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
  // 사용자 명시 2026-05-06 ultrathink (재): Step2 (AI deepening) 폐기 → 점 5개 (1, 3, 4, 5, 6 단계).
  // step 값을 시각 인덱스로 매핑.
  const stepToDot = { 1: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
  const visualStep = stepToDot[step] || 1;
  const total = 5;
  let html = '<div class="intake-progress">';
  for (let i = 1; i <= total; i++) html += `<span class="intake-dot ${i <= visualStep ? 'on' : ''}"></span>`;
  html += '</div>';
  return html;
}

function _intakeStep1Html() {
  const ex = _intakeState.exampleStep1;
  // 사용자 명시 2026-04-30 ultrathink: 미지원 브라우저도 mic button 표시 — 누름 시 토스트 안내 (예시·텍스트 권유).
  const micHtml = `<button id="intakeMicBtn1" class="intake-mic-btn" onclick="_intakeMicToggle(1)" aria-label="음성"><span id="intakeMicIcon1"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;display:block;"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg></span></button>`;
  return `
    <div class="intake-intro">🐚 지금 고민인 거 한 번 말해봐.</div>
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
  // 사용자 명시 2026-05-06 ultrathink (재 X3): AI 동적 long example 부활 — 1단계 발화로 살 붙인 예시 = 사용자 학습 가치 ↑.
  //   stuck 방지: 5초 timeout + pending/timedOut 분리 → 라벨에 "기다리는 중" 영구 표시 X.
  //   AI 도착 X 면 INTAKE_EXAMPLES 페어 long 만 조용히 표시.
  if (_intakeShouldDeepen(text)) {
    _intakeState.step = 3;
    _intakeState.aiLong = null;
    _intakeState.aiLongPending = true;
    _intakeState.aiLongTimedOut = false;
    _renderIntakeStep();
    const timeoutId = setTimeout(() => {
      if (!_intakeState || _intakeState.aiLong) return;
      _intakeState.aiLongPending = false;
      _intakeState.aiLongTimedOut = true;
      if (_intakeState.step === 3) _renderIntakeStep();
    }, 5000);
    _intakeGenLongExample(text)
      .then(longText => {
        clearTimeout(timeoutId);
        if (!_intakeState) return;
        _intakeState.aiLongPending = false;
        if (longText && longText.length > 10) {
          _intakeState.aiLong = longText;
          _intakeState.aiLongTimedOut = false;
        } else {
          _intakeState.aiLongTimedOut = true;
        }
        if (_intakeState.step === 3) _renderIntakeStep();
      })
      .catch(e => {
        clearTimeout(timeoutId);
        if (!_intakeState) return;
        _intakeState.aiLongPending = false;
        _intakeState.aiLongTimedOut = true;
        if (_intakeState.step === 3) _renderIntakeStep();
        console.warn('[intake] long example 실패 — INTAKE_EXAMPLES 페어 사용', e);
      });
  } else {
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
  // 사용자 명시 2026-05-06 ultrathink (재 X3): AI long 도착 = 너 발화로 살 붙인 chip / 미도착·timeout = INTAKE_EXAMPLES 페어 long.
  const ex = _intakeState.exampleStep1;
  const aiLong = _intakeState.aiLong;
  const longText = aiLong || ex.long;
  const chipPrefix = aiLong ? '✨' : ex.icon;
  // 라벨 — pending: "✨ 너 발화로 만들고 있어..." / aiLong 있음: "✨ 너 발화로 만들었어" / timedOut/일반: 기본 안내.
  let labelExtra = '';
  if (aiLong) labelExtra = ' <span class="small" style="color:var(--accent);">✨ 네 말 바탕으로 AI 예시</span>';
  else if (_intakeState.aiLongPending) labelExtra = ' <span class="small" style="opacity:0.7;">(✨ 네 말 바탕으로 AI 예시 생성 중...)</span>';
  // timedOut 면 라벨 추가 표시 X — 기본 안내 + INTAKE_EXAMPLES chip 만 조용히 노출.
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
      <div class="intake-example-label">↓ 예시 — <b>클릭하면 입력창에 채워져</b>${labelExtra}</div>
      <div class="intake-example-chip intake-example-long" onclick="_intakeStep3FillExample()">${chipPrefix} "${escapeHtml(longText)}"</div>
    </div>
  `;
}

function _intakeStep3FillExample() {
  const ta = document.getElementById('intakeInput3');
  if (!ta) return;
  ta.value = _intakeState.aiLong || _intakeState.exampleStep1.long;
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
  _intakeState.analysis = null;
  _intakeState.analysisFailed = false;
  _intakeState.analysisErrMsg = '';
  _renderIntakeStep();
  // 사용자 명시 2026-05-06 ultrathink (perf C): progressive 메시지 — 실제 시간 같음, perceived 단축.
  _startIntakeProgressMessages();
  // 사용자 보고 2026-05-06 ultrathink (재): 빈 껍데기 fallback 합성 절대 X.
  //   AI 가 진짜 분석한 척 가짜 카피 출력 → 사용자 신뢰 깨짐.
  //   재시도 3회 (1.5초 / 3초 간격). 다 실패하면 → 명시적 "다시 시도" UI 노출 (Step5 분기).
  let result = null;
  let lastErr = null;
  const RETRY_DELAYS = [1500, 3000];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await _intakeAnalyze(state.intakeWorry);
      // 사용자 명시 2026-05-08: 4단 raw text 응답 — text 필드만 검증.
      if (result && result.text && result.text.length > 50) break;
      result = null;
      throw new Error('빈 응답 — 4단 텍스트 부족');
    } catch (e) {
      lastErr = e;
      console.warn('[intake] analyze attempt ' + attempt + ' 실패', e && e.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }
  }
  _stopIntakeProgressMessages();
  if (result) {
    _intakeState.analysis = result;
    // 사용자 명시 2026-05-08: 4단 raw text 그대로 intakeWorry chat 보존 ([상황] 포함 — 결과 체크 모달용 메타).
    state.intakeWorry.push({
      role: 'assistant',
      content: result.text,
      ts: new Date().toISOString(),
      kind: 'analysis'
    });
    saveState();
    _renderIntakeStep();
  } else {
    console.warn('[intake] analyze 3회 다 실패 — 명시적 retry UI', lastErr && lastErr.message);
    _intakeState.analysisFailed = true;
    _intakeState.analysisErrMsg = (lastErr && lastErr.message) || '네트워크 오류';
    _renderIntakeStep();
  }
}

// 사용자 명시 2026-05-06 ultrathink (perf C): intake 분석 wait 동안 progressive 메시지 swap.
// 실제 latency 와 무관 — perceived 길이 단축 + 시간 경과 표시.
let _intakeProgressTimer = null;
function _startIntakeProgressMessages() {
  if (_intakeProgressTimer) clearInterval(_intakeProgressTimer);
  const messages = [
    '잠깐 들여다보는 중...',
    '환경 단서 살피는 중...',
    '심리 맥락 정리 중...',
    '전략 도출 중...',
    '거의 다 됐어...'
  ];
  let idx = 0;
  _intakeProgressTimer = setInterval(() => {
    idx = Math.min(idx + 1, messages.length - 1);
    const el = document.querySelector('.intake-loading');
    if (el) el.textContent = messages[idx];
    if (idx >= messages.length - 1) {
      clearInterval(_intakeProgressTimer);
      _intakeProgressTimer = null;
    }
  }, 1800);
}
function _stopIntakeProgressMessages() {
  if (_intakeProgressTimer) { clearInterval(_intakeProgressTimer); _intakeProgressTimer = null; }
}

function _intakeStep5Html() {
  // 사용자 보고 2026-05-06 ultrathink (재 X3): 분석 실패 → 진짜 원인 표면화 + 명시적 retry UI.
  if (_intakeState.analysisFailed) {
    const errMsg = _intakeState.analysisErrMsg || '';
    let userHint = '네트워크가 잠시 흔들렸을 수도 있어.';
    if (/429|rate|GUEST_LIMIT|GLOBAL_BUDGET/i.test(errMsg)) userHint = '오늘 게스트 한도 다 썼어. 20회. 가입하면 풀려.';
    else if (/403|turnstile/i.test(errMsg)) userHint = '봇 검증이 만료됐어. 페이지 새로고침 한 번 해줘.';
    else if (/cap|cost|초과|budget/i.test(errMsg)) userHint = '오늘 무료 사용량 cap 에 도달했어. 가입하면 풀려.';
    else if (/JSON|truncated|닫힘/i.test(errMsg)) userHint = 'AI 응답이 잘렸어. 한 번 더 시도하면 보통 됨.';
    else if (/세션 미준비|불가능/i.test(errMsg)) userHint = '아직 인증이 안 끝났어. 5초 후 다시 해줄래?';
    return `
      <div class="intake-ai-msg">
        <b>🐚</b> 잠깐, 분석이 잘 안 됐어 ✦<br><br>
        <span class="small">${escapeHtml(userHint)}</span>
        ${errMsg ? `<div class="small" style="margin-top:8px; opacity:0.55; font-size:10px;">상세: ${escapeHtml(errMsg.slice(0, 80))}</div>` : ''}
      </div>
      <div class="intake-actions" style="display:flex; gap:8px;">
        <button class="intake-send-btn" onclick="_intakeRetryAnalyze()" style="flex:2;">🔄 다시 분석</button>
        <button class="intake-send-btn intake-skip-btn" onclick="_intakeSkipAnalysis()" style="flex:1; background:transparent; border:1px solid var(--border); color:var(--text-dim);">건너뛰기</button>
      </div>
    `;
  }
  if (!_intakeState.analysis) {
    return `<div class="intake-ai-msg"><b>🐚</b> <span class="intake-loading">잠깐 들여다보는 중...</span></div>`;
  }
  // 사용자 명시 2026-05-08: 4단 raw text → formatAIResponse 로 askDeeper 응답과 100% 동일 카드.
  const a = _intakeState.analysis;
  const fourStageHtml = (typeof formatAIResponse === 'function' && a.text)
    ? formatAIResponse(a.text)
    : escapeHtml(a.text || '');
  return `
    <div class="intake-analysis msg assistant">
      <div class="msg-bubble">${fourStageHtml}</div>
    </div>
    <div class="intake-actions">
      <button class="intake-send-btn" onclick="_intakeStep5Next()">고마워 ✦</button>
    </div>
  `;
}

// 사용자 보고 2026-05-06 ultrathink (재): 분석 실패 시 retry — Step4 재호출.
function _intakeRetryAnalyze() {
  if (!_intakeState) return;
  _intakeState.analysisFailed = false;
  _intakeState.analysis = null;
  _intakeStep4Analyze();
}

// 분석 건너뛰고 모달 종료. analysis 없는 채로 close (튜토리얼이면 chat 다리 카피 없이 닫힘).
function _intakeSkipAnalysis() {
  if (!_intakeState) return;
  _intakeState.analysis = null;
  _intakeState.analysisFailed = false;
  // tutorial stash X — _startIntakeFromTutorial 가 analysis 없으면 fallback 흐름 (onbNext)
  _intakeState.step = 6;
  _renderIntakeStep();
}

function _intakeStep5Next() {
  // 사용자 명시 2026-05-09 (사용자 보고): 첫 4단 분석 후 나 탭 빈 상태 = 버그. 옛 결정 (2026-05-08 hypotheses 폐기) reverse.
  // 게스트/미구독자 = 챕터 마무리 시 호출되는 extractChapterCaseAnalysis 를 intake 첫 분석에서 바로 호출 (사용자 명시).
  // intake → state.traits/values/patterns + caseFormulation 즉시 채움 → 나 탭 즉시 반영.
  try {
    if (typeof extractChapterCaseAnalysis === 'function'
        && Array.isArray(state.intakeWorry) && state.intakeWorry.length >= 3) {
      // intakeWorry → chatMessages 형태 변환 (timestamp 필드)
      const _msgs = state.intakeWorry.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.ts || new Date().toISOString()
      }));
      // bypassTutorialGuard — onboarding 안에서 intake 호출되어도 추출 진행.
      // 사용자 명시 2026-05-09: model = sonnet (default). extractChapterCaseAnalysis 자체 default 사용.
      extractChapterCaseAnalysis(_msgs, {
        bypassTutorialGuard: true
      }).catch(e => console.warn('[intake → chapter case extract] silent:', e && e.message));
    }
  } catch (e) { console.warn('[intake step5Next extract trigger]:', e && e.message); }

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
  // 사용자 명시 2026-05-11 ultrathink: 테스트 계정 (soragodongapp@gmail.com) — 매 진입마다 setup 모달 표시. 필수 동의 항목 매번 확인 + 비밀번호 재설정 디버깅 편의. 기존 가드 (이미 활성 / 데이터 있음 / recovery 활성) 모두 우회. cancel 버튼 허용 (매번 떠도 닫을 수 있게).
  const _isTestAcct = session && session.user && session.user.email === 'soragodongapp@gmail.com';
  if (_isTestAcct) {
    if (document.getElementById('e2eeSetupOverlay')) return;  // 중복 fire 만 차단
    showE2EEPasswordSetupModal({ allowCancel: true });
    return;
  }
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
  // 사용자 보고 2026-05-09 ultrathink: 기존 카카오 사용자 (다른 device or 브라우저 clear or logout 후 재로그인) +
  // cloud row 평문 path 에서 setup 모달 잘못 fire 버그 fix. 기존 데이터 detect 시 skip.
  // 진짜 신규 = 모든 array 0 → setup fire (정상). 옛 강제 권유 의도 (2026-05-02) 부분 변경 — legacy 평문 row 자동 마이그 X.
  const _hasExistingData = (Array.isArray(state.entries) && state.entries.length > 0)
    || (Array.isArray(state.chatMessages) && state.chatMessages.length > 0)
    || (Array.isArray(state.shellCollection) && state.shellCollection.length > 0)
    || (Array.isArray(state.topicCards) && state.topicCards.length > 0)
    || (Array.isArray(state.missions) && state.missions.length > 0);
  if (_hasExistingData) {
    console.log('[E2EE setup] 기존 사용자 데이터 detect — setup 모달 skip');
    return;
  }
  // 사용자 명시 2026-05-02: allowCancel: false — 신규 강제 모달 (취소 button X).
  showE2EEPasswordSetupModal({ allowCancel: false });
}

