// Cloudflare Pages Functions — Turnstile 토큰 검증 (Phase 0).
// 사용자 명시 2026-05-05: 게스트 chat 진입 시만 검증. 인증 사용자는 skip.
//
// Site key (frontend, 공개 OK): 0x4AAAAAADJh3vgSfSXeGNkj
// Secret key (env, 비공개): TURNSTILE_SECRET_KEY — Cloudflare Pages env 직접 등록.
//
// 미설정 시 게스트 chat = fail-closed (검증 X = 봇 의심).

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileVerifyResult =
  | { ok: true }
  | { ok: false; reason: string; codes?: string[] };

export async function verifyTurnstileToken(
  secretKey: string | undefined,
  token: string | null | undefined,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  if (!secretKey) {
    console.error('[turnstile] TURNSTILE_SECRET_KEY env 누락 — Pages env 설정 필요');
    return { ok: false, reason: '게스트 검증 미설정 (서버)' };
  }
  if (!token) {
    return { ok: false, reason: 'Turnstile 토큰 누락 — 페이지 새로고침 후 다시' };
  }
  const form = new URLSearchParams();
  form.set('secret', secretKey);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);
  try {
    const resp = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const data: any = await resp.json();
    if (data?.success) return { ok: true };
    return {
      ok: false,
      reason: '봇 검증 실패 — 페이지 새로고침',
      codes: data?.['error-codes']
    };
  } catch (e: any) {
    console.warn('[turnstile] verify throw:', e?.message || e);
    return { ok: false, reason: 'Turnstile 서버 응답 X — 잠시 후' };
  }
}
