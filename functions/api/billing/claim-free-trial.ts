// POST /api/billing/claim-free-trial
// V4 (사용자 명시 2026-05-11 ultrathink): 가계약 모드 (BILLING_RECURRING_ENABLED!='true') Plus 첫 달 무료 흐름.
//   결제 X, 카드 등록 X — backend 가 직접 Plus subscription 30일 활성화. 1인 1회 가드.
//   30일 후 자동 만료 (cron 갱신 X — env flag false). 사용자가 직접 재구매.
//
// 정기결제 모드 가동 시 (env='true') = 이 endpoint 비활성, 대신 portone-register-trial.ts 사용 (카드 등록 + 30일 후 자동결제).
//
// 1인 1회 가드: soragodong_billing.plus_trial_consumed_at (migration 0018) IS NOT NULL = 거부.
//   migration 0018 미실행 시 = column 없음 → query 자체 fail → fallback: 가드 skip + 경고 로그.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS } from '../_lib/billing';
import { calcNextBillingDate, getCurrentKstAnchorDay } from '../_lib/cycle';

const TRIAL_PLAN: 'light' = 'light';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  // 정기결제 모드면 register-trial 사용해야 함 (카드 등록 + 자동결제). 이 endpoint 차단.
  if ((env as any).BILLING_RECURRING_ENABLED === 'true') {
    return jsonResponse({
      error: '정기결제 모드 — /api/billing/portone-register-trial 사용 (카드 등록 필요).',
      code: 'RECURRING_MODE_USE_REGISTER_TRIAL'
    }, 403);
  }
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (user.is_anonymous) {
    return jsonResponse({ error: '게스트는 결제 X — 로그인 후 진행', code: 'GUEST_BLOCKED' }, 403);
  }

  // 1인 1회 가드 — plus_trial_consumed_at 체크 (migration 0018).
  let trialAlreadyConsumed = false;
  let columnMissing = false;
  try {
    const checkResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=plus_trial_consumed_at,subscription_plan,subscription_active,subscription_expires_at`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!checkResp.ok) {
      const errTxt = await checkResp.text().catch(() => '');
      if (errTxt.includes('plus_trial_consumed_at') || errTxt.includes('column')) {
        columnMissing = true;
        console.warn('[claim-free-trial] plus_trial_consumed_at column 없음 — migration 0018 실행 필요. 가드 skip.');
      }
    } else {
      const rows: any = await checkResp.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]) {
        const r = rows[0];
        if (r.plus_trial_consumed_at) trialAlreadyConsumed = true;
        // 이미 활성 Plus 구독 — duplicate
        if (r.subscription_plan === TRIAL_PLAN && r.subscription_active && r.subscription_expires_at && new Date(r.subscription_expires_at) > new Date()) {
          return jsonResponse({
            ok: true,
            duplicate: true,
            message: '이미 Plus 구독이 활성. 만료 후 재신청.'
          }, 200);
        }
      }
    }
  } catch (e) {
    console.warn('[claim-free-trial] 가드 체크 throw:', e);
  }
  if (trialAlreadyConsumed) {
    return jsonResponse({
      ok: false,
      error: 'Plus 첫 달 무료는 1회 한정 — 이미 사용한 이력. 정가 9,900원 결제로 진행 (구독 모달 → Plus 1개월).',
      code: 'TRIAL_ALREADY_CONSUMED'
    }, 403);
  }

  // V4 (사용자 명시 2026-05-13 ultrathink): 매월 anchor cycle — '한 달 무료' = anchor 기준 다음 달 같은 날까지.
  const now = new Date();
  const anchorDay = getCurrentKstAnchorDay();
  const expiresIso = calcNextBillingDate(now, anchorDay).toISOString();
  const tier = TIER_PLANS[TRIAL_PLAN];

  // billing UPSERT — 결제 X, 카드 등록 X.
  const body: any = {
    user_id: user.id,
    user_email: user.email || null,
    subscription_active: true,
    subscription_plan: TRIAL_PLAN,
    subscription_expires_at: expiresIso,
    monthly_quota_usd: tier.cap_usd,
    monthly_token_used: 0,
    monthly_period_started_at: now.toISOString(),
    // 사용자 명시 2026-05-12 ultrathink: 구독 시점부터 daily quota 0 부터 카운트.
    daily_quota_used: 0,
    daily_quota_reset_at: new Date(now.getTime() + 86400_000).toISOString(),
    // 카드 등록 X — billingKey 관련 column 모두 null
    portone_billing_key: null,
    portone_billing_key_issued_at: null,
    trial_until: expiresIso,
    next_billing_at: null,
    cancel_at_period_end: false,
    cancelled_at: null,
    last_billing_error: null,
    // V4 (사용자 명시 2026-05-13 ultrathink): 매월 anchor day 저장 — migration 0023.
    //   migration 미적용 시 PATCH 가 column ignore (Supabase REST 동작) — 단순 fallback.
    cycle_anchor_day: anchorDay,
    subscription_started_at: now.toISOString()
  };
  // migration 0018 실행됐으면 1인 1회 기록.
  if (!columnMissing) body.plus_trial_consumed_at = now.toISOString();

  try {
    const upsertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify(body)
    });
    if (!upsertResp.ok) {
      const errTxt = await upsertResp.text().catch(() => '');
      // column missing 이면 한 번 더 plus_trial_consumed_at 빼고 재시도
      if (!columnMissing && errTxt.includes('plus_trial_consumed_at')) {
        console.warn('[claim-free-trial] column missing detected on UPSERT — 재시도 (가드 skip).');
        delete body.plus_trial_consumed_at;
        const retryResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal,resolution=merge-duplicates'
          },
          body: JSON.stringify(body)
        });
        if (!retryResp.ok) {
          return jsonResponse({ error: 'billing 저장 실패 (재시도 후): ' + retryResp.status }, 500);
        }
      } else {
        return jsonResponse({ error: 'billing 저장 실패: ' + upsertResp.status + ' ' + errTxt.slice(0, 200) }, 500);
      }
    }
  } catch (e: any) {
    return jsonResponse({ error: 'billing 저장 throw: ' + (e?.message || e) }, 500);
  }

  return jsonResponse({
    ok: true,
    expires_at: expiresIso,
    plan: TRIAL_PLAN,
    cap_usd: tier.cap_usd,
    message: `Plus 첫 달 무료 시작 — 한 달 후 만료 (자동 갱신 X). 만료 7일 전 알림.`
  });
}
