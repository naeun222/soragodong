function chatPlusAction(kind) {
  closeChatPlusMenu();
  if (kind === 'diary') showDiaryTemplates();
  else if (kind === 'memo') addMemoArchive();
  // 사용자 명시 2026-05-09 (spec 5-4): 숙고 진입 — reflectionContainer zone 폐기 보완.
  else if (kind === 'reflection') {
    if (typeof addReflectionQuestion === 'function') addReflectionQuestion();
  }
  // 'end'는 + 메뉴 밖 별도 ✓ 버튼으로 빼냄 (V4-fix)
}
document.addEventListener('click', function(e) {
  const menu = document.getElementById('chatPlusMenu');
  if (!menu || menu.hidden) return;
  const btn = document.getElementById('chatPlusBtn');
  if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeChatPlusMenu();
});

// 사용자 명시 2026-05-08 ultrathink: 이어서한 archive 의 옛 부분 = 이미 분석됨 → 새 archive 에 boundary 박아 옛 부분 분석 input 에서 제외 (중복 분석 + token 낭비 차단).
// archiveItem._extractFromIndex 가 있으면 그 인덱스 이후 messages 만 chapter case_analysis / topic 추출 input.
function _chapterExtractMessages(archiveItem) {
  if (!archiveItem || !Array.isArray(archiveItem.messages)) return [];
  const fromIdx = archiveItem._extractFromIndex || 0;
  return fromIdx > 0 ? archiveItem.messages.slice(fromIdx) : archiveItem.messages;
}

// V4 사용자 명시 2026-05-01 ultrathink: 챕터 분리 = archive 이송 (단일 흐름).
// chatMessages 의 현재 챕터를 chatArchive 로 이송 + chatMessages 비움.
// archive item: date = firstMsg day-key (cross-cutoff 챕터 시작 날), 별도 entry (merge X), _pendingExtract: true.
// 신규유저 (chapterCompletedCount < 3) 만 즉시 API 호출 (case + topic). 그 외 = 4AM 일괄.
function _archiveCurrentChapter(opts) {
  opts = opts || {};
  const validMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);

  // V4 사용자 명시 2026-05-04: 이어서 후 변경 X 마무리/보관 = 원본 archive 그대로 복귀.
  // 4AM cutoff 재처리 X / 새 _pendingExtract X / chapterCompletedCount 증가 X — 불필요 API 차단.
  // 판정: _resumedFromArchive snapshot 의 messages 와 현재 validMsgs 의 (role + content) 가 모두 일치.
  if (state._resumedFromArchive && state._resumedFromArchive.snapshot
      && Array.isArray(state._resumedFromArchive.snapshot.messages)) {
    const snap = state._resumedFromArchive.snapshot;
    const snapMsgs = snap.messages;
    let unchanged = snapMsgs.length === validMsgs.length;
    if (unchanged) {
      for (let i = 0; i < snapMsgs.length; i++) {
        if ((snapMsgs[i].role || '') !== (validMsgs[i].role || '')
            || (snapMsgs[i].content || '') !== (validMsgs[i].content || '')) {
          unchanged = false; break;
        }
      }
    }
    if (unchanged) {
      if (!Array.isArray(state.chatArchive)) state.chatArchive = [];
      const insertAt = (typeof state._resumedFromArchive.originalIndex === 'number'
        && state._resumedFromArchive.originalIndex >= 0
        && state._resumedFromArchive.originalIndex <= state.chatArchive.length)
        ? state._resumedFromArchive.originalIndex : 0;
      state.chatArchive.splice(insertAt, 0, snap);
      state.chatMessages = [];
      if (typeof _chatWindowStart !== 'undefined') _chatWindowStart = null;
      delete state._resumedFromArchive;
      pruneOldChatArchive();
      saveState();
      return snap;
    }
  }

  const minLen = (typeof opts.minMessages === 'number') ? opts.minMessages : 3;
  if (validMsgs.length < minLen) return null;
  if (!Array.isArray(state.chatArchive)) state.chatArchive = [];

  const firstMsgTs = validMsgs[0] && validMsgs[0].timestamp;
  const dateKey = firstMsgTs ? getDayKey(firstMsgTs) : todayKey();

  // V4 (사용자 명시 2026-05-04 V191): summary 필드 제거 — 히스토리 API 줄거리 요약 기능 폐기.
  // 표시 / system prompt 주입 / review 입력 모두 raw messages + topicCards 기반으로 통일.
  // 사용자 명시 2026-05-10 (큐 11): 챕터 안 isSimulationContext: true 메시지 1+ 면 isSimulation 챕터로 마킹.
  //   추출 path 격리 — cf 5차원 X, traits/values/patterns 만 (extractedFrom='simulation', confidence ≥ 0.7).
  const _isSimChapter = validMsgs.some(m => m && m.isSimulationContext === true);
  const archiveItem = {
    id: 'arch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    date: dateKey,
    messageCount: validMsgs.length,
    messages: validMsgs.slice(),
    generatedAt: new Date().toISOString(),
    endedManually: !!opts.manual,
    _pendingExtract: true,   // 4AM 일괄 처리 마커 (case_analysis + topic_extract 둘 다)
    ...(_isSimChapter ? { isSimulation: true } : {})
  };
  // 사용자 명시 2026-05-08 ultrathink: 이어서한 후 변경된 케이스 (옛 messages + 새 messages) — 새 archive 에 _extractFromIndex 박기.
  // unchanged 분기 (line 39-52) 에서는 옛 archive 그대로 복귀 → 이 분기 도달 X. changed 분기에서만 boundary 박음.
  if (state._resumedFromArchive && state._resumedFromArchive.snapshot
      && Array.isArray(state._resumedFromArchive.snapshot.messages)) {
    const _origLen = state._resumedFromArchive.snapshot.messages.length;
    if (_origLen > 0 && _origLen < validMsgs.length) {
      archiveItem._extractFromIndex = _origLen;
    }
    delete state._resumedFromArchive;
  }
  state.chatArchive.unshift(archiveItem);
  state.chatMessages = [];
  // 단계 2: chapter 분리 시 _chatWindowStart reset (새 챕터 = 신규 시작).
  if (typeof _chatWindowStart !== 'undefined') _chatWindowStart = null;
  pruneOldChatArchive();

  // 신규유저 빠른 추출 — 첫 3 챕터만 즉시 API 호출 (case + topic 둘 다)
  if (typeof state.chapterCompletedCount !== 'number') state.chapterCompletedCount = 0;
  state.chapterCompletedCount += 1;
  saveState();

  if (state.chapterCompletedCount <= 3 && typeof _canAI === 'function' && _canAI()
      && !window._onbTutorialMode
      && !(state.preferences && state.preferences.testerMode)
      && archiveItem.messages.length >= 6) {
    // V4 (사용자 명시 2026-05-06 ultrathink): 비구독자는 도서관 챕터 토픽 자동 정리 X.
    // 도서관은 ✓ (manual) 누를 때만 chapter topic 생성. case_analysis (나 탭 fill) 는 그대로.
    const _bill = window._billingCache;
    const _isPremium = !!(_bill && _bill.subscription_plan === 'premium' && _bill.subscription_active);
    const _allowChapterTopic = !!opts.manual || _isPremium;
    setTimeout(async () => {
      try {
        // V4 사용자 명시 2026-05-04: 추출 직전/직후 snapshot diff → 새 derived 항목에
        // sourceArchiveId 박음 (cascade soft delete 추적용).
        const _before = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
        // 사용자 명시 2026-05-08 ultrathink: _extractFromIndex 적용 — 옛 부분 input 제외.
        const _extractMsgs = _chapterExtractMessages(archiveItem);
        if (typeof extractChapterCaseAnalysis === 'function' && _extractMsgs.length >= 3) {
          try { await extractChapterCaseAnalysis(_extractMsgs); }
          catch (e) { console.warn('[new-user extract] case fail:', e); }
        }
        if (_allowChapterTopic && typeof extractPreviousChapterTopics === 'function' && _extractMsgs.length >= 3) {
          try { await extractPreviousChapterTopics(_extractMsgs); }
          catch (e) { console.warn('[new-user extract] topic fail:', e); }
        }
        if (_before && typeof _stampSourceArchiveId === 'function') {
          _stampSourceArchiveId(_before, archiveItem.id, archiveItem);
        }
        delete archiveItem._pendingExtract;
        delete archiveItem._pendingCaseAnalysis;  // legacy 호환
        saveState();
        if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
      } catch (e) { console.warn('[new-user extract] guard:', e); }
    }, 1500);
  }
  return archiveItem;
}

// V4 (v8 묶음 5): 튜토리얼 step ID 체크 helper — 현재 _onbStep 이 주어진 stepId 인지
function _isOnboardingStep(stepId) {
  if (!window._onbTutorialMode) return false;
  if (typeof _onbStep !== 'number' || !Array.isArray(ONBOARDING_STEPS)) return false;
  const step = ONBOARDING_STEPS[_onbStep];
  return !!(step && step.id === stepId);
}

// 사용자 명시 2026-05-01 ultrathink: ✓ 마무리 hint 배너 dismiss.
function dismissChatEndHint() {
  state._chatEndHintDismissed = true;
  saveState();
  const _b = document.getElementById('chatEndHintBanner');
  if (_b) _b.style.display = 'none';
}

// V3.13.x: 대화 마무리 — 사용자가 능동적으로 챕터 끊기.
// V4 사용자 명시 2026-05-01 ultrathink: _archiveCurrentChapter 단일 흐름으로 통일.
