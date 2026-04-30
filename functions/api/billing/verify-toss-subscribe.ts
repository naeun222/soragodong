// POST /api/billing/verify-toss-subscribe — 토스 송금 영수증 캡처 → Sonnet vision 인증 → 한 달 구독 활성화.
// 사용자 명시 2026-04-30 ultrathink: 포트원 미설정 단계 — 토스 수동 송금 으로 구독 시작.
// 자동 갱신 X — 한 달 후 expires, 재구독 시 다시 송금 + 인증.
//
// 흐름:
//   1) verifyAuth + tier 검증 (light / premium)
//   2) AI vision 으로 영수증 검증 (verify-toss-receipt 와 동일 로직)
//   3) 검증 성공 → soragodong_billing PATCH:
//      - subscription_active = true
//      - subscription_plan = tier
//      - subscription_expires_at = now + 30 days
//      - monthly_quota_usd = TIER_PLANS[tier].cap_usd
//      - monthly_token_used = 0 (새 cycle)
//      - monthly_period_started_at = now
//   4) payments 테이블에 record (payment_type='toss_subscribe')

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';
import { calculateCost, recordUsage } from '../_lib/usage';
import { TIER_PLANS, type TierKey } from '../_lib/billing';

const RECEIVER_ACCOUNT = {
  bank: '우리은행',
  number_normalized: '1002963062525',  // 하이픈 제거
  holder: '김나은'
};

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { image_base64, tier, user_memo_code, image_sha256 } = body;
  if (!image_base64 || !tier || !user_memo_code) {
    return jsonResponse({ error: 'image_base64 + tier + user_memo_code 필수' }, 400);
  }
  if (tier !== 'light' && tier !== 'premium') {
    return jsonResponse({ error: 'tier 는 light 또는 premium 만 허용' }, 400);
  }
  const tierPlan = TIER_PLANS[tier as TierKey];
  const expectedKrw = tierPlan.krw;

  // 메모 코드 검증 (alphanumeric+하이픈 4-20자)
  if (typeof user_memo_code !== 'string' || !/^[A-Z0-9-]{4,20}$/.test(user_memo_code)) {
    return jsonResponse({ error: '메모 코드 형식 오류' }, 400);
  }
  if (typeof image_base64 !== 'string' || image_base64.length > 8_000_000) {
    return jsonResponse({ error: '이미지 크기 초과' }, 400);
  }

  // Rate limit (verify-toss-receipt 와 동일 패턴 — 1분 5회 / 24h 10회)
  try {
    const now = new Date();
    const min1Ago = new Date(now.getTime() - 60_000).toISOString();
    const day1Ago = new Date(now.getTime() - 86400_000).toISOString();
    const recentResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?user_id=eq.${user.id}&payment_type=eq.toss_subscribe&created_at=gte.${day1Ago}&select=created_at`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    if (recentResp.ok) {
      const rows: any = await recentResp.json();
      const last1min = rows.filter((r: any) => r.created_at >= min1Ago).length;
      if (last1min >= 5) return jsonResponse({ error: '잠시 후 다시 시도해주세요 (1분당 5회 제한)' }, 429);
      if (rows.length >= 15) return jsonResponse({ error: '하루 인증 한도 초과 (15회). 카톡 오픈채팅으로 문의해주세요.' }, 429);
    }
  } catch (e) {
    console.warn('[verify-toss-subscribe] rate limit check 실패:', e);
  }

  // 중복 차단 — 같은 캡처 (sha256)
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
      if (dups && dups.length > 0) return jsonResponse({ error: '이미 사용된 영수증 캡처입니다' }, 400);
    } catch {}
  }

  // 중복 차단 — 같은 user_memo_code
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
    if (dups && dups.length > 0) return jsonResponse({ error: '이미 처리된 메모 코드입니다' }, 400);
  } catch {}

  if (!env.ANTHROPIC_API_KEY) return jsonResponse({ error: 'ANTHROPIC_API_KEY 미설정' }, 500);

  // AI vision 분석 (verify-toss-receipt 동일 prompt)
  const prompt = `다음 송금 관련 캡처를 분석해. 토스 / 우리 / 국민 / 신한 / 하나 / 기업 / 카뱅 / 토스뱅크 등 모든 은행 앱 가능. JSON으로 출력:

{
  "amount_krw": 숫자 (송금 금액, 원 단위),
  "receiver_account_number": "수신 계좌번호 (숫자만, 하이픈 제거). 안 보이면 null",
  "receiver_bank": "수신 은행명. 안 보이면 null",
  "receiver_holder": "수신 예금주명. 본인 계좌 출금 내역 캡처면 출금 받은 상대방 (보낸 곳) 이름",
  "memo": "송금 메모. 본인 통장 거래 내역에서 '받는 분에게 표시할 내용' 또는 메모 칼럼 확인",
  "send_time": "송금 시각 (가능하면 ISO 8601, 없으면 null)",
  "screen_type": "transfer_form / transfer_complete / transaction_detail / own_account_history / unknown",
  "is_money_transfer": true/false,
  "confidence": 0.0-1.0
}

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
    const usage = data.usage || {};
    aiCostUsd = calculateCost('claude-sonnet-4-6', usage.input_tokens || 0, usage.output_tokens || 0);
    recordUsage(env, {
      user_id: user.id,
      endpoint: 'verify_toss_subscribe',
      model: 'claude-sonnet-4-6',
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cost_usd: aiCostUsd
    }).catch(() => {});
  } catch (e: any) {
    return jsonResponse({ error: 'AI 호출 예외: ' + (e?.message || e) }, 502);
  }

  // 검증
  const isMoneyTransfer = aiAnalysis.is_money_transfer === true;
  if (!isMoneyTransfer) {
    return jsonResponse({ error: '송금 화면이 아닙니다', ai_analysis: aiAnalysis }, 400);
  }
  if (aiAnalysis.confidence < 0.7) {
    return jsonResponse({ error: 'AI 신뢰도 낮음 (수동 확인 필요). 카톡 오픈채팅으로 문의해주세요.', ai_analysis: aiAnalysis }, 400);
  }
  if (Math.abs((aiAnalysis.amount_krw || 0) - expectedKrw) >= 100) {
    return jsonResponse({
      error: `금액 불일치 (영수증: ${aiAnalysis.amount_krw}원, ${tierPlan.label} 구독: ${expectedKrw}원)`,
      ai_analysis: aiAnalysis
    }, 400);
  }
  // 계좌번호 또는 예금주명 검증
  const accountNorm = (aiAnalysis.receiver_account_number || '').replace(/[^0-9]/g, '');
  if (accountNorm) {
    if (accountNorm !== RECEIVER_ACCOUNT.number_normalized) {
      return jsonResponse({
        error: `수신 계좌 불일치 (영수증: ${aiAnalysis.receiver_account_number}, 회사: ${RECEIVER_ACCOUNT.number_normalized})`,
        ai_analysis: aiAnalysis
      }, 400);
    }
  } else {
    const holderNorm = (aiAnalysis.receiver_holder || '').replace(/\s/g, '');
    const expectedHolder = RECEIVER_ACCOUNT.holder.replace(/\s/g, '');
    if (holderNorm !== expectedHolder) {
      return jsonResponse({
        error: `예금주명 불일치 (영수증: "${aiAnalysis.receiver_holder}", 회사: "${RECEIVER_ACCOUNT.holder}")`,
        ai_analysis: aiAnalysis
      }, 400);
    }
  }
  // 메모 코드 매칭
  const memoNorm = (aiAnalysis.memo || '').toUpperCase().replace(/\s/g, '');
  const memoExpected = user_memo_code.toUpperCase().replace(/\s/g, '');
  if (!memoNorm.includes(memoExpected)) {
    return jsonResponse({
      error: `메모 코드 불일치 (영수증: "${aiAnalysis.memo}", 필수: "${user_memo_code}")`,
      ai_analysis: aiAnalysis
    }, 400);
  }

  // 검증 성공 — payments 기록 + 구독 활성화
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const periodStartedAt = new Date().toISOString();

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
        payment_type: 'toss_subscribe',
        amount_krw: expectedKrw,
        portone_imp_uid: null,
        portone_merchant_uid: user_memo_code,
        status: 'paid',
        raw_response: {
          tier,
          ai_analysis: aiAnalysis,
          image_sha256,
          ai_cost_usd: aiCostUsd,
          verified_at: new Date().toISOString()
        }
      })
    });
  } catch (e) { console.warn('[verify-toss-subscribe] payment 기록 실패:', e); }

  // 구독 활성화 — billing PATCH (subscribe.ts 와 동일 패턴, 단 결제 검증은 토스 영수증 으로 대체)
  try {
    const patchResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        subscription_active: true,
        subscription_expires_at: expiresAt,
        subscription_plan: tier,
        monthly_quota_usd: tierPlan.cap_usd,
        monthly_token_used: 0,
        monthly_period_started_at: periodStartedAt
      })
    });
    if (!patchResp.ok) {
      const errText = await patchResp.text().catch(() => '');
      console.error('[verify-toss-subscribe] billing PATCH 실패:', patchResp.status, errText);
      return jsonResponse({ error: '구독 활성화 실패: ' + patchResp.status }, 500);
    }
    return jsonResponse({
      ok: true,
      verified: true,
      tier,
      cap_usd: tierPlan.cap_usd,
      expires_at: expiresAt,
      ai_confidence: aiAnalysis.confidence,
      message: `${tierPlan.label} 구독 한 달 활성화 ✦`
    });
  } catch (e: any) {
    return jsonResponse({ error: '구독 활성화 실패: ' + (e?.message || e) }, 500);
  }
}
