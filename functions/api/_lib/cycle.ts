// V4 (사용자 명시 2026-05-13 ultrathink): 매월 가입일 anchor 기준 cycle helper.
//
// 표준 (Netflix / YouTube Premium 등): 가입일 anchor day 기준 매월 같은 날 결제.
//   anchor=13 → 매월 13일 / anchor=31 → 31, 30(4월/6월/9월/11월), 28-29(2월) clip.
// 옛 동작 (30일 fixed) 폐기 — 1년 12.17회 결제 vs 12회 표준.
//
// timezone: KST (Asia/Seoul, UTC+9) 기준. 사용자 가입 시각이 KST 기준 anchor 결정.
// 저장: UTC TIMESTAMPTZ. 변환만 KST 기준.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준으로 Date 의 day-of-month 추출 (1-31). */
export function getKstDay(date: Date): number {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.getUTCDate();
}

/** KST 기준 now 의 day-of-month — 가입 시점 anchor 결정용. */
export function getCurrentKstAnchorDay(): number {
  return getKstDay(new Date());
}

/**
 * 다음 결제 시각 계산 — prevBillingDate 기준 +1 month, anchor day 보존, 짧은 달 clip.
 *
 * @param prevBillingDate   이전 결제 (또는 가입) 시각 — KST 기준 hours/minutes 보존.
 * @param anchorDay         매월 결제 anchor (1-31, KST 기준).
 * @returns                 다음 결제 Date (UTC).
 *
 * 예:
 *   prev=2026-05-13 KST, anchor=13 → next=2026-06-13 KST
 *   prev=2026-01-31 KST, anchor=31 → next=2026-02-28 KST (clip)
 *   prev=2026-02-28 KST, anchor=31 → next=2026-03-31 KST (anchor 보존)
 *   prev=2026-03-31 KST, anchor=31 → next=2026-04-30 KST (clip)
 */
export function calcNextBillingDate(prevBillingDate: Date, anchorDay: number): Date {
  // KST 기준으로 변환 (UTC + 9h).
  const prevKst = new Date(prevBillingDate.getTime() + KST_OFFSET_MS);
  const targetYear  = prevKst.getUTCFullYear();
  const targetMonth = prevKst.getUTCMonth() + 1;  // +1 month (overflow OK — Date 가 자동 처리)
  // 해당 월의 마지막 날 — JS quirk: setUTCDate(0) 은 이전 달 마지막 날을 반환.
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clippedDay = Math.min(Math.max(1, anchorDay), lastDayOfTargetMonth);
  // KST 시각 — 시/분/초 보존 (charge 시각 일관성).
  const nextKst = new Date(Date.UTC(
    targetYear,
    targetMonth,
    clippedDay,
    prevKst.getUTCHours(),
    prevKst.getUTCMinutes(),
    prevKst.getUTCSeconds()
  ));
  // KST → UTC 복귀.
  return new Date(nextKst.getTime() - KST_OFFSET_MS);
}

/**
 * 옛 30일 fallback — anchor=NULL 인 row 보호.
 * cron-charge-recurring 이 옛 row 결제 시 anchor 없으면 이거 사용.
 */
export function calcNext30DayFallback(prevDate: Date): Date {
  return new Date(prevDate.getTime() + 30 * 86400_000);
}

/**
 * Anchor day 결정 — fallback chain:
 *   1) billing.cycle_anchor_day (있으면 그대로)
 *   2) next_billing_at 의 KST day (백필 안 된 row 보호)
 *   3) null (옛 30일 fallback)
 */
export function resolveAnchorDay(row: { cycle_anchor_day?: number | null; next_billing_at?: string | null }): number | null {
  if (typeof row.cycle_anchor_day === 'number' && row.cycle_anchor_day >= 1 && row.cycle_anchor_day <= 31) {
    return row.cycle_anchor_day;
  }
  if (row.next_billing_at) {
    try {
      const d = new Date(row.next_billing_at);
      if (!isNaN(d.getTime())) return getKstDay(d);
    } catch {}
  }
  return null;
}
