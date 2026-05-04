// ═══════════════════════════════════════════════════════════════
// MISSION SYSTEM (Phase 2 core)
// ═══════════════════════════════════════════════════════════════
// V3.13.x: 한 번에 한 개만 보여주는 페이지 인덱스 (모듈 스코프)
let _currentMissionIdx = 0;

// V3.13.x: 'YYYY-MM-DD' 키 두 개의 일수 차이 (b - a, 양수 = b가 미래)
function daysBetweenKeys(a, b) {
  if (!a || !b) return 0;
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  return Math.round((db - da) / 86400000);
}

// V3.13.x: 3일 이상 지난 pending 부름 자동 만료. init/홈 진입 시 호출.
function expireOldMissions() {
  const today = todayKey();
  let changed = false;
  (state.missions || []).forEach(m => {
    if (m.status !== 'pending') return;
    if (!m.scheduledFor) return;
    const diff = daysBetweenKeys(m.scheduledFor, today);
    if (diff >= 3) {
      m.status = 'expired';
      m.expiredAt = new Date().toISOString();
      changed = true;
    }
  });
  // 사용자 명시 2026-05-01 (agent audit): completed + attemptStatus 없음 + scheduledFor 14일+ 지남 → 자동 unknown.
  // 이전 = scheduledFor 만기 후 영원히 prompt 노출 stale 자리.
  (state.missions || []).forEach(m => {
    if (m.status !== 'completed') return;
    if (m.attemptStatus) return;
    if (!m.scheduledFor) return;
    const diff = daysBetweenKeys(m.scheduledFor, today);
    if (diff >= 14) {
      m.attemptStatus = 'unknown';
      m.attemptCheckedAt = new Date().toISOString();
      m._autoExpired = true;
      changed = true;
    }
  });
  if (changed) saveState();
}

// V4-fix v3 (사용자 요청): 가닥 미션 팔로업 — 오늘~7일 내 결과 체크 필요 미션 1개 찾기
// 2026-04-28 수정: 'completed' + attemptStatus 없음 = 결과 체크 대상 (사용자 명세 — '소라의 부름' 해냈어 처리됐을 때)
function _findPendingStrategyFollowup() {
  const today = todayKey();
  return (state.missions || []).find(m => {
    if (m.status !== 'completed') return false;
    if (m.attemptStatus) return false;  // 이미 result check 끝남 (worked/didnt/meh)
    if (!m.strategyId) return false;
    // 사용자 보고 2026-04-30 ultrathink-2: defer/일반 둘 다 한 번 prompt → 그 뒤 양생방에서만.
    // _followupAsked=true → skip. defer 시점에는 reset (만기일에 한 번 더).
    if (m._followupAsked) return false;
    if (m.scheduledFor && daysBetweenKeys(today, m.scheduledFor) > 0) return false;
    // defer된 미션 (scheduledFor 있음)은 7일 룰 무시 — 사용자 명시적 날짜 우선.
    if (m.scheduledFor) return true;
    // 일반 미션 (자동 follow-up) — 완료 후 7일 window
    // 사용자 보고 2026-04-30 ultrathink: completedAt fallback 시 .toISOString()(UTC) 대신 getDayKey (KST 4am cutoff) — 04:00-09:00 KST 윈도우 1일 off 버그 fix.
    const dateKey = m.completedDate || (m.completedAt ? getDayKey(m.completedAt) : null);
    if (!dateKey) return false;
    const diff = daysBetweenKeys(dateKey, today);
    // V4 (사용자 보고 2026-05-03): 같은 날 (diff=0, cutoff 안 지남) 자동 trigger 차단 → 다음날부터 (diff>=1).
    // 의도: 미션 완료 직후 결과 체크 모달 X. 4시 cutoff 지나야 자동 prompt.
    if (!(diff >= 1 && diff <= 7)) return false;
    // V4 (사용자 보고 2026-05-04 VB024): cutoff 직후 깨움 edge case 추가 차단.
    // 예) 23:30 완료 → 다음날 04:30 진입 시 diff=1 통과되지만 실제 5h 만 경과 → "하루 안 지났다" 사용자 체감.
    // 추가 가드: completedAt 으로부터 최소 12h 경과 (체감상 "하루" 으로 인식 가능 임계).
    if (m.completedAt) {
      const _now = (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now());
      const _elapsed = _now - new Date(m.completedAt).getTime();
      if (_elapsed < 12 * 3600000) return false;
    }
    return true;
  });
}

// V4 비전 6.2: 결과 체크 (체크인/채팅 진입 시 자동 팔로업)
// 사용자 요청 2026-04-27: 다음날 자동만, '⏸ 아직 결과 안 나왔어' 미루기, meh→돌연변이 confirm
async function offerStrategyFollowup() {
  // 튜토리얼 모드에선 자동 팔로업 X (사용자 요청 — 흐름 방해)
  if (window._onbTutorialMode) return;
  if (!state.preferences) state.preferences = {};
  const todayK = todayKey();
  const isTester = !!(state.preferences && state.preferences.testerMode);
  // 하루 한 번 가드 (테스터 모드는 매번 — 검증용)
  if (!isTester && state.preferences._lastFollowupAt === todayK) return;
  const mission = _findPendingStrategyFollowup();
  if (!mission) return;
  // 사용자 보고 2026-04-30 ultrathink: mission._followupAsked 제거.
  // 답 안 하고 dismiss시 다음날 또 나오게. daily gate (_lastFollowupAt) 만으로 same-day re-show 차단.
  state.preferences._lastFollowupAt = todayK;
  saveState();
  setTimeout(() => triggerAttemptResultFlow(mission), 600);
}

// 결과 체크 흐름 단일화 — followup / DNA 카드 버튼 / 튜토리얼 모두 같은 흐름
