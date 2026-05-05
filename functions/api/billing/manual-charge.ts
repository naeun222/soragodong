// POST /api/billing/manual-charge — 폐기됨.
// 사용자 명시 2026-05-06: 충전 / 토스 수동 송금 모두 폐기 → PortOne V2 카드 결제로 일원화.
// 신규 결제 = /api/billing/portone-verify-pay.

import { jsonResponse } from '../_lib/auth';

export async function onRequestPost(): Promise<Response> {
  return jsonResponse({
    error: '이 endpoint 는 폐기됐어요. 카드 결제 (PortOne) 사용해주세요.',
    code: 'DEPRECATED'
  }, 410);
}
