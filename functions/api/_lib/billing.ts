// Cloudflare Pages Functions — 사용자 plan / 잔여 토큰 / 차감.

import type { Env } from './auth';

// 사용자 명시 2026-05-05: $2.14 환영 credit / 1,000원 legacy bonus / 100만 토큰 환영 선물 정책 모두 폐기.
// 신정책: ensureBillingRow 가 신규 row 생성 시 처음 한 달 자동 무료 (얼리 플랜, 자동 결제 X).
// 만료 후 사용자가 직접 light/premium 구독 결정. 한도 도달 시 → premium 결제 유도 (개발자 후원 메시지).

export type UserBilling = {
  user_id: string;
  credit_balance_usd: number;
  subscription_active: boolean;
  subscription_expires_at: string | null;
  subscription_plan?: 'light' | 'premium' | 'early_light' | 'early_lifetime' | 'guest' | string | null;
  monthly_token_quota: number | null;
  monthly_quota_usd?: number;          // tier cap (USD). Light 5 / Premium 13 / early_light 4.
  monthly_token_used: number;          // micro-USD 누적 (cost_usd × 1M)
  monthly_period_started_at: string | null;
  // Opus 일일 한도 (Premium 한정).
  opus_daily_used?: number;
  opus_daily_reset_at?: string | null;
  // 사용자 명시 2026-05-05: 처음 한 달 무료 (얼리 플랜) 자동 활성 — 다음 cycle 안 갱신 X.
  free_trial_granted_at?: string | null;
};

export type BudgetCheck =
  | { ok: true; remaining_credit_usd: number; subscription_active: boolean; subscription_plan?: string | null; monthly_remaining_usd?: number; }
  | { ok: false; reason: string; code: 'NO_CREDIT' | 'NEED_AUTH' | 'NO_BILLING_ROW'; remaining_credit_usd?: number; };

// Light 9,900원 / Premium 25,000원 (월정액). 자동 갱신 X — 사용자 직접 매월 결제.
// early_light: 신규 가입자 자동 체험 ($1.1 cap ≈ 1,400원 상당, 하루치 정도). 만료 후 구독 유도.
// early_lifetime: 앱 출시 전 얼리버드 평생 이용권 (4,900원 1회 결제). 매월 $3 cap 자동 갱신 (결제 없이).
// guest: anonymous 사용자 $0.30 cap. linkIdentity 시 early_light 로 fresh 갱신.
export const TIER_PLANS: Record<'light' | 'premium' | 'early_light' | 'early_lifetime' | 'guest', { krw: number; cap_usd: number; label: string; auto_grant_first_month?: boolean; is_guest?: boolean; is_lifetime?: boolean }> = {
  light:          { krw: 9900,  cap_usd: 5,    label: 'Light' },
  premium:        { krw: 25000, cap_usd: 13,   label: 'Premium' },
  early_light:    { krw: 0,     cap_usd: 1.1,  label: '얼리 플랜', auto_grant_first_month: true },
  early_lifetime: { krw: 4900,  cap_usd: 3.0,  label: '얼리버드 평생', is_lifetime: true },
  guest:          { krw: 0,     cap_usd: 0.30, label: '게스트', is_guest: true }
};
export type TierKey = keyof typeof TIER_PLANS;

// 사용자 명시 2026-05-05: 처음 한 달 free trial 기간 (30일).
export const FREE_TRIAL_DAYS = 30;

// 사용자 명시 2026-05-02 ultrathink: light_pack 제거 — Premium 전용 (Light/얼리는 Premium 전환 또는 다음 달 대기).
export const OVERAGE_PACKS: Record<'premium_pack', { krw: number; usd: number; for_tier: TierKey }> = {
  premium_pack: { krw: 7000, usd: 5, for_tier: 'premium' }
};

// 사용자 명시 2026-05-02 ultrathink: Opus = Premium 전용 + 일일 30번 (메인 대화 한정, 새벽 4시 KST 리셋).
export const OPUS_DAILY_LIMIT_PREMIUM = 30;

// tier 검증 헬퍼. early_light / guest = 자동 부여라 결제 X. early_lifetime / light / premium = 결제 가능.
export async function validateTier(_env: Env, _userId: string, tierKey: TierKey | string): Promise<{ ok: boolean; error?: string; tier?: typeof TIER_PLANS[TierKey] }> {
  const plan = TIER_PLANS[tierKey as TierKey];
  if (!plan) return { ok: false, error: 'invalid tier' };
  if (plan.krw === 0) {
    return { ok: false, error: '이 플랜은 자동 활성화 — 결제 대상 X. light / premium / early_lifetime 으로 구독해줘.' };
  }
  return { ok: true, tier: plan };
}

export async function getUserBilling(env: Env, userId: string): Promise<UserBilling | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}&select=*&limit=1`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    if (!resp.ok) return null;
    const rows: any = await resp.json();
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } catch (e) {
    console.warn('[billing] 조회 실패:', e);
    return null;
  }
}

export async function ensureBillingRow(env: Env, userId: string, opts?: { isAnonymous?: boolean; userEmail?: string | null }): Promise<UserBilling | null> {
  const existing = await getUserBilling(env, userId);
  if (existing) return existing;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  // 사용자 명시 2026-05-05: 처음 한 달 자동 무료 (얼리 플랜) 활성화. 자동 갱신 X — 만료 후 active=false 자동.
  // 사용자가 직접 light / premium 구독 결정. 한도 도달 시 → premium 결제 유도 (개발자 후원 메시지).
  // Phase 0: anonymous (게스트) = 'guest' tier ($0.20 cap). linkIdentity 시 update-tier 로 'early_light' fresh.
  const now = new Date();
  const isGuest = !!opts?.isAnonymous;
  const tierKey: TierKey = isGuest ? 'guest' : 'early_light';
  const tier = TIER_PLANS[tierKey];
  // guest = 만료 X (anonymous 계정 자체가 abandoned 시 cron 으로 정리 — Phase 1 후속).
  // early_light = 30일 만료.
  const expiresAt = isGuest
    ? new Date(now.getTime() + 365 * 86400_000).toISOString()
    : new Date(now.getTime() + FREE_TRIAL_DAYS * 86400_000).toISOString();
  const newRow: Partial<UserBilling> & { user_email?: string | null } = {
    user_id: userId,
    // 사용자 보고 2026-05-09 ultrathink: schema 통일 (migration 0016) — user_email 같이 채움.
    // null OK (caller 가 전달 X 시) — cron 측 auth.users lookup fallback 활용.
    user_email: opts?.userEmail || null,
    credit_balance_usd: 0,
    subscription_active: true,
    subscription_expires_at: expiresAt,
    subscription_plan: tierKey,
    monthly_token_quota: null,
    monthly_quota_usd: tier.cap_usd,
    monthly_token_used: 0,
    monthly_period_started_at: now.toISOString(),
    free_trial_granted_at: isGuest ? null : now.toISOString()
  };
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=ignore-duplicates'
      },
      body: JSON.stringify(newRow)
    });
    if (!resp.ok) {
      console.warn('[billing] ensureBillingRow INSERT 비-2xx:', resp.status, await resp.text().catch(() => ''));
    }
    return await getUserBilling(env, userId);
  } catch (e) {
    console.warn('[billing] row 생성 실패:', e);
    return null;
  }
}

// 사용자 명시 2026-05-05 ultrathink (Phase 1c): 게스트 → early_light 자동 승격.
// 흐름: anonymous user 가 linkIdentity 로 이메일 가입 → 다음 /api/chat 또는 /api/usage 호출 시
//       backend 가 user.is_anonymous=false 인데 billing.subscription_plan='guest' detect → 승격.
// 효과: monthly_token_used = 0 reset, plan='early_light', cap_usd=$4, 30일 신규 만료.
export async function promoteGuestToEarlyLight(env: Env, userId: string): Promise<{ ok: boolean; promoted: boolean }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, promoted: false };
  const now = new Date();
  const expiresAt = new Date(now.getTime() + FREE_TRIAL_DAYS * 86400_000).toISOString();
  const earlyTier = TIER_PLANS.early_light;
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}&subscription_plan=eq.guest`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        subscription_plan: 'early_light',
        subscription_active: true,
        subscription_expires_at: expiresAt,
        monthly_quota_usd: earlyTier.cap_usd,
        monthly_token_used: 0,
        monthly_period_started_at: now.toISOString(),
        free_trial_granted_at: now.toISOString()
      })
    });
    if (!resp.ok) {
      console.warn('[promote guest] PATCH 비-OK:', resp.status);
      return { ok: false, promoted: false };
    }
    return { ok: true, promoted: true };
  } catch (e: any) {
    console.warn('[promote guest] throw:', e?.message || e);
    return { ok: false, promoted: false };
  }
}

// 사용자 명시 2026-04-30 ultrathink: 충전·환불 race condition + idempotency 차단 helper.
// 0005_atomic_billing.sql 의 add_credit_atomic_idempotent RPC 호출.
// migration 미실행 시 = fallback (read-modify-write — race risk 단 호환성 유지).
export async function addCreditAtomic(
  env: Env,
  userId: string,
  amountUsd: number,
  idempotencyKey: string
): Promise<{ ok: boolean; balance_usd?: number; already_applied?: boolean; error?: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: 'env missing' };
  if (amountUsd <= 0) return { ok: false, error: 'amount <= 0' };

  // 시도 1: atomic RPC (race-safe + idempotency)
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/add_credit_atomic_idempotent`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_amount_usd: amountUsd,
        p_idempotency_key: idempotencyKey
      })
    });
    if (resp.ok) {
      const data: any = await resp.json();
      if (data?.ok) {
        return {
          ok: true,
          balance_usd: Number(data.balance_usd) || 0,
          already_applied: !!data.already_applied
        };
      }
    } else if (resp.status !== 404) {
      console.warn('[addCreditAtomic] RPC 비-OK:', resp.status, await resp.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[addCreditAtomic] RPC 실패:', e);
  }

  // 시도 2: fallback (0005 migration 미실행 시) — read-modify-write + 명시 idempotency check
  // 사용자가 0005 migration 실행 권장.
  console.warn('[addCreditAtomic] fallback 사용 — 0005_atomic_billing.sql 실행 권장 (race risk).');
  try {
    // 명시 idempotency: payments 테이블에서 portone_imp_uid / portone_merchant_uid 로 unique check
    // 단 verify-toss-receipt 는 image_sha256 base — payments 에 별도 column 없으므로 best-effort.
    // 단순 read-modify-write fallback:
    const billingResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}&select=credit_balance_usd`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const rows: any = await billingResp.json();
    const currentBalance = Number(rows?.[0]?.credit_balance_usd) || 0;
    const newBalance = Math.round((currentBalance + amountUsd) * 1_000_000) / 1_000_000;
    const patchResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ credit_balance_usd: newBalance })
    });
    if (!patchResp.ok) return { ok: false, error: 'PATCH 실패: ' + patchResp.status };
    return { ok: true, balance_usd: newBalance, already_applied: false };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 잔액 차감 atomic RPC (refund / revoke-charge 측. race-safe + 음수 방지).
export async function subtractCreditAtomic(
  env: Env,
  userId: string,
  amountUsd: number
): Promise<{ ok: boolean; balance_usd?: number; subtracted_usd?: number; error?: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: 'env missing' };
  if (amountUsd <= 0) return { ok: false, error: 'amount <= 0' };

  // 시도 1: atomic RPC
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/subtract_credit_atomic`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_user_id: userId, p_amount_usd: amountUsd })
    });
    if (resp.ok) {
      const data: any = await resp.json();
      if (data?.ok) {
        return {
          ok: true,
          balance_usd: Number(data.balance_usd) || 0,
          subtracted_usd: Number(data.subtracted_usd) || 0
        };
      }
    } else if (resp.status !== 404) {
      console.warn('[subtractCreditAtomic] RPC 비-OK:', resp.status);
    }
  } catch (e) {
    console.warn('[subtractCreditAtomic] RPC 실패:', e);
  }

  // 시도 2: fallback
  console.warn('[subtractCreditAtomic] fallback — 0005 migration 실행 권장.');
  try {
    const billingResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}&select=credit_balance_usd`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const rows: any = await billingResp.json();
    const currentBalance = Number(rows?.[0]?.credit_balance_usd) || 0;
    const newBalance = Math.max(0, Math.round((currentBalance - amountUsd) * 1_000_000) / 1_000_000);
    const patchResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ credit_balance_usd: newBalance })
    });
    if (!patchResp.ok) return { ok: false, error: 'PATCH 실패: ' + patchResp.status };
    return { ok: true, balance_usd: newBalance, subtracted_usd: currentBalance - newBalance };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 사용자 명시 2026-04-30 ultrathink: 2-tier 월정액 도입 후 budget 검증 로직.
// 1) subscription 활성 → cap 안 남았으면 OK / cap 도달 시 credit_balance_usd 로 fall-through (overage pack 또는 잔여 free credit)
// 2) subscription X → credit_balance_usd 로 직접 사용 (overage_pack 잔여)
export async function checkBudget(env: Env, userId: string): Promise<BudgetCheck> {
  // 사용자 명시 2026-05-10: admin 계정 무한 plan 특혜 (테스트/디버그 + 본인 사용 — 옛 admin 특혜 제거 후 재도입).
  //   ADMIN_USER_ID env 매칭 시 budget check 우회 → 잔액/cap 무관 통과. opus 가드도 admin 우회 (chat.ts).
  if ((env as any).ADMIN_USER_ID && userId === (env as any).ADMIN_USER_ID) {
    return {
      ok: true,
      remaining_credit_usd: Number.POSITIVE_INFINITY,
      subscription_active: true,
      subscription_plan: 'admin',
      monthly_remaining_usd: Number.POSITIVE_INFINITY
    };
  }
  let billing = await getUserBilling(env, userId);
  if (!billing) {
    billing = await ensureBillingRow(env, userId);
    if (!billing) {
      return { ok: false, reason: 'billing row 생성 실패', code: 'NO_BILLING_ROW' };
    }
  }
  // early_lifetime: 30일마다 monthly_token_used 자동 리셋 (결제 없이 계속 갱신).
  // 사용자 명시 2026-05-06: 新 흐름 = 카드 등록 + cron 매월 자동 결제. 빌링키 있는 사용자는 cron 이 cycle 갱신 담당
  // (subscription_expires_at + monthly_period_started_at 같이 갱신). 자동 무결제 리셋 X — 결제 누락 시 무료 사용 방지.
  // 빌링키 없는 legacy 사용자 (옛 4,900원 1회 결제 lifetime) 만 종전대로 무결제 리셋 유지.
  const hasBillingKey = !!(billing as any).portone_billing_key;
  if (billing.subscription_plan === 'early_lifetime' && !hasBillingKey && billing.monthly_period_started_at && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const daysSince = (Date.now() - new Date(billing.monthly_period_started_at).getTime()) / 86400_000;
    if (daysSince >= 30) {
      const now = new Date();
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ monthly_token_used: 0, monthly_period_started_at: now.toISOString() })
        });
      } catch {}
      billing.monthly_token_used = 0;
      billing.monthly_period_started_at = now.toISOString();
    }
  }
  const subActive = !!(billing.subscription_active
    && billing.subscription_expires_at
    && new Date(billing.subscription_expires_at) > new Date());

  if (subActive) {
    const quotaUsd = Number(billing.monthly_quota_usd || 0);
    const usedUsd = Number(billing.monthly_token_used || 0) / 1_000_000;
    const remainingQuotaUsd = Math.max(0, quotaUsd - usedUsd);
    const creditUsd = Number(billing.credit_balance_usd || 0);
    // cap 안 남았거나 잔여 credit (overage pack 등) 으로 사용 가능 → OK
    if (remainingQuotaUsd > 0 || creditUsd > 0) {
      return {
        ok: true,
        remaining_credit_usd: creditUsd,
        subscription_active: true,
        subscription_plan: billing.subscription_plan || null,
        monthly_remaining_usd: remainingQuotaUsd
      };
    }
    // cap 도달 + credit 0 → 차단
    return {
      ok: false,
      reason: '이번 cycle 한도 다 썼어. 추가팩 결제 / tier 업그레이드 / 다음 cycle 대기 중 선택해줘.',
      code: 'NO_CREDIT',
      remaining_credit_usd: 0
    };
  }

  if (billing.credit_balance_usd > 0) {
    return {
      ok: true,
      remaining_credit_usd: billing.credit_balance_usd,
      subscription_active: false,
      subscription_plan: null,
      monthly_remaining_usd: 0
    };
  }
  return {
    ok: false,
    reason: '잔액이 0원이야. Light (8,900원) 또는 Premium (25,000원) 구독해줘.',
    code: 'NO_CREDIT',
    remaining_credit_usd: 0
  };
}

// 사용자 보고 2026-04-30: race condition 수정 — read-modify-write PATCH → atomic RPC.
// 동시 chat 호출 시 같은 잔액 읽고 한쪽 차감만 살아남던 버그 fix.
// 0002_billing_usage.sql 의 deduct_credit_atomic (FOR UPDATE row lock) 호출.
export async function deductCost(env: Env, userId: string, costUsd: number): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (costUsd <= 0) return;
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/deduct_credit_atomic`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_user_id: userId, p_cost_usd: costUsd })
    });
    if (!resp.ok) {
      console.warn('[billing] atomic 차감 실패:', resp.status, await resp.text());
    }
  } catch (e) {
    console.warn('[billing] 차감 실패:', e);
  }
}
