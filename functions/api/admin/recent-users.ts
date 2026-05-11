// GET /api/admin/recent-users — admin only. 최근 가입자 / 게스트 목록.
// 사용자 요청 2026-05-11: 영상 마케팅 직후 신규 유입 현황을 DevTools 콘솔에서 즉시 확인.
//
// Query:
//   limit  (1~200, default 50)
//   since  (24h | 7d | 30d | all, default 24h)
//   filter (all | guests | signups, default all)
//
// Response: { users: [{id,email,isGuest,createdAt,lastSignInAt,provider}], summary: {total,guests,real} }
//
// auth.users 는 PostgREST 의 rest/v1 로 노출 안 됨 → Supabase Auth Admin API (/auth/v1/admin/users) 사용.
// per_page=200 한 페이지 fetch → since/filter 인메모리 처리. 24h 신규가 200 넘으면 페이지네이션 추가 필요.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const ALLOWED_SINCE = new Set(['24h', '7d', '30d', 'all']);
const ALLOWED_FILTER = new Set(['all', 'guests', 'signups']);

function sinceMs(since: string): number | null {
  if (since === '24h') return 24 * 60 * 60 * 1000;
  if (since === '7d')  return 7 * 24 * 60 * 60 * 1000;
  if (since === '30d') return 30 * 24 * 60 * 60 * 1000;
  return null;  // 'all'
}

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    console.error('[admin/recent-users] ADMIN_USER_ID env 미설정');
    return jsonResponse({ error: '서버 설정 오류 (관리자에게 문의)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env 미설정 — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인' }, 500);
  }

  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const sinceRaw = url.searchParams.get('since') || '24h';
  const since = ALLOWED_SINCE.has(sinceRaw) ? sinceRaw : '24h';
  const filterRaw = url.searchParams.get('filter') || 'all';
  const filter = ALLOWED_FILTER.has(filterRaw) ? filterRaw : 'all';

  let resp: Response;
  try {
    resp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
  } catch (e: any) {
    return jsonResponse({ error: 'Supabase Auth Admin API fetch 실패: ' + (e?.message || e) }, 500);
  }
  if (!resp.ok) {
    const body = await resp.text();
    return jsonResponse({
      error: 'auth.users 조회 실패',
      upstream_status: resp.status,
      upstream_body: body.slice(0, 500),
      hint: resp.status === 401 || resp.status === 403
        ? 'SUPABASE_SERVICE_ROLE_KEY 가 admin 권한 키인지 확인'
        : 'SUPABASE_URL / 네트워크 확인',
    }, 500);
  }

  let data: any;
  try { data = await resp.json(); } catch { data = {}; }
  const allUsers: any[] = Array.isArray(data?.users) ? data.users : [];

  const sinceMillis = sinceMs(since);
  const cutoff = sinceMillis === null ? null : Date.now() - sinceMillis;

  const filtered = allUsers.filter((u) => {
    if (cutoff !== null) {
      const created = u.created_at ? new Date(u.created_at).getTime() : 0;
      if (created < cutoff) return false;
    }
    const isAnon = !!u.is_anonymous;
    if (filter === 'guests' && !isAnon) return false;
    if (filter === 'signups' && isAnon) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  const sliced = filtered.slice(0, limit);

  const users = sliced.map((u) => ({
    id: u.id,
    email: u.email || null,
    isGuest: !!u.is_anonymous,
    createdAt: u.created_at || null,
    lastSignInAt: u.last_sign_in_at || null,
    provider: u.app_metadata?.provider || (u.is_anonymous ? 'anonymous' : 'email'),
  }));

  const summary = {
    total: users.length,
    guests: users.filter((u) => u.isGuest).length,
    real: users.filter((u) => !u.isGuest).length,
  };

  return jsonResponse({ users, summary });
}
