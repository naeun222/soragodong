// Cloudflare Pages Functions — 사용자 plan / 잔여 토큰 / 차감.

import type { Env } from './auth';

// 사용자 명시 이력: 4,000원 → 2,000원 (2026-04-30) → 3,000원 (2026-05-01). 1USD = 1,400원 환산 → $2.14 (≈ 3,000원).
// pure API cost — 마진 X. 차감은 Anthropic 가격 그대로 (calculateCost in: 3, out: 15 등). 3,000원 = ~$2.14 어치 sonnet/haiku 호출 가능.
// 사용자 명시 2026-04-30 ultrathink: 자동 부여 X. 환영 모달 '받기' click 시만 (POST /api/billing/welcome-bonus).
export const FREE_INITIAL_CREDIT_USD = 2.14;

// 사용자 명시 2026-05-01: 환영 토큰 2,000원 → 3,000원 상향에 따른 기존 사용자 보상 (1회성).
// 대상: 이미 환영 토큰 받은 사용자 (free_credit_granted=true). 잔액 += $0.71 (≈ 1,000원).
// 결과: 기존 사용자 = $1.43 + $0.71 = $2.14 (신규 가입자 신정책과 동일 효과).
// 미수령 사용자 (free_credit_granted=false) = legacy bonus 대상 X — 받기 누르면 새 3,000원 정책 적용.
export const LEGACY_BONUS_MAY2026_USD = 0.71;

export type UserBilling = {
  user_id: string;
  credit_balance_usd: number;
  subscription_active: boolean;
  subscription_expires_at: string | null;
  subscription_plan?: 'light' | 'premium' | 'early_light' | string | null;
  monthly_token_quota: number | null;
  monthly_quota_usd?: number;          // 사용자 명시 2026-04-30: tier cap (USD). Light 5 / Premium 13 / early_light 4.
  monthly_token_used: number;          // micro-USD 누적 (cost_usd × 1M)
  monthly_period_started_at: string | null;
  free_credit_granted: boolean;
  legacy_bonus_2026_05_granted?: boolean;          // 사용자 명시 2026-05-01: 기존 사용자 1,000원 보너스 수령 여부 (migration 0006)
  // 사용자 명시 2026-05-02 ultrathink (migration 0008):
  early_user?: boolean;                            // 출시 전 가입자 = 평생 4,900원 cap $4 자격
  early_user_granted_at?: string | null;
  welcome_bonus_tokens_remaining?: number;          // 환영 선물 잔여 토큰 (input + output + cache 합산 카운트)
  welcome_bonus_total_granted?: number;
  welcome_bonus_granted_at?: string | null;
  welcome_bonus_expires_at?: string | null;
  opus_daily_used?: number;                         // Premium 전용 Opus 일일 사용 횟수 (한도 30)
  opus_daily_reset_at?: string | null;
};

export type BudgetCheck =
  | { ok: true; remaining_credit_usd: number; subscription_active: boolean; subscription_plan?: string | null; monthly_remaining_usd?: number; }
  | { ok: false; reason: string; code: 'NO_CREDIT' | 'NEED_AUTH' | 'NO_BILLING_ROW'; remaining_credit_usd?: number; };

// 사용자 명시 2026-05-02 ultrathink: 가격 조정 + early_light 신설.
//   - Light 8,900 → 9,900 (만 원 안쪽 보존)
//   - Premium cap $15 → $13 (Opus 30번 한도와 결합 cap 보호)
//   - early_light 4,900/cap $4 (얼리 유저 평생, requires early_user flag)
export const TIER_PLANS: Record<'light' | 'premium' | 'early_light', { krw: number; cap_usd: number; label: string; requires_early_user?: boolean }> = {
  light:        { krw: 9900,  cap_usd: 5,  label: 'Light' },
  premium:      { krw: 25000, cap_usd: 13, label: 'Premium' },
  early_light:  { krw: 4900,  cap_usd: 4,  label: 'Light (얼리)', requires_early_user: true }
};
export type TierKey = keyof typeof TIER_PLANS;

// 사용자 명시 2026-05-02 ultrathink: light_pack 제거 — Premium 전용 (Light/얼리는 Premium 전환 또는 다음 달 대기).
export const OVERAGE_PACKS: Record<'premium_pack', { krw: number; usd: number; for_tier: TierKey }> = {
  premium_pack: { krw: 7000, usd: 5, for_tier: 'premium' }
};

// 사용자 명시 2026-05-02 ultrathink: Opus = Premium 전용 + 일일 30번 (메인 대화 한정, 새벽 4시 KST 리셋).
export const OPUS_DAILY_LIMIT_PREMIUM = 30;

// 사용자 명시 2026-05-02 ultrathink: 환영 선물 = 정확히 100만 토큰, 30일 만료, 튜토리얼 완주 후 grant.
// 100만 토큰 ≈ Sonnet 평균 input:output 4:1 + 캐시 90% hit 기준 ~$2 어치. 회사 손해는 부담.
// 이전 정책 ($2.14 free credit, free_credit_granted flag) 와 병행 — grant_welcome_bonus_atomic RPC 가 둘 다 추가.
export const WELCOME_BONUS_TOKENS = 1_000_000;
export const WELCOME_BONUS_EXPIRES_DAYS = 30;

// 사용자 명시 2026-05-02 ultrathink: tier 검증 헬퍼.
// early_light 는 early_user flag 필수. UI 위변조 시 backend 가 거부.
export async function validateTier(env: Env, userId: string, tierKey: TierKey | string): Promise<{ ok: boolean; error?: string; tier?: typeof TIER_PLANS[TierKey] }> {
  const plan = TIER_PLANS[tierKey as TierKey];
  if (!plan) return { ok: false, error: 'invalid tier' };
  if (plan.requires_early_user) {
    const billing = await getUserBilling(env, userId);
    if (!billing?.early_user) {
      return { ok: false, error: '얼리 유저 자격 X' };
    }
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

export async function ensureBillingRow(env: Env, userId: string): Promise<UserBilling | null> {
  const existing = await getUserBilling(env, userId);
  if (existing) return existing;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  // 사용자 명시 2026-04-30 ultrathink (CRITICAL): 자동 free credit 부여 X. 잔액 0 INSERT.
  // 사용자가 환영 모달 '받기' button click 시만 POST /api/billing/welcome-bonus 로 부여.
  // root cause (이전 버그): 새로고침 시 getUserBilling transient 에러 → INSERT FREE_INITIAL_CREDIT_USD →
  //                       supabase 의 INSERT 동작 mismatch 가능성 → 잔액 reset / 누적 risk.
  // fix: 잔액 0 INSERT + free_credit_granted=false. 받기 click 만 trigger.
  const newRow: Partial<UserBilling> = {
    user_id: userId,
    credit_balance_usd: 0,
    subscription_active: false,
    subscription_expires_at: null,
    monthly_token_quota: null,
    monthly_token_used: 0,
    monthly_period_started_at: null,
    free_credit_granted: false
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
// 2) subscription X → credit_balance_usd 로 직접 사용 (legacy charge 잔액 또는 free credit)
export async function checkBudget(env: Env, userId: string): Promise<BudgetCheck> {
  let billing = await getUserBilling(env, userId);
  if (!billing) {
    billing = await ensureBillingRow(env, userId);
    if (!billing) {
      return { ok: false, reason: 'billing row 생성 실패', code: 'NO_BILLING_ROW' };
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
