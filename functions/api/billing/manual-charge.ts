// POST /api/billing/manual-charge — 폐기됨 (사용자 명시 2026-04-30).
// 옛 흐름: 영수증 점검 X 단순 신뢰 모델 → 위조 risk. AI 점검 (verify-toss-receipt) 으로 일원화.
// 모든 충전은 영수증 캡처 업로드 → /api/billing/verify-toss-receipt 사용.

import { jsonResponse } from '../_lib/auth';

export async function onRequestPost(): Promise<Response> {
  return jsonResponse({
    error: '이 endpoint 는 폐기됐어요. 영수증 캡처 업로드 → /api/billing/verify-toss-receipt 사용해주세요.',
    code: 'DEPRECATED',
    redirect: '/api/billing/verify-toss-receipt'
  }, 410);
}
