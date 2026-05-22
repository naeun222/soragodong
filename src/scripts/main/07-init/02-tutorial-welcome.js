// V4 (사용자 명시 2026-05-17 ultrathink): 모든 튜토 대상 = 게스트 OR 미구독 사용자.
//   구독 활성 (Light/Plus/Premium) 사용자는 튜토 X — 이미 commit 된 사용자.
//   각 튜토 shouldRunXxx 가 이 helper 호출 (게이트).
// V4 fix (사용자 보고 2026-05-23 ultrathink) — _billingCache fetch 전 race 보호.
//   옛: _bill null 시 _isSubscriber=false → eligible=true → premium 사용자가 init race 시점 즉시 분석 발동 (어드민 jade6679 보고).
//   신: _bill 미완료 시 구독자 가정 (= eligible=false, deferred). 진짜 미구독자도 fetch 완료 후 다음 호출에서 자연 fallthrough.
function _isTutorialEligibleUser() {
  if (typeof state === 'undefined' || !state) return false;
  if (state.isGuest) return true;
  const _bill = (typeof window !== 'undefined') ? window._billingCache : null;
  if (_bill == null) return false;  // race 보호 — fetch 전엔 구독자 가정.
  const _isSubscriber = !!(_bill.subscription_plan && _bill.subscription_plan !== 'free' && _bill.subscription_active);
  return !_isSubscriber;
}

// V4 (사용자 명시 2026-05-16 ultrathink): 옛 풀 튜토리얼 인프라 폐기. V8/V9 시작 튜토 + sim 튜토 picker 만 활성.
// ONBOARDING_STEPS = [] 빈 배열은 다른 파일에서 .length / findIndex 참조 — 빈 배열 유지로 모든 옛 경로 자연 종료.
// 활성 step (참고): Core 1 welcome / intake_intro / chapter_close_intro / core1_finish, Core 2 click_strategy ~ shell_obtained,
//   Core 3-A success_celebrate ~ core3a_finish, Core 3-B mutation_intro / try_evolved_card, Core 4 crystallize_complete.
const ONBOARDING_STEPS = [];

let _onbStep = 0;
let _onbActiveListeners = [];
let _onbStartTime = null;  // V3.12: 튜토리얼 시작 시간 — 종료 시 데이터 정리
