// GET /api/admin/pending-charges — admin only. 토스 송금 pending list 조회.
// 사용자 요청 2026-04-30: 김나은 admin이 매일 토스 확인 → pending 송금 list 보고 승인/환수.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  // admin 검증
  if (!env.ADMIN_USER_ID) {
    console.error('[admin] ADMIN_USER_ID env 미설정 — Cloudflare 대시보드에서 박아야 합니다');
    return jsonResponse({ error: '서버 설정 오류 (관리자에게 문의)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  // pending_manual status 송금 list 조회 (최근 30일)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?status=eq.pending_manual&created_at=gte.${cutoff}&select=*&order=created_at.desc`,
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
    return jsonResponse({ pending: rows });
  } catch (e: any) {
    return jsonResponse({ error: '예외: ' + (e?.message || e) }, 500);
  }
}
