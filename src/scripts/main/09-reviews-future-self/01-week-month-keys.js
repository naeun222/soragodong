// ═══════════════════════════════════════════════════════════════
// PHASE 4: REVIEWS + FUTURE SELF LETTER + PREDICTION FOLLOWUPS
// ═══════════════════════════════════════════════════════════════

// ─── Time helpers ───
function getWeekKey(date) {
  // ISO week: YYYY-W##
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); // Thursday of this week
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 사용자 명시 2026-05-01 ultrathink: 4AM cutoff 적용된 "now". 새벽 4시 이전 = 어제 mental.
function _cutoffAdjustedNow() {
  const now = (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now());
  return new Date(now - DAY_CUTOFF_HOUR * 3600000);
}

function getCurrentWeekKey() { return getWeekKey(_cutoffAdjustedNow()); }
function getCurrentMonthKey() { return getMonthKey(_cutoffAdjustedNow()); }

// 사용자 명시 2026-05-02 ultrathink: batch 자동 생성 review 가 도착했고 사용자가 아직 안 봤으면 카드 노출 (요일 제약 우회).
// review.auto = true (batch 으로 push) + !review.user_viewed (사용자 click X) 시 = "✦ 새 리뷰 도착" 의미.
