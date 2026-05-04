// 사용자 click 시 user_viewed=true 넣음 (다음 진입 시 카드 hidden).
function _hasFreshBatchReview(arrKey, keyMatch) {
  const arr = state[arrKey] || [];
  return arr.find(r => r.auto && !r.user_viewed && (!keyMatch || keyMatch(r)));
}

// 사용자 명시 2026-05-04: 한 번 진입한 리뷰 카드 같은 주기 안에선 다시 안 뜨게.
// type ∈ {'weekly','monthly','quarterly','annual'}, key = 해당 주기 식별자 (currentWeekKey / prevMonthKey / prevQuarterKey / prevYear).
function _reviewDismissed(type, key) {
  const map = state.preferences && state.preferences._dismissedReviews;
  return map && map[type] === key;
}
function _dismissReview(type, key) {
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._dismissedReviews) state.preferences._dismissedReviews = {};
  state.preferences._dismissedReviews[type] = key;
  if (typeof saveState === 'function') saveState();
}

function isWeeklyReviewAvailable() {
  // batch 자동 생성 + 미시청 = 항상 노출 (요일 무관)
  const fresh = _hasFreshBatchReview('weeklyReviews');
  if (fresh) return true;
  // 옛 흐름: 일요일 + 이번주 안 한 경우 (사용자 직접 생성 가능 시점)
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  const currentWeekKey = getCurrentWeekKey();
  if (_reviewDismissed('weekly', currentWeekKey)) return false;
  return !(state.weeklyReviews || []).some(r => r.weekKey === currentWeekKey);
}

function isMonthlyReviewAvailable() {
  const fresh = _hasFreshBatchReview('monthlyReviews');
  if (fresh) return true;
  // 옛 흐름: 일요일 + 첫 7일 + 지난달 데이터 있으면
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  const dayOfMonth = today.getDate();
  if (dayOfMonth > 7) return false;
  const prevMonthKey = getMonthKey(new Date(today.getFullYear(), today.getMonth() - 1, 15));
  if (_reviewDismissed('monthly', prevMonthKey)) return false;
  const hasPrevMonth = (state.monthlyReviews || []).some(r => r.monthKey === prevMonthKey);
  if (hasPrevMonth) return false;
  const hasPrevMonthData = state.entries.some(e => e.date.startsWith(prevMonthKey));
  return hasPrevMonthData;
}

// 사용자 명시 2026-05-01 ultrathink: 분기 리뷰 카드 가드 (4AM cutoff).
function isQuarterlyReviewAvailable() {
  const fresh = _hasFreshBatchReview('quarterlyReviews');
  if (fresh) return true;
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  if (today.getDate() > 7) return false;
  if (today.getMonth() % 3 !== 0) return false;
  const prevQDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const prevQuarterKey = (typeof getQuarterKey === 'function') ? getQuarterKey(prevQDate) : null;
  if (!prevQuarterKey) return false;
  if (_reviewDismissed('quarterly', prevQuarterKey)) return false;
  const exists = (state.quarterlyReviews || []).some(r => r.quarterKey === prevQuarterKey);
  if (exists) return false;
  const range = (typeof getQuarterRange === 'function') ? getQuarterRange(prevQuarterKey) : null;
  if (!range) return false;
  const startISO = range.start.toISOString().split('T')[0];
  const endISO = range.end.toISOString().split('T')[0];
  return state.entries.some(e => e.date >= startISO && e.date <= endISO);
}

// 사용자 명시 2026-05-01 ultrathink: 연간 리뷰 카드 가드 (4AM cutoff).
function isAnnualReviewAvailable() {
  const fresh = _hasFreshBatchReview('annualReviews');
  if (fresh) return true;
  const today = _cutoffAdjustedNow();
  if (today.getDay() !== 0) return false;
  if (today.getMonth() !== 0) return false;
  if (today.getDate() > 7) return false;
  const prevYear = today.getFullYear() - 1;
  if (_reviewDismissed('annual', prevYear)) return false;
  const exists = (state.annualReviews || []).some(r => r.year === prevYear);
  if (exists) return false;
  return (state.entries || []).some(e => e.date && e.date.startsWith(String(prevYear)));
}

