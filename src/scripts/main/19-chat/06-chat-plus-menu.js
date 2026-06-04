function chatPlusAction(kind) {
  closeChatPlusMenu();
  // V4 (사용자 명시 2026-06-05): '더 알아보기'·'깨달음으로' = 메시지 버튼 → + 메뉴로 이동 (마지막 AI 응답 대상).
  if (kind === 'deeper') askDeeperFromPlus();
  else if (kind === 'insight') saveLastMsgAsInsight();
  else if (kind === 'memo') addMemoArchive();
  // 사용자 명시 2026-05-09 (spec 5-4): 숙고 진입 — reflectionContainer zone 폐기 보완.
  else if (kind === 'reflection') {
    if (typeof addReflectionQuestion === 'function') addReflectionQuestion();
  }
  // 'end'는 + 메뉴 밖 별도 ✓ 버튼으로 빼냄 (V4-fix)
}

// V4 (사용자 명시 2026-06-05): + 메뉴 '더 알아보기'/'깨달음으로' 대상 = 마지막 AI 응답.
function _lastAssistantChatMsgIdx() {
  const msgs = state.chatMessages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.role === 'assistant' && !m.typing && !m.error) return i;
  }
  return -1;
}
// 마지막 AI 응답을 4단 분석 (옛 메시지 '더 알아보기' 버튼과 동일 동작). cap/쿨다운은 askDeeper 가 처리.
function askDeeperFromPlus() {
  const idx = _lastAssistantChatMsgIdx();
  if (idx < 0) { if (typeof showToast === 'function') showToast('먼저 고동이랑 얘기해봐'); return; }
  const m = state.chatMessages[idx];
  if (m.fromDeeper || /\[내가 본 것\]|\[이게 뭐냐면\]/.test(m.content || '')) {
    if (typeof showToast === 'function') showToast('이미 깊게 분석한 답이야');
    return;
  }
  // 게스트 첫 사용 안내 (E2EE / AI 학습 0) — _showSimpleTutoModal key 가드로 1회만.
  if (typeof _showFirstDeeperTutoIfGuest === 'function') _showFirstDeeperTutoIfGuest();
  if (typeof askDeeper === 'function') askDeeper(idx);
}
// 마지막 AI 응답을 깨달음으로 저장 (옛 메시지 '✦ 깨달음으로' 버튼과 동일 동작).
function saveLastMsgAsInsight() {
  const idx = _lastAssistantChatMsgIdx();
  if (idx < 0) { if (typeof showToast === 'function') showToast('먼저 고동이랑 얘기해봐'); return; }
  const m = state.chatMessages[idx];
  if (m.saved) { if (typeof showToast === 'function') showToast('이미 깨달음에 저장했어'); return; }
  if (typeof saveMsgAsInsight === 'function') saveMsgAsInsight(idx);
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
  // 사용자 명시 2026-05-10 (큐 11 batch 12): 챕터 안 시뮬 / 일반 혼재 가능 — 메시지 단위 격리.
  //   isSimulation (boolean): 1+ 시뮬 메시지 (legacy 호환)
  //   hasSimulationMessages (boolean): 명시 (혼합 가능 시각 마커용 archive UI)
  //   pure 시뮬 챕터 = 모든 메시지가 isSimulationContext (드문 케이스, 시뮬 inject 후 즉시 마무리)
  const _hasSimMsg = validMsgs.some(m => m && m.isSimulationContext === true);
  const _allSimMsgs = _hasSimMsg && validMsgs.every(m => !m || m.isSimulationContext === true);
  const archiveItem = {
    id: 'arch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    date: dateKey,
    messageCount: validMsgs.length,
    messages: validMsgs.slice(),
    generatedAt: new Date().toISOString(),
    endedManually: !!opts.manual,
    // V4 (사용자 명시 2026-05-25 ultrathink): _pendingExtract → _pendingCleanup (재설계 통합 마커).
    //   cleanup batch (case+topic+diary) 가 처리 후 _cleanedAt stamp. 옛 마커 호환은 init 시 migration shim 이 처리.
    _pendingCleanup: true,
    ...(_hasSimMsg ? { hasSimulationMessages: true } : {}),
    ...(_allSimMsgs ? { isSimulation: true } : {})  // legacy 호환 — pure 시뮬 챕터만
  };
  // 사용자 명시 2026-05-08 ultrathink: 이어서한 후 변경된 케이스 (옛 messages + 새 messages) — 새 archive 에 _extractFromIndex 박기.
  // unchanged 분기 (line 39-52) 에서는 옛 archive 그대로 복귀 → 이 분기 도달 X. changed 분기에서만 boundary 박음.
  if (state._resumedFromArchive && state._resumedFromArchive.snapshot
      && Array.isArray(state._resumedFromArchive.snapshot.messages)) {
    const _origLen = state._resumedFromArchive.snapshot.messages.length;
    if (_origLen > 0 && _origLen < validMsgs.length) {
      archiveItem._extractFromIndex = _origLen;
    }
    // V4 (사용자 명시 2026-05-20 ultrathink): changed 분기 = 옛 archive id 의 별도 테이블 row 정리.
    //   옛 코드 path 에선 옛 archive 자체가 chatArchive 에서 빠지고 새 archive 로 대체 → 옛 chapter 의 chat_messages row 가 leak.
    const _oldId = state._resumedFromArchive.snapshot.id;
    if (_oldId && typeof _deleteChapterMessages === 'function') {
      _deleteChapterMessages(_oldId).catch(e => console.warn('[_archiveCurrentChapter] old chapter delete fail:', e));
    }
    delete state._resumedFromArchive;
  }
  state.chatArchive.unshift(archiveItem);
  state.chatMessages = [];
  // 단계 2: chapter 분리 시 _chatWindowStart reset (새 챕터 = 신규 시작).
  if (typeof _chatWindowStart !== 'undefined') _chatWindowStart = null;
  pruneOldChatArchive();

  // V4 (사용자 명시 2026-05-20 ultrathink): Step 3 — chat_messages 별도 테이블 dual-write.
  //   write amplification 방어 — main row JSONB 안 챕터 messages 통째 PATCH 회피.
  //   in-memory messages 그대로 유지 (read 경로 무변경 안전망). 성공 시 _hasMessages=true 박음 →
  //     Step 4 cloud save 가 _hasMessages 박힌 archive 의 messages 키 strip + read dual-mode (lazy load).
  //   실패 시 _hasMessages 안 박음 → 다음 cloud sync 가 main row 에 messages fallback 저장.
  // V4 fix (사용자 보고 2026-05-26 ultrathink): _chatMessagesSaveInFlight 마커 — backfill race 가드.
  //   옛 path: fire-and-forget save 진행 중 saveState → cloud main row 에 _hasMessages=false 박힘 →
  //   다른 device (또는 같은 device 의 다음 boot) backfill 이 같은 archive 잡아 두 번째 INSERT.
  //   본 fix: in-flight 동안 마커 박고 backfill target filter 에서 skip — 단일 device race 차단.
  //   multi-device race 는 _saveChapterMessages 의 pre-delete 멱등화 + DB UNIQUE (0034) 가 잡음.
  if (typeof _saveChapterMessages === 'function' && archiveItem.id) {
    archiveItem._chatMessagesSaveInFlight = true;
    (async () => {
      try {
        const _r = await _saveChapterMessages(archiveItem.id, validMsgs);
        if (_r && _r.ok) {
          archiveItem._hasMessages = true;
        } else {
          console.warn('[_archiveCurrentChapter] chat_messages save fail — keep inline:', _r && _r.reason);
        }
      } catch (e) { console.warn('[_archiveCurrentChapter] chat_messages save throw:', e); }
      finally {
        delete archiveItem._chatMessagesSaveInFlight;
        try { saveState(); } catch {}
      }
    })();
  }

  // V4 (사용자 명시 2026-05-13 ultrathink): RAG embed fire-and-forget. Plus/Premium 만 + useRag ON 일 때.
  //   백엔드 cloudflare AI 호출 = 우리 infra. fail 해도 chat 흐름 영향 X.
  if (typeof _ragIsEnabled === 'function' && _ragIsEnabled() && typeof _ragEmbedArchive === 'function') {
    setTimeout(() => { _ragEmbedArchive(archiveItem).catch(e => console.warn('[rag] embed archive fail:', e)); }, 0);
  }

  // V4 (사용자 명시 2026-05-25 ultrathink, 2 번째 묶음): topicCards 만 즉시 추출 부활.
  //   Step 5a (commit 6d26cff) 가 폐기한 것 = case_analysis (Opus, 비싼 분석) — 폐기 유지.
  //   topicCards (Haiku, ~$0.0001/챕터) 는 RAG inject 의 핵심 정보원 → 즉시 추출 필요.
  //   4AM batch 만 의존 시 직전 챕터 (몇 분~몇 시간 전) 의 topicCards 가 비어서 RAG fallback (첫 2 user msg)
  //   = "와 나 이제 끝났어" 같은 cryptic 짧은 msg 만 inject → AI "기억 못 함".
  //   가드: _canAI / 튜토리얼 / 테스터 / msg >= 6. 시뮬 메시지 격리 (메시지 단위) 유지.
  if (typeof _canAI === 'function' && _canAI()
      && !window._onbTutorialMode
      && !(state.preferences && state.preferences.testerMode)
      && archiveItem.messages.length >= 6) {
    setTimeout(async () => {
      try {
        const _before = (typeof _captureDerivedSnapshot === 'function') ? _captureDerivedSnapshot() : null;
        const _extractMsgs = _chapterExtractMessages(archiveItem);
        const _normalMsgs = _extractMsgs.filter(m => !m || !m.isSimulationContext);
        const _simMsgs = _extractMsgs.filter(m => m && m.isSimulationContext);
        if (typeof extractPreviousChapterTopics === 'function') {
          if (_normalMsgs.length >= 3) {
            try { await extractPreviousChapterTopics(_normalMsgs); }
            catch (e) { console.warn('[immediate-topic] normal fail:', e); }
          }
          if (_simMsgs.length >= 3) {
            const _beforeSim = (state.topicCards || []).length;
            try {
              await extractPreviousChapterTopics(_simMsgs);
              const _added = (state.topicCards || []).slice(_beforeSim);
              _added.forEach(card => { if (card) card.source = 'simulation'; });
            } catch (e) { console.warn('[immediate-topic] sim fail:', e); }
          }
        }
        if (_before && typeof _stampSourceArchiveId === 'function') {
          _stampSourceArchiveId(_before, archiveItem.id, archiveItem);
        }
        saveState();
        if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
      } catch (e) { console.warn('[immediate-topic] guard:', e); }
    }, 1500);
  }

  // V4 (사용자 명시 2026-05-25 ultrathink): 신규유저 즉시 case_analysis 분기 폐기.
  //   옛: 게스트/미구독자 매 챕터 마무리마다 즉시 inline (Sonnet) → 새 spec 폐기.
  //   새: 모든 사용자 동일 path — 챕터 마무리 → _pendingCleanup 마커 → 4AM cutoff 통과 후 cleanup batch (Opus).
  //   첫 case formulation 노출까지 최대 24시간 + polling. 사용자 spec 8 (OK 수용).
  //   chapterCompletedCount 만 유지 (다른 흐름 의존).
  if (typeof state.chapterCompletedCount !== 'number') state.chapterCompletedCount = 0;
  state.chapterCompletedCount += 1;
  saveState();
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
