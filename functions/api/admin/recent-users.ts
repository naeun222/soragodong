// GET /api/admin/recent-users — admin only. 최근 가입자 / 게스트 + 활동 + 결제 + 유입 요약.
// 사용자 요청 2026-05-11: 영상 마케팅 직후 신규 유입 / 활동 / 전환 현황을 DevTools 콘솔에서 즉시 확인.
//
// Query:
//   limit  (1~200, default 50)
//   since  (24h | 7d | 30d | all, default 24h)
//   filter (all | guests | signups, default all)
//   joins  (csv: activity,billing,acquisition — 기본 전부. 'none' = auth.users 만)
//
// Response:
//   { users: [{
//       id, email, isGuest, createdAt, lastSignInAt, provider,
//       messageCount, lastActivityAt,            ← activity (soragodong_usage)
//       plan, subscriptionActive, creditBalanceUsd,  ← billing
//       utmSource, utmMedium, utmCampaign, referer,  ← acquisition (table 없으면 null)
//     }],
//     summary: { total, guests, real, withActivity, paid } }
//
// 구현 노트:
// - auth.users 는 PostgREST 미노출 → Auth Admin API (/auth/v1/admin/users) per_page=200 한 페이지.
// - billing / usage / acquisition 은 PostgREST in.(...) 병렬 fetch.
// - acquisition 테이블이 아직 migration 안 됐어도 graceful (utm* = null 로 반환).
// - usage 활동량 cutoff = since 와 동일, 'all' 시 30d 로 cap (응답 무거워지지 않도록).

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const ALLOWED_SINCE = new Set(['24h', '7d', '30d', 'all']);
const ALLOWED_FILTER = new Set(['all', 'guests', 'signups']);
const ALLOWED_JOINS = new Set(['activity', 'billing', 'acquisition']);

const DAY_MS = 24 * 60 * 60 * 1000;

function sinceMs(since: string): number | null {
  if (since === '24h') return DAY_MS;
  if (since === '7d')  return 7 * DAY_MS;
  if (since === '30d') return 30 * DAY_MS;
  return null;  // 'all'
}

function parseJoins(raw: string | null): Set<string> {
  if (raw === 'none') return new Set();
  if (!raw) return new Set(['activity', 'billing', 'acquisition']);
  const set = new Set<string>();
  for (const k of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    if (ALLOWED_JOINS.has(k)) set.add(k);
  }
  return set;
}

function inList(ids: string[]): string {
  // PostgREST in.() — UUID 는 quoting 불필요 but escape safety.
  return ids.map(id => encodeURIComponent(id)).join(',');
}

async function fetchBilling(env: AdminEnv, idsParam: string): Promise<Map<string, any>> {
  if (!idsParam) return new Map();
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=in.(${idsParam})&select=user_id,credit_balance_usd,subscription_active,subscription_plan,subscription_expires_at`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!resp.ok) return new Map();
    const rows: any[] = await resp.json();
    const map = new Map<string, any>();
    for (const r of rows) map.set(r.user_id, r);
    return map;
  } catch { return new Map(); }
}

async function fetchUsageWindow(env: AdminEnv, idsParam: string, cutoffMs: number): Promise<any[]> {
  if (!idsParam) return [];
  try {
    const cutoffIso = new Date(cutoffMs).toISOString();
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_usage?user_id=in.(${idsParam})&recorded_at=gte.${encodeURIComponent(cutoffIso)}&select=user_id,endpoint,recorded_at&order=recorded_at.desc&limit=10000`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!resp.ok) return [];
    return await resp.json();
  } catch { return []; }
}

async function fetchAcquisition(env: AdminEnv, idsParam: string): Promise<Map<string, any>> {
  if (!idsParam) return new Map();
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_acquisition?user_id=in.(${idsParam})&select=user_id,signup_referer,signup_utm_source,signup_utm_medium,signup_utm_campaign,signup_user_agent`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!resp.ok) return new Map();  // table 없음 (migration 0018 미적용) 등 graceful
    const rows: any[] = await resp.json();
    const map = new Map<string, any>();
    for (const r of rows) map.set(r.user_id, r);
    return map;
  } catch { return new Map(); }
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
  const joins = parseJoins(url.searchParams.get('joins'));

  // 1) auth.users fetch
  let authResp: Response;
  try {
    authResp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
  } catch (e: any) {
    return jsonResponse({ error: 'Supabase Auth Admin API fetch 실패: ' + (e?.message || e) }, 500);
  }
  if (!authResp.ok) {
    const body = await authResp.text();
    return jsonResponse({
      error: 'auth.users 조회 실패',
      upstream_status: authResp.status,
      upstream_body: body.slice(0, 500),
      hint: authResp.status === 401 || authResp.status === 403
        ? 'SUPABASE_SERVICE_ROLE_KEY 가 admin 권한 키인지 확인'
        : 'SUPABASE_URL / 네트워크 확인',
    }, 500);
  }

  let authData: any;
  try { authData = await authResp.json(); } catch { authData = {}; }
  const allUsers: any[] = Array.isArray(authData?.users) ? authData.users : [];

  // 2) filter + sort + slice
  const sinceMillis = sinceMs(since);
  const signupCutoff = sinceMillis === null ? null : Date.now() - sinceMillis;

  const filtered = allUsers.filter((u) => {
    if (signupCutoff !== null) {
      const created = u.created_at ? new Date(u.created_at).getTime() : 0;
      if (created < signupCutoff) return false;
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
  const userIds = sliced.map(u => u.id).filter(Boolean);
  const idsParam = inList(userIds);

  // 3) 병렬 join fetch (각각 실패해도 응답은 계속)
  // 활동 window: signup window 와 동일 (단, 'all' 은 30d cap — usage rows 폭발 방지)
  const activityCutoff = sinceMillis === null ? Date.now() - 30 * DAY_MS : Date.now() - sinceMillis;

  const [billingMap, usageRows, acqMap] = await Promise.all([
    joins.has('billing')     ? fetchBilling(env, idsParam)                       : Promise.resolve(new Map()),
    joins.has('activity')    ? fetchUsageWindow(env, idsParam, activityCutoff)   : Promise.resolve([] as any[]),
    joins.has('acquisition') ? fetchAcquisition(env, idsParam)                   : Promise.resolve(new Map()),
  ]);

  // 4) usage rows → 사용자별 message count + last activity
  const activityMap = new Map<string, { count: number; last: string | null }>();
  for (const row of usageRows) {
    const cur = activityMap.get(row.user_id) || { count: 0, last: null as string | null };
    if (row.endpoint === 'chat') cur.count++;
    if (!cur.last || (row.recorded_at && row.recorded_at > cur.last)) cur.last = row.recorded_at;
    activityMap.set(row.user_id, cur);
  }

  // 5) compose
  const users = sliced.map((u: any) => {
    const bill = billingMap.get(u.id);
    const act = activityMap.get(u.id) || { count: 0, last: null };
    const acq = acqMap.get(u.id);
    const subActive = !!bill?.subscription_active
      && bill.subscription_expires_at
      && new Date(bill.subscription_expires_at).getTime() > Date.now();
    return {
      id: u.id,
      email: u.email || null,
      isGuest: !!u.is_anonymous,
      createdAt: u.created_at || null,
      lastSignInAt: u.last_sign_in_at || null,
      provider: u.app_metadata?.provider || (u.is_anonymous ? 'anonymous' : 'email'),
      // Phase 2 활동
      messageCount: act.count,
      lastActivityAt: act.last,
      // Phase 4 결제
      plan: bill?.subscription_plan || null,
      subscriptionActive: subActive,
      creditBalanceUsd: bill?.credit_balance_usd ?? null,
      // Phase 3 유입
      utmSource: acq?.signup_utm_source || null,
      utmMedium: acq?.signup_utm_medium || null,
      utmCampaign: acq?.signup_utm_campaign || null,
      referer: acq?.signup_referer || null,
    };
  });

  const summary = {
    total: users.length,
    guests: users.filter(u => u.isGuest).length,
    real: users.filter(u => !u.isGuest).length,
    withActivity: users.filter(u => u.messageCount > 0).length,
    paid: users.filter(u => u.subscriptionActive).length,
  };

  return jsonResponse({ users, summary });
}
