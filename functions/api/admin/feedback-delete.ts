// POST /api/admin/feedback-delete — admin only. 피드백 항목 삭제.
// body: { feedback_id }
// 사용자 명시 2026-05-06: 자동 오류 보고 inbox 정리용 — admin 답변 후 삭제 가능.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    console.error('[admin] ADMIN_USER_ID env 미설정');
    return jsonResponse({ error: '서버 설정 오류 (관리자에게 문의)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { feedback_id } = body;
  if (!feedback_id || typeof feedback_id !== 'number') {
    return jsonResponse({ error: 'feedback_id (number) 필수' }, 400);
  }

  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_feedback?id=eq.${feedback_id}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal'
        }
      }
    );
    if (!resp.ok) {
      const t = await resp.text();
      return jsonResponse({ error: 'DELETE 실패: ' + t.slice(0, 200) }, 500);
    }
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: '예외: ' + (e?.message || e) }, 500);
  }
}
