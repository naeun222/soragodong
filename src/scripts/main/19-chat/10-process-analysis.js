async function processAnalysis(analysis, messageIdx) {
  // V3.4: retry로 인한 중복 방지. 직전 3분 내 retry 호출되었다면 신규 추가 X
  const recentRetry = state._lastRetryAt && (Date.now() - state._lastRetryAt < 3 * 60 * 1000);

  // 사용자 요청 2026-04-30: traits/values/patterns/case_formulation_update 처리 → extractChapterCaseAnalysis (endChapter 시점).
  // 매 메시지 추출 + isUITrigger 가드 + _prevUserIdx 부분 dead code로 제거. insight/proposal/decision_suggested 등 메시지 단위는 아래 유지.
  // === [나 탭 자동 정리] 신규 추가 후 완전 일치 strict dedupe 한 번 더 ===
  // similarText fuzzy로 못 잡힌 케이스 (다른 이름인데 description 완전 일치 등) 정리
  dedupeAllModelExactDuplicates();
  if (analysis.insight) {
    state.chatMessages[messageIdx].insightCandidate = analysis.insight;
  }
  if (analysis.proposal) {
    state.chatMessages[messageIdx].proposalData = analysis.proposal;
  }
  // Decision suggestion (V3.1)
  if (analysis.decision_suggested && analysis.decision_suggested.title) {
    const ds = analysis.decision_suggested;
    // Don't suggest if user already declined a similar one in last 30 messages
    const recentDeclines = state.chatMessages.slice(-30).filter(m => 
      m.decisionResponse === 'decline' && m.decisionSuggested
    );
    const alreadyDeclined = recentDeclines.find(m => 
      similarText(m.decisionSuggested.title || '', ds.title || '')
    );
    // Don't suggest if there's already an active decision with similar title
    const hasActive = (state.decisions || []).some(d =>
      !d._deleted && d.status === 'in_progress' && similarText(d.title || '', ds.title || '')
    );
    if (!alreadyDeclined && !hasActive) {
      state.chatMessages[messageIdx].decisionSuggested = {
        title: String(ds.title).trim().slice(0, 60),
        reason: ds.reason ? String(ds.reason).trim().slice(0, 200) : ''
      };
    }
  }
  // V4 사용자 명시 2026-05-23 ultrathink — extracted_tasks (vaultProposals) + extracted_schedule (todaySchedule auto-push) 분기 폐기.
  //   backend system-persona.ts 의 JSON schema 에서 두 키 제거 (2026-05-23) → AI 가 더 이상 출력 X.
  //   클라이언트 stale path 도 같이 제거. memoryVault 자체는 명시 path (decision-vault / topic-actions / drag-drop) 로 유지.
  // 사용자 요청 2026-04-28: 채팅에서 진주 추가 요청 추출.
  // 사용자 보고 2026-05-11: '진주에 넣어줘' 안 했는데 자동 추가되는 버그 (시뮬 토론 중에 LLM 이 잘못 감지).
  //   → 자동 push 폐기. extracted_pearls 있으면 직전 user message 의 pearlSuggestion=true 만 마킹.
  //   chip ("🔮 지금 이 기억 진주에 넣을래?") 노출 → 사용자 click → saveMsgAsPearl 흐름 (카테고리 / 사진 첨부 등).
  //   같은 날 dedupe 는 sendChat 의 regex path 와 공유 (pearlSaved / pearlSuggestion 이미 있으면 skip).
  if (analysis.extracted_pearls && Array.isArray(analysis.extracted_pearls) && analysis.extracted_pearls.length > 0) {
    let lastUserIdx = -1;
    for (let i = (messageIdx ?? state.chatMessages.length - 1) - 1; i >= 0; i--) {
      if (state.chatMessages[i] && state.chatMessages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx >= 0) {
      const _um = state.chatMessages[lastUserIdx];
      if (!_um.pearlSaved && !_um.pearlSuggestion) {
        _um.pearlSuggestion = true;
        if (typeof renderChat === 'function') { try { renderChat(); } catch {} }
      }
    }
  }
  saveState();
}

// V3.6: showVaultToast deprecated — vaultProposals 카드로 대체됨 (V3.7에서 제거)



// V4 (v8 묶음 4): 더 알아보기 빈도 cap (Plan 별) — 튜토리얼 무제한 + 쿨다운 30분
// 사용자 보고 2026-05-08: 옛 `billing.earlybird` boolean 필드는 backend 응답에 없음 (subscription_plan 만 있음).
//   → 얼리버드 사용자가 fallback 1 로 떨어져 첫 시도에 막혔음. plan 문자열 매핑으로 정정.
// V4 (사용자 명시 2026-05-13 ultrathink): tier 재매핑 정합성 정정 — Light(early_lifetime)=3 / Plus(light)=5 / Premium=10.
//   옛 옛 cap (light=3 / early_lifetime=4) 은 V4 label swap *이전* 의미 (옛 light=entry, 옛 early_lifetime=mid).
//   현 의미 (light=Plus mid, early_lifetime=Light entry) 와 어긋나 가격순 위반 (Plus 9,900 < Light 4,900 한도) 이었음.
//   early_light (legacy 환영) = Light 와 동등 3 — daily_cap_usd 도 같음 ($0.20).
function _getDailyDeeperCap() {
  if (window._onbTutorialMode) return Infinity;
  if (state.preferences && state.preferences.testerMode) return Infinity;
  // V4 (사용자 명시 2026-05-13): 어드민 overlay 활성 시 모든 cap/cooldown 제한 X.
  if (typeof _isAdmin === 'function' && _isAdmin()) return Infinity;
  const billing = window._billingCache;
  const plan = billing?.subscription_plan;
  if (plan === 'premium') return 10;
  if (plan === 'light') return 5;           // Plus
  if (plan === 'early_lifetime') return 3;  // Light
  if (plan === 'early_light') return 3;     // legacy 환영 (Light 와 동등)
  return 2;
}
// V4 (사용자 보고 2026-05-13 ultrathink): _dailyDeeperCount 가 state debounce/cloud race 로 손실되어
//   대화탭 재진입 / 앱 재시작 시 cooldown 잠금 풀리던 버그. localStorage 별도 key 로 backup — state 와 분리.
//   state.preferences.testerMode 면 cap=Infinity (위 _getDailyDeeperCap) 라 cooldown 자체 무시 — backup 영향 X.
const _DEEPER_LS_KEY = '_soragodong_dailyDeeper';
function _persistDeeperLocally() {
  try {
    if (typeof localStorage !== 'undefined' && state._dailyDeeperCount) {
      localStorage.setItem(_DEEPER_LS_KEY, JSON.stringify(state._dailyDeeperCount));
    }
  } catch {}
}
function _loadDeeperLocally(todayK) {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(_DEEPER_LS_KEY);
      if (!raw) return null;
      const b = JSON.parse(raw);
      if (b && b.date === todayK && typeof b.count === 'number') return b;
    }
  } catch {}
  return null;
}
function _getTodayDeeperCount() {
  const todayK = todayKey();
  if (!state._dailyDeeperCount || state._dailyDeeperCount.date !== todayK) {
    // localStorage backup 에서 복원 — 같은 todayK 면 사용 (cooldown 잔재 유지).
    const backup = _loadDeeperLocally(todayK);
    if (backup) {
      state._dailyDeeperCount = backup;
      return state._dailyDeeperCount.count;
    }
    state._dailyDeeperCount = { date: todayK, count: 0, lastAt: 0, capToastShown: false };
  }
  return state._dailyDeeperCount.count;
}
function _incrementDailyDeeperCount() {
  _getTodayDeeperCount();
  state._dailyDeeperCount.count += 1;
  state._dailyDeeperCount.lastAt = Date.now();
  saveState();
  _persistDeeperLocally();  // state debounce / cloud race 보호 — 동기 직저장.
}
function _checkDeeperEligibility() {
  const cap = _getDailyDeeperCap();
  if (cap === Infinity) return { ok: true, current: 0, cap: Infinity };
  const current = _getTodayDeeperCount();
  // V4 (사용자 명시 2026-05-13 ultrathink): Premium = cooldown 면제. 'Premium = 마음껏 깊게' brand 정합.
  //   cap 10회/일 은 비용 가드로 유지. cooldown 은 충동 클릭 보호 — paying customer 신뢰.
  const _plan = window._billingCache?.subscription_plan;
  const _cooldownExempt = (_plan === 'premium');
  if (!_cooldownExempt) {
    const lastAt = (state._dailyDeeperCount && state._dailyDeeperCount.lastAt) || 0;
    const cooldownLeft = (lastAt + 30 * 60 * 1000) - Date.now();
    if (cooldownLeft > 0 && current > 0) return { ok: false, current, cap, cooldown: cooldownLeft, reason: 'cooldown' };
  }
  return { ok: current < cap, current, cap, reason: current < cap ? null : 'cap' };
}
function _showDeeperCapToast() {
  const elig = _checkDeeperEligibility();
  if (elig.reason === 'cooldown') {
    const minLeft = Math.ceil((elig.cooldown || 0) / 60000);
    showToast(`⏳ 깊은 분석 쿨다운 — ${minLeft}분 후 다시`);
  } else {
    showToast(`🔒 오늘 깊은 분석 ${elig.cap}회 다 썼어 — 내일 또`);
  }
}

// V3: 짧은 답을 더 깊게 분석 요청
