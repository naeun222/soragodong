// Hook push queue — POST.
// 사용자 명시 2026-05-17 Phase B.
//
// POST /api/hook/queue — frontend 가 hook 생성 직후 호출. 다음 push 시간에 발사할 entry 등록.
//   body: { hook_id, body, scheduled_at (ISO), user_name? }
//   user_id PK → upsert (latest 1 entry 만 유지).
//   sent_at 자동 NULL reset → 새 hook 이 옛 pending 덮어씀.
//
// prefs 가 없거나 enabled=false 인 사용자도 queue 에 들어옴 (silent — cron 이 prefs 체크해서 skip).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

type QueueBody = {
  hook_id: string;
  body: string;
  scheduled_at: string;  // ISO
  user_name?: string;
};

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: QueueBody;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON' }, 400); }

  const hook_id = String(body.hook_id || '').slice(0, 100);
  const hookBody = String(body.body || '').slice(0, 500);
  const scheduled_at = String(body.scheduled_at || '');
  const user_name = String(body.user_name || '').slice(0, 30) || null;

  if (!hook_id || !hookBody || !scheduled_at) {
    return jsonResponse({ ok: false, error: 'hook_id / body / scheduled_at 필수' }, 400);
  }
  if (isNaN(new Date(scheduled_at).getTime())) {
    return jsonResponse({ ok: false, error: 'scheduled_at invalid' }, 400);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'supabase env 누락' }, 500);
  }

  // upsert — 같은 user 의 옛 pending hook 덮어씀. sent_at / send_attempts / last_error reset.
  const row = {
    user_id: user.id,
    hook_id, body: hookBody,
    user_name,
    scheduled_at,
    sent_at: null,
    send_attempts: 0,
    last_error: null,
  };

  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return jsonResponse({ ok: false, error: errText.slice(0, 300), status: resp.status }, 500);
  }
  return jsonResponse({ ok: true });
}

// DELETE — 사용자가 직접 pending 취소 (옵션. 아직 frontend 호출 X).
export async function onRequestDelete(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'supabase env 누락' }, 500);
  }
  await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue?user_id=eq.${user.id}`, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }).catch(() => {});
  return jsonResponse({ ok: true });
}
