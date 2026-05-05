// 사용자 명시 2026-05-05: 1,000원 legacy bonus 정책 폐기 (100만 토큰 환영 선물과 함께).
// 이 endpoint 자체는 410 Gone 응답 — 클라이언트가 더 이상 호출 X. 파일 자체 삭제는 사용자 검토 후 별도 결정.

import { jsonResponse, type Env } from '../_lib/auth';

export async function onRequestPost(_context: { request: Request; env: Env }): Promise<Response> {
  return jsonResponse({
    ok: false,
    deprecated: true,
    error: 'legacy bonus 정책 폐기됨. 처음 한 달 무료 (얼리 플랜) 자동 활성화.'
  }, 410);
}
