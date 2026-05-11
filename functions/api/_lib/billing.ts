// Cloudflare Pages Functions — 사용자 plan / 잔여 토큰 / 차감.

import type { Env } from './auth';

// 사용자 명시 2026-05-05: $2.14 환영 credit / 1,000원 legacy bonus / 100만 토큰 환영 선물 정책 모두 폐기.
// 신정책: ensureBillingRow 가 신규 row 생성 시 처음 한 달 자동 무료 (얼리 플랜, 자동 결제 X).
// 만료 후 사용자가 직접 light/plus/premium 구독 결정. 한도 도달 시 → 상위 tier 권유.
// V4 (사용자 명시 2026-05-11 ultrathink): tier 재구성 — Light(early_lifetime, 4,900) / Plus(light, 9,900 첫 달 무료) / Premium(premium, 25,000).
//   key 와 label 매핑 헷갈림 주의 (frontend `01-tiers-and-caps.js` 와 동기).

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
  // 사용자 명시 2026-05-12 ultrathink: 일일 cap (migration 0020). consume_daily_atomic RPC 가 관리.
  daily_quota_used?: number;            // 오늘 누적 (USD)
  daily_quota_reset_at?: string | null; // 다음 24h reset 시각
  daily_cap_grace_until?: string | null; // grace 7일 종료 시각 (NULL = grace 미적용)
};

export type BudgetCheck =
  | { ok: true; remaining_credit_usd: number; subscription_active: boolean; subscription_plan?: string | null; monthly_remaining_usd?: number; }
  | { ok: false; reason: string; code: 'NO_CREDIT' | 'NEED_AUTH' | 'NO_BILLING_ROW'; remaining_credit_usd?: number; };

// V4 (사용자 명시 2026-05-11 ultrathink): 3-tier 정가화 + Plus 첫 달 무료 promo.
//   light  (key='light')          — 'Plus' (9,900). 첫 달 무료 trial (portone-register-trial), 30일 후 자동 결제. cap $5.
//   premium (key='premium')       — 'Premium' (25,000). 정가 즉시 결제. cap $13.
//   early_light (legacy)          — 신규 가입자 자동 환영 체험 ($1.1 cap ≈ 1,400원, 30일). 만료 후 구독 유도. 결제 X.
//   early_lifetime (key='early_lifetime') — 'Light' (4,900). 정가 entry tier, 즉시 결제, 자동 갱신. cap $2.2 (옛 promo $3 폐기).
//   guest                         — anonymous 사용자 $0.30 cap. linkIdentity 시 early_light 로 fresh 갱신.
// 사용자 명시 2026-05-12 ultrathink:
//   - daily_cap_usd 추가 (pricing_redesign.md v2): light/early $0.20, premium $0.75, guest null (일일 cap 미적용).
//   - cap_usd 는 통계용으로 유지 (monthly cap 가드 폐기 — migration 0020 의 record_chat_usage_atomic 갱신).
//   - 한 달 한도 없음. daily cap 만 강제. 매일 reset → 풀 사용 시 월 max = daily × 30 (light $6, premium $22.5).
export const TIER_PLANS: Record<'light' | 'premium' | 'early_light' | 'early_lifetime' | 'guest', { krw: number; cap_usd: number; daily_cap_usd: number | null; label: string; auto_grant_first_month?: boolean; is_guest?: boolean; has_free_trial?: boolean }> = {
  light:          { krw: 9900,  cap_usd: 5,    daily_cap_usd: 0.20, label: 'Plus', has_free_trial: true },
  premium:        { krw: 25000, cap_usd: 13,   daily_cap_usd: 0.75, label: 'Premium' },
  early_light:    { krw: 0,     cap_usd: 1.1,  daily_cap_usd: 0.20, label: '얼리 플랜 (legacy)', auto_grant_first_month: true },
  early_lifetime: { krw: 4900,  cap_usd: 2.2,  daily_cap_usd: 0.20, label: 'Light' },
  guest:          { krw: 0,     cap_usd: 0.30, daily_cap_usd: null, label: '게스트', is_guest: true }
};
export type TierKey = keyof typeof TIER_PLANS;

// 사용자 명시 2026-05-05: 처음 한 달 free trial 기간 (30일).
export const FREE_TRIAL_DAYS = 30;

// V4 (사용자 명시 2026-05-11 ultrathink): 신규 가입 환영 토큰 한정량 (양 비공개).
//   옛 정책 (early_light plan 자동 활성화) 폐기 → credit_balance_usd 로 grant.
//   사용자가 명시 'Plus trial' 신청 (1인 1회) 까지의 brige funnel.
//   양 = $1.1 (옛 early_light cap 와 동일 — 본인 출혈 max 보존). 사용자 노출 절대값 X.
export const WELCOME_TOKEN_USD = 1.1;

// 사용자 명시 2026-05-02 ultrathink: light_pack 제거 — Premium 전용 (Light/얼리는 Premium 전환 또는 다음 달 대기).
// V4 (사용자 명시 2026-05-04 ultrathink — v2): 작은 단위 재설계 — premium_pack 7000/$5 → 2500/$1.5.
//   frontend `01-tiers-and-caps.js` OVERAGE_PACKS_CLIENT.premium_pack 와 동기 — 옛 amount mismatch 결제 fail 픽스.
export const OVERAGE_PACKS: Record<'premium_pack', { krw: number; usd: number; for_tier: TierKey }> = {
  premium_pack: { krw: 2500, usd: 1.5, for_tier: 'premium' }
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
  // V4 (사용자 명시 2026-05-11 ultrathink): plan 자동 활성화 폐기 → credit_balance_usd 로 환영 토큰 한정량 grant.
  //   funnel: 가입 → 무료 토큰 (소진까지, 시간 무관) → 사용자 명시 Plus trial (1인 1회, 카드 등록) → 정가 결제.
  //   본인 출혈 max = 옛 early_light cap ($1.1) 와 동일. 시간 압박 (30일 만료) 제거 → ADHD 사용자 친화.
  //   anonymous (게스트) = 그대로 'guest' plan ($0.30 cap, 1년) — 별개 정체성 유지.
  const now = new Date();
  const isGuest = !!opts?.isAnonymous;
  // 사용자 명시 2026-05-12 ultrathink: 신규 가입 시 daily_cap_grace_until = 가입 + 7일. paid 사용자 cap × 1.5 (충격 완화).
  //   guest 는 daily cap 없음 (TIER_PLANS.guest.daily_cap_usd=null) — grace 무의미하지만 컬럼 일관성 위해 박음.
  const _graceUntil = new Date(now.getTime() + 7 * 86400_000).toISOString();
  const newRow: Partial<UserBilling> & { user_email?: string | null } = isGuest
    ? {
        user_id: userId,
        user_email: opts?.userEmail || null,
        credit_balance_usd: 0,
        subscription_active: true,
        subscription_expires_at: new Date(now.getTime() + 365 * 86400_000).toISOString(),
        subscription_plan: 'guest',
        monthly_token_quota: null,
        monthly_quota_usd: TIER_PLANS.guest.cap_usd,
        monthly_token_used: 0,
        monthly_period_started_at: now.toISOString(),
        free_trial_granted_at: null,
        daily_quota_used: 0,
        daily_quota_reset_at: new Date(now.getTime() + 86400_000).toISOString(),
        daily_cap_grace_until: _graceUntil
      }
    : {
        user_id: userId,
        // 사용자 보고 2026-05-09 ultrathink: schema 통일 (migration 0016) — user_email 같이 채움.
        user_email: opts?.userEmail || null,
        credit_balance_usd: WELCOME_TOKEN_USD,  // 환영 토큰 한정량 (양 비공개)
        subscription_active: false,             // plan 자동 활성화 X
        subscription_expires_at: null,
        subscription_plan: null,
        monthly_token_quota: null,
        monthly_quota_usd: 0,
        monthly_token_used: 0,
        monthly_period_started_at: null,
        free_trial_granted_at: now.toISOString(), // 환영 토큰 grant 시점 = 멱등 가드
        daily_quota_used: 0,
        daily_quota_reset_at: new Date(now.getTime() + 86400_000).toISOString(),
        daily_cap_grace_until: _graceUntil
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

// V4 (사용자 명시 2026-05-11 ultrathink): 게스트 → 환영 토큰 grant 으로 승격 (plan 자동 활성화 X).
// 흐름: anonymous user 가 linkIdentity 로 이메일 가입 → 다음 /api/chat 또는 /api/usage 호출 시
//       backend 가 user.is_anonymous=false 인데 billing.subscription_plan='guest' detect → 승격.
// 효과: subscription_active=false, plan=null, credit_balance_usd += $1.1 환영 토큰 grant.
//   funnel: 게스트 사용 → 가입 후 토큰 추가 → Plus trial 명시 신청 → 정가 결제.
//   함수명은 호환 유지 (호출처 기존 코드 영향 X) — 동작만 변경.
export async function promoteGuestToEarlyLight(env: Env, userId: string): Promise<{ ok: boolean; promoted: boolean }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, promoted: false };
  const now = new Date();
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
        subscription_plan: null,
        subscription_active: false,
        subscription_expires_at: null,
        credit_balance_usd: WELCOME_TOKEN_USD,
        monthly_quota_usd: 0,
        monthly_token_used: 0,
        monthly_period_started_at: null,
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

// 사용자 명시 2026-05-12 ultrathink: 일일 cap atomic 차감 helper.
// 0020_daily_cap.sql 의 consume_daily_atomic RPC 호출. user-trigger path (chat.ts) 에서만 호출.
// batch path (chat-batch.ts) 는 monthly cap 만 차감 (옛 흐름).
// guest 등 daily_cap_usd=null 이면 RPC 가 skip 반환 — ok:true 그대로.
export async function consumeDailyAtomic(
  env: Env,
  userId: string,
  amountUsd: number,
  dailyCapUsd: number | null
): Promise<{
  ok: boolean;
  skipped?: boolean;
  daily_cap_reached?: boolean;
  reset_at?: string;
  effective_cap?: number;
  base_cap?: number;
  used?: number;
  daily_remaining?: number;
  in_grace?: boolean;
  reason?: string;
  error?: string;
}> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: 'env missing' };
  if (amountUsd < 0) return { ok: false, error: 'amount < 0' };
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_daily_atomic`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_amount_usd: amountUsd,
        p_daily_cap_usd: dailyCapUsd
      })
    });
    if (!resp.ok) {
      console.warn('[consume_daily_atomic] RPC 비-OK:', resp.status, await resp.text().catch(() => ''));
      // migration 0020 미적용 / 다른 일시적 오류 = fail-open (사용자 명시 2026-05-12 ultrathink: 차단보단 통과).
      return { ok: true, skipped: true, reason: 'rpc_unavailable' };
    }
    const data: any = await resp.json();
    return data || { ok: false, error: 'no data' };
  } catch (e: any) {
    console.warn('[consume_daily_atomic] throw:', e?.message || e);
    return { ok: true, skipped: true, reason: 'rpc_throw' };
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
  if (env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID) {
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
  // V4 (사용자 명시 2026-05-11 — 가계약): BILLING_RECURRING_ENABLED='true' 가 아니면 Plus 첫 달 무료 promo X.
  //   잘못된 카피 누수 방지 — env 분기로 정확한 안내.
  const recurOn = (env as any).BILLING_RECURRING_ENABLED === 'true';
  const planLine = recurOn
    ? 'Light (4,900원) / Plus (9,900원 첫 달 무료) / Premium (25,000원)'
    : 'Light (4,900원) / Plus (9,900원) / Premium (25,000원) — 모두 1개월 이용권';
  return {
    ok: false,
    reason: `잔액이 0원이야. ${planLine} 중 구독해줘.`,
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
