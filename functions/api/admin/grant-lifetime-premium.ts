// POST /api/admin/grant-lifetime-premium — admin 전용. 사용자에게 평생 Premium plan grant (결제 우회).
// 사용자 명시 2026-05-18 ultrathink: 친구/베타 등 결제 없이 평생 Premium 권한 부여.
//
// body: {
//   user_ids: string[]  (필수, UUID 배열. 1~50개)
//   expires_at?: string (선택, ISO. 기본 = '2099-12-31T23:59:59Z')
// }
//
// 동작:
//   - soragodong_billing UPSERT (user_id PRIMARY KEY 멱등):
//       subscription_plan='premium', subscription_active=true,
//       subscription_expires_at=<expires_at>, monthly_quota_usd=13 (TIER_PLANS.premium.cap_usd),
//       monthly_token_used=0, monthly_period_started_at=NOW, daily_quota_used=0,
//       daily_quota_reset_at=NOW+24h, cancel_at_period_end=false,
//       scheduled_plan_change=null, scheduled_plan_change_at=null
//   - 안 건드림: credit_balance_usd (기존 잔액 보존), free_trial_granted_at,
//                portone_billing_key (NULL 유지 → cron 자동 결제 매칭 X),
//                next_billing_at (NULL 유지 → cron skip).
//   - soragodong_payments INSERT 안 함 (admin grant = audit trail X — payment 가 아님).
//
// 검증:
//   - target user 가 다음 /api/usage 호출 시 billing.subscription_plan='premium' 응답.
//   - frontend refreshBillingStatus → planKey='premium' → Premium UI 노출.
//   - cron-charge-recurring.ts 는 portone_billing_key IS NULL 인 row skip → 자동 결제 시도 X.
//   - checkBudget: subscription_active=true && expires_at='2099-12-31' > NOW → cap 안 (quota $13) 통과.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS } from '../_lib/billing';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const DEFAULT_EXPIRES_AT = '2099-12-31T23:59:59Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    return jsonResponse({ error: '서버 설정 오류 (ADMIN_USER_ID 미설정)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'supabase env 미설정' }, 500);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const userIdsRaw = Array.isArray(body?.user_ids) ? body.user_ids : null;
  if (!userIdsRaw || userIdsRaw.length === 0) {
    return jsonResponse({ error: 'user_ids 배열 필수 (1~50개)' }, 400);
  }
  if (userIdsRaw.length > 50) {
    return jsonResponse({ error: 'user_ids 최대 50개' }, 400);
  }
  // UUID 형식 검증 — invalid 하나라도 있으면 전체 거부.
  const userIds: string[] = [];
  for (const u of userIdsRaw) {
    if (typeof u !== 'string' || !UUID_RE.test(u.trim())) {
      return jsonResponse({ error: `invalid UUID: ${String(u).slice(0, 60)}` }, 400);
    }
    userIds.push(u.trim());
  }
  // 중복 제거.
  const uniqueIds = Array.from(new Set(userIds));

  let expiresAt = DEFAULT_EXPIRES_AT;
  if (typeof body?.expires_at === 'string' && body.expires_at.trim()) {
    const dt = new Date(body.expires_at);
    if (isNaN(dt.getTime())) {
      return jsonResponse({ error: 'expires_at ISO 형식 invalid' }, 400);
    }
    if (dt.getTime() <= Date.now()) {
      return jsonResponse({ error: 'expires_at 가 현재보다 과거 X' }, 400);
    }
    expiresAt = dt.toISOString();
  }

  const nowIso = new Date().toISOString();
  const dailyResetIso = new Date(Date.now() + 86400_000).toISOString();
  const premiumCap = TIER_PLANS.premium.cap_usd;  // 13

  const results: Array<{ user_id: string; ok: boolean; mode?: 'insert' | 'update'; old_plan?: string | null; error?: string }> = [];

  for (const uid of uniqueIds) {
    try {
      // 1. 기존 row 조회 (UPSERT 응답으로는 mode 구분 X — 명시 조회).
      let existing: any = null;
      try {
        const r = await fetch(
          `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${uid}&select=subscription_plan,subscription_active,subscription_expires_at`,
          {
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        if (r.ok) {
          const rows: any = await r.json();
          existing = rows?.[0] || null;
        }
      } catch {}

      // 2. UPSERT payload — INSERT 시 fresh 값 (안 채우면 DEFAULT), UPDATE 시 동일 값 덮어쓰기.
      //    user_id PRIMARY KEY → Prefer: resolution=merge-duplicates 로 INSERT or UPDATE 자동.
      const payload: Record<string, any> = {
        user_id: uid,
        subscription_plan: 'premium',
        subscription_active: true,
        subscription_expires_at: expiresAt,
        monthly_quota_usd: premiumCap,
        monthly_token_used: 0,
        monthly_period_started_at: nowIso,
        daily_quota_used: 0,
        daily_quota_reset_at: dailyResetIso,
        cancel_at_period_end: false,
        scheduled_plan_change: null,
        scheduled_plan_change_at: null
      };
      // 신규 row 인 경우 — credit_balance_usd 명시 0 (기존 row 면 그 컬럼 안 보냄 → 보존).
      // merge-duplicates 는 payload 의 컬럼만 덮어쓰니 기존 cred_balance_usd 안전.
      // 단 신규 row 는 column DEFAULT (0) 적용 — payload 에 보낼 필요 X.

      const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal,resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        results.push({ user_id: uid, ok: false, error: `UPSERT ${resp.status}: ${txt.slice(0, 200)}` });
        continue;
      }

      results.push({
        user_id: uid,
        ok: true,
        mode: existing ? 'update' : 'insert',
        old_plan: existing?.subscription_plan ?? null
      });
    } catch (e: any) {
      results.push({ user_id: uid, ok: false, error: e?.message || String(e) });
    }
  }

  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;

  return jsonResponse({
    ok: failCount === 0,
    granted_count: okCount,
    failed_count: failCount,
    expires_at: expiresAt,
    plan: 'premium',
    cap_usd: premiumCap,
    results
  }, failCount === 0 ? 200 : 207);  // 207 = Multi-Status (일부 실패)
}
