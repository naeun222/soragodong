// POST /api/admin/feedback-reply — admin only. 피드백에 답변 작성.
// body: { feedback_id, reply }
// 사용자 요청 2026-04-30: 김나은 admin이 인앱에서 답변 → 사용자 inbox에 표시.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { feedback_id, reply } = body;
  if (!feedback_id || typeof feedback_id !== 'number') {
    return jsonResponse({ error: 'feedback_id (number) 필수' }, 400);
  }
  if (!reply || typeof reply !== 'string' || reply.trim().length < 1) {
    return jsonResponse({ error: 'reply 본문 필수' }, 400);
  }
  if (reply.length > 5000) {
    return jsonResponse({ error: '5000자 이하' }, 400);
  }

  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_feedback?id=eq.${feedback_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          admin_reply: reply.trim(),
          replied_at: new Date().toISOString(),
          status: 'replied'
        })
      }
    );
    if (!resp.ok) {
      const t = await resp.text();
      return jsonResponse({ error: 'PATCH 실패: ' + t.slice(0, 200) }, 500);
    }
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: '예외: ' + (e?.message || e) }, 500);
  }
}
