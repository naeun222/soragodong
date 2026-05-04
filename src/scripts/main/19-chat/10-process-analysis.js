async function processAnalysis(analysis, messageIdx) {
  // V3.4: retry로 인한 중복 방지. 직전 3분 내 retry 호출되었다면 신규 추가 X
  const recentRetry = state._lastRetryAt && (Date.now() - state._lastRetryAt < 3 * 60 * 1000);

  // 사용자 요청 2026-04-30: traits/values/patterns/case_formulation_update 처리 → extractChapterCaseAnalysis (endChapter 시점).
  // 매 메시지 추출 + isUITrigger 가드 + _prevUserIdx 부분 dead code로 제거. insight/proposal/decision_suggested/extracted_tasks 등 메시지 단위는 아래 유지.
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
      d.status === 'in_progress' && similarText(d.title || '', ds.title || '')
    );
    if (!alreadyDeclined && !hasActive) {
      state.chatMessages[messageIdx].decisionSuggested = {
        title: String(ds.title).trim().slice(0, 60),
        reason: ds.reason ? String(ds.reason).trim().slice(0, 200) : ''
      };
    }
  }
  // V3: Memory Vault auto-extraction → 확인 step (V3.6)
  // 변경: 즉시 추가 X. 사용자에게 카드로 물어보고 "응" 누를 때만 저장.
  if (analysis.extracted_tasks && Array.isArray(analysis.extracted_tasks)) {
    const proposals = [];
    analysis.extracted_tasks.forEach(taskText => {
      if (!taskText || typeof taskText !== 'string') return;
      const cleanText = taskText.trim().slice(0, 200);
      if (!cleanText) return;
      // 이미 vault에 있는지 (최근 20개) — fuzzy로 먼저 차단
      const existsInVault = (state.memoryVault || []).slice(-20).find(v => 
        v.content && similarText(v.content, cleanText)
      );
      if (existsInVault) return;
      // 같은 메시지에 같은 제안 중복도 차단
      if (proposals.some(p => exactSameText(p.content, cleanText))) return;
      proposals.push({
        proposalId: 'vp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        content: cleanText,
        responded: false,
        accepted: null
      });
    });
    if (proposals.length > 0) {
      // 메시지에 pending proposal로 저장 (renderChat에서 카드로 표시)
      state.chatMessages[messageIdx].vaultProposals = proposals;
    }
  }
  // 사용자 요청 2026-04-28: 채팅에서 일정 추출 → 자동 todaySchedule 등록
  if (analysis.extracted_schedule && Array.isArray(analysis.extracted_schedule)) {
    if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
    const todayK = todayKey();
    const colors = ['#d4a76a','#8fc88f','#7ec8e3','#b39ddb','#ff8da1','#ffb86b','#5fcfba'];
    let added = 0;
    analysis.extracted_schedule.forEach((it, i) => {
      if (!it || !it.title || !it.start || !it.end) return;
      if (!/^\d{1,2}:\d{2}$/.test(it.start) || !/^\d{1,2}:\d{2}$/.test(it.end)) return;
      // 같은 시간대 중복 방지
      const dup = state.todaySchedule.some(s =>
        s.date === todayK && s.title === String(it.title).trim().slice(0,40) && s.start === it.start
      );
      if (dup) return;
      state.todaySchedule.push({
        id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        title: String(it.title).trim().slice(0,40),
        start: it.start,
        end: it.end,
        date: todayK,
        source: 'chat',
        taskId: null,
        color: colors[(state.todaySchedule.length + i) % colors.length]
      });
      added++;
    });
    if (added > 0) {
      showToast(`📅 ${added}개 일정 추가됨`);
      // 실행 탭 (timetable 포함) 즉시 갱신
      if (typeof renderExecute === 'function') { try { renderExecute(); } catch {} }
      // V4 (v8 묶음 16): 일정 자동 추가 placeholder dismiss
      if (typeof dismissPlaceholder === 'function') dismissPlaceholder('schedule');
    }
  }
  // 사용자 요청 2026-04-28: 채팅에서 진주 추가 요청 추출 → state.pearls에 자동 등록
  if (analysis.extracted_pearls && Array.isArray(analysis.extracted_pearls)) {
    if (!Array.isArray(state.pearls)) state.pearls = [];
    const validCats = ['음악', '음식', '장소', '순간', '사람', '기타'];
    let addedPearls = 0;
    analysis.extracted_pearls.forEach(p => {
      if (!p || !p.content || typeof p.content !== 'string') return;
      const content = p.content.trim().slice(0, 200);
      if (!content) return;
      const category = validCats.includes(p.category) ? p.category : '기타';
      // 같은 content 중복 방지 (대소문자 무시)
      const dup = state.pearls.some(x => x && x.content &&
        x.content.toLowerCase().trim() === content.toLowerCase()
      );
      if (dup) return;
      state.pearls.push({
        id: 'pearl_chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        category,
        content,
        note: p.note ? String(p.note).trim().slice(0, 200) : null,
        createdAt: new Date().toISOString(),
        type: 'pearl',
        source: 'chat'
      });
      addedPearls++;
    });
    if (addedPearls > 0) {
      showToast(`🔮 ${addedPearls}개 진주 추가됨`);
      // 진주 화면 / 도서관 hero 즉시 갱신
      if (typeof renderLensPearls === 'function') { try { renderLensPearls(); } catch {} }
      if (typeof renderLibraryHero === 'function') { try { renderLibraryHero(); } catch {} }
    }
  }
  saveState();
}

// V3.6: showVaultToast deprecated — vaultProposals 카드로 대체됨 (V3.7에서 제거)



// V4 (v8 묶음 4): 더 알아보기 빈도 cap (Plan 별) — Free 1 / Light 2 / Earlybird 3 / Premium 8 / 튜토리얼 무제한 + 쿨다운 30분
function _getDailyDeeperCap() {
  if (window._onbTutorialMode) return Infinity;
  if (state.preferences && state.preferences.testerMode) return Infinity;
  const billing = window._billingCache;
  const plan = billing?.subscription_plan;
  if (plan === 'premium') return 8;
  if (plan === 'light') return 2;
  if (billing?.earlybird) return 3;
  return 1;
}
function _getTodayDeeperCount() {
  const todayK = todayKey();
  if (!state._dailyDeeperCount || state._dailyDeeperCount.date !== todayK) {
    state._dailyDeeperCount = { date: todayK, count: 0, lastAt: 0, capToastShown: false };
  }
  return state._dailyDeeperCount.count;
}
function _incrementDailyDeeperCount() {
  _getTodayDeeperCount();
  state._dailyDeeperCount.count += 1;
  state._dailyDeeperCount.lastAt = Date.now();
  saveState();
}
function _checkDeeperEligibility() {
  const cap = _getDailyDeeperCap();
  if (cap === Infinity) return { ok: true, current: 0, cap: Infinity };
  const current = _getTodayDeeperCount();
  const lastAt = (state._dailyDeeperCount && state._dailyDeeperCount.lastAt) || 0;
  const cooldownLeft = (lastAt + 30 * 60 * 1000) - Date.now();
  if (cooldownLeft > 0 && current > 0) return { ok: false, current, cap, cooldown: cooldownLeft, reason: 'cooldown' };
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
