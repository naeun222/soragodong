function chatPlusAction(kind) {
  closeChatPlusMenu();
  if (kind === 'diary') showDiaryTemplates();
  else if (kind === 'memo') addMemoArchive();
  // 'end'는 + 메뉴 밖 별도 ✓ 버튼으로 빼냄 (V4-fix)
}
document.addEventListener('click', function(e) {
  const menu = document.getElementById('chatPlusMenu');
  if (!menu || menu.hidden) return;
  const btn = document.getElementById('chatPlusBtn');
  if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeChatPlusMenu();
});

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
  const archiveItem = {
    id: 'arch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    date: dateKey,
    messageCount: validMsgs.length,
    messages: validMsgs.slice(),
    generatedAt: new Date().toISOString(),
    endedManually: !!opts.manual,
    _pendingExtract: true   // 4AM 일괄 처리 마커 (case_analysis + topic_extract 둘 다)
  };
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
    setTimeout(async () => {
      try {
        if (typeof extractChapterCaseAnalysis === 'function') {
          try { await extractChapterCaseAnalysis(archiveItem.messages); }
          catch (e) { console.warn('[new-user extract] case fail:', e); }
        }
        if (typeof extractPreviousChapterTopics === 'function') {
          try { await extractPreviousChapterTopics(archiveItem.messages); }
          catch (e) { console.warn('[new-user extract] topic fail:', e); }
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
