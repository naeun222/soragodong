// 사용자가 [🌱 가지 만들기] / [🔄 가지 다시 만들기] 버튼 클릭
async function triggerGenerateMutationOptions() {
  if (!_mutationChatState) return;
  if (_mutationChatState.loading) return;
  const { strategyId, missionTitle } = _mutationChatState;
  // 첫 가지: allowSameLayer = false (다른 차원 권유)
  // 그 이후 (이미 options 메시지 있으면): allowSameLayer = true (같은 차원 refine OK)
  const hasPrior = _mutationChatState.messages.some(m => m.role === 'options');
  await _generateMutationOptions(strategyId, missionTitle, { allowSameLayer: hasPrior });
}

function _renderMutationChat() {
  if (!_mutationChatState) return;
  const card = getStrategyCard(_mutationChatState.strategyId);
  if (!card) { closeMutationChat(false); return; }

  // overlay 없으면 생성
  let overlay = document.getElementById('mutationChatOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mutationChatOverlay';
    overlay.className = 'mutation-chat-overlay';
    overlay.innerHTML = `
      <div class="mutation-chat-modal" onclick="event.stopPropagation()">
        <div class="mutation-chat-header">
          <div style="flex:1;">
            <div class="mutation-chat-header-title">
              <span>🧬 돌연변이 — DNA 진화</span>
              <span id="mutationChatSelectedChip"></span>
            </div>
            <div class="mutation-chat-header-sub" id="mutationChatSubtitle"></div>
          </div>
          <button class="chat-mode-btn js-chat-mode-btn" onclick="toggleChatModel()" aria-label="대화 모델 전환" title="대화 모델 전환" style="margin-right:8px;"><img src="/godongicon.png" alt="" class="chat-mode-img"></button>
          <button class="mutation-chat-close" onclick="closeMutationChat(false)" aria-label="닫기">✕</button>
        </div>
        <div class="mutation-chat-area" id="mutationChatArea"></div>
        <div class="mutation-chat-footer" id="mutationChatFooter"></div>
      </div>
    `;
    overlay.onclick = (e) => { if (e.target === overlay) closeMutationChat(false); };
    document.body.appendChild(overlay);
    if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
  }
  // V4-fix v2: footer는 매번 재렌더 (confirm bar 분기)
  // 선택된 가지 — 모든 'options' 메시지 중 selectedRef 위치
  const sel = _mutationChatState.selectedRef;
  const selectedOpt = sel
    ? (_mutationChatState.messages[sel.msgIdx]?.options || [])[sel.optIdx]
    : null;
  const hasPriorOptions = _mutationChatState.messages.some(m => m.role === 'options');

  const footer = document.getElementById('mutationChatFooter');
  if (footer) {
    if (_mutationChatState.confirmStep && selectedOpt) {
      const layerName = _LAYER_NAME[selectedOpt.layer] || selectedOpt.layer;
      footer.innerHTML = `
        <div class="mutation-confirm-bar">
          <div class="mutation-confirm-text">"${escapeHtml(card.title)}" → ${escapeHtml(layerName)} 차원 새 가닥 등록.<br>
          이 대화 흐름 (${_mutationChatState.messages.length}개) 도 같이 보관할까?</div>
          <div class="mutation-confirm-actions">
            <button class="mutation-confirm-btn" onclick="_completeMutationFinish(false)">아니 결과만</button>
            <button class="mutation-confirm-btn primary" onclick="_completeMutationFinish(true)">응 같이 보관</button>
          </div>
        </div>
      `;
    } else {
      // 사용자 요청 2026-04-29: [🌱 가지 만들기] / [🔄 가지 다시 만들기] 버튼 — 입력 위 sticky
      const genBtnLabel = hasPriorOptions ? '🔄 가지 다시 만들기' : '🌱 가지 만들기';
      const genBtnTitle = hasPriorOptions
        ? '대화 반영해서 새 가지 4개 — 같은 차원 refine OK'
        : '대화 좀 풀고 가지 만들거나, 바로 만들어도 OK';
      footer.innerHTML = `
        <div class="mutation-gen-bar">
          <button class="mutation-gen-btn" onclick="triggerGenerateMutationOptions()" title="${genBtnTitle}" ${_mutationChatState.loading ? 'disabled' : ''}>
            ${genBtnLabel}
          </button>
        </div>
        <div class="mutation-chat-input-row">
          <textarea class="mutation-chat-input" id="mutationChatInput" placeholder="자유롭게 대화..." rows="1"></textarea>
          <button class="input-mic-btn" id="mutationMicBtn" onclick="_toggleInputSpeech('mutationChatInput', 'mutationMicBtn')" aria-label="음성 입력" title="음성 입력"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg></button>
          <button class="mutation-chat-send" id="mutationChatSendBtn" onclick="sendMutationMessage()">↑</button>
          <!-- V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 돌연변이 깨달음 추출 ✓ button -->
          <button class="mutation-chat-extract" id="mutationChatExtractBtn" onclick="_extractMutationInsight({ trigger: 'manual' })" aria-label="여기서 깨달은 거 추출" title="여기서 깨달은 거 추출">✓</button>
        </div>
        <div class="mutation-chat-actions">
          <button class="mutation-chat-mission-btn" id="mutationFinishBtn" onclick="finishMutationChat()" ${!selectedOpt ? 'disabled' : ''}>✦ 이 가지로 해볼게</button>
        </div>
      `;
      const ta = document.getElementById('mutationChatInput');
      if (ta) {
        // 사용자 보고 2026-05-02: rAF coalesce — 매 keystroke sync reflow 차단.
        let _mutResizeRaf = 0;
        ta.addEventListener('input', () => {
          if (_mutResizeRaf) return;
          _mutResizeRaf = requestAnimationFrame(() => {
            _mutResizeRaf = 0;
            ta.style.height = 'auto';
            ta.style.height = Math.min(100, ta.scrollHeight) + 'px';
          });
        });
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMutationMessage(); }
        });
      }
    }
  }
  // subtitle: 가닥 제목
  const subEl = document.getElementById('mutationChatSubtitle');
  if (subEl) subEl.textContent = `"${card.title}"`;
  // 헤더 chip — 선택된 가지 표시 (선택 시만)
  const chipEl = document.getElementById('mutationChatSelectedChip');
  if (chipEl) {
    if (selectedOpt) {
      chipEl.innerHTML = `<span class="mutation-selected-chip" title="선택된 가지">${_LAYER_EMOJI[selectedOpt.layer] || '✦'} ${_LAYER_NAME[selectedOpt.layer] || selectedOpt.layer}</span>`;
    } else {
      chipEl.innerHTML = '';
    }
  }
  // 채팅 영역 — 메시지 시간순 (options 메시지 인라인 적용됨)
  const area = document.getElementById('mutationChatArea');
  if (area) {
    let html = '';
    _mutationChatState.messages.forEach((m, msgIdx) => {
      if (m.role === 'options') {
        // 가지 카드 4개 인라인
        const opts = m.options || [];
        html += `<div class="mutation-msg assistant" style="background:transparent; border:none; padding:0; max-width:100%;">
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">🌱 가지 ${opts.length}개</div>
          <div class="mutation-options-stack">
            ${opts.map((o, oi) => {
              const isSelected = sel && sel.msgIdx === msgIdx && sel.optIdx === oi;
              const otherSelected = sel && !isSelected;
              return `
                <button class="mutation-option-card${isSelected ? ' selected' : ''}${otherSelected ? ' dim' : ''}" onclick="selectMutationOption(${msgIdx}, ${oi})">
                  <div class="mutation-option-layer">${_LAYER_EMOJI[o.layer] || '✦'} ${_LAYER_NAME[o.layer] || o.layer}</div>
                  <div class="mutation-option-action">${escapeHtml(o.action)}</div>
                </button>
              `;
            }).join('')}
          </div>
        </div>`;
      } else if (m.role === 'assistant' && !m._placeholder) {
        // 사용자 보고 2026-05-01 ultrathink: '깨달음으로' 버튼 bubble 안 → bubble 밖 sibling 으로 분리 (메인 chat 패턴 일치, gold pill on dark bubble 시각 충돌 해소).
        const saved = !!m.savedAsInsight;
        html += `<div class="mutation-msg assistant">${escapeHtml(m.content)}</div>`;
        html += `<div class="mutation-msg-actions"><button class="mutation-insight-btn${saved ? ' saved' : ''}" onclick="saveMutationMsgAsInsight(${msgIdx})">${saved ? '✦ 저장됨' : '✦ 깨달음으로'}</button></div>`;
      } else {
        html += `<div class="mutation-msg ${m.role}">${escapeHtml(m.content)}</div>`;
      }
    });
    area.innerHTML = html;
    area.scrollTop = area.scrollHeight;
  }
}

async function selectMutationOption(msgIdx, optIdx) {
  if (!_mutationChatState) return;
  const optMsg = _mutationChatState.messages[msgIdx];
  if (!optMsg || optMsg.role !== 'options') return;
  const opt = (optMsg.options || [])[optIdx];
  if (!opt) return;
  // 같은 가지 다시 클릭 = 선택 해제 (toggle)
  const cur = _mutationChatState.selectedRef;
  if (cur && cur.msgIdx === msgIdx && cur.optIdx === optIdx) {
    _mutationChatState.selectedRef = null;
    _renderMutationChat();
    return;
  }
  _mutationChatState.selectedRef = { msgIdx, optIdx };
  _mutationChatState.chatRecord.selectedLayer = opt.layer;
  _mutationChatState.chatRecord.selectedAction = opt.action;
  _mutationChatState.messages.push({
    role: 'user',
    content: `${_LAYER_EMOJI[opt.layer] || '✦'} ${_LAYER_NAME[opt.layer] || opt.layer} — ${opt.action}`
  });
  // V4-fix v3 (사용자 요청): 선택 후 step by step 구체 안내
  _mutationChatState.messages.push({ role: 'assistant', content: '구체적인 단계 정리 중... ✦' , _placeholder: true });
  _renderMutationChat();

  const card = getStrategyCard(_mutationChatState.strategyId);
  const layerName = _LAYER_NAME[opt.layer] || opt.layer;
  let stepText = '';

  if (_canAI()) {
    try {
      const resp = await callAnthropic({
          _endpoint: 'mutation',
          // 사용자 요청 2026-04-30: 고른 후 정리 task → sonnet 4.6 적합.
          model: 'claude-sonnet-4-6', max_tokens: 400,
          messages: [{
            role: 'user',
            content: `사용자 가닥 "${card?.title || ''}" — 새 시도 차원: ${opt.layer} ${layerName}\n행동: "${opt.action}"\n\n[네 일]\n이 행동을 *오늘부터 바로 할 수 있도록* 구체적 step-by-step 3-5단계.\n각 단계: 짧고 명확하게 (한 줄 max 40자). 의지 부담↓ 환경 셋업 우선.\n\n[톤]\n진지 모드 친구. 외재화. "실패" 단어 X. 관찰 친화 (작은 단위).\n\n[출력 — 다른 거 X, 단계만]\n1. (첫 단계 — 가장 작게)\n2. ...\n3. ...\n\n도입 한 줄 + 단계 + 마무리 한 줄 ("시작 전에 더 얘기 X면 ✦ 해볼게로 등록").`
          }]
      });
      const data = await resp.json();
      stepText = data.content?.[0]?.text?.trim() || '';
    } catch (e) { console.warn('mutation step AI:', e); }
  }
  // fallback (AI 없거나 실패)
  if (!stepText) {
    const fb = {
      L3: `좋아. 환경 차원은 의지 부담 ↓↓ — 한 번 셋업하면 자동 발동.\n\n1. 그 행동이 자연스레 일어날 환경 1가지 정하기 (장소/도구/시간)\n2. 셋업 한 번 (5분 이내) — 예: 폰 차단, 알람 X, 도구 미리 펼침\n3. 다음 trigger가 왔을 때 그 환경에 그냥 들어가기\n4. 작동했는지 한 줄 기록\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L4: `좋아. 사회 차원은 의지 부담 ↓ — 다른 사람의 존재가 trigger.\n\n1. 믿을 사람 1명 정하기 (친구/동기/가족)\n2. 카톡 한 줄로 알리기 — "나 X 시도 중이야"\n3. 매주 1번 짧게 결과 공유 (긴 설명 X)\n4. 작동 안 해도 알리기 — 발견 자체가 가치\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L1: `좋아. 인지 차원은 의지 부담 높음 — 생각의 틀 자체를 바꿈.\n\n1. 이 패턴이 어디서 오는지 한 줄 적기 (왜 작동하지)\n2. 다른 해석 1개 시도 — "X = Y 아니라 Z일 수도"\n3. 그 해석으로 하루 살아보기\n4. 어떤 차이 있었는지 저녁에 한 줄\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L5: `좋아. 메타 차원은 의지 부담 ↓ — 큰 그림에서 다시 봄.\n\n1. 마법의 소라고동 또는 일기에 큰 질문 적용하기 — "이게 정말 네 길인지"\n2. 일주일 그 질문 안고 살기 (답 강요 X)\n3. 일주일 후 한 단락 쓰기\n4. 결론은 "지금은 모름"도 OK — 머무는 시간도 의미\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L2: `좋아. 행동 차원 — 알람/체크리스트로 trigger 만들기.\n\n1. 행동을 5분 이하로 쪼개기\n2. 알람 1개 설정 (실제 가능한 시간)\n3. 알람 울리면 그냥 시작 — 5분만\n4. 작동했는지 한 줄 기록\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`
    };
    stepText = fb[opt.layer] || fb.L2;
  }

  // placeholder 제거 + 실제 응답 push
  _mutationChatState.messages = _mutationChatState.messages.filter(m => !m._placeholder);
  _mutationChatState.messages.push({ role: 'assistant', content: stepText });
  _renderMutationChat();
}

function sendMutationMessage() {
  if (!_mutationChatState) return;
  const ta = document.getElementById('mutationChatInput');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  _mutationChatState.messages.push({ role: 'user', content: text });
  ta.value = '';
  ta.style.height = 'auto';
  // AI 호출 — 간단 응답 (fallback 우선)
  if (!_canAI()) {
    _mutationChatState.messages.push({
      role: 'assistant',
      content: '응. 그 부분 같이 보자. 어떤 게 가장 망설여져?'
    });
    _renderMutationChat();
    return;
  }
  _renderMutationChat();
  // AI 호출 (백그라운드)
  (async () => {
    try {
      const card = getStrategyCard(_mutationChatState.strategyId);
      // 사용자 요청 2026-04-29: 임시 대화 전체 활용 + 진지 모드 + 사용자 본인 데이터 인용
      const allMsgs = _mutationChatState.messages
        .filter(m => m.role !== 'options' && !m._placeholder)
        .map(m => `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`).join('\n');
      // 사용자 본인 데이터 인용용
      const _topByConf = (arr, n) => (arr || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, n);
      const traits = _topByConf(state.traits, 5).map(t => `- ${t.name}${t.description ? ': ' + t.description : ''}`).join('\n');
      const patterns = _topByConf(state.patterns, 5).map(p => `- ${p.name}${p.trigger ? ' (트리거: ' + p.trigger + ')' : ''}`).join('\n');
      const values = _topByConf(state.values, 3).map(v => `- ${v.name}`).join('\n');
      const cf = state.caseFormulation;
      const cfLine = (cf && cf.version > 0)
        ? `통합분석 v.${cf.version}: 문제 ${(cf.problems||[]).slice(0,2).map(p => typeof p==='string'?p:p.text||'').join('; ').slice(0,150)}`
        : '';
      const activeDiag = (state.diagnoses || []).find(d => d.status === 'active' || d.status === 'shown');
      const diagLine = activeDiag && _DIAG_LABELS && _DIAG_LABELS[activeDiag.type]
        ? `관찰: ${_DIAG_LABELS[activeDiag.type].name} — ${activeDiag.evidence || ''}`
        : '';

      const resp = await callAnthropic({
          _endpoint: 'mutation',
          model: 'claude-sonnet-4-6', max_tokens: 350,
          messages: [{
            role: 'user',
            content: `너는 돌연변이 진화 임시 대화창 안 AI. "${card.title}" 가닥의 다음 시도를 사용자가 진지하게 고민 중.

[톤 — 진지 모드 (가벼운 ㅋㅋ / 농담 X)]
- 1-4문장. 차분한 친구. 외재화 ("X 패턴이 작동" / "이 도구 안 맞을 수도"). "실패" 단어 X.
- 사용자 페이스 따라가. 추궁성 질문 X.
- 사용자 메시지 짧아도 진지 톤 유지 (모드 sticky).
- 분석/제안 강요 X. 사용자가 자기 발견하도록.

[사용자 본인 데이터 — 우선 인용. generic textbook 단독 회피]
${traits ? '특성:\n' + traits : ''}
${patterns ? '\n패턴:\n' + patterns : ''}
${values ? '\n가치:\n' + values : ''}
${cfLine ? '\n' + cfLine : ''}
${diagLine ? '\n' + diagLine : ''}

[지금 대화 전체]
${allMsgs}

[네 응답만, 마크다운 X]`
          }]
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text?.trim() || '응. 더 얘기해봐.';
      if (_mutationChatState) {
        _mutationChatState.messages.push({ role: 'assistant', content: text });
        _renderMutationChat();
      }
    } catch (e) {
      if (_mutationChatState) {
        _mutationChatState.messages.push({ role: 'assistant', content: '응. 더 얘기해봐.' });
        _renderMutationChat();
      }
    }
  })();
}

// 사용자 요청 2026-04-28: ✦ 클릭 → 임시 대화창 닫고 → openStrategyMissionChat (어떤 상황? → 오늘의 제안 → 부름 등록)
async function finishMutationChat() {
  if (!_mutationChatState) return;
  const sel = _mutationChatState.selectedRef;
  if (!sel) return;
  const card = getStrategyCard(_mutationChatState.strategyId);
  if (!card) { closeMutationChat(false); return; }
  const optMsg = _mutationChatState.messages[sel.msgIdx];
  if (!optMsg || optMsg.role !== 'options') return;
  const opt = (optMsg.options || [])[sel.optIdx];
  if (!opt) return;
  // 사용자 명시 2026-05-01: first-gen 변환 — 토픽 카드 category 'strategy' 로 정식 promote (옵션 선택 후만).
  if (_mutationChatState.firstGen && card.category !== 'strategy') {
    card.category = 'strategy';
  }
  // chatRecord 자동 보관
  _mutationChatState.chatRecord.messages = _mutationChatState.messages.slice();
  _mutationChatState.chatRecord.kept = true;
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  card.evolutionChats.push(_mutationChatState.chatRecord);
  saveState();
  const strategyId = _mutationChatState.strategyId;
  const chatHistory = _mutationChatState.messages.slice();
  closeMutationChat(true);
  // 사용자 요청 2026-04-28: 돌연변이는 이미 대화로 맥락 충분 → '어떤 상황?' 모달 X. 바로 오늘의 제안 → 부름 등록
  await _completeMutationToMission(strategyId, opt, chatHistory);
}

// 돌연변이 직접 흐름 — 카드만 update (사용자 요청 2026-04-28: mission 자동 생성 X. ✦ 해볼게로 재사용)
async function _completeMutationToMission(strategyId, opt, chatHistory) {
  const card = getStrategyCard(strategyId);
  if (!card) return;
  const layerName = _LAYER_NAME[opt.layer] || opt.layer;
  showToast('🧬 카드 진화 중...');
  // 새 generation 추가 + 옛 카드 내용 snapshot
  mutateToNewGeneration(strategyId, opt.layer, opt.action);
  const refreshed = getStrategyCard(strategyId);
  if (refreshed) {
    // 임시 fallback (AI 호출 실패 대비)
    const fallbackTitle = opt.action.length > 40 ? opt.action.slice(0, 40) + '...' : opt.action;
    refreshed.title = fallbackTitle;
    refreshed.psychConcept = `${layerName} 차원 — ${opt.action.slice(0, 60)}`;
    refreshed.actionStrategy = opt.action;
    const lastGen = refreshed.generations[refreshed.generations.length - 1];
    if (lastGen) {
      lastGen.layerName = layerName;
    }
    // AI로 새 4 필드 재생성 (TITLE/PROBLEM/CONCEPT/ACTION) — 옛 가닥 맥락 + 새 차원 + 임시 대화 흐름 종합
    if (_canAI()) {
      try {
        const oldSnapshot = lastGen?.snapshot || refreshed.generations[refreshed.generations.length - 2]?.snapshot;
        const oldCtx = oldSnapshot
          ? `[옛 가닥] ${oldSnapshot.title}\n[옛 문제] ${oldSnapshot.problemContext}\n[옛 심리학] ${oldSnapshot.psychConcept}\n[옛 행동] ${oldSnapshot.actionStrategy}`
          : `[옛 가닥] ${refreshed.title}`;
        const recentMsgs = (chatHistory || []).slice(-6).map(m => `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`).join('\n');
        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: _anthropicHeaders(),
          body: JSON.stringify({
            _endpoint: 'mutation',
            // 사용자 요청 2026-04-30: 4 필드 정리 task → sonnet 4.6 적합.
            model: 'claude-sonnet-4-6', max_tokens: 500,
            messages: [{
              role: 'user',
              content: `진화한 새 가닥 — 카드 4 필드 정리.

${oldCtx}
[새 차원] ${layerName} (${opt.layer})
[새 행동] ${opt.action}
[돌연변이 대화]
${recentMsgs}

[네 일]
새 차원/행동 맞춰 진화한 카드의 4 필드 작성.

[출력 — 정확히 4줄]
TITLE: <짧은 제목, 5-14자>
PROBLEM: <문제 상황, 50-90자, 옛 가닥 안 통한 맥락 반영>
CONCEPT: <심리학 개념 + 1줄 설명, ${layerName} 차원 메커니즘, 30-80자>
ACTION: <전략적 행동, 50-120자, 구체적 무엇을 어떻게>

[금지] 마크다운, JSON, 따옴표, "실패" 단어, 추상적 다짐.`
            }]
          })
        });
        const aiData = await aiResp.json();
        const raw = (aiData.content?.[0]?.text || '').trim();
        const titleM = raw.match(/TITLE:\s*(.+)/);
        const probM = raw.match(/PROBLEM:\s*(.+)/);
        const conM = raw.match(/CONCEPT:\s*(.+)/);
        const actM = raw.match(/ACTION:\s*(.+)/);
        if (titleM) refreshed.title = titleM[1].trim().slice(0, 40);
        if (probM) refreshed.problemContext = probM[1].trim().slice(0, 200);
        if (conM) refreshed.psychConcept = conM[1].trim().slice(0, 200);
        if (actM) refreshed.actionStrategy = actM[1].trim().slice(0, 240);
      } catch (e) { console.warn('mutation AI 4-field:', e); }
    }
  }
  // V4 (v8 묶음 19-J): 진화된 카드 시각 효과 stash — .just-evolved 클래스 부여 (CSS 샤랄라)
  if (refreshed) {
    state._justEvolvedCardId = refreshed.id;
  }
  saveState({ force: true });
  // V4 (v8 묶음 19-G): 토스트 단축
  showToast('🧬 전략 카드 진화 완료');
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof showScreen === 'function') showScreen('archive');
  // V4 (v8 묶음 19-J): Core 3-B step 2 try_evolved_card — 진화 직후 ✦ 해볼게 안내 (첫 경험만)
  if (state.tutorialShown && !state.tutorialShown.core3b_try) {
    setTimeout(() => {
      if (state.tutorialShown.core3b_try) return;
      const idx = ONBOARDING_STEPS.findIndex(s => s && s.id === 'try_evolved_card');
      if (idx < 0) return;
      _onbStep = idx;
      _onbTutorialMode = true;
      window._onbTutorialMode = true;
      _activeCoreId = 'core3b';
      if (typeof onbRenderStep === 'function') onbRenderStep();
    }, 800);
  }
}

// V4 (사용자 명시 2026-05-04): 돌연변이 깨달음 추출 ✓ 적용 완료 (v7 §11 / v8 §11)
// - 기능 A ✓: mutation-chat-input-row ✓ button → _extractMutationInsight({ trigger: 'manual' }) → state.archive type='mutation'
// - 기능 B ✓: maybeRunDailyChapterExtract 안 _mutationChatState 활성 + messages>=5 면 자동 추출
// - 데이터 모델: state.archive type='mutation' (도서관 깨달음 카테고리 6번째 sub-category)
// - 시각 구분: .archive-type-mutation CSS + CATS array 'mutation' 항목
// V4-fix v2: 보관 여부 결정 후 실제 미션 생성
function _completeMutationFinish(keepHistory) {
  if (!_mutationChatState) return;
  const sel = _mutationChatState.selectedRef;
  if (!sel) return;
  const card = getStrategyCard(_mutationChatState.strategyId);
  if (!card) { closeMutationChat(false); return; }
  const optMsg = _mutationChatState.messages[sel.msgIdx];
  if (!optMsg || optMsg.role !== 'options') return;
  const opt = (optMsg.options || [])[sel.optIdx];
  if (!opt) return;

  // 사용자 명시 2026-05-01: first-gen 변환 — 토픽 카드 category promote (옵션 선택 후만)
  if (_mutationChatState.firstGen && card.category !== 'strategy') {
    card.category = 'strategy';
  }

  _mutationChatState.chatRecord.messages = keepHistory ? _mutationChatState.messages.slice() : [];
  _mutationChatState.chatRecord.kept = !!keepHistory;
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  card.evolutionChats.push(_mutationChatState.chatRecord);

  mutateToNewGeneration(_mutationChatState.strategyId, opt.layer, opt.action);
  const refreshed = getStrategyCard(_mutationChatState.strategyId);
  const newGenIdx = (refreshed?.generations?.length || 1) - 1;
  createMission(opt.action, `🧬 ${card.title} — ${_LAYER_NAME[opt.layer] || opt.layer} 차원 진화`, {
    strategyId: _mutationChatState.strategyId,
    generationIdx: newGenIdx,
    linkedStrategy: card.title
  });

  saveState({ force: true });
  showToast(`🧬 새 가닥 등록 — ${_LAYER_NAME[opt.layer] || opt.layer} 차원. ${keepHistory ? '대화도 보관됨.' : ''} 홈 → 부름.`);
  closeMutationChat(true);
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof showScreen === 'function') showScreen('home');
}

// V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 돌연변이 깨달음 추출 — saveMsgAsInsight 와 메커니즘 100% 동일.
// "돌연변이 임시대화창에서 좋은 말 나오면 저장" — 마지막 AI 메시지 1개 에서 지혜 추출 → state.archive type='mutation' push.
