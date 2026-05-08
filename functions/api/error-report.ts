// 사용자 명시 2026-05-05 ultrathink-3: 클라이언트 에러 자동 보고 → soragodongapp@gmail.com.
// 클라이언트 측 1h dedupe (localStorage signature) + backend Resend API 호출.
//
// 환경변수:
//   - RESEND_API_KEY (필수, 미설정 시 silent skip — 코드 batch 안 깨짐)
//   - ERROR_REPORT_FROM (선택, 기본 'onboarding@resend.dev' = Resend domain 인증 X 시 fallback)
//   - ERROR_REPORT_TO (선택, 기본 'soragodongapp@gmail.com')
//
// 가입: https://resend.com → API Keys → Create. Cloudflare env vars 추가 후 자동 활성.
// Free tier: 3,000/월 / 100/일 — 클라이언트 dedupe 1h 가 있어 충분.

import type { Env as BaseEnv } from './_lib/auth';

type Env = BaseEnv & {
  RESEND_API_KEY?: string;
  ERROR_REPORT_FROM?: string;
  ERROR_REPORT_TO?: string;
};

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// 사용자 명시 2026-05-08 ultrathink (audit WARN #16): IP rate limit — Resend 무료 100/일 스팸 소진 차단.
// 같은 IP 시간당 5건 cap. KV 미설정 시 silent skip (보고 누락 회피 우선).
async function _checkErrorReportRate(env: Env & { GUEST_KV?: any }, ip: string): Promise<boolean> {
  if (!env.GUEST_KV || !ip || ip === 'unknown') return true;
  try {
    const hourKey = `errrpt:${ip}:${new Date().toISOString().slice(0, 13)}`;
    const cur = parseInt((await env.GUEST_KV.get(hourKey)) || '0', 10);
    if (cur >= 5) return false;
    await env.GUEST_KV.put(hourKey, String(cur + 1), { expirationTtl: 3700 });
    return true;
  } catch { return true; }  // KV throw → 통과
}

export async function onRequestPost(context: { request: Request; env: Env & { GUEST_KV?: any } }): Promise<Response> {
  const { request, env } = context;

  // 사용자 명시 2026-05-08 ultrathink (audit WARN #16): IP rate limit 추가.
  const _ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const _rateOk = await _checkErrorReportRate(env, _ip);
  if (!_rateOk) {
    return new Response(JSON.stringify({ ok: false, code: 'RATE_LIMITED' }), {
      status: 200,  // 200 으로 응답 (클라이언트 dedupe 가 sent 으로 mark X)
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body: any = {};
  try { body = await request.json(); } catch {}

  // 사용자 식별 — 클라이언트가 access_token 같이 보내면 검증 가능. 일단 익명도 허용 (보고 누락 회피 우선).
  // body 안 userId / appVersion / signature / detail / stack / userAgent / url / time 사용.
  const signature = String(body.signature || 'unknown').slice(0, 200);
  const detail = String(body.detail || '').slice(0, 4000);
  const stack = String(body.stack || '').slice(0, 4000);
  const userId = String(body.userId || 'anonymous').slice(0, 100);
  const appVersion = String(body.appVersion || 'unknown').slice(0, 50);
  const userAgent = String(body.userAgent || '').slice(0, 300);
  const url = String(body.url || '').slice(0, 300);
  const time = String(body.time || new Date().toISOString()).slice(0, 50);

  if (!env.RESEND_API_KEY) {
    // env 미설정 — 보고 skip 하되 200 으로 응답 (클라이언트 dedupe 가 sent 으로 mark 안 하도록 false 반환).
    console.log('[error-report] RESEND_API_KEY 미설정 — 스킵', { signature });
    return new Response(JSON.stringify({ ok: false, code: 'NO_API_KEY' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const from = env.ERROR_REPORT_FROM || 'onboarding@resend.dev';
  const to = env.ERROR_REPORT_TO || 'soragodongapp@gmail.com';
  const subject = `[소라고동 V4 ${appVersion}] ${signature}`.slice(0, 200);

  const html = `
<!DOCTYPE html>
<html><body style="font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.6;">
  <h3 style="margin: 0 0 12px;">${escapeHtml(signature)}</h3>
  <table style="border-collapse: collapse; margin-bottom: 16px;">
    <tr><td style="padding: 2px 8px; color: #888;">time</td><td style="padding: 2px 8px;">${escapeHtml(time)}</td></tr>
    <tr><td style="padding: 2px 8px; color: #888;">user</td><td style="padding: 2px 8px;">${escapeHtml(userId)}</td></tr>
    <tr><td style="padding: 2px 8px; color: #888;">version</td><td style="padding: 2px 8px;">${escapeHtml(appVersion)}</td></tr>
    <tr><td style="padding: 2px 8px; color: #888;">url</td><td style="padding: 2px 8px;">${escapeHtml(url)}</td></tr>
    <tr><td style="padding: 2px 8px; color: #888;">UA</td><td style="padding: 2px 8px;">${escapeHtml(userAgent)}</td></tr>
  </table>
  <h4 style="margin: 12px 0 4px;">detail</h4>
  <pre style="background: #f4f4f4; padding: 10px; border-radius: 6px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(detail)}</pre>
  ${stack ? `<h4 style="margin: 12px 0 4px;">stack</h4><pre style="background: #f4f4f4; padding: 10px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-size: 11px;">${escapeHtml(stack)}</pre>` : ''}
</body></html>
`.trim();

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, html })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn('[error-report] Resend 비-OK:', resp.status, errText.slice(0, 300));
      return new Response(JSON.stringify({ ok: false, status: resp.status, detail: errText.slice(0, 200) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.warn('[error-report] Resend throw:', e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
