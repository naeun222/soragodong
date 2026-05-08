// 사용자 명시 2026-04-30 ultrathink: chat_intake_entry step 안 button 핸들러.
// 모달 풀 흐름 종료 → 분석 결과를 대화창에 4단 형식 + proposal 메시지로 자동 표시
// → 튜토리얼은 click_strategy step 으로 점프 (send_diary / click_deeper / await_deeper_response 생략 — intake 가 동일 분석을 만들었으므로 중복 단계 회피).
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
    // 사용자 명시 2026-05-08: AI 가 직접 [상황]/[내가 본 것]/[이게 뭐냐면]/[이럴 땐 이렇게]/[오늘의 제안] raw text 로 응답.
    //   askDeeper 와 100% 동일 흐름 — fromDeeper: true 로 markdown 렌더 + ⭐ 오늘의 제안 카드.
    const fourStage = analysis.text;
    // proposal title 추출 — [오늘의 제안] 섹션 첫 줄.
    let proposalTitle = '오늘 한 걸음';
    const propMatch = fourStage.match(/\[오늘의 제안\]\s*([\s\S]+?)(?=\n\s*\[|$)/);
    if (propMatch) {
      const firstLine = propMatch[1].trim().split(/\n/)[0].trim();
      if (firstLine) proposalTitle = firstLine.slice(0, 40);
    }
    state.chatMessages.push({
      role: 'assistant',
      content: fourStage,
      fromDeeper: true,
      proposal: true,
      proposalData: { title: proposalTitle },
      timestamp: nowIso
    });
    // V4 (사용자 명시 2026-05-04 ultrathink): 4단 분석 직후 안내 메시지 inject — '내가 지금은 4단 분석 채워놨다' 톤 (옛 카피 톤)
    state.chatMessages.push({
      role: 'assistant',
      content: '처음이라 위 4단으로 친절히 정리해줬어 ✦\n평소엔 답 아래 "더 알고 싶어 ▾" 누르면 이렇게 깊게 풀어줄게.',
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
