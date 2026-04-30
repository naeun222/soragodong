// POST /api/billing/welcome-bonus — 사용자 환영 모달 '받기' click 시만 free credit 부여.
// 사용자 명시 2026-04-30 ultrathink:
//   - 자동 부여 X (ensureBillingRow 잔액 0 INSERT 으로 변경)
//   - 첫 click 만 잔액 = $1.43 (≈ 2,000원) 으로 **SET (리셋)** + free_credit_granted false → true
//   - 두 번째 호출 = 이미 받음 → 잔액 변경 X (idempotent — race-protected via PATCH filter free_credit_granted=eq.false)
//   - 매 갱신 시 누적 += $X 버그 차단 (절대 add 아님 — SET)
//   - flag strict: free_credit_granted 진실 source. client _welcomeBonusShown 은 fast-path cache 만.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { FREE_INITIAL_CREDIT_USD, getUserBilling, ensureBillingRow } from '../_lib/billing';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // 1. billing row 확보 (없으면 잔액 0 으로 생성)
  let billing = await getUserBilling(env, user.id);
  if (!billing) {
    billing = await ensureBillingRow(env, user.id);
    if (!billing) {
      return jsonResponse({ ok: false, error: 'billing row 생성 실패' }, 500);
    }
  }

  // 2. 이미 받았으면 idempotent 응답 (잔액 변경 X)
  if (billing.free_credit_granted) {
    return jsonResponse({
      ok: true,
      already_granted: true,
      balance_usd: billing.credit_balance_usd,
      message: '이미 받았어요'
    });
  }

  // 3. 첫 받기 — 잔액 = FREE_INITIAL_CREDIT_USD 으로 SET (사용자 명시 2026-04-30: 추가 X / 리셋)
  // (idempotent — 이미 받음 = 위에서 early return. 즉 첫 호출만 도달)
  const newBalance = FREE_INITIAL_CREDIT_USD;
  const grantedAt = new Date().toISOString();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'env missing' }, 500);
  }
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&free_credit_granted=eq.false`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        credit_balance_usd: newBalance,
        free_credit_granted: true,
        free_credit_amount_usd: FREE_INITIAL_CREDIT_USD,
        free_credit_granted_at: grantedAt
      })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn('[welcome-bonus] PATCH 실패:', resp.status, text);
      return jsonResponse({ ok: false, error: 'PATCH 실패: ' + resp.status }, 500);
    }
    // 사용자 보고 ultrathink: PATCH free_credit_granted=eq.false 필터 = race condition 방지
    // (동시 두 호출 시 첫 PATCH 만 success, 두 번째 = empty array → 잔액 중복 부여 X)
    const rows: any = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      // 다른 호출이 먼저 성공 → 이미 받음 처리
      const refreshed = await getUserBilling(env, user.id);
      return jsonResponse({
        ok: true,
        already_granted: true,
        balance_usd: refreshed?.credit_balance_usd || newBalance,
        message: '이미 받았어요 (race-protected)'
      });
    }
    return jsonResponse({
      ok: true,
      granted: true,
      balance_usd: newBalance,
      granted_usd: FREE_INITIAL_CREDIT_USD,
      granted_at: grantedAt
    });
  } catch (e: any) {
    console.warn('[welcome-bonus] error:', e);
    return jsonResponse({ ok: false, error: e.message || String(e) }, 500);
  }
}
