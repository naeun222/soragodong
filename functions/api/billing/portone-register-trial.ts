// POST /api/billing/portone-register-trial
// V4 (사용자 명시 2026-05-11 ultrathink): Plus(key='light') 첫 달 무료 trial = 카드 등록만 (즉시 결제 X) + 30일 후 첫 자동 결제.
//   옛 얼리버드 promo (plan='early_lifetime' trial) 폐기 — 정체성 이전.
//
// frontend 흐름:
//   1) PortOne.requestIssueBillingKey(...) 로 카드 등록 모달 → 사용자 카드 정보 입력 (결제 X)
//   2) 응답 billingKey + plan='light' 를 이 endpoint 에 POST
//   3) 서버: PortOne 진위 검증 → soragodong_billing 에 billing_key 저장 + subscription_active=true,
//      plan='light', trial_until = +30d, next_billing_at = +30d
//   4) cron-charge-recurring 이 30일 후 자동으로 첫 결제 시도 (Plus 9,900원)
//
// 중복 호출 방어: 이미 활성 동일 plan 사용자면 빌링키만 갱신 (재등록 케이스).
// plan 파라미터: 'light' 만 허용 (Plus trial 전용 endpoint). 기본값 'light'.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS } from '../_lib/billing';
import { fetchPortOneBillingKey } from '../_lib/portone';

const TRIAL_DAYS = 30;
const TRIAL_PLAN: 'light' = 'light';  // Plus tier — trial 흐름 전용

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  // V4 (사용자 명시 2026-05-11 — 가계약): 정기결제 흐름 자체 비활성화 시 trial 등록 차단.
  //   cron-charge-recurring 이 no-op 인 상태에서 trial 등록 시 = 30일 뒤 자동결제 X → 무한 무료 사용 (본인 출혈).
  //   frontend 가계약 모드는 proceedOneTimePurchase 로 분기하므로 이 endpoint 호출 X. 직접 호출 방어용.
  if ((env as any).BILLING_RECURRING_ENABLED !== 'true') {
    return jsonResponse({
      error: '정기결제 흐름 비활성 (가계약 단계) — 1개월 일회성 결제만 가능. /api/billing/portone-verify-pay 사용.',
      code: 'RECURRING_DISABLED'
    }, 403);
  }
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (user.is_anonymous) {
    return jsonResponse({ error: '게스트는 결제 X — 로그인 후 진행', code: 'GUEST_BLOCKED' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { billingKey, plan } = body;
  if (!billingKey || typeof billingKey !== 'string') {
    return jsonResponse({ error: 'billingKey 필수' }, 400);
  }
  // plan 파라미터 검증 — 명시되면 'light' 만 허용. 안 보내면 default 'light'.
  if (plan && plan !== TRIAL_PLAN) {
    return jsonResponse({ error: `이 endpoint 는 ${TRIAL_PLAN} (Plus) trial 전용 — plan='${plan}' 거부.` }, 400);
  }

  // PortOne 진위 검증.
  const fetchResult = await fetchPortOneBillingKey(env, billingKey);
  if (!fetchResult.ok) {
    return jsonResponse({ error: '빌링키 검증 실패: ' + fetchResult.error }, 502);
  }
  const data = fetchResult.data;
  if (data.status && data.status !== 'ISSUED') {
    return jsonResponse({ error: `빌링키 상태 ${data.status} — 유효한 ISSUED 상태 X` }, 400);
  }
  // customer.id 매칭 (다른 계정 빌링키 가로채기 방어)
  const portoneCustomerId = (data.customer && (data.customer.id || data.customer.customerId)) || '';
  if (portoneCustomerId && portoneCustomerId !== user.id) {
    return jsonResponse({
      error: '카드 등록 시점 계정과 현재 계정이 달라 — 등록했던 계정으로 다시 로그인.',
      code: 'CUSTOMER_MISMATCH'
    }, 403);
  }

  // 중복 등록 방어 — 이미 active Plus(light) 사용자면 안내.
  let alreadyActive = false;
  try {
    const checkResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=subscription_plan,subscription_active,subscription_expires_at,portone_billing_key`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows: any = await checkResp.json().catch(() => []);
    if (Array.isArray(rows) && rows[0]) {
      const r = rows[0];
      if (r.subscription_plan === TRIAL_PLAN && r.subscription_active && r.portone_billing_key && r.portone_billing_key !== billingKey) {
        alreadyActive = true;
      }
    }
  } catch {}
  if (alreadyActive) {
    return jsonResponse({
      ok: true,
      duplicate: true,
      message: '이미 Plus 구독이 활성. 빌링키 변경은 [설정 → 카드 변경] 에서.'
    }, 200);
  }

  const now = new Date();
  const trialUntilISO = new Date(now.getTime() + TRIAL_DAYS * 86400_000).toISOString();
  const tier = TIER_PLANS[TRIAL_PLAN];

  // billing row 갱신 (없으면 INSERT).
  // upsert pattern — Prefer: resolution=merge-duplicates 로 user_id PK 충돌 시 갱신.
  try {
    const upsertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: user.id,
        // 사용자 보고 2026-05-09 ultrathink: schema 통일 (migration 0016) — billing.user_email sync.
        user_email: user.email || null,
        subscription_active: true,
        subscription_plan: TRIAL_PLAN,
        subscription_expires_at: trialUntilISO,
        monthly_quota_usd: tier.cap_usd,
        monthly_token_used: 0,
        monthly_period_started_at: now.toISOString(),
        portone_billing_key: billingKey,
        portone_billing_key_issued_at: now.toISOString(),
        trial_until: trialUntilISO,
        next_billing_at: trialUntilISO,
        cancel_at_period_end: false,
        cancelled_at: null,
        last_billing_error: null
      })
    });
    if (!upsertResp.ok) {
      const errTxt = await upsertResp.text().catch(() => '');
      return jsonResponse({ error: 'billing 저장 실패: ' + upsertResp.status + ' ' + errTxt.slice(0, 200) }, 500);
    }
  } catch (e: any) {
    return jsonResponse({ error: 'billing 저장 throw: ' + (e?.message || e) }, 500);
  }

  return jsonResponse({
    ok: true,
    trial_until: trialUntilISO,
    next_billing_at: trialUntilISO,
    plan: TRIAL_PLAN,
    cap_usd: tier.cap_usd,
    message: `Plus 첫 달 무료 — ${TRIAL_DAYS}일 뒤 ${tier.krw.toLocaleString()}원 자동 결제 시작.`
  });
}
