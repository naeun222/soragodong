// 사용자 본인 사용량 조회 endpoint. 클라이언트가 [설정 → 사용량] 화면에서 호출.

import { verifyAuth, unauthorized, jsonResponse } from './_lib/auth';
import { getMonthlyUsage } from './_lib/usage';
import { getUserBilling } from './_lib/billing';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'GET only' }, 405);
  }
  const user = await verifyAuth(req);
  if (!user) return unauthorized();

  const [usage, billing] = await Promise.all([
    getMonthlyUsage(user.id),
    getUserBilling(user.id)
  ]);

  return jsonResponse({
    monthly: usage,
    billing: billing || null
  });
}
