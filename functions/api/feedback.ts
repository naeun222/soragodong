// POST /api/feedback — 인앱 사용자 메시지 → Supabase soragodong_feedback 테이블 저장.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }
  const { message } = body;
  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    return jsonResponse({ error: '5자 이상 적어주세요' }, 400);
  }
  if (message.length > 2000) {
    return jsonResponse({ error: '2000자 이하' }, 400);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase env 누락' }, 500);
  }

  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_feedback`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: user.id,
        user_email: user.email || null,
        message: message.trim(),
        created_at: new Date().toISOString(),
        status: 'open'
      })
    });
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: '저장 실패: ' + (e?.message || e) }, 500);
  }
}
