// V4 (사용자 요청 2026-04-29): 설정 → 🐚 투어 다시 보기
// V4 사용자 명시 (V203): chooser 폐기 — 코어 #1 직접 진입 (사용자가 명시 click 한 거라 명확).
function showTutorialReplayMenu() {
  if (typeof startCoreTutorial === 'function') return startCoreTutorial('core1');
  return startInteractiveOnboarding();
}

// V4 (사용자 요청 2026-04-29): 설정 → 🔧 개별 코어 튜토리얼
// 코어 7개 + 풀 한 번에 골라서 진행. 잠금이랑 무관 — replay 도구.
async function showCoreReplayPicker() {
  if (typeof showOptionsModal !== 'function') {
    return startInteractiveOnboarding();
  }
  // 사용자 요청 2026-04-29: 제목 '코어 #N' 제거, 단순 명사 (코어 번호 순서 유지)
  const opts = [
    { label: '🐚 시작',             value: 'core1', desc: '체크인 / 대화 한 바퀴 (필수 핵심)' },
    { label: '⭐ 소라의 부름',      value: 'core2', desc: '미션 / 모래사장 / 양생방 (좀 긺)' },
    { label: '🚀 실행',             value: 'core3', desc: '머릿속 풀기 + 몰입' },
    { label: '✦ 나',                value: 'core4', desc: 'AI가 본 너의 패턴·가치·특성' },
    { label: '📚 도서관',           value: 'core5', desc: '일기 / 진주 / 깨달음 / 리뷰 (좀 긺)' },
    { label: '🌊 숙고',             value: 'core6', desc: '마음을 울리는 큰 물음' },
    { label: '🐚 마법의 소라고동', value: 'core8', desc: '큰 결정 14일 숙성' },
    { label: '✨ 풀 튜토리얼',       value: 'full',  desc: '처음부터 끝까지 (~30분)' }
  ];
  const choice = await showOptionsModal({
    title: '🔧 개별 코어 튜토리얼',
    message: '코어 골라서 다시 보기. 잠금 상태 영향 X.',
    options: opts
  });
  if (!choice) return;
  if (choice === 'full') {
    window._fullTutorialActive = true;
    return startInteractiveOnboarding();
  }
  if (typeof startCoreTutorial === 'function') return startCoreTutorial(choice);
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

