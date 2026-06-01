// 사용자 명시 2026-04-30 ultrathink: chat_intake_entry step 안 button 핸들러.
// 모달 풀 흐름 종료 → 분석 결과(가벼운 비트)를 대화창에 fromBeat 메시지로 자동 표시 (사용자 명시 2026-06-02).
// 주의: 현재 dead path — ONBOARDING_STEPS=[] (옛 풀 튜토리얼 폐기). 살아있는 첫 관찰 = _resumePendingIntake → runIntakeFlow (모달만).
window._startIntakeFromTutorial = async function() {
  if (document.getElementById('intakeModalOverlay')) return;
  // 사용자 명시 2026-05-01 (agent audit): _canAI 가드 — session 없거나 401 시 사용자 stranded 차단.
  if (typeof _canAI === 'function' && !_canAI()) {
    if (typeof showToast === 'function') showToast('🔑 로그인 후 다시 시도해줘');
    if (typeof onbNext === 'function') onbNext();
    return;
  }
  try {
    await runIntakeFlow();
    if (state.intakeWorry && state.intakeWorry.length > 0) {
      state.preferences = state.preferences || {};
      state.preferences._firstTouchDone = true;
    }
    saveState();
  } catch (e) { console.warn('[intake] tutorial 흐름 실패', e); }

  // intake 분석 stash → 대화창으로 전달
  const analysis = window._lastIntakeAnalysis;
  const worries = Array.isArray(window._lastIntakeWorries) ? window._lastIntakeWorries : [];
  delete window._lastIntakeAnalysis;
  delete window._lastIntakeWorries;

  if (analysis && analysis.text) {
    state.chatMessages = state.chatMessages || [];
    const nowIso = new Date().toISOString();
    if (worries.length > 0) {
      state.chatMessages.push({
        role: 'user',
        content: worries.join('\n\n'),
        timestamp: nowIso
      });
    }
    // 사용자 명시 2026-06-02: 첫 관찰 = 가벼운 비트 (fromBeat). 옛 4단/proposal/미션 온램프 제거 — 비트 규칙 (조언/제안 X).
    //   대화탭 '이거 짚어줘' 와 동일 시각 — 깨달음 핀 + 가지(왜/이어보기/그럼뭐하지) 칩.
    const beatText = analysis.text;
    state.chatMessages.push({
      role: 'assistant',
      content: beatText,
      fromBeat: true,
      relatedCandidates: (typeof _findRelatedInsights === 'function') ? _findRelatedInsights(worries.join(' '), 2) : [],
      timestamp: nowIso
    });
    // 첫 관찰 직후 안내 — 비트 + 새 칩 이름.
    state.chatMessages.push({
      role: 'assistant',
      content: '처음이라 내가 먼저 한 번 짚어봤어 ✦\n평소엔 답 아래 "이거 짚어줘" 누르면 이렇게 콕 짚어줄게.',
      timestamp: nowIso
    });
    saveState();
    if (typeof renderChat === 'function') renderChat();
    setTimeout(() => { if (typeof scrollChatToBottom === 'function') scrollChatToBottom(true); }, 80);

    // V4 (v8 묶음 12): chapter_close_intro 점프 — 사용자 ✓ 마무리 클릭 안내 → endChapter (묶음 5 archive 핀 영구) → core1_finish
    const targetIdx = Array.isArray(ONBOARDING_STEPS)
      ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'chapter_close_intro')
      : -1;
    if (targetIdx >= 0 && typeof _onbStep !== 'undefined') {
      _onbStep = targetIdx;
      if (typeof onbRenderStep === 'function') {
        setTimeout(() => onbRenderStep(), 200);
      }
      return;
    }
  }

  // fallback — 분석 결과 없거나 jump 실패: 기존 동작 (다음 step)
  if (typeof onbNext === 'function') onbNext();
};

function _intakeSpeechSupported() {
  return ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
}

function _showIntakeModal() {
  if (document.getElementById('intakeModalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'intakeModalOverlay';
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10002';
  // V4 (v8 묶음 12): 강제 모드 — 오버레이 클릭 X (ESC 차단은 keydown listener)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) e.stopPropagation(); });
  overlay.innerHTML = `<div class="intake-modal" onclick="event.stopPropagation()" id="intakeModalContent"></div>`;
  document.body.appendChild(overlay);
  // V4 (v8 묶음 12): ESC 차단 — _onIntakeKeydown 등록
  document.addEventListener('keydown', _onIntakeKeydown, true);
  _renderIntakeStep();
}
