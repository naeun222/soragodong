// V4 (사용자 명시 2026-05-17 ultrathink): Hook 옵션 A — pull 패턴.
//   iOS PWA 사용자 push 못 받아도 fetch 로 hook 받음. push + fetch 둘 다 trigger, id dedup (frontend).
//
// GET /api/hook/pending — 현재 user 의 latest hook (sent_at 박힘 + answered_at NULL + 7d 안) 1 row 반환.
//   user 당 1 row (hook_push_queue PK = user_id).
//   sent_at IS NULL = backend 가 아직 push 발사 X (cron 대기) — 안 반환 (안 보냈으니 사용자 모름이 맞음).
//   sent_at IS NOT NULL + answered_at NULL = pending (push 발사 후 답변 X 상태).
//   7d 지난 row 는 stale → 반환 X.
//   응답 시 last_displayed_at = NOW() mark (best-effort, 통계용).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

const SEVEN_DAYS_MS = 7 * 86400000;

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'SUPABASE env 누락' }, 500);
  }

  const sevenDaysAgoIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const url = `${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue` +
    `?select=hook_id,body,user_name,scheduled_at,sent_at,answered_at` +
    `&user_id=eq.${user.id}` +
    `&sent_at=not.is.null` +
    `&sent_at=gte.${encodeURIComponent(sevenDaysAgoIso)}` +
    `&answered_at=is.null` +
    `&limit=1`;
  const resp = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) {
    console.warn('[hook pending] fetch fail', resp.status);
    return jsonResponse({ ok: false, error: 'fetch fail' }, 500);
  }
  const rows: any[] = await resp.json().catch(() => []);
  if (!rows.length) return jsonResponse({ ok: true, hook: null });

  const row = rows[0];

  // mark last_displayed_at (fire-and-forget, 통계용).
  fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue?user_id=eq.${user.id}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ last_displayed_at: new Date().toISOString() }),
  }).catch(() => {});

  return jsonResponse({
    ok: true,
    hook: {
      id: row.hook_id,
      body: row.body,
      userName: row.user_name,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
    },
  });
}
