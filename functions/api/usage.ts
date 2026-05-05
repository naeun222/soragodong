// GET /api/usage — 사용자 본인 사용량 + billing 정보 조회.
// 사용자 명시 2026-05-05: 신규 가입자 처음 한 달 무료 (얼리 플랜) 자동 활성화 — billing row 없으면 ensureBillingRow 가 즉시 active=true / plan='early_light' / 30일 expires 생성.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { getMonthlyUsage } from './_lib/usage';
import { getUserBilling, ensureBillingRow } from './_lib/billing';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  // 신규 가입자 자동 한 달 무료 활성화 — 첫 진입에서 즉시 trigger.
  let billing = await getUserBilling(env, user.id);
  if (!billing) {
    billing = await ensureBillingRow(env, user.id);
  }
  const usage = await getMonthlyUsage(env, user.id);

  return jsonResponse({
    monthly: usage,
    billing: billing || null
  });
}
