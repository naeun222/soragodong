// POST /api/billing/cron-charge-recurring
// 사용자 명시 2026-05-06: 정기결제 cron — 매시간 외부 cron 서비스 (cron-job.org / GitHub Actions) 가 호출. 헤더 'X-Cron-Secret' 인증.
// V4 (사용자 명시 2026-05-11 ultrathink): Light(early_lifetime)/Plus(light)/Premium 모두 정기 갱신 (Plus trial 만료 첫 결제 포함).
//
// 동작:
//   1) next_billing_at <= now AND subscription_active=true AND portone_billing_key NOT NULL
//      AND cancel_at_period_end=false 인 row 들 fetch (limit 50 — Cloudflare Pages Functions wall-time 보호)
//   2) 각 row 마다 PortOne /payments/{paymentId}/billing-key 로 자동 결제
//   3) 성공: subscription_expires_at += 30d, next_billing_at += 30d, monthly_token_used=0, payments INSERT
//      실패: last_billing_error 기록 + last_billing_attempt_at = now. 3회 연속 실패 시 subscription_active=false.
//
// 멱등: paymentId = `recurring-{user_id}-{billing_period_started_iso}` — 같은 시점 두 번 trigger 돼도 PortOne 측 unique.
// 사용자 보고 2026-05-06: cron 호출 자체가 retry 돼도 PortOne 측 paymentId duplicate 시 idempotent 응답.

import { jsonResponse, type Env } from '../_lib/auth';
import { TIER_PLANS } from '../_lib/billing';
import { chargeWithBillingKey } from '../_lib/portone';

const CYCLE_DAYS = 30;
const MAX_BATCH = 50;
const FAILURE_LIMIT = 3;  // 3회 연속 실패 시 자동 비활성

interface BillingRow {
  user_id: string;
  user_email?: string | null;
  subscription_plan: string;
  subscription_expires_at: string | null;
  portone_billing_key: string | null;
  trial_until: string | null;
  next_billing_at: string | null;
  last_billing_attempt_at: string | null;
  last_billing_error: string | null;
  failure_count?: number;
  // V4 (사용자 명시 2026-05-13 ultrathink): 다운그레이드 예약 — migration 0022.
  scheduled_plan_change?: string | null;
  scheduled_plan_change_at?: string | null;
}

// 사용자 보고 2026-05-09: migration 0016 적용 후 billing.user_email 우선.
// fallback = auth.users.email (옛 row / sync 미스 보호).
async function _fetchUserEmail(env: Env, userId: string): Promise<string | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!resp.ok) return null;
    const data: any = await resp.json().catch(() => null);
    return data?.email || null;
  } catch { return null; }
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  // 인증 — CRON_SECRET 헤더.
  const cronSecret = (env as any).CRON_SECRET;
  if (!cronSecret) {
    return jsonResponse({ error: 'CRON_SECRET env 미설정' }, 500);
  }
  const provided = request.headers.get('x-cron-secret') || '';
  if (provided !== cronSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  // V4 (사용자 명시 2026-05-11 — 가계약): 정기결제 PG 계약 미승인 상태 → cron 자동 결제 비활성.
  //   Cloudflare env BILLING_RECURRING_ENABLED='true' 일 때만 동작. 미설정 / 'false' = no-op.
  //   계약 승인 후 env 설정으로 다시 켜기.
  if ((env as any).BILLING_RECURRING_ENABLED !== 'true') {
    return jsonResponse({ ok: true, skipped: true, reason: 'BILLING_RECURRING_ENABLED env != "true"' });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'supabase env 미설정' }, 500);
  }

  const nowIso = new Date().toISOString();

  // due rows 조회.
  let dueRows: BillingRow[] = [];
  try {
    // 사용자 보고 2026-05-09: migration 0016 적용 후 user_email 같이 select.
    // 사용자 명시 2026-05-11: light/premium 도 정기결제 — cron 대상 확장.
    const url = `${env.SUPABASE_URL}/rest/v1/soragodong_billing?` +
      `select=user_id,user_email,subscription_plan,subscription_expires_at,portone_billing_key,trial_until,next_billing_at,last_billing_attempt_at,last_billing_error,scheduled_plan_change,scheduled_plan_change_at&` +
      `next_billing_at=lte.${encodeURIComponent(nowIso)}&` +
      `subscription_active=eq.true&` +
      `cancel_at_period_end=eq.false&` +
      `portone_billing_key=not.is.null&` +
      `subscription_plan=in.(early_lifetime,light,premium)&` +
      `limit=${MAX_BATCH}`;
    const resp = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!resp.ok) {
      return jsonResponse({ error: 'due rows 조회 실패: ' + resp.status }, 500);
    }
    dueRows = await resp.json();
  } catch (e: any) {
    return jsonResponse({ error: 'due rows throw: ' + (e?.message || e) }, 500);
  }

  if (dueRows.length === 0) {
    return jsonResponse({ ok: true, processed: 0, charged: 0, failed: 0 });
  }

  let charged = 0;
  let failed = 0;
  const errors: Array<{ user_id: string; error: string }> = [];

  for (const row of dueRows) {
    if (!row.portone_billing_key) continue;
    // V4 (사용자 명시 2026-05-13 ultrathink): scheduled_plan_change set 이면 새 plan 으로 charge + 전환.
    //   다운그레이드 = 사용자가 schedule-plan-change endpoint 로 예약. 만료일 도달 시 cron 이 자동 전환.
    //   업그레이드 = 이 흐름 X (즉시 결제). schedule-plan-change endpoint 가 업그레이드 거부.
    const _isScheduledChange = !!(row.scheduled_plan_change && row.scheduled_plan_change !== row.subscription_plan);
    const _chargePlanKey = _isScheduledChange ? (row.scheduled_plan_change as string) : row.subscription_plan;
    // 사용자 명시 2026-05-11: plan 별 tier 동적 조회 (light/premium/early_lifetime).
    const tier = TIER_PLANS[_chargePlanKey as keyof typeof TIER_PLANS];
    if (!tier || !tier.krw) {
      errors.push({ user_id: row.user_id, error: `unknown plan: ${_chargePlanKey}` });
      failed++;
      continue;
    }
    // 사용자 명시 2026-05-08 ultrathink (audit FAIL #3): paymentId 멱등 — billing date 기준 결정적 ID.
    // 옛: Date.now() + Math.random() → cron 재시도 시 다른 ID 생성 → 중복 결제 위험.
    // PortOne 측 paymentId unique 멱등 보호 작동 위해 같은 cycle 안 같은 ID 보장.
    // KG이니시스 oid 최대 40자 — short user prefix + cycleDay 로 30자 이내.
    const _cycleDay = (row.next_billing_at ? new Date(row.next_billing_at) : new Date()).toISOString().slice(0, 10);
    const paymentId = `r-${row.user_id.slice(0,8)}-${_cycleDay}`;
    // 사용자 보고 2026-05-09: billing.user_email 우선 / 없으면 auth.users.email fallback (PortOne customer.email + payments INSERT).
    const userEmail = row.user_email || await _fetchUserEmail(env, row.user_id) || undefined;
    const result = await chargeWithBillingKey(env, paymentId, {
      billingKey: row.portone_billing_key,
      orderName: _isScheduledChange
        ? `소라고동 ${tier.label} 정기 (${tier.krw.toLocaleString()}원/월) — ${row.subscription_plan} → ${_chargePlanKey} 전환`
        : `소라고동 ${tier.label} 정기 (${tier.krw.toLocaleString()}원/월)`,
      amount: tier.krw,
      currency: 'KRW',
      customer: { id: row.user_id, email: userEmail },
      customData: JSON.stringify({
        tier: _chargePlanKey,
        type: _isScheduledChange ? 'subscribe_plan_change' : 'subscribe_recurring',
        prev_plan: _isScheduledChange ? row.subscription_plan : undefined
      })
    });

    if (result.ok && result.payment.status === 'PAID') {
      // 성공 — 다음 cycle.
      const newCycleStart = new Date();
      const newExpires = new Date(newCycleStart.getTime() + CYCLE_DAYS * 86400_000).toISOString();
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${row.user_id}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            subscription_expires_at: newExpires,
            next_billing_at: newExpires,
            monthly_token_used: 0,
            monthly_period_started_at: newCycleStart.toISOString(),
            // 사용자 명시 2026-05-12 ultrathink: 자동 갱신 = 새 cycle 시작 → daily quota 0 부터 카운트.
            daily_quota_used: 0,
            daily_quota_reset_at: new Date(newCycleStart.getTime() + 86400_000).toISOString(),
            last_billing_attempt_at: newCycleStart.toISOString(),
            last_billing_error: null,
            // V4 (사용자 명시 2026-05-13 ultrathink): 예약된 plan 전환 적용. monthly_quota_usd 도 새 cap 으로.
            ...(_isScheduledChange ? {
              subscription_plan: _chargePlanKey,
              monthly_quota_usd: tier.cap_usd,
              scheduled_plan_change: null,
              scheduled_plan_change_at: null
            } : {})
          })
        });
        // payments INSERT (재고용).
        await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_payments`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal,resolution=ignore-duplicates'
          },
          body: JSON.stringify({
            user_id: row.user_id,
            user_email: userEmail || null,
            payment_type: _isScheduledChange ? 'subscribe_plan_change' : 'subscribe_recurring',
            amount_krw: tier.krw,
            portone_imp_uid: result.payment.txId || paymentId,
            portone_merchant_uid: paymentId,
            status: 'paid',
            raw_response: result.payment,
            // 사용자 명시 2026-05-09 ultrathink: 영수증 + 현금영수증 자진발급 (chargeWithBillingKey 가 자동 적용).
            receipt_url: result.payment.receiptUrl || null,
            cash_receipt_status: (result.payment as any).cashReceipt?.status || 'ISSUED',
            cash_receipt_type: 'SELF_ISSUE'
          })
        });
        charged++;
      } catch (e: any) {
        errors.push({ user_id: row.user_id, error: 'PATCH throw: ' + (e?.message || e) });
      }
    } else {
      // 실패 — error 기록 + failure count 증가. 3회 누적 시 비활성.
      const errMsg = (result as any).error || 'unknown';
      const code = (result as any).code || '';
      // 다음 시도 = 24시간 뒤 (사용자 카드 보강 / 한도 회복 시간).
      const nextRetry = new Date(Date.now() + 86400_000).toISOString();
      // 누적 실패 횟수 추정: last_billing_error 가 직전과 같은 코드면 +1, 다르면 1.
      // 단순화 — DB 스키마에 별도 column 없이 last_billing_error 텍스트 안에 "(N회)" suffix 로 표시.
      let failureCount = 1;
      if (row.last_billing_error) {
        const m = row.last_billing_error.match(/\((\d+)회\)$/);
        if (m) failureCount = Math.min(parseInt(m[1], 10) + 1, FAILURE_LIMIT + 1);
      }
      const labeledErr = `${code}: ${errMsg} (${failureCount}회)`;
      const deactivate = failureCount >= FAILURE_LIMIT;
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${row.user_id}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            last_billing_attempt_at: new Date().toISOString(),
            last_billing_error: labeledErr.slice(0, 500),
            next_billing_at: deactivate ? null : nextRetry,
            subscription_active: deactivate ? false : true
          })
        });
      } catch {}
      errors.push({ user_id: row.user_id, error: labeledErr });
      failed++;
    }
  }

  return jsonResponse({
    ok: true,
    processed: dueRows.length,
    charged,
    failed,
    errors: errors.slice(0, 20)
  });
}
