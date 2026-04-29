// Cloudflare Pages Functions — 사용자 plan / 잔여 토큰 / 차감.

import type { Env } from './auth';

export const FREE_INITIAL_CREDIT_USD = 1.0;

export type UserBilling = {
  user_id: string;
  credit_balance_usd: number;
  subscription_active: boolean;
  subscription_expires_at: string | null;
  subscription_plan?: string | null;
  monthly_token_quota: number | null;
  monthly_token_used: number;
  monthly_period_started_at: string | null;
  free_credit_granted: boolean;
};

export type BudgetCheck =
  | { ok: true; remaining_credit_usd: number; subscription_active: boolean; }
  | { ok: false; reason: string; code: 'NO_CREDIT' | 'NEED_AUTH' | 'NO_BILLING_ROW'; remaining_credit_usd?: number; };

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
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(newRow)
    });
    return await getUserBilling(env, userId);
  } catch (e) {
    console.warn('[billing] row 생성 실패:', e);
    return null;
  }
}

export async function checkBudget(env: Env, userId: string): Promise<BudgetCheck> {
  let billing = await getUserBilling(env, userId);
  if (!billing) {
    billing = await ensureBillingRow(env, userId);
    if (!billing) {
      return { ok: false, reason: 'billing row 생성 실패', code: 'NO_BILLING_ROW' };
    }
  }
  if (billing.subscription_active && billing.subscription_expires_at && new Date(billing.subscription_expires_at) > new Date()) {
    return { ok: true, remaining_credit_usd: billing.credit_balance_usd, subscription_active: true };
  }
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

export async function deductCost(env: Env, userId: string, costUsd: number): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (costUsd <= 0) return;
  try {
    const billing = await getUserBilling(env, userId);
    if (!billing) return;
    const updates: any = {};
    if (billing.subscription_active && billing.subscription_expires_at && new Date(billing.subscription_expires_at) > new Date()) {
      updates.monthly_token_used = (billing.monthly_token_used || 0) + Math.round(costUsd * 1_000_000);
    } else {
      updates.credit_balance_usd = Math.max(0, (billing.credit_balance_usd || 0) - costUsd);
    }
    await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(updates)
    });
  } catch (e) {
    console.warn('[billing] 차감 실패:', e);
  }
}
