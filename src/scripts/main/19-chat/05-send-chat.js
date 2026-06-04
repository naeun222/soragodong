async function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  // V4 사용자 명시 2026-05-23 ultrathink (재재) — welcome 메시지를 AI 의 *진짜 첫 발화* 로 chatMessages 에 박음.
  //   chatMessages 비어있을 때 sendChat 시점에 welcome (모드별 텍스트) push → user msg push.
  //   AI 가 자기 첫 발화 인식 + 사용자 발화가 *답하는 형식* 으로 자연 흐름.
  //   (옛 _chatEmptyCheckinDismissedDayK 자리 폐기 — 대화탭 체크인 카드 자체 폐기 후 dead.)
  if ((state.chatMessages || []).length === 0 && typeof _chatWelcomeText === 'function') {
    // V4 fix (사용자 명시 2026-05-26 ultrathink) — 모드 미선택 시 daily 강제 X (null 그대로 → default '편하게 말해 보소').
    // 표정도 soft-smile 명시 (render 시 mode default fallback 차단).
    state.chatMessages.push({
      role: 'assistant',
      content: _chatWelcomeText(state.chatMode || null),
      expression: 'soft-smile',
      timestamp: new Date().toISOString(),
      _isWelcome: true
    });
  }

  // 사용자 명시 2026-05-01: 위기 신호 detect — 자살예방법 §15-6 + 제조물책임 안전 의무.
  // chat 본문 + '일기:' prefix 본문 모두 covered (text 전체 검사).
  if (typeof _detectCrisisSignal === 'function' && _detectCrisisSignal(text)) {
    if (typeof showCrisisCarousel === 'function') showCrisisCarousel('chat_keyword');
  }

  // 사용자 요청 2026-04-30: 일일 cap 체크 (비용 폭발 방지). 도달 시 토스트 + 차단.
  const capCheck = _checkDailyChatCap();
  if (!capCheck.ok) {
    showToast(`📋 오늘 대화 한도 (${capCheck.cap}개) 다 됐어 — 내일 4시 이후 풀려.\n설정에서 한도 조절 가능.`);
    return;
  }

  // 사용자 보고 2026-05-10: deeper cap 막힌 상태에서 일반 chat 으로 동일/비슷한 prompt 보내면 우회되던 버그 fix.
  // 명시적 4단 분석 요청 패턴 (라벨 둘 이상 명시 OR "4단" + "분석/깊게") 만 deeper 로 처리. 자연 도움 요청 ("어떡하지", "도와줘") 은 무관.
  const _looksLikeDeeperReq = (() => {
    const labelMatches = (text.match(/\[(내가 본 것|이게 뭐냐면|이럴 땐 이렇게|오늘의 제안)\]/g) || []).length;
    if (labelMatches >= 2) return true;
    if (/4\s*단(계|으로)?/.test(text) && /(분석|깊게|deeper)/i.test(text)) return true;
    return false;
  })();
  let _isDeeperFromText = false;
  if (_looksLikeDeeperReq && typeof _checkDeeperEligibility === 'function' &&
      !window._onbTutorialMode && !(state.preferences && state.preferences.testerMode)) {
    const elig = _checkDeeperEligibility();
    if (!elig.ok) {
      _showDeeperCapToast();
      return;
    }
    _isDeeperFromText = true;
  }

  // V4 (사용자 명시 2026-05-20 ultrathink): 4AM cutoff 단순 룰 — last msg < (직전 4AM cutoff - 5분) 이면 archive.
  //   옛 (_isDifferentDay && _gap >= 5h) 룰 폐기. 새 룰은 자정~새벽 단발 chat 도 다음 4AM batch 에 묶이게.
  //   mid-session 보호: last msg 가 cutoff 직전 5분 또는 cutoff 이후 = defer.
  //   archive date = first msg dayK (4AM 기준) — _archiveCurrentChapter 가 이미 그렇게 처리.
  const lastMsg = state.chatMessages[state.chatMessages.length - 1];
  const _nowMs = Date.now();
  const _lastMs = lastMsg && lastMsg.timestamp ? new Date(lastMsg.timestamp).getTime() : null;
  let isNewChapter = false;
  if (_lastMs != null && typeof _lastDaily4amCutoff === 'function') {
    const _cutoffMs = _lastDaily4amCutoff().getTime();
    isNewChapter = _lastMs < (_cutoffMs - 5 * 60 * 1000);
  }

  // V4 (사용자 보고 2026-05-04 V199): resumeArchiveChat 직후 첫 sendChat 은 archive 강제 skip (mid-session 보호).
  if (state._chatResumedAt && (_nowMs - state._chatResumedAt) < (5 * 60 * 60 * 1000)) {
    isNewChapter = false;
  }
  delete state._chatResumedAt;

  // archive 대상 → 직전 챕터 즉시 archive 이송 (chatMessages 비움)
  // (resume 후 무변경 + cutoff 통과 = _archiveCurrentChapter 가 원본 snapshot 으로 복귀하고 chatMessages 비움 → 새 메시지는 새 챕터 시작.)
  if (isNewChapter && state.chatMessages.length > 0) {
    // V4 (사용자 명시 2026-05-14): 새 챕터 시작 — 전략 resurface 챕터 1장 가드 reset.
    if (typeof _strategyClearChapterFlag === 'function') _strategyClearChapterFlag();
    _archiveCurrentChapter({ manual: false });
  }
  // V4 사용자 명시 2026-05-04: 새 메시지 push 직전 — resume snapshot 무효화.
  // (사용자가 실제로 새 내용 추가 → 더 이상 "변경 X 마무리" 케이스가 아님.)
  if (state._resumedFromArchive) delete state._resumedFromArchive;
  
  // V3.13: '일기:' 키워드 감지 → 오늘 entry에 원본 그대로 저장
  // 사용자 요청 2026-04-29: 같은 날 여러 번 적으면 덮어쓰기 X — 시각 표시와 함께 append
  const diaryMatch = text.match(/^일기[:：]\s*([\s\S]+)$/);
  let isDiary = false;
  let diaryAppended = false;
  if (diaryMatch) {
    const diaryContent = diaryMatch[1].trim();
    const todayK = todayKey();
    let entry = state.entries.find(e => e.date === todayK);
    if (!entry) {
      entry = { date: todayK, timestamp: new Date().toISOString() };
      state.entries.push(entry);
    }
    if (entry.diary && entry.diary.trim()) {
      // 두 번째 이상 — 시각 마커와 함께 append
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      entry.diary = entry.diary.trimEnd() + '\n\n— ' + timeStr + ' —\n' + diaryContent;
      diaryAppended = true;
    } else {
      entry.diary = diaryContent;
    }
    entry.dailySource = 'diary';
    // V4 fix (사용자 명시 2026-05-26 ultrathink — diary marker race): 채팅 일기 path 도 batch sentinel strip.
    //   17-mood-vitality-sleep.js 체크인 path 와 동일 정책 — diary 손수 작성 = batch aiSummary 재공급 권리 회복.
    delete entry._aiSummaryFailed;
    delete entry._aiSummaryFailReason;
    isDiary = true;
    // V4 (v8 묶음 16): 일기 첫 사용 placeholder dismiss
    if (typeof dismissPlaceholder === 'function') dismissPlaceholder('diary');
  }

  // 사용자 명시 2026-05-01 ultrathink: 단일 챕터 디자인 — chapterStart 마커 push X (5h+ 갭이면 _archiveCurrentChapter 가 직전 챕터 이송 + chatMessages 비움. 새 메시지 = 새 챕터의 자연 시작점, 마커 불필요).
  state.chatMessages.push({
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
    ...(isDiary ? { isDiary: true } : {}),
    ...(_isDeeperFromText ? { isDeeperRequest: true } : {})
  });
  // 사용자 요청 2026-04-30: 일일 cap 카운트 증가 (메시지 push 직후, AI call 전).
  _incrementDailyChatCount();
  // V4-1m: 진주 능동 제안 신호 감지 (행복/소중함). 같은 날 1회 가드.
  if (typeof detectPearlSignal === 'function' && detectPearlSignal(text)) {
    const todayK = todayKey();
    const alreadyToday = (state.chatMessages || []).some(m =>
      m.pearlSuggestion && m.timestamp && getDayKey(m.timestamp) === todayK
    );
    if (!alreadyToday) {
      state.chatMessages[state.chatMessages.length - 1].pearlSuggestion = true;
    }
  }
  // Hook 답변 처리 — 마지막 unanswered hook (홈에서 카드 탭으로 inject 된 것) 이 있으면
  //   이 user 메시지가 답변으로 간주, hook answered = true + msg.replyToHookId 박음.
  if (Array.isArray(state.askedHooks) && state.askedHooks.length > 0) {
    const unanswered = state.askedHooks
      .filter(h => h && !h.answered)
      .sort((a, b) => new Date(b.askedAt) - new Date(a.askedAt))[0];
    if (unanswered) {
      const hookInjected = (state.chatMessages || []).some(m =>
        m && m.isHookMessage && m.hookId === unanswered.id
      );
      if (hookInjected) {
        unanswered.answered = true;
        unanswered.answeredAt = new Date().toISOString();
        // V4 (사용자 명시 2026-05-17 ultrathink) 옵션 A: backend hook_push_queue 도 answered_at mark (iOS PWA pull 패턴 dedup).
        if (typeof _markHookAnsweredBackend === 'function') _markHookAnsweredBackend(unanswered.id);
        const lastMsg = state.chatMessages[state.chatMessages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          lastMsg.replyToHookId = unanswered.id;
        }
        // V4 (사용자 명시 2026-05-18 ultrathink): 첫 backend-pull hook 답변 직후 push 알림 설정 모달 trigger.
        //   이유: 사용자가 pull 패턴으로 hook 받음 = push 권한 없이도 hook 작동 = 가치 체험 후 자연 권유.
        //   옛 trigger (init 후 _hookInitCount >= 2) = 사용자 가치 인지 X 상태에 권한 요청 → 거부율 ↑.
        if (unanswered.source === 'backend-pull'
            && !state.preferences?._hookOnboardingShown
            && typeof maybeShowHookOnboarding === 'function') {
          setTimeout(() => { try { maybeShowHookOnboarding(); } catch (e) { console.warn('[hookOnb after-pull-reply]', e); } }, 1500);
        }
      }
    }
  }

  input.value = ''; input.style.height = 'auto';
  renderChat();
  saveState();
  if (isDiary) showToast(diaryAppended ? '📔 오늘 일기에 이어 저장됨' : '📔 오늘 일기로 저장됨');

  // 사용자 명시 2026-05-01 ultrathink: 5h+ 갭 시점 직접 토픽 추출 폐기 — _archiveCurrentChapter 이송 후 4AM 흐름이 일괄 처리 (또는 신규유저 즉시 trigger).

  await generateAIResponse();

  // 사용자 보고 2026-05-10: text-trigger deeper cap 차감 — generate 후 increment + cap toast.
  if (_isDeeperFromText && !window._onbTutorialMode && !(state.preferences && state.preferences.testerMode)) {
    if (typeof _incrementDailyDeeperCount === 'function') _incrementDailyDeeperCount();
    const after = (typeof _checkDeeperEligibility === 'function') ? _checkDeeperEligibility() : { ok: true };
    if (!after.ok && after.reason === 'cap' && state._dailyDeeperCount && !state._dailyDeeperCount.capToastShown) {
      state._dailyDeeperCount.capToastShown = true;
      saveState();
      showToast(`🔒 오늘 깊은 분석 ${after.cap}회 다 썼어 — 내일 또`);
    }
  }

  // V4 사용자 명시 2026-05-01 ultrathink: 옛 chatPairsCount 즉시 추출 폐기.
  // 신규유저 빠른 추출 = _archiveCurrentChapter 안 chapterCompletedCount<3 분기로 이동.
  // 즉 챕터 마무리 (✓ 또는 5h+ 자동) 시점에 첫 3챕터만 즉시 API 호출.

  // 사용자 명시 2026-05-08 ultrathink: 옛 게스트 3턴째 1회 inline 분기 폐기.
  //   _maybeAutoForceAnalyzeFreeTier (매 3턴마다 extractChapterCaseAnalysis Opus) 가 미구독자/게스트 둘 다 처리.
  //   중복 + Sonnet/Opus 동시 호출 = 비용 낭비. 단일 흐름으로 통합.
}

// V3.13.x: + 메뉴 토글
function toggleChatPlusMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('chatPlusMenu');
  const btn = document.getElementById('chatPlusBtn');
  if (!menu || !btn) return;
  if (menu.hidden) {
    menu.hidden = false;
    btn.classList.add('open');
    // V4 (v8 묶음 16): + 메뉴 첫 열기 placeholder dismiss
    if (typeof dismissPlaceholder === 'function') dismissPlaceholder('plus');
  } else {
    menu.hidden = true;
    btn.classList.remove('open');
  }
}
function closeChatPlusMenu() {
  const menu = document.getElementById('chatPlusMenu');
  const btn = document.getElementById('chatPlusBtn');
  if (menu && !menu.hidden) menu.hidden = true;
  if (btn) btn.classList.remove('open');
}
