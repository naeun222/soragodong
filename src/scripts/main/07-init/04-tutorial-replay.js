// V4 (사용자 요청 2026-04-29): 설정 → 🐚 투어 다시 보기
// V4 사용자 명시 (V203): chooser 폐기 — 코어 #1 직접 진입 (사용자가 명시 click 한 거라 명확).
function showTutorialReplayMenu() {
  if (typeof startCoreTutorial === 'function') return startCoreTutorial('core1');
  return startInteractiveOnboarding();
}

// V4 (사용자 명시 2026-05-06 ultrathink): 옛 chooser dead — V8 sim 튜토 picker (showSimTutorialPicker) 로 위임.
async function showCoreReplayPicker() {
  if (typeof showSimTutorialPicker === 'function') return showSimTutorialPicker();
  if (typeof showToast === 'function') showToast('튜토리얼 picker 준비 중...');
}

// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 코어 잠금 시각 표시 = 폐기.
// .core-locked 클래스 부착 X — DOM 깨끗. 옛 잠금 시각 (🔒 ::after) 안 보임.
// 함수는 보존 — render 함수들이 호출 (renderHome 등).
function applyCoreLockMarkers() {
  return;  // 옛 잠금 메커니즘 dead — noop
  /* DEAD CODE (v8 폐기, legacy reference):
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  // 매핑: 셀렉터 → coreId
  const lockMap = [
    // 탭 nav (3개)
    { sel: '.nav-item[data-screen="execute"]', core: 'core3' },
    { sel: '.nav-item[data-screen="model"]',   core: 'core4' },
    { sel: '.nav-item[data-screen="archive"]', core: 'core5' },
    // 홈 카드들
    { sel: '#missionContainer .mission-card',                         core: 'core2' },
    { sel: '.home-small-card[onclick="openShellCollection()"]',       core: 'core2' },
    // 도서관 안 양생방 chip — core2 prerequisite (사용자 요청 2026-04-29)
    { sel: '.lib-cat-chip[data-cat="yangsaeng"]',                     core: 'core2' },
    // 숙고 질문 — 추가 진입점 + 이미 active 진행 중인 카드도 잠금 (사용자 요청 2026-04-29)
    { sel: '.reflection-empty-card, .reflection-active-card, [onclick="addReflectionQuestion()"]', core: 'core6' },
    // 마법의 소라고동 — 도서관 안 진입점 + 홈 mini 카드 + 결정 화면 새 결정 버튼
    { sel: '[onclick="showArchiveDecisions()"], .decision-mini-card, .magic-card', core: 'core8' }
  ];
  lockMap.forEach(({sel, core}) => {
    const locked = isCoreLocked(core);
    document.querySelectorAll(sel).forEach(el => {
      if (locked) {
        el.classList.add('core-locked');
        el.setAttribute('data-core', core);
      } else {
        // 풀린 거: 클래스 + data 제거 (안전: 다른 data-core 쓰는 element와 충돌 X — 우리 앱엔 그런 예 없음)
        el.classList.remove('core-locked');
        if (el.getAttribute('data-core')) el.removeAttribute('data-core');
      }
    });
  });
  */
}

// 사용자 요청 2026-04-29: 튜토리얼 phase 시각화 — "지금 어디 있나"
// startId 기준으로 phase 묶음 정의. 마지막 phase는 다음 startId 직전까지.
const ONBOARDING_PHASES = [
  { startId: 'tutorial_plea',         name: '시작',                  desc: '한 마디 부탁' },
  { startId: 'go_home_for_checkin',    name: '첫 체크인',             desc: '오늘 너 30초 기록' },
  { startId: 'go_chat',                name: '대화 + 전략',           desc: '소라랑 풀고 무기 만들기' },
  { startId: 'go_home_for_mission',    name: '미션 + 모래사장',       desc: '소라의 부름과 결과 체크' },
  { startId: 'go_archive',             name: '🧬 양생방',             desc: '전략이 자라는 곳 — 핵심' },
  { startId: 'go_execute',             name: '실행 + 나',             desc: '몰입 + 자기 모델' },
  { startId: 'go_archive_lib',         name: '도서관 둘러보기',       desc: '5 카테고리 + 숙고' },
  { startId: 'finish',                 name: '마무리',                desc: '준비 끝!' }
];

// step idx → phase info
function _getPhaseInfo(idx) {
  if (!Array.isArray(ONBOARDING_STEPS) || idx < 0) return null;
  // phase startIdx 인덱스 매핑
  const startIdxs = ONBOARDING_PHASES.map(p => {
    const i = ONBOARDING_STEPS.findIndex(s => s && s.id === p.startId);
    return i;
  });
  // 어떤 phase에 속하는지
  let phaseIdx = 0;
  for (let p = 0; p < ONBOARDING_PHASES.length; p++) {
    if (startIdxs[p] !== -1 && startIdxs[p] <= idx) phaseIdx = p;
  }
  const phase = ONBOARDING_PHASES[phaseIdx];
  const phaseStartIdx = startIdxs[phaseIdx] >= 0 ? startIdxs[phaseIdx] : 0;
  const nextStart = (phaseIdx + 1 < startIdxs.length && startIdxs[phaseIdx + 1] >= 0) ? startIdxs[phaseIdx + 1] : ONBOARDING_STEPS.length;
  const phaseEndIdx = nextStart - 1;
  return { phaseIdx, phase, phaseStartIdx, phaseEndIdx, totalPhases: ONBOARDING_PHASES.length };
}

