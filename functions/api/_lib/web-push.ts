// Web Push (RFC 8030 + RFC 8188 + RFC 8291 aes128gcm) — Cloudflare Workers crypto.subtle 구현.
// 사용자 명시 2026-05-17 Phase B-4.
//
// 외부 의존성 X. ECDSA P-256 (VAPID JWT) + ECDH (shared secret) + HKDF + AES-128-GCM.
//
// 사용:
//   const env = { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_CONTACT_EMAIL };
//   await sendWebPush(subscription, payloadJson, env);
//
// VAPID 키 형식 (USER_TODO 참조):
//   PRIVATE = Base64URL 인코딩된 32-byte raw P-256 d 값. (web-push generate-vapid-keys CLI 출력 호환)
//   PUBLIC = Base64URL 인코딩된 65-byte raw P-256 uncompressed point (0x04 prefix + x + y).
//   CONTACT = "mailto:email@example.com" 또는 "https://..." (Web Push 표준 sub claim).

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;  // base64url, 65 bytes (uncompressed P-256 point)
    auth: string;    // base64url, 16 bytes
  };
}

export interface WebPushEnv {
  VAPID_PRIVATE_KEY: string;   // base64url, 32 bytes (P-256 d)
  VAPID_PUBLIC_KEY: string;    // base64url, 65 bytes (P-256 uncompressed point)
  VAPID_CONTACT_EMAIL: string; // "mailto:email" or "https://..."
}

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
  // subscription 무효 (404/410) — 호출자가 DB row 삭제 권장.
  subscriptionGone?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Base64URL helpers
// ─────────────────────────────────────────────────────────────────────────────
function b64UrlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function b64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (const a of arrs) totalLen += a.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// P-256 key import (ECDSA for VAPID JWT signing, ECDH for shared secret).
// raw 65-byte uncompressed (0x04 || x32 || y32) → CryptoKey.
// raw 32-byte d → P-256 private key (ECDSA + ECDH usage).
// ─────────────────────────────────────────────────────────────────────────────
async function importP256PublicKey(rawBytes: Uint8Array, usage: 'verify' | 'deriveBits'): Promise<CryptoKey> {
  // raw 65 bytes (0x04 prefix + x + y).
  if (rawBytes.length !== 65 || rawBytes[0] !== 0x04) {
    throw new Error('public key must be 65-byte uncompressed P-256 (0x04 prefix)');
  }
  return crypto.subtle.importKey(
    'raw', rawBytes,
    usage === 'verify' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'ECDH', namedCurve: 'P-256' },
    false,
    usage === 'verify' ? ['verify'] : []
  );
}

async function importP256PrivateKeyJwk(dBytes: Uint8Array, publicBytes: Uint8Array, usage: 'sign' | 'deriveBits'): Promise<CryptoKey> {
  if (dBytes.length !== 32) throw new Error('private key d must be 32 bytes');
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) throw new Error('public key must be 65-byte uncompressed');
  const x = publicBytes.slice(1, 33);
  const y = publicBytes.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    d: b64UrlEncode(dBytes),
    x: b64UrlEncode(x),
    y: b64UrlEncode(y),
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk', jwk,
    usage === 'sign' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'ECDH', namedCurve: 'P-256' },
    false,
    usage === 'sign' ? ['sign'] : ['deriveBits']
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VAPID JWT — ES256 signed JWT.
//   header: { typ: 'JWT', alg: 'ES256' }
//   payload: { aud, exp, sub }
// signature = ECDSA-SHA256 over (b64u(header) || '.' || b64u(payload)).
// crypto.subtle.sign returns RAW R||S 64 bytes (P-256), 그대로 b64url 가능.
// ─────────────────────────────────────────────────────────────────────────────
async function buildVapidJwt(audience: string, subject: string, env: WebPushEnv): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,  // 12h
    sub: subject,
  };
  const headerB64 = b64UrlEncode(strToBytes(JSON.stringify(header)));
  const payloadB64 = b64UrlEncode(strToBytes(JSON.stringify(payload)));
  const signingInput = headerB64 + '.' + payloadB64;

  const dBytes = b64UrlDecode(env.VAPID_PRIVATE_KEY);
  const pubBytes = b64UrlDecode(env.VAPID_PUBLIC_KEY);
  const privateKey = await importP256PrivateKeyJwk(dBytes, pubBytes, 'sign');
  const sigBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    strToBytes(signingInput)
  );
  // Web Crypto returns IEEE P1363 (raw R||S 64 bytes) — JOSE 요구 format 그대로.
  return signingInput + '.' + b64UrlEncode(new Uint8Array(sigBuffer));
}

// ─────────────────────────────────────────────────────────────────────────────
// HKDF helper — extract + expand.
// crypto.subtle HKDF 만 있음. Extract 단계는 HMAC 으로 직접.
// ─────────────────────────────────────────────────────────────────────────────
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, data);
  return new Uint8Array(sig);
}

// HKDF (RFC 5869): extract + expand. info = label byte string. length = output bytes (≤ 32 here).
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  // T(1) = HMAC(PRK, info || 0x01). length 인 만큼만.
  const t1 = await hmacSha256(prk, concatBytes(info, new Uint8Array([0x01])));
  return t1.slice(0, length);
}

// ─────────────────────────────────────────────────────────────────────────────
// RFC 8291 aes128gcm — payload 암호화.
//   1) ephemeral ECDH key pair (server side per message)
//   2) shared secret = ECDH(server private, client p256dh)
//   3) IKM = HKDF(auth, shared, "WebPush: info\0" || ua_public || as_public, 32)
//   4) salt = random 16 bytes
//   5) CEK = HKDF(salt, IKM, "Content-Encoding: aes128gcm\0", 16)
//   6) nonce = HKDF(salt, IKM, "Content-Encoding: nonce\0", 12)
//   7) padded = payload || 0x02 || (zero pad to record size - 17)
//   8) ciphertext = AES-128-GCM(CEK, nonce, padded)
//   9) record = salt(16) || record_size_be32(4) || idlen(1) || keyid(65 server public) || ciphertext
// ─────────────────────────────────────────────────────────────────────────────
async function encryptPayloadAes128Gcm(
  payload: Uint8Array,
  subscription: WebPushSubscription
): Promise<Uint8Array> {
  const uaPublic = b64UrlDecode(subscription.keys.p256dh);  // 65 bytes
  const authSecret = b64UrlDecode(subscription.keys.auth);  // 16 bytes
  if (uaPublic.length !== 65) throw new Error('p256dh must be 65 bytes');
  if (authSecret.length !== 16) throw new Error('auth must be 16 bytes');

  // (1) ephemeral key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const asPublicJwk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);
  const asPublic = concatBytes(
    new Uint8Array([0x04]),
    b64UrlDecode(asPublicJwk.x!),
    b64UrlDecode(asPublicJwk.y!)
  );

  // (2) shared secret via ECDH
  const uaPublicKey = await importP256PublicKey(uaPublic, 'deriveBits');
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPublicKey },
    ephemeral.privateKey,
    256
  );
  const shared = new Uint8Array(sharedBits);

  // (3) IKM = HKDF(auth, shared, "WebPush: info\0" || ua_public || as_public, 32)
  const ikmInfo = concatBytes(
    strToBytes('WebPush: info'),
    new Uint8Array([0x00]),
    uaPublic,
    asPublic
  );
  const ikm = await hkdf(authSecret, shared, ikmInfo, 32);

  // (4) salt
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // (5) CEK
  const cekInfo = concatBytes(strToBytes('Content-Encoding: aes128gcm'), new Uint8Array([0x00]));
  const cek = await hkdf(salt, ikm, cekInfo, 16);

  // (6) nonce
  const nonceInfo = concatBytes(strToBytes('Content-Encoding: nonce'), new Uint8Array([0x00]));
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // (7) padded — payload + 0x02 (last record delimiter). 추가 padding 없음.
  const padded = concatBytes(payload, new Uint8Array([0x02]));

  // (8) AES-128-GCM
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    cekKey,
    padded
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  // (9) record header — RFC 8188.
  // record_size (be32) — payload 가 한 record 안 들어가는 최소값 (실제 사이즈 + 17 + slack).
  //   spec: record size minimum = payload + 17. 우리는 안전하게 4096 사용.
  const recordSize = Math.max(ciphertext.length + 17, 4096);
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);  // 16 + 4 + 1 + 65 = 86
  header.set(salt, 0);
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, recordSize, false);
  header.set(rsBytes, 16);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concatBytes(header, ciphertext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry — sendWebPush(subscription, payloadString, env, ttl?)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: string,
  env: WebPushEnv,
  opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {}
): Promise<SendResult> {
  try {
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return { ok: false, error: 'invalid subscription' };
    }
    if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
      return { ok: false, error: 'VAPID env 누락' };
    }

    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const subject = env.VAPID_CONTACT_EMAIL && env.VAPID_CONTACT_EMAIL.startsWith('mailto:')
      ? env.VAPID_CONTACT_EMAIL
      : env.VAPID_CONTACT_EMAIL && env.VAPID_CONTACT_EMAIL.startsWith('http')
      ? env.VAPID_CONTACT_EMAIL
      : 'mailto:noreply@soragodong.com';

    const jwt = await buildVapidJwt(audience, subject, env);
    const cipherBody = await encryptPayloadAes128Gcm(strToBytes(payload), subscription);

    const headers: Record<string, string> = {
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(opts.ttl ?? 86400),  // 24h default
    };
    if (opts.urgency) headers['Urgency'] = opts.urgency;

    const resp = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: cipherBody,
    });

    if (resp.ok || resp.status === 201) return { ok: true, status: resp.status };
    if (resp.status === 404 || resp.status === 410) {
      return { ok: false, status: resp.status, subscriptionGone: true, error: 'subscription gone' };
    }
    const errText = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, error: errText.slice(0, 300) };
  } catch (e: any) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
