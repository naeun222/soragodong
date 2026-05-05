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
