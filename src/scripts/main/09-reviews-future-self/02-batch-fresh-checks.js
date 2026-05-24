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

// V4 (사용자 명시 2026-05-25 ultrathink): UI 노출 = fresh batch review 만.
//   옛 일요일 fallback path (사용자 직접 generateReview 호출 후 노출) 폐기.
//   새 spec: review 는 무조건 batch path (auto=true) 만 — review chain batch 가 자격 충족 시 생성.
//   inline path (auto=false) 도 사용 X — _force* 명령어는 batch path 호출로 변경 또는 폐기.
function isWeeklyReviewAvailable() {
  return !!_hasFreshBatchReview('weeklyReviews');
}

function isMonthlyReviewAvailable() {
  return !!_hasFreshBatchReview('monthlyReviews');
}

function isQuarterlyReviewAvailable() {
  return !!_hasFreshBatchReview('quarterlyReviews');
}

function isAnnualReviewAvailable() {
  return !!_hasFreshBatchReview('annualReviews');
}

