// POST /api/billing/charge — 폐기됨.
// 사용자 명시 2026-05-06: 충전 plan + V1 IMP 모두 폐기 → Light/Premium 월정액 + premium_pack 추가팩 으로 일원화.

import { jsonResponse } from '../_lib/auth';

export async function onRequestPost(): Promise<Response> {
  return jsonResponse({
    error: '충전 결제 폐기됨. Light/Premium 구독 또는 Premium 추가팩 사용해주세요.',
    code: 'DEPRECATED'
  }, 410);
}
