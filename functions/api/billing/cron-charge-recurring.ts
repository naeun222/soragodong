// POST /api/billing/cron-charge-recurring
// 사용자 명시 2026-05-06: 얼리버드 정기결제 cron — 매시간 외부 cron 서비스 (cron-job.org / GitHub Actions)
// 가 호출. 헤더 'X-Cron-Secret' 으로 인증.
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

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'supabase env 미설정' }, 500);
  }

  const nowIso = new Date().toISOString();

  // due rows 조회.
  let dueRows: BillingRow[] = [];
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/soragodong_billing?` +
      `select=user_id,subscription_plan,subscription_expires_at,portone_billing_key,trial_until,next_billing_at,last_billing_attempt_at,last_billing_error&` +
      `next_billing_at=lte.${encodeURIComponent(nowIso)}&` +
      `subscription_active=eq.true&` +
      `cancel_at_period_end=eq.false&` +
      `portone_billing_key=not.is.null&` +
      `subscription_plan=eq.early_lifetime&` +
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

  const tier = TIER_PLANS.early_lifetime;
  let charged = 0;
  let failed = 0;
  const errors: Array<{ user_id: string; error: string }> = [];

  for (const row of dueRows) {
    if (!row.portone_billing_key) continue;
    // 사용자 명시 2026-05-08 ultrathink (audit FAIL #3): paymentId 멱등 — billing date 기준 결정적 ID.
    // 옛: Date.now() + Math.random() → cron 재시도 시 다른 ID 생성 → 중복 결제 위험.
    // PortOne 측 paymentId unique 멱등 보호 작동 위해 같은 cycle 안 같은 ID 보장.
    const _cycleDay = (row.next_billing_at ? new Date(row.next_billing_at) : new Date()).toISOString().slice(0, 10);
    const paymentId = `recurring-${row.user_id}-${_cycleDay}`;
    const result = await chargeWithBillingKey(env, paymentId, {
      billingKey: row.portone_billing_key,
      orderName: `소라고동 얼리버드 정기 (${tier.krw.toLocaleString()}원/월)`,
      amount: tier.krw,
      currency: 'KRW',
      customer: { id: row.user_id, email: row.user_email || undefined },
      customData: JSON.stringify({ tier: 'early_lifetime', type: 'subscribe_recurring' })
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
            last_billing_attempt_at: newCycleStart.toISOString(),
            last_billing_error: null
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
            payment_type: 'subscribe_recurring',
            amount_krw: tier.krw,
            portone_imp_uid: result.payment.txId || paymentId,
            portone_merchant_uid: paymentId,
            status: 'paid',
            raw_response: result.payment
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
