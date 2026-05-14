// V4 (사용자 명시 2026-05-14 ultrathink): admin 사용자 detail 드릴다운.
//   GET /api/admin/user-detail?user_id=<uuid> → 그 사용자의 endpoint 분포 / 일별 활동 / billing / acquisition / 최근 payments / feedback.
//   verifyAuth + ADMIN_USER_ID 검증 (dashboard.ts 패턴 동일).
//   E2EE 본문 X — usage 메타데이터 (endpoint, model, tokens, cost, recorded_at) 만.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const sbHeaders = (env: AdminEnv) => ({
  'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
});

async function sbFetch(env: AdminEnv, path: string): Promise<any[]> {
  try {
    const resp = await fetch(`${env.SUPABASE_URL}${path}`, { headers: sbHeaders(env) });
    if (!resp.ok) return [];
    return await resp.json();
  } catch { return []; }
}

function dayKey(iso: string): string {
  return (iso || '').slice(0, 10);
}

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) return jsonResponse({ error: 'ADMIN_USER_ID env 미설정' }, 500);
  if (user.id !== env.ADMIN_USER_ID) return jsonResponse({ error: '관리자 권한 필요' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env 미설정' }, 500);
  }

  const url = new URL(request.url);
  const targetUserId = (url.searchParams.get('user_id') || '').trim();
  if (!targetUserId || !/^[0-9a-f-]{36}$/i.test(targetUserId)) {
    return jsonResponse({ error: 'user_id 필수 (UUID)' }, 400);
  }

  const now = Date.now();
  const cutoff30d = new Date(now - 30 * DAY_MS).toISOString();

  // auth.users 단일 — Auth Admin API 는 id 검색 별 API
  const authUserPromise = (async () => {
    try {
      const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`, { headers: sbHeaders(env) });
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  })();

  const uidEnc = encodeURIComponent(targetUserId);
  const [
    authUser,
    usageRows,
    billingRows,
    acqRows,
    paymentRows,
    feedbackRows
  ] = await Promise.all([
    authUserPromise,
    sbFetch(env, `/rest/v1/soragodong_usage?user_id=eq.${uidEnc}&recorded_at=gte.${encodeURIComponent(cutoff30d)}&select=endpoint,model,input_tokens,output_tokens,cost_usd,recorded_at&order=recorded_at.desc&limit=5000`),
    sbFetch(env, `/rest/v1/soragodong_billing?user_id=eq.${uidEnc}&select=*`),
    sbFetch(env, `/rest/v1/soragodong_acquisition?user_id=eq.${uidEnc}&select=*`),
    sbFetch(env, `/rest/v1/soragodong_payments?user_id=eq.${uidEnc}&select=id,payment_type,amount_krw,status,refund_amount_krw,created_at,refunded_at&order=created_at.desc&limit=20`),
    sbFetch(env, `/rest/v1/soragodong_feedback?user_id=eq.${uidEnc}&select=id,message,status,admin_reply,created_at,replied_at&order=created_at.desc&limit=10`),
  ]);

  if (!authUser) return jsonResponse({ error: '사용자 찾을 수 X' }, 404);

  // endpoint 분포
  const byEndpoint: Record<string, { count: number; cost: number }> = {};
  const byModel: Record<string, number> = {};
  const byDay: Record<string, { count: number; cost: number }> = {};
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const r of usageRows) {
    const ep = r.endpoint || 'unknown';
    if (!byEndpoint[ep]) byEndpoint[ep] = { count: 0, cost: 0 };
    byEndpoint[ep].count++;
    byEndpoint[ep].cost += Number(r.cost_usd) || 0;
    const md = r.model || 'unknown';
    byModel[md] = (byModel[md] || 0) + 1;
    const dk = dayKey(r.recorded_at);
    if (!byDay[dk]) byDay[dk] = { count: 0, cost: 0 };
    byDay[dk].count++;
    byDay[dk].cost += Number(r.cost_usd) || 0;
    totalCost += Number(r.cost_usd) || 0;
    totalInputTokens += Number(r.input_tokens) || 0;
    totalOutputTokens += Number(r.output_tokens) || 0;
  }

  // 30일 daily timeline — 0 인 날도 포함
  const dailyTimeline: { day: string; count: number; cost: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const dk = dayKey(new Date(now - i * DAY_MS).toISOString());
    dailyTimeline.push({
      day: dk,
      count: byDay[dk]?.count || 0,
      cost: +(byDay[dk]?.cost || 0).toFixed(4)
    });
  }

  const endpointDistribution = Object.entries(byEndpoint)
    .map(([endpoint, v]) => ({ endpoint, count: v.count, cost_usd: +v.cost.toFixed(4) }))
    .sort((a, b) => b.count - a.count);

  const modelDistribution = Object.entries(byModel)
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count);

  // 최근 raw activity 30개 (recorded_at desc)
  const recent = usageRows.slice(0, 30).map(r => ({
    endpoint: r.endpoint,
    model: r.model,
    cost_usd: +(Number(r.cost_usd) || 0).toFixed(5),
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    recorded_at: r.recorded_at
  }));

  const bill = billingRows[0] || null;
  const acq = acqRows[0] || null;

  return jsonResponse({
    ok: true,
    user: {
      id: authUser.id,
      email: authUser.email || null,
      isGuest: !!authUser.is_anonymous,
      createdAt: authUser.created_at || null,
      lastSignInAt: authUser.last_sign_in_at || null,
      provider: authUser.app_metadata?.provider || (authUser.is_anonymous ? 'anonymous' : 'email'),
      emailConfirmedAt: authUser.email_confirmed_at || null
    },
    billing: bill ? {
      plan: bill.subscription_plan || null,
      subscriptionActive: !!bill.subscription_active && bill.subscription_expires_at && new Date(bill.subscription_expires_at).getTime() > now,
      subscriptionExpiresAt: bill.subscription_expires_at,
      creditBalanceUsd: bill.credit_balance_usd,
      dailyQuotaUsed: bill.daily_quota_used,
      freeCreditGranted: !!bill.free_credit_granted,
      scheduledPlanChange: bill.scheduled_plan_change,
      cycleAnchorDay: bill.cycle_anchor_day,
      portoneBillingKeyExists: !!bill.portone_billing_key
    } : null,
    acquisition: acq ? {
      utmSource: acq.signup_utm_source,
      utmMedium: acq.signup_utm_medium,
      utmCampaign: acq.signup_utm_campaign,
      referer: acq.signup_referer,
      userAgent: (acq.signup_user_agent || '').slice(0, 200),
      capturedAt: acq.created_at
    } : null,
    usage: {
      total_calls: usageRows.length,
      total_cost_usd: +totalCost.toFixed(4),
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      by_endpoint: endpointDistribution,
      by_model: modelDistribution,
      by_day_timeline: dailyTimeline,
      recent
    },
    payments: paymentRows.map(p => ({
      id: p.id,
      payment_type: p.payment_type,
      amount_krw: p.amount_krw,
      status: p.status,
      refund_amount_krw: p.refund_amount_krw,
      created_at: p.created_at,
      refunded_at: p.refunded_at
    })),
    feedback: feedbackRows.map(f => ({
      id: f.id,
      message: (f.message || '').slice(0, 300),  // 본인 작성 — 본문 OK
      status: f.status,
      admin_reply: (f.admin_reply || '').slice(0, 300),
      created_at: f.created_at,
      replied_at: f.replied_at
    })),
    generated_at: new Date().toISOString()
  });
}
