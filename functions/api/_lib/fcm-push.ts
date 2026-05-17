// V4 (사용자 명시 2026-05-18 ultrathink): Capacitor native push → FCM HTTP v1 발송 helper.
//   Cloudflare Workers 환경. Firebase Admin SDK 없이 raw HTTP. Web Crypto API 로 JWT RS256 signing.
//
// 환경 변수:
//   FCM_SERVICE_ACCOUNT_JSON — Firebase Console > Project Settings > Service Accounts > Generate new private key 다운로드한 JSON 전체.
//     CF Workers Secret 으로 set: `npx wrangler pages secret put FCM_SERVICE_ACCOUNT_JSON` 후 JSON 문자열 paste.
//
// 사용:
//   const r = await sendFcm(fcmToken, title, body, data, env);
//   r.ok / r.gone / r.error.

export interface FcmEnv {
  FCM_SERVICE_ACCOUNT_JSON?: string;
}

export interface FcmResult {
  ok: boolean;
  status?: number;
  error?: string;
  gone?: boolean;  // UNREGISTERED token — backend 가 subscription clear.
}

// ─────────────────────────────────────────────────────────────────────────────
// Base64URL encoding helpers
// ─────────────────────────────────────────────────────────────────────────────
function _b64urlEncodeString(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _b64urlEncodeBytes(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// PEM PKCS#8 → CryptoKey (RSASSA-PKCS1-v1_5 / SHA-256)
// ─────────────────────────────────────────────────────────────────────────────
async function _importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(pemContents);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT RS256 signing — Service Account 인증용.
// ─────────────────────────────────────────────────────────────────────────────
async function _createJwt(sa: { client_email: string; private_key: string }): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = _b64urlEncodeString(JSON.stringify(header));
  const payloadB64 = _b64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const privateKey = await _importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${_b64urlEncodeBytes(new Uint8Array(signature))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth2 access_token (urn:ietf:params:oauth:grant-type:jwt-bearer)
// ─────────────────────────────────────────────────────────────────────────────
async function _getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const jwt = await _createJwt(sa);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OAuth2 token fail: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as { access_token?: string };
  if (!data.access_token) throw new Error('OAuth2 token missing in response');
  return data.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM HTTP v1 send.
//   fcmToken: PushNotifications.register() 가 받은 registration token.
//   data: { hookId, userName, ... } — string values only (FCM 제약).
// ─────────────────────────────────────────────────────────────────────────────
export async function sendFcm(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string | number>,
  env: FcmEnv
): Promise<FcmResult> {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) {
    return { ok: false, error: 'FCM_SERVICE_ACCOUNT_JSON env 누락' };
  }
  let sa: any;
  try { sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON); }
  catch { return { ok: false, error: 'FCM_SERVICE_ACCOUNT_JSON invalid JSON' }; }
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    return { ok: false, error: 'FCM_SERVICE_ACCOUNT_JSON incomplete (project_id/client_email/private_key 누락)' };
  }

  let accessToken: string;
  try { accessToken = await _getAccessToken(sa); }
  catch (e: any) { return { ok: false, error: 'access token: ' + String(e && e.message || e) }; }

  // FCM data fields = string only.
  const dataStr: Record<string, string> = {};
  for (const k of Object.keys(data || {})) {
    const v = data[k];
    if (v !== null && v !== undefined) dataStr[k] = String(v);
  }

  const message = {
    message: {
      token: fcmToken,
      notification: { title, body },
      data: dataStr,
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'default',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: { sound: 'default' },
        },
      },
    },
  };

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  if (resp.ok) return { ok: true };
  const text = await resp.text().catch(() => '');
  // FCM error codes: NOT_FOUND/UNREGISTERED → token invalid → clear subscription.
  if (resp.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(text)) {
    return { ok: false, status: resp.status, error: text.slice(0, 300), gone: true };
  }
  if (resp.status === 400 && /INVALID_ARGUMENT.*token/i.test(text)) {
    return { ok: false, status: resp.status, error: text.slice(0, 300), gone: true };
  }
  return { ok: false, status: resp.status, error: text.slice(0, 300) };
}
