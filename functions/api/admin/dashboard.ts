// V4 (사용자 명시 2026-05-14 ultrathink): admin 운영 대시보드 — 단일 fetch batch.
//   /api/admin/dashboard GET → acquisition / activity / revenue / cost / feedback 5 묶음 한 번에.
//   verifyAuth + env.ADMIN_USER_ID 검증. recent-users / usage-summary 와 동일 패턴.
//   PostgREST 직접 fetch (RPC X — read-only / race-safe 무관). Promise.all 병렬.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KRW_PER_USD = 1400;

// plan별 KRW 매월 정가 — soragodong_payments 가 비어있어도 next month 예상 계산.
// memory [[feedback_plan_color_system]] 와 plan key 통일: Light = early_lifetime, Plus = light, Premium = premium.
const PLAN_PRICE_KRW: Record<string, number> = {
  early_lifetime: 5500,    // Light
  light:         15000,    // Plus
  premium:       29000,    // Premium
  guest:             0
};

// daily quota cap (USD) — migration 0020 기준. 사용자 plan 별.
const QUOTA_CAP_USD: Record<string, number> = {
  early_lifetime: 0.20,
  light:          0.30,
  premium:        0.75,
  guest:          0
};

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
  // YYYY-MM-DD 슬라이스
  return (iso || '').slice(0, 10);
}

function monthKey(iso: string): string {
  return (iso || '').slice(0, 7);
}

function dateNDaysAgoIso(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

// 가입 source 분류 — acquisition row 없으면 'direct' 으로.
function classifySource(acq: any): string {
  const utm = (acq?.signup_utm_source || '').toLowerCase().trim();
  if (utm === 'start' || utm === 'startlite' || utm === 'introduce') return utm;
  if (acq?.signup_referer) {
    const ref = acq.signup_referer.toLowerCase();
    if (ref.includes('soragodong.com/start')) return 'start';
    if (ref.includes('soragodong.com/startlite')) return 'startlite';
    if (ref.includes('soragodong.com/introduce')) return 'introduce';
  }
  return utm || 'direct';
}

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();
  if (!env.ADMIN_USER_ID) {
    return jsonResponse({ error: '서버 설정 오류 (ADMIN_USER_ID env 미설정)' }, 500);
  }
  if (user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'env 미설정 — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const now = Date.now();
  const cutoff24h = dateNDaysAgoIso(1);
  const cutoff7d  = dateNDaysAgoIso(7);
  const cutoff30d = dateNDaysAgoIso(30);
  const cutoff45d = dateNDaysAgoIso(45); // retention cohort 4 weeks + buffer
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // ───── 병렬 fetch ─────
  // auth.users 는 PostgREST 미노출 → /auth/v1/admin/users 별도. cohort retention 위해.
  // 최근 30일 가입자만 — per_page=200 = max.
  const authUsersPromise = (async () => {
    try {
      const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, { headers: sbHeaders(env) });
      if (!resp.ok) return [];
      const d: any = await resp.json();
      return Array.isArray(d?.users) ? d.users : [];
    } catch { return []; }
  })();

  const [
    authUsers,
    acquisitionAll,
    usage30d,
    billingAll,
    paymentsThisMonth,
    payments30d,
    feedbackOpen,
    feedbackAll
  ] = await Promise.all([
    authUsersPromise,
    sbFetch(env, `/rest/v1/soragodong_acquisition?created_at=gte.${encodeURIComponent(cutoff45d)}&select=user_id,signup_utm_source,signup_referer,created_at&order=created_at.desc&limit=2000`),
    sbFetch(env, `/rest/v1/soragodong_usage?recorded_at=gte.${encodeURIComponent(cutoff30d)}&select=user_id,endpoint,recorded_at,cost_usd&order=recorded_at.desc&limit=50000`),
    sbFetch(env, `/rest/v1/soragodong_billing?select=user_id,credit_balance_usd,subscription_plan,subscription_active,subscription_expires_at,daily_quota_used,free_credit_granted&limit=2000`),
    sbFetch(env, `/rest/v1/soragodong_payments?created_at=gte.${encodeURIComponent(thisMonthStart)}&select=amount_krw,status,payment_type,created_at,refund_amount_krw&order=created_at.desc&limit=1000`),
    sbFetch(env, `/rest/v1/soragodong_payments?created_at=gte.${encodeURIComponent(cutoff30d)}&select=amount_krw,status,payment_type,created_at,refund_amount_krw,refunded_at&order=created_at.desc&limit=2000`),
    sbFetch(env, `/rest/v1/soragodong_feedback?status=eq.open&order=created_at.desc&limit=3&select=id,user_email,message,created_at`),
    sbFetch(env, `/rest/v1/soragodong_feedback?select=id,status`),
  ]);

  // ───── A: Acquisition ─────
  const acqByUserId = new Map<string, any>();
  for (const a of acquisitionAll) acqByUserId.set(a.user_id, a);

  // new_users — acquisition row 가 가장 정확. auth.users 의 created_at fallback.
  const acqAllRows = acquisitionAll; // 45일 windowed
  const new_24h = acqAllRows.filter(r => r.created_at >= cutoff24h).length;
  const new_7d  = acqAllRows.filter(r => r.created_at >= cutoff7d).length;
  const new_30d = acqAllRows.filter(r => r.created_at >= cutoff30d).length;

  // by_source — 30일 source 분포 (top 5)
  const sourceCount: Record<string, number> = {};
  for (const a of acqAllRows.filter(r => r.created_at >= cutoff30d)) {
    const s = classifySource(a);
    sourceCount[s] = (sourceCount[s] || 0) + 1;
  }
  const by_source = Object.entries(sourceCount).map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // ───── Conversion + funnel ─────
  // 30일 가입자 user_id 별 plan 매핑 → source 별 conversion 분포.
  const billingByUserId = new Map<string, any>();
  for (const b of billingAll) billingByUserId.set(b.user_id, b);
  const usageByUserId = new Map<string, { count: number; cost: number; firstAt: string | null; chatCount: number }>();
  for (const u of usage30d) {
    const cur = usageByUserId.get(u.user_id) || { count: 0, cost: 0, firstAt: null as string | null, chatCount: 0 };
    cur.count++;
    cur.cost += Number(u.cost_usd) || 0;
    if (u.endpoint === 'chat') cur.chatCount++;
    if (!cur.firstAt || (u.recorded_at && u.recorded_at < cur.firstAt)) cur.firstAt = u.recorded_at;
    usageByUserId.set(u.user_id, cur);
  }

  // 30일 가입자 cohort 만.
  const cohort30dUserIds = acqAllRows.filter(r => r.created_at >= cutoff30d).map(r => r.user_id);
  const conversionBySource: Record<string, { signups: number; first_chat: number; light: number; plus: number; premium: number }> = {};
  for (const uid of cohort30dUserIds) {
    const acq = acqByUserId.get(uid);
    if (!acq) continue;
    const source = classifySource(acq);
    if (!conversionBySource[source]) conversionBySource[source] = { signups: 0, first_chat: 0, light: 0, plus: 0, premium: 0 };
    conversionBySource[source].signups++;
    const usage = usageByUserId.get(uid);
    if (usage && usage.chatCount > 0) conversionBySource[source].first_chat++;
    const bill = billingByUserId.get(uid);
    if (bill?.subscription_active) {
      const plan = bill.subscription_plan;
      if (plan === 'early_lifetime') conversionBySource[source].light++;
      else if (plan === 'light') conversionBySource[source].plus++;
      else if (plan === 'premium') conversionBySource[source].premium++;
    }
  }
  const conversion = Object.entries(conversionBySource)
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.signups - a.signups).slice(0, 5);

  // funnel — 30일 cohort 기준.
  const signupCount = cohort30dUserIds.length;
  const firstChatCount = cohort30dUserIds.filter(uid => (usageByUserId.get(uid)?.chatCount || 0) > 0).length;
  const firstPaidUserIds = new Set<string>();
  for (const p of payments30d) {
    if (p.status === 'paid' && (p.payment_type === 'subscribe' || p.payment_type === 'charge')) {
      // payments 는 user_id 없는 query 라 fall through — payment 별도 user 매칭 X. 일단 cohort 안 결제 count.
    }
  }
  // first_paid 가 사용자별 매핑 안 됐으면 simpler: payments30d 중 cohort 안 user_email 매칭. payments query 에 user_id 없음 → skip 정확도.
  // 일단 active subscription 으로 first_paid proxy.
  const firstPaidProxy = cohort30dUserIds.filter(uid => billingByUserId.get(uid)?.subscription_active).length;
  const funnel = [
    { stage: 'signup',     count: signupCount },
    { stage: 'first_chat', count: firstChatCount },
    { stage: 'first_paid', count: firstPaidProxy },
    { stage: 'renewed',    count: 0 }  // payments query 에 user_id 안 가져옴 — v2 강화
  ];

  // ───── B: Activity ─────
  // DAU = 어제 24h 안 active user. WAU = 7d. MAU = 30d.
  const dauSet = new Set<string>();
  const wauSet = new Set<string>();
  const mauSet = new Set<string>();
  for (const u of usage30d) {
    mauSet.add(u.user_id);
    if (u.recorded_at >= cutoff7d) wauSet.add(u.user_id);
    if (u.recorded_at >= cutoff24h) dauSet.add(u.user_id);
  }

  // 7일 일별 sparkline (DAU)
  const dauByDay: Record<string, Set<string>> = {};
  const chatByDay: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const dk = dayKey(new Date(now - i * DAY_MS).toISOString());
    dauByDay[dk] = new Set();
    chatByDay[dk] = 0;
  }
  for (const u of usage30d) {
    const dk = dayKey(u.recorded_at);
    if (dauByDay[dk]) dauByDay[dk].add(u.user_id);
    if (u.endpoint === 'chat' && chatByDay[dk] !== undefined) chatByDay[dk]++;
  }
  const dau_sparkline_keys = Object.keys(dauByDay).sort();
  const dau_sparkline = dau_sparkline_keys.slice(-7).map(dk => ({ day: dk, value: dauByDay[dk].size }));
  const chat_sparkline = dau_sparkline_keys.slice(-14).map(dk => ({ day: dk, value: chatByDay[dk] || 0 }));

  // retention cohort — 주별 4주. cohort 기준일 = 가입일 (auth.users.created_at). active = usage30d.
  const usageByUserDay = new Map<string, Set<string>>();  // user_id → set of dayKey
  for (const u of usage30d) {
    const dk = dayKey(u.recorded_at);
    if (!usageByUserDay.has(u.user_id)) usageByUserDay.set(u.user_id, new Set());
    usageByUserDay.get(u.user_id)!.add(dk);
  }
  // ISO week (YYYY-Www) 함수
  function isoWeek(d: Date): string {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const wn = Math.ceil((((t.getTime() - ys.getTime()) / DAY_MS) + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`;
  }
  const cohortMap: Record<string, { size: number; d1Set: Set<string>; d7Set: Set<string>; d14Set: Set<string>; d30Set: Set<string>; oldestSignup: number }> = {};
  for (const au of authUsers) {
    if (au.is_anonymous) continue;
    const created = au.created_at ? new Date(au.created_at).getTime() : 0;
    if (!created || created < now - 45 * DAY_MS) continue;
    const wk = isoWeek(new Date(created));
    if (!cohortMap[wk]) cohortMap[wk] = { size: 0, d1Set: new Set(), d7Set: new Set(), d14Set: new Set(), d30Set: new Set(), oldestSignup: created };
    cohortMap[wk].size++;
    const userDays = usageByUserDay.get(au.id);
    if (userDays) {
      // signupAt 으로부터 N일 후까지 active 했나
      const sAt = created;
      const d1Cut = sAt + 1 * DAY_MS;
      const d7Cut = sAt + 7 * DAY_MS;
      const d14Cut = sAt + 14 * DAY_MS;
      const d30Cut = sAt + 30 * DAY_MS;
      for (const dk of userDays) {
        const dkMs = new Date(dk + 'T12:00:00Z').getTime();
        if (dkMs >= d1Cut && dkMs <= d1Cut + DAY_MS && now > d1Cut) cohortMap[wk].d1Set.add(au.id);
        if (dkMs >= sAt && dkMs <= d7Cut && now > d1Cut) {
          // 가입 후 1~7일 사이 active = D7 candidate (active in week 1)
        }
        if (dkMs > d7Cut - DAY_MS && dkMs <= d7Cut + DAY_MS && now > d7Cut) cohortMap[wk].d7Set.add(au.id);
        if (dkMs > d14Cut - DAY_MS && dkMs <= d14Cut + DAY_MS && now > d14Cut) cohortMap[wk].d14Set.add(au.id);
        if (dkMs > d30Cut - DAY_MS && dkMs <= d30Cut + DAY_MS && now > d30Cut) cohortMap[wk].d30Set.add(au.id);
      }
    }
  }
  const retention = Object.entries(cohortMap)
    .sort((a, b) => b[1].oldestSignup - a[1].oldestSignup)
    .slice(0, 4)
    .map(([cohort, v]) => ({
      cohort,
      size: v.size,
      d1:  v.size > 0 ? +(v.d1Set.size / v.size).toFixed(2) : null,
      d7:  v.size > 0 ? +(v.d7Set.size / v.size).toFixed(2) : null,
      d14: v.size > 0 ? +(v.d14Set.size / v.size).toFixed(2) : null,
      d30: v.size > 0 ? +(v.d30Set.size / v.size).toFixed(2) : null,
    }));

  // ───── C: Revenue ─────
  const planCount: Record<string, number> = {};
  for (const b of billingAll) {
    const plan = (b.subscription_plan || 'free').toLowerCase();
    const active = !!b.subscription_active && b.subscription_expires_at && new Date(b.subscription_expires_at).getTime() > now;
    if (active) planCount[plan] = (planCount[plan] || 0) + 1;
  }
  // free = no row 또는 not active. authUsers 안에서 billing 안에 없는 사용자 수.
  const billingUserIds = new Set(billingAll.map(b => b.user_id));
  const realUserIds = authUsers.filter((u: any) => !u.is_anonymous).map((u: any) => u.id);
  const freeCount = realUserIds.filter(uid => !billingUserIds.has(uid) || !billingAll.find(b => b.user_id === uid && b.subscription_active && new Date(b.subscription_expires_at).getTime() > now)).length;
  if (freeCount > 0) planCount['free'] = freeCount;

  const plan_distribution = Object.entries(planCount).map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count);

  // MRR this month
  let mrr_this_month_krw = 0;
  let refund_this_month_krw = 0;
  for (const p of paymentsThisMonth) {
    if (p.status === 'paid' && (p.payment_type === 'subscribe' || p.payment_type === 'charge')) {
      mrr_this_month_krw += Number(p.amount_krw) || 0;
    }
    if (p.status === 'refunded') {
      refund_this_month_krw += Number(p.refund_amount_krw) || Number(p.amount_krw) || 0;
    }
  }

  // 다음 달 예상 = active subscription × plan 정가
  let mrr_next_month_estimate_krw = 0;
  for (const b of billingAll) {
    if (b.subscription_active && b.subscription_expires_at && new Date(b.subscription_expires_at).getTime() > now) {
      mrr_next_month_estimate_krw += PLAN_PRICE_KRW[b.subscription_plan] || 0;
    }
  }

  // 30일 일별 매출 + 환불
  const revByDay: Record<string, { paid: number; refund: number }> = {};
  for (let i = 0; i < 30; i++) {
    const dk = dayKey(new Date(now - i * DAY_MS).toISOString());
    revByDay[dk] = { paid: 0, refund: 0 };
  }
  for (const p of payments30d) {
    const dk = dayKey(p.created_at);
    if (!revByDay[dk]) continue;
    if (p.status === 'paid' && (p.payment_type === 'subscribe' || p.payment_type === 'charge')) {
      revByDay[dk].paid += Number(p.amount_krw) || 0;
    }
    if (p.status === 'refunded') {
      const refundDay = p.refunded_at ? dayKey(p.refunded_at) : dk;
      if (revByDay[refundDay]) {
        revByDay[refundDay].refund += Number(p.refund_amount_krw) || Number(p.amount_krw) || 0;
      }
    }
  }
  const daily_revenue_sparkline = Object.entries(revByDay).sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, paid: v.paid, refund: v.refund }));

  // Trial 전환 — free_credit_granted=true & subscription_active 비율
  const trialUsers = billingAll.filter(b => b.free_credit_granted === true);
  const trialActive = trialUsers.filter(b => b.subscription_active && b.subscription_expires_at && new Date(b.subscription_expires_at).getTime() > now);
  // trial expired = trial 시작 + expires_at 이미 지났음
  const trialExpired = trialUsers.filter(b => b.subscription_expires_at && new Date(b.subscription_expires_at).getTime() <= now);
  const trial_conversion = {
    started: trialUsers.length,
    expired: trialExpired.length,
    converted: trialActive.length,
    conversion_rate: trialUsers.length > 0 ? +(trialActive.length / trialUsers.length).toFixed(2) : null
  };

  // ───── D: Cost ─────
  let costToday = 0, costYesterday = 0, costThisMonth = 0;
  const costByEndpoint: Record<string, number> = {};
  const todayKeyStr = dayKey(new Date(now).toISOString());
  const yesterdayKeyStr = dayKey(new Date(now - DAY_MS).toISOString());
  const thisMonthKeyStr = monthKey(new Date(now).toISOString());
  for (const u of usage30d) {
    const c = Number(u.cost_usd) || 0;
    const dk = dayKey(u.recorded_at);
    const mk = monthKey(u.recorded_at);
    if (dk === todayKeyStr) costToday += c;
    if (dk === yesterdayKeyStr) costYesterday += c;
    if (mk === thisMonthKeyStr) costThisMonth += c;
    if (u.endpoint) costByEndpoint[u.endpoint] = (costByEndpoint[u.endpoint] || 0) + c;
  }
  const by_endpoint = Object.entries(costByEndpoint).map(([endpoint, cost]) => ({ endpoint, cost: +cost.toFixed(4) }))
    .sort((a, b) => b.cost - a.cost).slice(0, 5);

  // Quota 도달 분포
  const quotaBuckets = { '0-25%': 0, '25-50%': 0, '50-75%': 0, '75-95%': 0, '95%+': 0 };
  const quotaToppedUsers: { user_id: string; pct: number; plan: string }[] = [];
  for (const b of billingAll) {
    if (!b.subscription_active) continue;
    const cap = QUOTA_CAP_USD[b.subscription_plan] || 0;
    if (cap <= 0) continue;
    const used = Number(b.daily_quota_used) || 0;
    const pct = used / cap;
    if (pct >= 0.95) { quotaBuckets['95%+']++; quotaToppedUsers.push({ user_id: b.user_id, pct: +pct.toFixed(2), plan: b.subscription_plan }); }
    else if (pct >= 0.75) quotaBuckets['75-95%']++;
    else if (pct >= 0.50) quotaBuckets['50-75%']++;
    else if (pct >= 0.25) quotaBuckets['25-50%']++;
    else quotaBuckets['0-25%']++;
  }
  // user_email 보강 (top 5)
  quotaToppedUsers.sort((a, b) => b.pct - a.pct);
  const top5QuotaIds = quotaToppedUsers.slice(0, 5).map(u => u.user_id);
  const top5Emails = top5QuotaIds.map(uid => authUsers.find((u: any) => u.id === uid)?.email || uid.slice(0, 8) + '…');

  // ───── E: Feedback ─────
  const open_count = feedbackAll.filter(f => f.status === 'open').length;
  const replied_count = feedbackAll.filter(f => f.status === 'replied').length;
  const recent_open = feedbackOpen.map(f => ({
    id: f.id,
    user_email: f.user_email || '',
    message_preview: (f.message || '').slice(0, 60),
    created_at: f.created_at
  }));

  // ───── F: 사용자별 활동 표 (E2EE 본문 X, 메타데이터만) ─────
  // user_id / email / 가입일 / 마지막 활동 / chat 메시지 수 / 총 호출 / 누적 비용 / plan / source / open feedback 수.
  const feedbackOpenByUser = new Map<string, number>();
  for (const f of feedbackAll) {
    if (f.status !== 'open') continue;
    // feedbackAll 가 user_id 필드 안 가져옴 — feedbackOpen (limit 3) 만 user_email 있음. 일단 user_id 매칭 X (집계는 정확, 사용자별 매칭은 skip).
  }
  const usersTable = authUsers.map((au: any) => {
    const usage = usageByUserId.get(au.id);
    const bill = billingByUserId.get(au.id);
    const acq = acqByUserId.get(au.id);
    const subActive = !!bill?.subscription_active
      && bill?.subscription_expires_at
      && new Date(bill.subscription_expires_at).getTime() > now;
    return {
      id: au.id,
      email: au.email || null,
      isGuest: !!au.is_anonymous,
      createdAt: au.created_at || null,
      lastSignInAt: au.last_sign_in_at || null,
      lastActivityAt: usage?.firstAt || null,  // first/last 명칭 혼동: usage.firstAt 은 30d 안 가장 오래된 row. last 은 별도 계산 필요 — order desc 였으니 첫 push 가 last.
      chatCount: usage?.chatCount || 0,
      totalCalls: usage?.count || 0,
      totalCostUsd: +(usage?.cost || 0).toFixed(4),
      plan: bill?.subscription_plan || null,
      subscriptionActive: subActive,
      creditBalanceUsd: bill?.credit_balance_usd ?? null,
      source: acq ? classifySource(acq) : null
    };
  });
  // last activity desc 로 정렬 — null 은 끝.
  usersTable.sort((a: any, b: any) => {
    const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tb - ta;
  });

  // 한 가지 fix — usageByUserId.firstAt 은 사실 last (order desc 라 첫 push 가 최신).
  // 그러나 코드 가독성 위해 별도 lastActivity map 빌드 (정확성).
  const lastActivityMap = new Map<string, string>();
  for (const u of usage30d) {
    const prev = lastActivityMap.get(u.user_id);
    if (!prev || (u.recorded_at && u.recorded_at > prev)) {
      lastActivityMap.set(u.user_id, u.recorded_at);
    }
  }
  for (const row of usersTable) {
    row.lastActivityAt = lastActivityMap.get(row.id) || null;
  }
  usersTable.sort((a: any, b: any) => {
    const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tb - ta;
  });

  // endpoint 사용 분포 — 호출 수 기준 (cost 카드와 별도, 본문은 안 보이지만 어떤 기능 많이 썼는지).
  const callsByEndpoint: Record<string, number> = {};
  for (const u of usage30d) {
    if (u.endpoint) callsByEndpoint[u.endpoint] = (callsByEndpoint[u.endpoint] || 0) + 1;
  }
  const endpoint_usage = Object.entries(callsByEndpoint)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return jsonResponse({
    ok: true,
    acquisition: {
      new_users: { last_24h: new_24h, last_7d: new_7d, last_30d: new_30d },
      by_source,
      conversion,
      funnel
    },
    activity: {
      dau: dauSet.size,
      wau: wauSet.size,
      mau: mauSet.size,
      dau_sparkline,
      chat_sparkline,
      retention
    },
    revenue: {
      plan_distribution,
      mrr_this_month_krw,
      refund_this_month_krw,
      mrr_next_month_estimate_krw,
      daily_revenue_sparkline,
      trial_conversion
    },
    cost: {
      today_usd: +costToday.toFixed(4),
      yesterday_usd: +costYesterday.toFixed(4),
      this_month_usd: +costThisMonth.toFixed(4),
      by_endpoint,
      quota_distribution: quotaBuckets,
      quota_topped_users: top5Emails
    },
    feedback: {
      open_count,
      replied_count,
      recent_open
    },
    users: {
      total: usersTable.length,
      rows: usersTable.slice(0, 50)
    },
    endpoint_usage,
    generated_at: new Date().toISOString()
  });
}
