// V4 (사용자 명시 2026-05-14 ultrathink): 개발자도구 — plan 결제 onboarding chain 미리보기.
//   각 plan (Light / Plus / Premium) 별 버튼 1개. 클릭 시:
//     1) state.preferences._planOnboardingShown[plan] flag delete (재진입 가능)
//     2) _showRecurringSuccessModal 호출 — 결제 성공 모달부터 시작 (실 결제 흐름과 동일)
//     3) [닫기] → _planOnboardingFlow(plan, skipStep1=true) chain (step 2 → 3 → 4)
//   실제 결제 X / billing cache 안 건드림 / DB 동기 안 함 — UI 시각 확인만.
function devPreviewPlanOnboarding(planKey) {
  if (typeof TIER_PLANS_CLIENT === 'undefined' || !TIER_PLANS_CLIENT[planKey]) {
    if (typeof showToast === 'function') showToast('잘못된 plan key: ' + planKey);
    return;
  }
  // flag reset — 매 미리보기마다 chain 풀로 노출.
  try {
    state.preferences = state.preferences || {};
    state.preferences._planOnboardingShown = state.preferences._planOnboardingShown || {};
    delete state.preferences._planOnboardingShown[planKey];
    // 미리보기는 saveState() 생략 — flag 영구 박지 않음 (다음 페이지 reload 시 flag 복원).
  } catch {}
  const tier = TIER_PLANS_CLIENT[planKey];
  // Plus (key='light') 만 isTrial=true (첫 달 무료 카피 분기 확인용). 다른 plan 은 정가 결제 카피.
  const isTrial = (planKey === 'light');
  // 가짜 next_billing — 30일 후.
  const fakeNext = new Date(Date.now() + 30 * 86400_000).toISOString();
  if (typeof _showRecurringSuccessModal === 'function') {
    _showRecurringSuccessModal({
      tier,
      plan: planKey,
      pgLabel: '🧪 테스트 (개발자 미리보기)',
      isTrial,
      nextBillingIso: fakeNext
    });
  } else {
    if (typeof showToast === 'function') showToast('_showRecurringSuccessModal 미정의');
  }
}
