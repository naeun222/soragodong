// V4 (사용자 명시 2026-05-16 ultrathink): 옛 풀 튜토리얼 인프라 폐기. V8/V9 시작 튜토 + sim 튜토 picker 만 활성.
// ONBOARDING_STEPS = [] 빈 배열은 다른 파일에서 .length / findIndex 참조 — 빈 배열 유지로 모든 옛 경로 자연 종료.
// 활성 step (참고): Core 1 welcome / intake_intro / chapter_close_intro / core1_finish, Core 2 click_strategy ~ shell_obtained,
//   Core 3-A success_celebrate ~ core3a_finish, Core 3-B mutation_intro / try_evolved_card, Core 4 crystallize_complete.
const ONBOARDING_STEPS = [];

let _onbStep = 0;
let _onbActiveListeners = [];
let _onbStartTime = null;  // V3.12: 튜토리얼 시작 시간 — 종료 시 데이터 정리
