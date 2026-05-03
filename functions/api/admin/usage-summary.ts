// POST /api/admin/usage-summary — admin only. soragodong_usage 집계 dashboard.
// 사용자 명시 2026-05-02 ultrathink: endpoint / model / day / user 별 비용 분포 보고 절감 우선순위 결정.
//
// Body: { days?: 7 | 30 | 90 (default 7), group_by?: 'endpoint' | 'model' | 'user' | 'day' (default 'endpoint') }
// Response: { ok, rows: [{key, calls, input_tokens, output_tokens, cache_read_tokens, cost_usd}], total, cutoff, group_by, days }

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const ALLOWED_GROUP_BY = new Set(['endpoint', 'model', 'user', 'day']);
const ALLOWED_DAYS = new Set([7, 30, 90]);

export async function onRequestPost(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  if (!env.ADMIN_USER_ID) {
    console.error('[admin] ADMIN_USER_ID env 미설정 — Cloudflare 대시보드에 추가해야 합니다');
    return jsonResponse({ error: '서버 설정 오류 (관리자에게 문의)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const days = ALLOWED_DAYS.has(Number(body.days)) ? Number(body.days) : 7;
  const groupBy = ALLOWED_GROUP_BY.has(body.group_by) ? body.group_by : 'endpoint';

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env missing' }, 500);
  }

  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_usage_summary`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_days: days, p_group_by: groupBy })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn('[admin/usage-summary] RPC 비-OK:', resp.status, text);
      return jsonResponse({ error: 'RPC 실패: ' + resp.status, detail: text }, 500);
    }
    const data: any = await resp.json();
    return jsonResponse(data);
  } catch (e: any) {
    console.warn('[admin/usage-summary] error:', e);
    return jsonResponse({ error: e?.message || String(e) }, 500);
  }
}
