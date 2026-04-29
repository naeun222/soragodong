// POST /api/billing/verify-toss-receipt — 토스 송금 영수증 캡처 → Sonnet vision 분석 → 자동 인증.
// 사용자 요청 2026-04-30: 캡처로 자동 인증 (Sonnet 4.6 vision, ~95% 정확도).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { calculateCost, recordUsage } from '../_lib/usage';

const KRW_PER_USD = 1400;

// 김나은 본인 계좌 — frontend TOSS_ACCOUNT와 동일
const RECEIVER_ACCOUNT = {
  bank: '우리은행',
  number_normalized: '1002963062525',  // 하이픈 제거
  holder: '김나은'
};

const CHARGE_PLANS_KRW = [1000, 5000, 10000, 30000, 50000];
const BONUS_PCT = [0, 0, 3, 8, 12];

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { image_base64, expected_amount_krw, user_memo_code, image_sha256 } = body;
  if (!image_base64 || !expected_amount_krw || !user_memo_code) {
    return jsonResponse({ error: 'image_base64 + expected_amount_krw + user_memo_code 필수' }, 400);
  }
  if (!CHARGE_PLANS_KRW.includes(expected_amount_krw)) {
    return jsonResponse({ error: '유효하지 않은 충전 금액' }, 400);
  }
  // 사용자 보고 2026-04-30: prompt injection 차단 — user_memo_code는 alphanumeric+하이픈, 4-20자만.
  if (typeof user_memo_code !== 'string' || !/^[A-Z0-9-]{4,20}$/.test(user_memo_code)) {
    return jsonResponse({ error: '메모 코드 형식 오류 (대문자 영숫자/하이픈 4-20자)' }, 400);
  }
  if (typeof image_base64 !== 'string' || image_base64.length > 8_000_000) {
    return jsonResponse({ error: '이미지 크기 초과' }, 400);
  }

  // 1. 같은 캡처 (sha256) 중복 차단
  if (image_sha256) {
    try {
      const dupResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_payments?raw_response->>image_sha256=eq.${image_sha256}&select=id&limit=1`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      const dups: any = await dupResp.json();
      if (dups && dups.length > 0) {
        return jsonResponse({ error: '이미 사용된 영수증 캡처입니다' }, 400);
      }
    } catch {}
  }

  // 2. 같은 user_memo_code 중복 차단
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
      return jsonResponse({ error: '이미 처리된 메모 코드입니다' }, 400);
    }
  } catch {}

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY 미설정' }, 500);
  }

  // 3. Sonnet vision 분석
  const prompt = `다음 송금 관련 캡처를 분석해. 토스 / 우리 / 국민 / 신한 / 하나 / 기업 / 카뱅 / 토스뱅크 등 모든 은행 앱 가능. JSON으로 출력:

{
  "amount_krw": 숫자 (송금 금액, 원 단위),
  "receiver_account_number": "수신 계좌번호 (숫자만, 하이픈 제거). 화면에 안 보이면 null",
  "receiver_bank": "수신 은행명. 안 보이면 null",
  "receiver_holder": "수신 예금주명. 본인 계좌 출금 내역 캡처면 출금 받은 상대방 (보낸 곳) 이름",
  "memo": "송금 메모 (있다면). 본인 통장 거래 내역에는 '받는 분에게 표시할 내용' 또는 메모 칼럼 확인",
  "send_time": "송금 시각 (가능하면 ISO 8601, 없으면 null)",
  "screen_type": "어느 화면 캡처인지: 'transfer_form' (송금 직전 — 계좌 보임) / 'transfer_complete' (토스 송금 완료) / 'transaction_detail' (거래내역 상세) / 'own_account_history' (본인 계좌 거래 내역 — 출금 line) / 'unknown'",
  "is_money_transfer": true/false (송금 관련 화면이 맞는지 — 광고/잔액 X, 송금 거래 O),
  "confidence": 0.0-1.0
}

** 본인 계좌 거래 내역 캡처 케이스 **:
사용자가 송금 보낸 후 자기 통장 / 자기 은행앱 거래 내역에서 출금 line을 캡처할 수도 있음.
이 경우: 출금 line의 상대방 이름 = receiver_holder, 출금 금액 = amount_krw, 메모 / 적요 = memo.
보통 line 형식: "[시각] 출금 [상대 이름] -[금액]원 [메모]" 등.

JSON만 출력. 다른 글 X.`;

  let aiAnalysis: any;
  let aiCostUsd = 0;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image_base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    if (!resp.ok) {
      const t = await resp.text();
      return jsonResponse({ error: 'AI 분석 실패: ' + t.slice(0, 200) }, 502);
    }
    const data: any = await resp.json();
    const text = data?.content?.[0]?.text || '';
    const jm = text.match(/\{[\s\S]*\}/);
    if (!jm) return jsonResponse({ error: 'AI 응답 파싱 실패' }, 502);
    try { aiAnalysis = JSON.parse(jm[0]); } catch { return jsonResponse({ error: 'JSON 파싱 실패' }, 502); }
    // usage 기록
    const usage = data.usage || {};
    aiCostUsd = calculateCost('claude-sonnet-4-6', usage.input_tokens || 0, usage.output_tokens || 0);
    recordUsage(env, {
      user_id: user.id,
      endpoint: 'verify_toss_receipt',
      model: 'claude-sonnet-4-6',
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cost_usd: aiCostUsd
    }).catch(() => {});
  } catch (e: any) {
    return jsonResponse({ error: 'AI 호출 예외: ' + (e?.message || e) }, 502);
  }

  // 4. 검증 — 자동 인증 조건
  // 사용자 보고 2026-04-30: is_toss_receipt → is_money_transfer (모든 은행 앱 지원).
  // 옛 버전 호환: is_toss_receipt도 체크.
  const isMoneyTransfer = aiAnalysis.is_money_transfer === true || aiAnalysis.is_toss_receipt === true;
  if (!isMoneyTransfer) {
    return jsonResponse({ error: '송금 화면이 아닙니다', ai_analysis: aiAnalysis }, 400);
  }
  if (aiAnalysis.confidence < 0.7) {
    return jsonResponse({ error: 'AI 분석 신뢰도가 낮습니다 (수동 확인 필요). 카톡 오픈채팅으로 문의해주세요.', ai_analysis: aiAnalysis }, 400);
  }
  // 금액 매칭 (±100원 허용 — OCR 약간 오류 대비)
  const amountMatch = Math.abs((aiAnalysis.amount_krw || 0) - expected_amount_krw) < 100;
  if (!amountMatch) {
    return jsonResponse({ error: `금액 불일치 (영수증: ${aiAnalysis.amount_krw}원, 충전: ${expected_amount_krw}원)`, ai_analysis: aiAnalysis }, 400);
  }
  // 계좌번호 매칭 — 사용자 보고 2026-04-30: 토스 '송금 완료' 화면은 계좌번호 안 보임 → optional 처리.
  // 계좌번호 보이면 strict 매칭, 안 보이면 receiver_holder (예금주명) 으로 매칭.
  const accountNorm = (aiAnalysis.receiver_account_number || '').replace(/[^0-9]/g, '');
  if (accountNorm) {
    // 계좌번호 보임 — strict 매칭
    if (accountNorm !== RECEIVER_ACCOUNT.number_normalized) {
      return jsonResponse({ error: `수신 계좌 불일치 (영수증: ${aiAnalysis.receiver_account_number}, 회사: ${RECEIVER_ACCOUNT.number_normalized})`, ai_analysis: aiAnalysis }, 400);
    }
  } else {
    // 계좌번호 안 보임 (송금 완료 화면) — 예금주명으로 매칭
    const holderNorm = (aiAnalysis.receiver_holder || '').replace(/\s/g, '');
    const expectedHolder = RECEIVER_ACCOUNT.holder.replace(/\s/g, '');
    if (!holderNorm.includes(expectedHolder)) {
      return jsonResponse({ error: `예금주명 불일치 (영수증: "${aiAnalysis.receiver_holder}", 회사: "${RECEIVER_ACCOUNT.holder}")`, ai_analysis: aiAnalysis }, 400);
    }
    // 송금 완료 화면 = 계좌 검증 못 함 → 메모 코드로 검증 (메모는 unique, 도용 방지)
  }
  // 메모 코드 매칭
  const memoNorm = (aiAnalysis.memo || '').toUpperCase().replace(/\s/g, '');
  const memoExpected = user_memo_code.toUpperCase().replace(/\s/g, '');
  if (!memoNorm.includes(memoExpected)) {
    return jsonResponse({ error: `메모 코드 불일치 (영수증: "${aiAnalysis.memo}", 필수: "${user_memo_code}")`, ai_analysis: aiAnalysis }, 400);
  }

  // 5. 자동 인증 — 잔액 반영 + payments status='paid'
  const planIdx = CHARGE_PLANS_KRW.indexOf(expected_amount_krw);
  const bonusPct = BONUS_PCT[planIdx];
  const totalKrwWithBonus = expected_amount_krw * (1 + bonusPct / 100);
  const usdAmount = Math.round((totalKrwWithBonus / KRW_PER_USD) * 1_000_000) / 1_000_000;

  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments`, {
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
        payment_type: 'toss_auto_verified',
        amount_krw: expected_amount_krw,
        amount_credit_usd: usdAmount,
        portone_imp_uid: null,
        portone_merchant_uid: user_memo_code,
        status: 'paid',
        raw_response: { ai_analysis: aiAnalysis, image_sha256, ai_cost_usd: aiCostUsd, verified_at: new Date().toISOString() }
      })
    });

    // 잔액 반영
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
      verified: true,
      charged_krw: expected_amount_krw,
      charged_usd: usdAmount,
      new_balance_usd: newBalance,
      ai_confidence: aiAnalysis.confidence,
      message: 'AI 자동 인증 완료 ✦'
    });
  } catch (e: any) {
    return jsonResponse({ error: '잔액 반영 실패: ' + (e?.message || e) }, 500);
  }
}
