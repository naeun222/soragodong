// POST /api/billing/manual-charge — 토스 수동 송금 충전 (베타 단계 신뢰 모델).
// 사용자가 송금 후 "송금 완료" 클릭 → 5천원 이하만 즉시 잔액 반영 (pending_manual status).
// 사용자 보고 2026-04-30 review (agent P0): 즉시 반영 = 무료 충전 risk → 5천원 이상은 admin 확인 후만 +잔액.
// 김나은(admin) 1일 1회 토스 확인 → 미입금 사용자 = admin endpoint로 환수.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

const KRW_PER_USD = 1400;

const CHARGE_PLANS_KRW = [1000, 5000, 10000, 30000, 50000];
const BONUS_PCT = [0, 0, 3, 8, 12];
// 사용자 명시 2026-04-30: 즉시 반영 cap (옵션 b — 5천원). 그 이상은 admin 확인 후 admin endpoint 가 +잔액.
const INSTANT_CAP_KRW = 5000;

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { amount_krw, user_memo_code } = body;
  if (!amount_krw || !CHARGE_PLANS_KRW.includes(amount_krw)) {
    return jsonResponse({ error: '유효하지 않은 충전 금액' }, 400);
  }
  if (!user_memo_code || typeof user_memo_code !== 'string') {
    return jsonResponse({ error: '송금 메모 코드 필수' }, 400);
  }
  // 사용자 보고 2026-04-30: 메모 코드 형식 검증 (alphanumeric+하이픈, 4-20자).
  if (!/^[A-Z0-9-]{4,20}$/.test(user_memo_code)) {
    return jsonResponse({ error: '메모 코드 형식 오류 (대문자 영숫자/하이픈 4-20자)' }, 400);
  }

  // 같은 user_memo_code 중복 방지 (사용자 한 번 송금 = 한 번 충전)
  try {
    const dupResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?portone_merchant_uid=eq.${encodeURIComponent(user_memo_code)}&select=id&limit=1`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const dups: any = await dupResp.json();
    if (dups && dups.length > 0) {
      return jsonResponse({ error: '이미 처리된 메모 코드입니다 (중복 송금 방지)' }, 400);
    }
  } catch (e) { /* 중복 검사 실패 시 통과 — 다음 단계에서 unique constraint */ }

  const planIdx = CHARGE_PLANS_KRW.indexOf(amount_krw);
  const bonusPct = BONUS_PCT[planIdx];
  const totalKrwWithBonus = amount_krw * (1 + bonusPct / 100);
  const usdAmount = Math.round((totalKrwWithBonus / KRW_PER_USD) * 1_000_000) / 1_000_000;

  // payments 기록 (status='pending_manual')
  try {
    const payResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: user.id,
        user_email: user.email || null,
        payment_type: 'manual_charge_toss',
        amount_krw,
        amount_credit_usd: usdAmount,
        portone_imp_uid: null,
        portone_merchant_uid: user_memo_code,
        status: 'pending_manual',  // admin 확인 후 'paid'
        raw_response: { user_memo_code, bonus_pct: bonusPct, claimed_at: new Date().toISOString() }
      })
    });
    if (!payResp.ok) {
      const t = await payResp.text();
      return jsonResponse({ error: 'payments 기록 실패: ' + t }, 500);
    }
  } catch (e: any) {
    return jsonResponse({ error: 'payments 예외: ' + (e?.message || e) }, 500);
  }

  // 사용자 명시 2026-04-30: 5천원 이하만 즉시 반영. 그 이상은 admin 확인 후 admin endpoint 가 +잔액 (위조 충전 risk 방지).
  if (amount_krw > INSTANT_CAP_KRW) {
    return jsonResponse({
      ok: true,
      charged_krw: amount_krw,
      charged_usd: usdAmount,
      new_balance_usd: null,  // admin 확인 후 +잔액
      status: 'pending_admin_confirm',
      user_memo_code,
      message: `5천원 이상 충전은 admin 확인 후 잔액 반영됩니다 (영업일 기준 24시간 내). 송금 확인 시 카톡 오픈채팅으로 알림 보내요.`
    });
  }

  // 5천원 이하 — 즉시 잔액 반영 (베타 신뢰 모델).
  try {
    const billingResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}&select=credit_balance_usd`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const billingRows: any = await billingResp.json();
    const currentBalance = (billingRows[0]?.credit_balance_usd) || 0;
    const newBalance = Math.round((currentBalance + usdAmount) * 1_000_000) / 1_000_000;
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ credit_balance_usd: newBalance })
    });
    return jsonResponse({
      ok: true,
      charged_krw: amount_krw,
      charged_usd: usdAmount,
      new_balance_usd: newBalance,
      status: 'pending_admin_confirm',
      user_memo_code,
      message: '잔액이 즉시 반영되었습니다. 송금 확인 후 정식 처리됩니다 (24시간 내).'
    });
  } catch (e: any) {
    return jsonResponse({ error: '잔액 반영 실패: ' + (e?.message || e) }, 500);
  }
}
