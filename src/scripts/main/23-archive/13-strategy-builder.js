function addManualStrategy() {
  openStrategyBuilder();
}

let _strategyBuilderState = null;  // { messages: [], parsed: null }

function openStrategyBuilder() {
  _strategyBuilderState = { messages: [], parsed: null };
  // 첫 AI 가이드
  _strategyBuilderState.messages.push({
    role: 'assistant',
    content: '🧬 전략 DNA 같이 만들자.\n\n어떤 상황에서 막혀? 한 줄로 적어봐 — 네가 자주 마주치는 패턴이나 풀고 싶은 고민.'
  });
  const overlay = document.createElement('div');
  overlay.id = 'strategyBuilder';
  overlay.className = 'sb-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeStrategyBuilder(); };
  overlay.innerHTML = `
    <div class="sb-modal" onclick="event.stopPropagation()">
      <div class="sb-header">
        <div class="sb-title">🧬 전략 DNA 같이 만들기</div>
        <button class="sb-close" onclick="closeStrategyBuilder()">×</button>
      </div>
      <div class="sb-chat" id="sbChat"></div>
      <div class="sb-save-row" id="sbSaveRow" style="display:none;">
        <button class="sb-save-btn" onclick="saveStrategyFromBuilder()">✨ 이걸로 DNA 카드 저장</button>
      </div>
      <div class="sb-input-bar">
        <textarea id="sbInput" class="sb-textarea" placeholder="한 줄 적어..." rows="1"></textarea>
        <button class="sb-send" onclick="sbSendMessage()">↑</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  renderStrategyBuilderChat();
  setTimeout(() => document.getElementById('sbInput')?.focus(), 100);
}

function closeStrategyBuilder() {
  const el = document.getElementById('strategyBuilder');
  if (el) el.remove();
  _strategyBuilderState = null;
}

function renderStrategyBuilderChat() {
  const c = document.getElementById('sbChat');
  if (!c || !_strategyBuilderState) return;
  c.innerHTML = _strategyBuilderState.messages.map(m => {
    const cls = m.role === 'user' ? 'sb-msg-user' : 'sb-msg-ai';
    return `<div class="sb-msg ${cls}">${escapeHtml(m.content || '')}</div>`;
  }).join('');
  c.scrollTop = c.scrollHeight;
  // parsed가 있으면 저장 버튼 노출
  document.getElementById('sbSaveRow').style.display = _strategyBuilderState.parsed ? 'block' : 'none';
}

async function sbSendMessage() {
  const input = document.getElementById('sbInput');
  const text = (input?.value || '').trim();
  if (!text || !_strategyBuilderState) return;
  _strategyBuilderState.messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  renderStrategyBuilderChat();

  if (!_canAI()) {
    // 사용자 보고 2026-04-30: Phase C 후 키 모델 폐기 — 로그인이 게이트.
    _strategyBuilderState.messages.push({ role: 'assistant', content: '(로그인이 안 되어있어. 다시 로그인 해줘.)' });
    renderStrategyBuilderChat();
    return;
  }

  // typing indicator
  _strategyBuilderState.messages.push({ role: 'assistant', content: '...' });
  renderStrategyBuilderChat();

  // 시스템 prompt: 4단 + JSON 같이 출력
  const recentMsgs = _strategyBuilderState.messages
    .filter(m => m.content !== '...')
    .slice(-8)
    .map(m => ({ role: m.role, content: m.content }));

  const sys = `"전략 DNA" 카드를 같이 만드는 동반자.

[흐름]
1. 사용자가 막히는 상황 한 줄 적음.
2. 한두 번 짧게 더 묻고 (예: 빈도/맥락/가치). 너무 많이 묻지 X (1-2턴).
3. 4단 정리해서 사용자에게 보여줌 — TITLE/PROBLEM/CONCEPT/ACTION
4. JSON도 같이 출력 (사용자에겐 보이고, 코드가 파싱)

[톤]
- 친구 반말, 1-3문장, 외재화
- 칭찬 X, 단정 X, 결론 강요 X
- 금지어: 대박/힘내/화이팅/할 수 있어/멋져/대단해

[4단 출력 형식 (3-4 turn 후, 사용자가 충분히 적었을 때)]
응답 본문 + 마지막에 다음 JSON (코드블록 \`\`\`json):
{
  "TITLE": "5-14자 명사형 명제",
  "PROBLEM": "문제 상황 50-90자",
  "CONCEPT": "심리학 개념 + 1줄 설명 30-80자",
  "ACTION": "구체 행동 50-120자"
}

JSON 안 적용하면 4단 정리 X — 더 묻기. 사용자가 충분히 답한 후에만 JSON.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({
        _endpoint: 'analyze_4stage',
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: sys,
        messages: recentMsgs
      })
    });
    const data = await resp.json();
    let aiText = data.content?.[0]?.text?.trim() || '(응답 비어있어)';

    // typing 제거
    _strategyBuilderState.messages.pop();

    // JSON 추출
    const jm = aiText.match(/```json\s*([\s\S]*?)```/);
    let parsed = null;
    if (jm) {
      try {
        const obj = JSON.parse(jm[1]);
        if (obj.TITLE || obj.title) {
          parsed = {
            title: (obj.TITLE || obj.title || '').slice(0, 30),
            problemContext: (obj.PROBLEM || obj.problem || '').slice(0, 200),
            psychConcept: (obj.CONCEPT || obj.concept || '').slice(0, 200),
            actionStrategy: (obj.ACTION || obj.action || '').slice(0, 240)
          };
        }
      } catch (e) { console.warn('sb JSON parse:', e); }
      // JSON 블록 제거하고 본문만 표시
      aiText = aiText.replace(/```json[\s\S]*?```/g, '').trim();
    }

    _strategyBuilderState.messages.push({ role: 'assistant', content: aiText });
    if (parsed) _strategyBuilderState.parsed = parsed;
    renderStrategyBuilderChat();
  } catch (e) {
    console.warn('sb AI failed:', e);
    _strategyBuilderState.messages.pop();
    _strategyBuilderState.messages.push({ role: 'assistant', content: '(AI 응답 실패 — 잠시 후 다시 보내봐)' });
    renderStrategyBuilderChat();
  }
}

function saveStrategyFromBuilder() {
  if (!_strategyBuilderState || !_strategyBuilderState.parsed) return;
  const p = _strategyBuilderState.parsed;
  const now = new Date().toISOString();
  const summary = [p.problemContext, p.psychConcept, p.actionStrategy].filter(Boolean).join(' / ');
  if (!Array.isArray(state.topicCards)) state.topicCards = [];
  state.topicCards.push({
    id: 'strat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    category: 'strategy',
    title: p.title,
    summary,
    problemContext: p.problemContext,
    psychConcept: p.psychConcept,
    actionStrategy: p.actionStrategy,
    chapterStartedAt: now,
    chapterEndedAt: now,
    createdAt: now,
    messageCount: _strategyBuilderState.messages.length,
    source: 'builder',
    generations: [{
      gen: 1, layer: 'L2',
      action: p.actionStrategy || p.title,
      missions: [], shells: [], attempts: [],
      status: 'working'
    }],
    embodimentStatus: 'seedling',
    embodimentPath: null,
    evolutionChats: []
  });
  saveState();
  closeStrategyBuilder();
  if (typeof renderArchive === 'function') renderArchive();
  showToast('🧬 전략 DNA 카드 저장됨');
}

// === LENS 1: TIMELINE — 일기 통합 (체크인 + 대화 + 아카이브 깨달음) ===
