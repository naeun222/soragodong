// POST /api/billing/legacy-bonus-may2026 — 기존 사용자 1,000원 추가 보너스 (1회성).
// 사용자 명시 2026-05-01:
//   - 환영 토큰 2,000원 → 3,000원 상향. 이미 환영 토큰 받은 사용자에게 동등 효과 부여.
//   - 자격: free_credit_granted=true AND legacy_bonus_2026_05_granted=false
//   - 잔액 += $0.71 (≈ 1,000원). atomic RPC (FOR UPDATE row lock — race 차단).
//   - 두 번째 호출 = 이미 받음 → 잔액 변경 X (idempotent).
//   - 미수령 사용자 (free_credit_granted=false) = not_legacy_user → 받기 누르면 새 3,000원 정책 (welcome-bonus).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { LEGACY_BONUS_MAY2026_USD, getUserBilling, ensureBillingRow } from '../_lib/billing';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // 1. billing row 확보 (없으면 잔액 0 으로 생성 — 단 grant 자격 X 으로 빠짐)
  let billing = await getUserBilling(env, user.id);
  if (!billing) {
    billing = await ensureBillingRow(env, user.id);
    if (!billing) {
      return jsonResponse({ ok: false, error: 'billing row 생성 실패' }, 500);
    }
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'env missing' }, 500);
  }

  // 2. atomic grant RPC 호출
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/grant_legacy_bonus_may2026`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: user.id,
        p_amount_usd: LEGACY_BONUS_MAY2026_USD
      })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn('[legacy-bonus-may2026] RPC 비-OK:', resp.status, text);
      return jsonResponse({ ok: false, error: 'RPC 실패: ' + resp.status, detail: text }, 500);
    }
    const data: any = await resp.json();
    if (!data || data.ok === false) {
      // not_legacy_user / no_billing_row 등
      return jsonResponse({
        ok: false,
        reason: data?.reason || 'unknown',
        message: data?.reason === 'not_legacy_user'
          ? '환영 토큰을 먼저 받아야 해'
          : '받기 실패'
      });
    }
    return jsonResponse({
      ok: true,
      granted: !!data.granted,
      already_granted: !!data.already_granted,
      balance_usd: Number(data.balance_usd) || 0,
      amount_usd: data.granted ? LEGACY_BONUS_MAY2026_USD : 0,
      message: data.already_granted ? '이미 받았어요' : '1,000원 받았어요'
    });
  } catch (e: any) {
    console.warn('[legacy-bonus-may2026] error:', e);
    return jsonResponse({ ok: false, error: e.message || String(e) }, 500);
  }
}
