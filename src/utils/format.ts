// 포매팅 유틸 — index.html에서 추출 (Phase A Tier 1, 두 번째 모듈)
// 사용자 요청 2026-05-03: 단일 HTML → 모듈 점진 추출 계속.

import { todayKey, getDayKey } from './date';

/**
 * HTML 특수문자 5개(& < > " ')를 entity로 변환.
 * falsy 입력(null / undefined / 빈 문자열 / 0)은 빈 문자열 반환.
 *
 * index.html에서 391회 사용 — 사용자 입력·서버 응답 안전하게 DOM에 박을 때.
 */
export function escapeHtml(input: unknown): string {
  if (!input) return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(input).replace(/[&<>"']/g, c => map[c]);
}

/**
 * 'YYYY-MM-DD' 키를 한국어 날짜 표시로.
 * - 오늘   → "오늘 · 4월 29일 (목)"
 * - 어제   → "어제 · 4월 28일 (수)"
 * - 그 외  → "2026년 4월 29일 (목)"
 *
 * 04:00 cutoff 기준 (date.ts의 getDayKey/todayKey 그대로 사용).
 */
export function formatDateKorean(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = todayKey();
  const yesterday = getDayKey(Date.now() - 86400000);
  if (dateStr === today) {
    return '오늘 · ' + d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  }
  if (dateStr === yesterday) {
    return '어제 · ' + d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  }
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}
