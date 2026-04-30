// 사용자 plan / 잔여 토큰 체크. 사용자 요청 2026-04-30 (Phase C 결제 모델: 무료 충전 토큰 + 월 정액 + 충전식).

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 무료 충전 토큰 초기 한도 (가입 시 1회 지급). 실제 정책 따라 조정.
// 사용자 명시 2026-04-30: 1,400원 → 4,000원 (4 천원어치). 1USD = 1,400원 환산 → $2.86.
// pure API cost — 마진 X. 차감은 Anthropic 가격 그대로.
export const FREE_INITIAL_CREDIT_USD = 2.86;

export type UserBilling = {
  user_id: string;
  // 충전 잔액 (USD)
  credit_balance_usd: number;
  // 월 정액 활성 여부 + 만료일
  subscription_active: boolean;
  subscription_expires_at: string | null;     // ISO timestamp
  // 월 정액 토큰 한도 + 사용량 (이번 달)
  monthly_token_quota: number | null;          // null = 무제한
  monthly_token_used: number;
  monthly_period_started_at: string | null;
  // 무료 충전 토큰 받았는지 (가입 시 1회)
  free_credit_granted: boolean;
};

export type BudgetCheck =
  | { ok: true; remaining_credit_usd: number; subscription_active: boolean; }
  | { ok: false; reason: string; code: 'NO_CREDIT' | 'NEED_AUTH' | 'NO_BILLING_ROW'; remaining_credit_usd?: number; };

// 사용자 billing row 조회 (없으면 null)
export async function getUserBilling(userId: string): Promise<UserBilling | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}&select=*&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!rows || rows.length === 0) return null;
    return rows[0];
  } catch (e) {
    console.warn('[billing] 조회 실패:', e);
    return null;
  }
}

// 신규 사용자 billing row 생성 (가입 시 무료 충전 토큰 부여)
export async function ensureBillingRow(userId: string): Promise<UserBilling | null> {
  const existing = await getUserBilling(userId);
  if (existing) return existing;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const newRow: Partial<UserBilling> = {
    user_id: userId,
    credit_balance_usd: FREE_INITIAL_CREDIT_USD,
    subscription_active: false,
    subscription_expires_at: null,
    monthly_token_quota: null,
    monthly_token_used: 0,
    monthly_period_started_at: null,
    free_credit_granted: true
  };
  try {
    // 사용자 보고 2026-04-30 ultrathink: ignore-duplicates 명시 — 새로고침 시 잔액 자동 충전 버그 fix (functions/ 와 동일 정책).
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/soragodong_billing`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=ignore-duplicates'
      },
      body: JSON.stringify(newRow)
    });
    if (!resp.ok) {
      console.warn('[billing] ensureBillingRow INSERT 비-2xx:', resp.status);
    }
    return await getUserBilling(userId);
  } catch (e) {
    console.warn('[billing] row 생성 실패:', e);
    return null;
  }
}

// AI 호출 전 잔여 한도 체크
export async function checkBudget(userId: string): Promise<BudgetCheck> {
  let billing = await getUserBilling(userId);
  if (!billing) {
    // 첫 진입 — 무료 충전 토큰 자동 부여
    billing = await ensureBillingRow(userId);
    if (!billing) {
      return { ok: false, reason: 'billing row 생성 실패', code: 'NO_BILLING_ROW' };
    }
  }
  // 월 정액 활성 + 만료 X면 OK
  if (billing.subscription_active && billing.subscription_expires_at && new Date(billing.subscription_expires_at) > new Date()) {
    return { ok: true, remaining_credit_usd: billing.credit_balance_usd, subscription_active: true };
  }
  // 충전 잔액 있으면 OK
  if (billing.credit_balance_usd > 0) {
    return { ok: true, remaining_credit_usd: billing.credit_balance_usd, subscription_active: false };
  }
  return {
    ok: false,
    reason: '충전 잔액이 0원이야. 결제 / 충전 후 다시 시도.',
    code: 'NO_CREDIT',
    remaining_credit_usd: 0
  };
}

// AI 호출 후 사용 비용 차감
export async function deductCost(userId: string, costUsd: number): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  if (costUsd <= 0) return;
  // RPC 함수로 atomic 차감 (race condition 회피). 일단 단순 update — Supabase에 stored procedure 박혀있으면 RPC 활용 권장.
  try {
    const billing = await getUserBilling(userId);
    if (!billing) return;
    // 월 정액 활성이면 월 토큰 카운터에 누적 (잔액 차감 X). 미활성이면 잔액 차감.
    const updates: any = {};
    if (billing.subscription_active && billing.subscription_expires_at && new Date(billing.subscription_expires_at) > new Date()) {
      // 월 정액: 토큰 사용량만 누적
      updates.monthly_token_used = (billing.monthly_token_used || 0) + Math.round(costUsd * 1_000_000);
    } else {
      // 충전: 잔액 차감
      updates.credit_balance_usd = Math.max(0, (billing.credit_balance_usd || 0) - costUsd);
    }
    await fetch(`${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(updates)
    });
  } catch (e) {
    console.warn('[billing] 차감 실패:', e);
  }
}
