// V4 (사용자 명시 2026-05-06 ultrathink): 옛 chooser dead — V8 sim 튜토 picker (showSimTutorialPicker) 로 위임.
async function showCoreReplayPicker() {
  if (typeof showSimTutorialPicker === 'function') return showSimTutorialPicker();
  if (typeof showToast === 'function') showToast('튜토리얼 picker 준비 중...');
}

// V4 (v8 사용자 명시 2026-05-03 ultrathink): 옛 코어 잠금 시각 표시 = 폐기.
// .core-locked 클래스 부착 X — DOM 깨끗. 옛 잠금 시각 (🔒 ::after) 안 보임.
// 함수는 보존 — render 함수들이 호출 (renderHome 등).
function applyCoreLockMarkers() {
  return;  // v8 폐기 — noop. legacy 호환 위해 함수 보존 (renderHome 등 호출).
}

// 사용자 요청 2026-04-29: 튜토리얼 phase 시각화 — "지금 어디 있나"
// startId 기준으로 phase 묶음 정의. 마지막 phase는 다음 startId 직전까지.
const ONBOARDING_PHASES = [
  { startId: 'tutorial_plea',         name: '시작',                  desc: '한 마디 부탁' },
  { startId: 'go_home_for_checkin',    name: '첫 체크인',             desc: '오늘 너 30초 기록' },
  { startId: 'go_chat',                name: '대화 + 전략',           desc: '소라랑 풀고 무기 만들기' },
  { startId: 'go_home_for_mission',    name: '미션 + 모래사장',       desc: '소라의 부름과 결과 체크' },
  { startId: 'go_archive',             name: '🧬 키움',             desc: '전략이 자라는 곳 — 핵심' },
  { startId: 'go_execute',             name: '실행 + 나',             desc: '몰입 + 자기 모델' },
  { startId: 'go_archive_lib',         name: '홈 둘러보기',       desc: '5 카테고리 + 숙고' },
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

