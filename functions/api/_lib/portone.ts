// Cloudflare Pages Functions — PortOne V2 REST API helper.
// 사용자 명시 2026-05-06: V1 (api.iamport.kr) 폐기 → V2 (api.portone.io) 전환.
// Auth: Authorization: PortOne <PORTONE_API_KEY_V2>

import type { Env } from './auth';

const PORTONE_API_BASE = 'https://api.portone.io';

export interface PortOnePaymentAmount {
  total: number;
  taxFree?: number;
  vat?: number;
  supply?: number;
  discount?: number;
  paid?: number;
  cancelled?: number;
}

export interface PortOnePayment {
  id: string;
  txId?: string;
  status: 'READY' | 'PENDING' | 'PAID' | 'FAILED' | 'PARTIAL_CANCELLED' | 'CANCELLED' | 'PAY_PENDING' | 'VIRTUAL_ACCOUNT_ISSUED';
  storeId?: string;
  channel?: {
    id?: string;
    key?: string;
    type?: string;
    pgProvider?: string;
  };
  orderName?: string;
  amount?: PortOnePaymentAmount;
  currency?: string;
  customer?: any;
  paidAt?: string;
  receiptUrl?: string;
  method?: any;
  customData?: string;
}

// 결제 단건 조회 — 결제 검증용 (frontend 가 paymentId 전달 → 서버에서 실제 status / amount 검증).
export async function fetchPortOnePayment(env: Env, paymentId: string): Promise<{ ok: true; payment: PortOnePayment } | { ok: false; error: string; status?: number }> {
  if (!env.PORTONE_API_KEY_V2) {
    return { ok: false, error: 'PORTONE_API_KEY_V2 env 미설정' };
  }
  try {
    const resp = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        'Authorization': `PortOne ${env.PORTONE_API_KEY_V2}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('[portone] payment fetch fail:', resp.status, err.slice(0, 300));
      return { ok: false, error: `payment fetch ${resp.status}: ${err.slice(0, 200)}`, status: resp.status };
    }
    const data: any = await resp.json();
    return { ok: true, payment: data };
  } catch (e: any) {
    console.error('[portone] payment fetch throw:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// 결제 취소 — 환불용 (전체 또는 부분).
export async function cancelPortOnePayment(
  env: Env,
  paymentId: string,
  reason: string,
  amount?: number
): Promise<{ ok: boolean; error?: string; cancellation?: any }> {
  if (!env.PORTONE_API_KEY_V2) return { ok: false, error: 'PORTONE_API_KEY_V2 미설정' };
  try {
    const body: any = { reason };
    if (typeof amount === 'number' && amount > 0) body.amount = amount;
    const resp = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `PortOne ${env.PORTONE_API_KEY_V2}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      return { ok: false, error: `cancel fail ${resp.status}: ${err.slice(0, 200)}` };
    }
    const data: any = await resp.json().catch(() => ({}));
    return { ok: true, cancellation: data?.cancellation };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ─── 빌링키 (정기결제) — 얼리버드 첫 달 무료 + 자동 갱신용 ───
// 사용자 명시 2026-05-06: 카드 등록만 (즉시 결제 X) → 30일 후 cron 이 이 키로 첫 결제.

export interface PortOneBillingKey {
  billingKey: string;
  channels?: any[];
  customer?: any;
  status?: 'ISSUED' | 'DELETED';
  issuedAt?: string;
  deletedAt?: string;
  methods?: any[];
}

// 빌링키 단건 조회 — frontend 가 issue 후 backend 에 billingKey 전달 → 진위 검증.
export async function fetchPortOneBillingKey(env: Env, billingKey: string): Promise<{ ok: true; data: PortOneBillingKey } | { ok: false; error: string; status?: number }> {
  if (!env.PORTONE_API_KEY_V2) return { ok: false, error: 'PORTONE_API_KEY_V2 미설정' };
  try {
    const resp = await fetch(`${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`, {
      headers: {
        'Authorization': `PortOne ${env.PORTONE_API_KEY_V2}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      return { ok: false, error: `billing-key fetch ${resp.status}: ${err.slice(0, 200)}`, status: resp.status };
    }
    const data: any = await resp.json();
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 사용자 명시 2026-05-09 ultrathink: 현금영수증 자진발급 — 부가가치세법 §32-2 의무.
// 자진발급 식별번호 = '010-000-1234' (= 01000001234). 사용자 본인 휴대폰 입력 시 PERSONAL 소득공제용.
export const CASH_RECEIPT_SELF_ISSUE_NUMBER = '01000001234';

// 빌링키로 결제 — cron 이 trial_until 도래 시 호출. paymentId = 신규 unique.
// orderName / customer / amount 모두 전달. PortOne V2 = POST /payments/{paymentId}/billing-key
export async function chargeWithBillingKey(env: Env, paymentId: string, params: {
  billingKey: string;
  orderName: string;
  amount: number;
  currency?: string;
  customer?: { id?: string; email?: string; phoneNumber?: string; name?: { full?: string } };
  customData?: string;
  cashReceipt?: { type: 'PERSONAL' | 'CORPORATE'; customerIdentityNumber: string };
}): Promise<{ ok: true; payment: PortOnePayment } | { ok: false; error: string; code?: string; status?: number }> {
  if (!env.PORTONE_API_KEY_V2) return { ok: false, error: 'PORTONE_API_KEY_V2 미설정' };
  try {
    const body: any = {
      billingKey: params.billingKey,
      orderName: params.orderName,
      amount: { total: params.amount },
      currency: params.currency || 'KRW'
    };
    if (params.customer) body.customer = params.customer;
    if (params.customData) body.customData = params.customData;
    // 사용자 명시 2026-05-09 ultrathink: 현금영수증 자진발급 자동 적용 (부가세법 §32-2 의무).
    // 사용자 명시 휴대폰/사업자번호 없으면 자진발급 (010-000-1234).
    body.cashReceipt = params.cashReceipt || { type: 'PERSONAL', customerIdentityNumber: CASH_RECEIPT_SELF_ISSUE_NUMBER };
    const resp = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/billing-key`, {
      method: 'POST',
      headers: {
        'Authorization': `PortOne ${env.PORTONE_API_KEY_V2}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      let parsed: any = {};
      try { parsed = JSON.parse(errTxt); } catch {}

      // 사용자 보고 2026-05-11: ALREADY_PAID = 이전 시도가 비동기로 실제 결제 성공한 케이스 복구.
      //   원인: 카카오페이 등 비동기 응답 → 클라가 status 못 읽어 에러 처리.
      //   PortOne 측은 paymentId 멱등 보호로 동일 ID 재시도 시 ALREADY_PAID 반환.
      //   해결: 기존 결제 fetch 해서 PAID 면 정상 진행.
      if (parsed?.type === 'ALREADY_PAID') {
        console.log('[portone] ALREADY_PAID — recovering existing payment:', paymentId);
        const polled = await fetchPortOnePayment(env, paymentId);
        if (polled.ok && polled.payment.status === 'PAID') {
          return { ok: true, payment: polled.payment };
        }
        // PAID 아닌 상태 (FAILED 등) — fall through 해서 원래 에러 반환.
      }

      return {
        ok: false,
        error: parsed?.message || errTxt.slice(0, 300),
        code: parsed?.type || `HTTP_${resp.status}`,
        status: resp.status
      };
    }
    const data: any = await resp.json();
    // PortOne V2 응답 유형 3가지:
    //   1) 동기 nested:  { payment: { id, status:'PAID', ... } }
    //   2) 동기 flat:    { type:'InstantBillingKeyPaymentSummary', paymentId, status:'PAID', ... }
    //   3) 비동기:       { type:'PaymentBillingKeyPaymentInProgress', asyncPaymentInProgress: true }
    // 사용자 보고 2026-05-11: KG이니시스 빌링키 = 비동기 응답 케이스 → polling 으로 최종 status 조회.
    let payment: PortOnePayment = data?.payment || data;
    if (!payment.status) {
      console.log('[portone] charge response missing status (async?):', JSON.stringify(data).slice(0, 300));
      // 최대 10초 polling — Cloudflare wall-time 보호.
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const polled = await fetchPortOnePayment(env, paymentId);
        if (polled.ok && polled.payment.status) {
          payment = polled.payment;
          if (payment.status === 'PAID' || payment.status === 'FAILED' || payment.status === 'CANCELLED') break;
        }
      }
      if (!payment.status) {
        return { ok: false, error: 'PortOne 응답에 status 없음 — polling 도 timeout. raw: ' + JSON.stringify(data).slice(0, 200) };
      }
    }
    return { ok: true, payment };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 빌링키 삭제 — 사용자가 '구독 즉시 해지 / 카드 등록 취소' 시.
export async function deletePortOneBillingKey(env: Env, billingKey: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!env.PORTONE_API_KEY_V2) return { ok: false, error: 'PORTONE_API_KEY_V2 미설정' };
  try {
    const resp = await fetch(`${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}?reason=${encodeURIComponent(reason)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `PortOne ${env.PORTONE_API_KEY_V2}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      return { ok: false, error: `billing-key delete ${resp.status}: ${err.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 사용자 명시 2026-05-06: PortOne V2 webhook (svix 호환) 서명 검증.
// header webhook-id + webhook-timestamp + webhook-signature 셋 다 필요.
// signature 형식: "v1,<base64>" — secret 으로 HMAC-SHA256(`${id}.${timestamp}.${body}`) base64 와 일치 확인.
// Cloudflare Workers crypto.subtle 사용.
export async function verifyPortOneWebhook(
  env: Env,
  rawBody: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
  webhookSignature: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!env.PORTONE_WEBHOOK_SECRET) return { ok: false, error: 'PORTONE_WEBHOOK_SECRET 미설정' };
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, error: 'webhook headers 누락 (id/timestamp/signature)' };
  }
  // timestamp 5분 신선도 검증 (replay attack 방지).
  const ts = parseInt(webhookTimestamp, 10);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    return { ok: false, error: 'webhook timestamp stale (5분 초과)' };
  }
  // PortOne webhook secret 은 'whsec_' prefix + base64 인코딩.
  const secretKey = env.PORTONE_WEBHOOK_SECRET.startsWith('whsec_')
    ? env.PORTONE_WEBHOOK_SECRET.slice('whsec_'.length)
    : env.PORTONE_WEBHOOK_SECRET;
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(secretKey), c => c.charCodeAt(0));
  } catch {
    return { ok: false, error: 'webhook secret base64 디코드 실패' };
  }
  const toSign = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(toSign));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  // signature header = "v1,<sig> v1,<sig> ..." (공백 분리 다중 가능)
  const candidates = webhookSignature.split(' ').map(s => {
    const parts = s.split(',');
    return parts.length === 2 && parts[0] === 'v1' ? parts[1] : null;
  }).filter(Boolean) as string[];
  if (candidates.includes(expectedB64)) return { ok: true };
  return { ok: false, error: 'webhook signature mismatch' };
}
