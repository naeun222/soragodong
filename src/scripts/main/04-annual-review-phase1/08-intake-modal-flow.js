// V4 (v8 묶음 12): intake 모달 ESC / Escape 차단 — 사용자 명시 선택만 (X / 취소 X)
function _onIntakeKeydown(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault();
    e.stopPropagation();
  }
}

function _closeIntakeModal() {
  if (_intakeState && _intakeState.recognition) {
    try { _intakeState.recognition.stop(); } catch {}
  }
  // V4 (v8 묶음 12): ESC keydown listener 해제
  try { document.removeEventListener('keydown', _onIntakeKeydown, true); } catch {}
  const overlay = document.getElementById('intakeModalOverlay');
  if (overlay) overlay.remove();
  const resolveFn = _intakeState && _intakeState.resolve;
  _intakeState = null;
  if (typeof resolveFn === 'function') resolveFn();
}

function _renderIntakeStep() {
  const c = document.getElementById('intakeModalContent');
  if (!c || !_intakeState) return;
  const dots = _intakeProgressDots(_intakeState.step);
  if (_intakeState.step === 1)      c.innerHTML = dots + _intakeStep1Html();
  else if (_intakeState.step === 2) c.innerHTML = dots + _intakeStep2Html();
  else if (_intakeState.step === 3) c.innerHTML = dots + _intakeStep3Html();
  else if (_intakeState.step === 4) c.innerHTML = dots + _intakeStep4Html();
  else if (_intakeState.step === 5) c.innerHTML = dots + _intakeStep5Html();
  else if (_intakeState.step === 6) c.innerHTML = dots + _intakeStep6Html();
  // textarea autofocus (Step1, 3)
  setTimeout(() => {
    const ta = document.querySelector('#intakeModalContent textarea');
    if (ta) ta.focus();
  }, 100);
}

function _intakeProgressDots(step) {
  const total = 6;
  let html = '<div class="intake-progress">';
  for (let i = 1; i <= total; i++) html += `<span class="intake-dot ${i <= step ? 'on' : ''}"></span>`;
  html += '</div>';
  return html;
}

function _intakeStep1Html() {
  const ex = _intakeState.exampleStep1;
  // 사용자 명시 2026-04-30 ultrathink: 미지원 브라우저도 mic button 표시 — 누름 시 토스트 안내 (예시·텍스트 권유).
  const micHtml = `<button id="intakeMicBtn1" class="intake-mic-btn" onclick="_intakeMicToggle(1)" aria-label="음성"><span id="intakeMicIcon1"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;display:block;"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg></span></button>`;
  return `
    <div class="intake-mic-recommend">
      <span class="intake-mic-recommend-emoji">🎤</span>
      <span><b>말로 풀어봐 — 적극 추천!</b><br><span class="intake-mic-recommend-sub">손보다 빠르고 자연스러워</span></span>
    </div>
    <div class="intake-prompt">머릿속에서 안 떠나는 거. 한 줄도 OK.</div>
    <textarea id="intakeInput1" class="intake-textarea" rows="3" placeholder="한 줄도 OK. 마음 가는 대로."></textarea>
    <div id="intakeMicStatus1" class="intake-mic-status" style="display:none;"></div>
    <div class="intake-actions">
      ${micHtml}
      <button id="intakeSendBtn1" class="intake-send-btn" onclick="_intakeStep1Send()">✦ 보내기</button>
    </div>
    <div class="intake-example">
      <div class="intake-example-label">↓ 예시 — <b>클릭하면 입력창에 채워져</b></div>
      <div class="intake-example-chip" onclick="_intakeStep1FillExample()">${ex.icon} "${escapeHtml(ex.short)}"</div>
    </div>
  `;
}

function _intakeStep1FillExample() {
  const ta = document.getElementById('intakeInput1');
  if (ta && _intakeState) ta.value = _intakeState.exampleStep1.short;
}

async function _intakeStep1Send() {
  const text = (document.getElementById('intakeInput1')?.value || '').trim();
  if (!text) { showToast('한 줄이라도 적어줘 ✦'); return; }
  state.intakeWorry.push({ role: 'user', content: text, ts: new Date().toISOString(), kind: 'first' });
  saveState();
  // 짧음 detect → Step2 (deepening). 장문이면 Step3 skip 후 Step4 직진.
  if (_intakeShouldDeepen(text)) {
    _intakeState.step = 2;
    _renderIntakeStep();
    try {
      const ask = await _intakeDeepenAsk(text);
      state.intakeWorry.push({ role: 'assistant', content: ask, ts: new Date().toISOString(), kind: 'deepen_q' });
      saveState();
      const askDiv = document.getElementById('intakeAIAsk');
      if (askDiv) askDiv.innerHTML = `<b>🐚</b> ${escapeHtml(ask)}`;
    } catch (e) {
      console.warn('[intake] deepen ask 실패 — fallback wording', e);
      const askDiv = document.getElementById('intakeAIAsk');
      if (askDiv) askDiv.innerHTML = `<b>🐚</b> 어떤 상황이었고 어떻게 됐는지 좀 더 풀어줄래? 상황 → 무슨 마음 → 어떻게 됐는지, 자유롭게.`;
      state.intakeWorry.push({ role: 'assistant', content: '어떤 상황이었고 어떻게 됐는지 좀 더 풀어줄래?', ts: new Date().toISOString(), kind: 'deepen_q' });
      saveState();
    }
    // AI 동적 long example 미리 백그라운드 fetch (Step3 진입 시 즉시 표시)
    _intakeGenLongExample(text)
      .then(longText => { if (_intakeState) _intakeState.aiLong = longText; })
      .catch(e => { console.warn('[intake] long example 실패 — INTAKE_EXAMPLES 페어 사용', e); });
  } else {
    // 한 번에 장문 발화 → Step3 skip → Step4 (paraphrase + 더 알고 싶어) 직진
    _intakeState.step = 4;
    _renderIntakeStep();
  }
}

function _intakeStep2Html() {
  return `
    <div class="intake-ai-msg" id="intakeAIAsk"><b>🐚</b> <span class="intake-loading">잠깐...</span></div>
    <div class="intake-prompt-secondary">한 번 더 풀어줘.<br><span class="small">고민을 구체적으로 다 털어놔도 OK. 상황 → 무슨 마음 → 어떻게 됐는지.</span></div>
    <div class="intake-actions">
      <button class="intake-send-btn" onclick="_intakeStep2Next()">✦ 다음</button>
    </div>
  `;
}

async function _intakeStep2Next() {
  _intakeState.step = 3;
  _renderIntakeStep();
  // 사용자 명시 2026-04-30: AI 동적 long example 보장 — 백그라운드 fetch 미완료 시 다시 시도 + await
  if (!_intakeState.aiLong) {
    try {
      const userFirst = state.intakeWorry.find(m => m.role === 'user');
      if (userFirst && userFirst.content) {
        const longText = await _intakeGenLongExample(userFirst.content);
        if (_intakeState && longText) {
          _intakeState.aiLong = longText;
          _renderIntakeStep();
        }
      }
    } catch (e) {
      console.warn('[intake] step3 long example retry failed:', e);
    }
  }
}

function _intakeStep3Html() {
  const userFirst = state.intakeWorry.find(m => m.role === 'user');
  const userText = userFirst ? userFirst.content : '';
  // AI long 우선 / 없으면 페어 long fallback
  const ex = _intakeState.exampleStep1;
  const fallbackLong = ex.long;
  const longText = _intakeState.aiLong || fallbackLong;
  const micHtml = `<button id="intakeMicBtn3" class="intake-mic-btn" onclick="_intakeMicToggle(3)" aria-label="음성"><span id="intakeMicIcon3"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;display:block;"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg></span></button>`;
  return `
    <div class="intake-ai-msg-small"><b>🐚</b> ${escapeHtml(userText.slice(0, 50))}${userText.length > 50 ? '...' : ''} — 한 번 더 풀어줘.</div>
    <textarea id="intakeInput3" class="intake-textarea" rows="5" placeholder="3줄 이상 풀어줘.&#10;상황 → 무슨 마음 → 어떻게 됐는지."></textarea>
    <div id="intakeMicStatus3" class="intake-mic-status" style="display:none;"></div>
    <div class="intake-actions">
      ${micHtml}
      <button class="intake-send-btn" onclick="_intakeStep3Send()">✦ 보내기</button>
    </div>
    <div class="intake-example">
      <div class="intake-example-label">↓ 예시 — <b>클릭하면 입력창에 채워져</b>${_intakeState.aiLong ? '' : ' <span class="small">(AI 답변 기다리는 중...)</span>'}</div>
      <div class="intake-example-chip intake-example-long" onclick="_intakeStep3FillExample()">${ex.icon} "${escapeHtml(longText)}"</div>
    </div>
  `;
}

function _intakeStep3FillExample() {
  const ta = document.getElementById('intakeInput3');
  if (!ta) return;
  const longText = _intakeState.aiLong || _intakeState.exampleStep1.long;
  ta.value = longText;
}

async function _intakeStep3Send() {
  const text = (document.getElementById('intakeInput3')?.value || '').trim();
  if (!text) { showToast('한 번 더 풀어줘 ✦'); return; }
  state.intakeWorry.push({ role: 'user', content: text, ts: new Date().toISOString(), kind: 'detailed' });
  saveState();
  _intakeState.step = 4;
  _renderIntakeStep();
}

function _intakeStep4Html() {
  // 사용자 발화 paraphrase 한 줄 + "더 알고 싶어" button
  const lastUser = state.intakeWorry.filter(m => m.role === 'user').slice(-1)[0];
  const preview = lastUser ? (lastUser.content.length > 80 ? lastUser.content.slice(0, 80) + '...' : lastUser.content) : '';
  return `
    <div class="intake-ai-msg"><b>🐚</b> 잘 들었어 ✦<br><br><span class="small intake-quote">"${escapeHtml(preview)}"</span><br><br>이 마음, 어디서 작동하는지 같이 들여다볼래?</div>
    <div class="intake-actions">
      <button class="intake-send-btn intake-deepen-btn" onclick="_intakeStep4Analyze()">🔍 더 알고 싶어</button>
    </div>
  `;
}

async function _intakeStep4Analyze() {
  _intakeState.step = 5;
  _renderIntakeStep();
  try {
    const result = await _intakeAnalyze(state.intakeWorry);
    _intakeState.analysis = result;
    state.intakeWorry.push({
      role: 'assistant',
      content: `[차원: ${result.dimension}]\n${result.diagnosis}\n\n✦ ${result.strategy}`,
      ts: new Date().toISOString(),
      kind: 'analysis'
    });
    saveState();
    _renderIntakeStep();
  } catch (e) {
    console.warn('[intake] analyze 실패', e);
    _intakeState.analysis = {
      paraphrase: '',
      dimension: '환경',
      diagnosis: '잘 들었어. 좀 더 같이 들여다보고 싶어.',
      strategy: '천천히 가자. 다음 대화에서 이어가자.',
      hypotheses: []
    };
    _renderIntakeStep();
  }
}

function _intakeStep5Html() {
  if (!_intakeState.analysis) {
    return `<div class="intake-ai-msg"><b>🐚</b> <span class="intake-loading">잠깐 들여다보는 중...</span></div>`;
  }
  const a = _intakeState.analysis;
  return `
    <div class="intake-analysis">
      ${a.paraphrase ? `<div class="intake-analysis-paraphrase">${escapeHtml(a.paraphrase)}</div>` : ''}
      <div class="intake-analysis-dim"><b>${escapeHtml(a.dimension || '')} 차원</b> 이 작동하고 있어 보여.</div>
      <div class="intake-analysis-diag">${escapeHtml(a.diagnosis || '')}</div>
      <div class="intake-analysis-sep"></div>
      <div class="intake-analysis-strategy"><b>✦ 이렇게 한 번 해볼래?</b><br>${escapeHtml(a.strategy || '')}</div>
    </div>
    <div class="intake-actions">
      <button class="intake-send-btn" onclick="_intakeStep5Next()">고마워 ✦</button>
    </div>
  `;
}

function _intakeStep5Next() {
  // hypotheses → traits/values/patterns 자동 합류
  if (_intakeState.analysis && _intakeState.analysis.hypotheses) {
    _intakeApplyHypotheses(_intakeState.analysis.hypotheses);
    saveState();
  }
  // 사용자 명시 2026-04-30 ultrathink: 튜토리얼 모드일 때 모달 종료 후 대화창에 4단 분석 자동 표시용 stash.
  // _startIntakeFromTutorial 가 modal 종료 시점에 읽어서 처리.
  if (window._onbTutorialMode) {
    window._lastIntakeAnalysis = _intakeState.analysis ? JSON.parse(JSON.stringify(_intakeState.analysis)) : null;
    window._lastIntakeWorries = (state.intakeWorry || [])
      .filter(m => m && m.role === 'user')
      .map(m => m.content);
  }
  _intakeState.step = 6;
  _renderIntakeStep();
}

function _intakeStep6Html() {
  // V4 (사용자 명시 2026-05-06 ultrathink): V8 시작 튜토리얼 모드 — chat 탭 다리 카피.
  if (window._v8TutorialMode) {
    return `
      <div class="intake-finish">
        <div class="intake-finish-icon">🐚</div>
        <div class="intake-finish-title">잠깐 들여다봤어.</div>
        <div class="intake-finish-body">
          정리해서 채팅으로 보여줄게.
        </div>
      </div>
      <div class="intake-actions">
        <button class="intake-send-btn" onclick="_closeIntakeModal()">계속 ✦</button>
      </div>
    `;
  }
  return `
    <div class="intake-finish">
      <div class="intake-finish-icon">🐚</div>
      <div class="intake-finish-title">방금 너를 잠깐 들여다봤어 🐚</div>
      <div class="intake-finish-body">
        ✨ <b>나 탭</b> 가보면 — 내가 방금 너를 어떻게 봤는지 나와있어.<br>
        이따 확인해봐!
      </div>
    </div>
    <div class="intake-actions">
      <button class="intake-send-btn" onclick="_closeIntakeModal()">계속 ✦</button>
    </div>
  `;
}

// Web Speech API 통합 — Step1 / Step3 마이크 버튼.
function _intakeMicToggle(stepNum) {
  if (!_intakeState) return;
  if (_intakeState.recognizing) {
    try { _intakeState.recognition?.stop(); } catch {}
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // 사용자 명시 2026-04-30 ultrathink: 미지원 브라우저 (iOS Safari < 16.5 등) = 토스트 안내. 예시·텍스트 권유.
    showToast('🎤 음성 인식이 이 브라우저에서는 안 돼. 예시 누르거나 직접 적어줘 ✦');
    return;
  }
  // 첫 사용 = privacy 안내 1회
  // 사용자 명시 2026-05-01 (agent audit): consent 키 통합 (chat 4곳 입력창과 동일 키). 사용자가 chat 에서 한 번 동의하면 intake 도 skip.
  if (!localStorage.getItem('soragodong_v4_speech_consent')) {
    if (!confirm('🎤 음성 입력 안내\n\n음성은 Google 서버를 거쳐 텍스트로 변환됩니다. 동의하시고 사용하시겠어요?')) return;
    try { localStorage.setItem('soragodong_v4_speech_consent', '1'); } catch {}
  }
  const ta = document.getElementById('intakeInput' + stepNum);
  const iconEl = document.getElementById('intakeMicIcon' + stepNum);
  const statusEl = document.getElementById('intakeMicStatus' + stepNum);
  const recognition = new SR();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = ta?.value ? ta.value + ' ' : '';
  let silenceTimer = null;
  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { try { recognition.stop(); } catch {} }, 5000);  // 5초 침묵 자동 종료
  };
  recognition.onstart = () => {
    _intakeState.recognizing = true;
    if (iconEl) iconEl.textContent = '⏹';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<span class="intake-mic-pulse">●</span> 듣는 중...'; }
    resetSilenceTimer();
  };
  recognition.onresult = (event) => {
    resetSilenceTimer();
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript + ' ';
      else interim += transcript;
    }
    if (ta) ta.value = (finalText + interim).trim();
  };
  recognition.onerror = (e) => {
    console.warn('[intake speech] error', e);
    if (statusEl) statusEl.innerHTML = '⚠️ 음성 인식 오류 — 다시 시도하거나 직접 적어줘';
  };
  recognition.onend = () => {
    _intakeState.recognizing = false;
    _intakeState.recognition = null;
    if (silenceTimer) clearTimeout(silenceTimer);
    if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;display:block;"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg>';
    if (statusEl) statusEl.style.display = 'none';
  };
  _intakeState.recognition = recognition;
  try { recognition.start(); } catch (e) { console.warn('[intake speech] start fail', e); }
}

async function maybeShowE2EESetupForNewUser() {
  if (!authUserId) return;
  if (state.preferences && state.preferences.testerMode) return;
  // 사용자 보고 2026-05-05 (Phase 1): 게스트 = 비밀번호 설정 모달 X. linkIdentity (가입 모달) 안에서 함께 처리.
  // 게스트는 cloud sync X 라 마스터 키 불필요 — saveToCloudNow 가 isGuest 분기에서 early return.
  if (state.isGuest) return;
  if (_e2eeEnabled || _e2eeMasterKey) return;
  if (window._e2eePendingRecovery) return;
  try {
    if (localStorage.getItem('soragodong_v4_e2ee_recovery')) return;  // 이미 활성
    // 사용자 명시 2026-05-02: dismissed flag 검사 제거 — E2EE 설정 강제 (skip X). 신규/legacy 둘 다.
  } catch {}
  if (document.getElementById('e2eeSetupOverlay')) return;
  // 사용자 명시 2026-05-02: allowCancel: false — 신규/legacy 강제 모달 (취소 button X).
  showE2EEPasswordSetupModal({ allowCancel: false });
}

