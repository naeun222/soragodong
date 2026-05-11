// 사용자 명시 2026-05-05: 100만 토큰 환영 선물 endpoint 폐기.
// V4 (사용자 명시 2026-05-11 ultrathink): 신규 가입 = ensureBillingRow 가 credit_balance_usd 로 환영 토큰 한정량 (WELCOME_TOKEN_USD, 양 비공개) grant.
//   사용자 명시 'Plus trial' (portone-register-trial, 1인 1회) 까지의 brige funnel.
// 이 endpoint 자체는 410 Gone 응답 — 클라이언트가 더 이상 호출 X. 파일 자체 삭제는 사용자 검토 후 별도 결정.

import { jsonResponse, type Env } from '../_lib/auth';

export async function onRequestPost(_context: { request: Request; env: Env }): Promise<Response> {
  return jsonResponse({
    ok: false,
    deprecated: true,
    error: '환영 선물 endpoint 폐기. 신규 가입 시 환영 토큰은 자동 grant (별도 호출 X).',
    migration: 'ensureBillingRow 가 신규 가입 시 credit_balance_usd 로 자동 grant'
  }, 410);
}
