// 날짜 유틸 — index.html에서 추출 (Phase A 모듈 분리 시작점)
// 사용자 요청 2026-04-29: 단일 HTML → 모듈 점진 추출. 첫 단계.

// 새벽 4시 cutoff — 새벽 작업자 자연스러움 + 잠 자기 전 일기·체크인이 그 날 기록으로 묶임.
export const DAY_CUTOFF_HOUR = 4;

/**
 * 'YYYY-MM-DD' 형식의 날짜 키 반환.
 * 새벽 4시 이전이면 전날로 처리 (cutoff).
 *
 * @param input  Date | number(ms) | string(ISO) | undefined(=now)
 */
export function getDayKey(input?: Date | number | string): string {
  const t = input == null
    ? Date.now()
    : (typeof input === 'string' ? new Date(input).getTime()
       : (input instanceof Date ? input.getTime() : input));
  const d = new Date(t - DAY_CUTOFF_HOUR * 3600000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function todayKey(): string {
  return getDayKey();
}

/**
 * 'YYYY-MM-DD' 키 두 개의 일수 차이 (b - a). 양수 = b가 미래.
 */
export function daysBetweenKeys(a: string, b: string): number {
  if (!a || !b) return 0;
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  return Math.round((db - da) / 86400000);
}
