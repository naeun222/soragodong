// V4 (사용자 명시 2026-05-17 ultrathink): Hook 옵션 A — answered mark.
//
// POST /api/hook/answered — body: { hook_id }. user_id PK + hook_id 매칭 row 에 answered_at = NOW().
//   사용자가 hook 에 답변 (chat send + replyToHookId) 시 frontend 가 호출.
//   미일치 hook_id (옛 hook 또는 다른 user) = silent skip (OK 반환).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'SUPABASE env 누락' }, 500);
  }

  let body: any = {};
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON' }, 400); }
  const hook_id = String(body.hook_id || '').slice(0, 100).trim();
  if (!hook_id) return jsonResponse({ ok: false, error: 'hook_id 필수' }, 400);

  // user_id PK + hook_id 일치 row 만 mark. mismatch = silent (0 row update — 정상).
  const url = `${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue` +
    `?user_id=eq.${user.id}&hook_id=eq.${encodeURIComponent(hook_id)}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ answered_at: new Date().toISOString() }),
  });
  if (!resp.ok) {
    console.warn('[hook answered] PATCH fail', resp.status);
    return jsonResponse({ ok: false, error: 'PATCH fail' }, 500);
  }
  return jsonResponse({ ok: true });
}
