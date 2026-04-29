// GET /api/usage — 사용자 본인 사용량 + billing 정보 조회.

import { verifyAuth, unauthorized, jsonResponse, type Env } from './_lib/auth';
import { getMonthlyUsage } from './_lib/usage';
import { getUserBilling } from './_lib/billing';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  const [usage, billing] = await Promise.all([
    getMonthlyUsage(env, user.id),
    getUserBilling(env, user.id)
  ]);

  return jsonResponse({
    monthly: usage,
    billing: billing || null
  });
}
