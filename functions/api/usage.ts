// GET /api/usage — 사용자 본인 사용량 + billing 정보 조회.
// 사용자 명시 2026-05-05: 신규 가입자 처음 한 달 무료 (얼리 플랜) 자동 활성화 — billing row 없으면 ensureBillingRow 가 즉시 active=true / plan='early_light' / 30일 expires 생성.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { getMonthlyUsage } from './_lib/usage';
import { getUserBilling, ensureBillingRow, promoteGuestToEarlyLight } from './_lib/billing';

// V4 (사용자 보고 2026-05-25 ultrathink): outer try/catch wrap — chat.ts onRequestPost 패턴 (line 211) 적용.
//   옛: uncaught throw 시 Cloudflare Pages Functions 가 자체 5xx HTML 페이지 응답 → frontend 'Unexpected token <'.
//   신: throw 잡아 JSON 500 + detail 반환 → frontend `_doRefreshBillingStatus` 가 'API 500 — ...' 형태로 표시.
//   원래 verifyAuth 의 `throw new Error('SUPABASE env 누락')` 만 uncaught throw 후보였는데, 모르는 throw path 도 같이 cover.
export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  try {
    return await _handleUsageRequest(context);
  } catch (e: any) {
    const _msg = e?.message || String(e);
    const _stack = e?.stack ? String(e.stack).slice(0, 800) : '';
    console.error('[usage.ts] uncaught throw:', _stack || _msg);
    return jsonResponse({
      error: '백엔드 throw: ' + _msg,
      stack: _stack || undefined
    }, 500);
  }
}

async function _handleUsageRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // 신규 가입자 자동 한 달 무료 활성화 — 첫 진입에서 즉시 trigger.
  // Phase 0: anonymous 사용자는 'guest' tier ($0.30) 로 자동 생성.
  // Phase 1c: linkIdentity 후 (is_anonymous=false + plan='guest') → 'early_light' 자동 승격.
  let billing = await getUserBilling(env, user.id);
  if (!billing) {
    billing = await ensureBillingRow(env, user.id, { isAnonymous: !!user.is_anonymous });
  } else if (!user.is_anonymous && billing.subscription_plan === 'guest') {
    await promoteGuestToEarlyLight(env, user.id);
    billing = await getUserBilling(env, user.id);  // refetch
  }
  const usage = await getMonthlyUsage(env, user.id);

  // V4 (사용자 명시 2026-05-13): 어드민이면 게스트 한도 도달 alert flag 같이 반환 (인앱 banner 표시용).
  let guestBudgetAlert: any = null;
  if (env.ADMIN_USER_ID && user.id === env.ADMIN_USER_ID) {
    try {
      const guestEnv = env as any;
      if (guestEnv.GUEST_KV) {
        const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const dateK = kstNow.toISOString().slice(0, 10);
        const raw = await guestEnv.GUEST_KV.get(`alert:guest_budget:${dateK}`);
        if (raw) {
          try { guestBudgetAlert = JSON.parse(raw); } catch { guestBudgetAlert = { raw }; }
        }
      }
    } catch (e: any) { console.warn('[usage] guest alert read throw:', e?.message || e); }
  }

  return jsonResponse({
    monthly: usage,
    billing: billing || null,
    ...(guestBudgetAlert ? { guest_budget_alert: guestBudgetAlert } : {})
  });
}
