// GET /api/admin/feedback-list — admin only. 사용자 피드백 list 조회.
// 사용자 요청 2026-04-30: Soragodong admin이 인앱으로 피드백 답변하기 위한 list endpoint.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    console.error('[admin] ADMIN_USER_ID env 미설정 — Cloudflare 대시보드에서 박아야 합니다');
    return jsonResponse({ error: '서버 설정 오류 (관리자에게 문의)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env 미설정 — Cloudflare에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 박혀있는지 확인' }, 500);
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
      const upstreamBody = await resp.text();
      // table 없음 / RLS 차단 / 인증 오류 등 — 자세한 에러 표시 (admin 진단용)
      return jsonResponse({
        error: 'soragodong_feedback 조회 실패',
        upstream_status: resp.status,
        upstream_body: upstreamBody.slice(0, 500),
        hint: resp.status === 404 || /relation .* does not exist/i.test(upstreamBody)
          ? 'soragodong_feedback table 없음 — supabase/migrations/0003_feedback.sql 실행 필요'
          : '환경변수 / RLS 정책 확인'
      }, 500);
    }
    const rows: any = await resp.json();
    return jsonResponse({ feedback: rows });
  } catch (e: any) {
    return jsonResponse({ error: '예외: ' + (e?.message || e) }, 500);
  }
}
