// GET /api/admin/feedback-list — admin only. 사용자 피드백 list 조회.
// 사용자 요청 2026-04-30: 김나은 admin이 인앱으로 피드백 답변하기 위한 list endpoint.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get('status') || '';  // 'open' | 'replied' | 'all'
  let query = '?select=*&order=created_at.desc&limit=200';
  if (filter && filter !== 'all') {
    query = `?status=eq.${encodeURIComponent(filter)}` + query;
  }

  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_feedback${query}`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    if (!resp.ok) {
      return jsonResponse({ error: '조회 실패' }, 500);
    }
    const rows: any = await resp.json();
    return jsonResponse({ feedback: rows });
  } catch (e: any) {
    return jsonResponse({ error: '예외: ' + (e?.message || e) }, 500);
  }
}
