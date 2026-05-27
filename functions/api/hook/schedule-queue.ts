// 일정/할 일 알림 서버 push queue — PUT (upsert) / DELETE.
// 사용자 명시 2026-05-27 ultrathink.
//
// PUT /api/hook/schedule-queue — frontend 가 알림 set/변경 시 호출.
//   body: { item_id, title, body?, scheduled_at (ISO) }
//   UNIQUE(user_id, item_id) → upsert. sent_at / send_attempts / last_error reset (재예약 = 새로 발사 대기).
//
// DELETE /api/hook/schedule-queue?item_id=... — 알림 해제 / 일정 삭제 / 할 일 완료 시 호출.
//
// cron (POST /api/hook/cron-push) 가 hook 처리 후 이 큐도 처리. push_subscription 은 hook_preferences 에서 join.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

type SchedQueueBody = {
  item_id: string;
  title: string;
  body?: string;
  scheduled_at: string;  // ISO
};

export async function onRequestPut(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: SchedQueueBody;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON' }, 400); }

  const item_id = String(body.item_id || '').slice(0, 120);
  const title = String(body.title || '').slice(0, 120);
  const notifBody = String(body.body || '').slice(0, 200);
  const scheduled_at = String(body.scheduled_at || '');

  if (!item_id || !title || !scheduled_at) {
    return jsonResponse({ ok: false, error: 'item_id / title / scheduled_at 필수' }, 400);
  }
  if (isNaN(new Date(scheduled_at).getTime())) {
    return jsonResponse({ ok: false, error: 'scheduled_at invalid' }, 400);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'supabase env 누락' }, 500);
  }

  const row = {
    user_id: user.id,
    item_id,
    title,
    body: notifBody,
    scheduled_at,
    sent_at: null,
    send_attempts: 0,
    last_error: null,
  };

  // upsert on (user_id, item_id). sent_at / attempts / error reset.
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_schedule_push_queue?on_conflict=user_id,item_id`, {
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

export async function onRequestDelete(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'supabase env 누락' }, 500);
  }

  const url = new URL(request.url);
  const itemId = (url.searchParams.get('item_id') || '').slice(0, 120);
  if (!itemId) return jsonResponse({ ok: false, error: 'item_id 필수' }, 400);

  await fetch(
    `${env.SUPABASE_URL}/rest/v1/soragodong_schedule_push_queue` +
    `?user_id=eq.${user.id}&item_id=eq.${encodeURIComponent(itemId)}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  ).catch(() => {});
  return jsonResponse({ ok: true });
}
