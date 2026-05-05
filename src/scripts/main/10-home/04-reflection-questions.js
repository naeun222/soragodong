function renderReflectionHome() {
  const container = document.getElementById('reflectionContainer');
  if (!container) return;
  const all = state.reflectionQuestions || [];
  const active = all.find(q => q.status === 'active');

  // V4: render 후 잠금 시각 갱신
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 0);

  // V4-fix: 한 번에 하나씩 — active 1개만 표시. pending/paused/더 깊이 볼 거 링크 제거.
  if (!active) {
    container.innerHTML = `
      <div class="reflection-empty-card" onclick="addReflectionQuestion()">
        🌊 숙고해보고 싶은 질문 있어? <span style="color:var(--accent2);">+ 추가</span>
      </div>
    `;
    return;
  }

  // V4-fix: 카드 안에 다 보이게 shortText (AI 요약) 우선 표시
  const display = active.shortText || active.text;
  container.innerHTML = `
    <div class="reflection-active-card" onclick="openReflectionChat('${active.id}')">
      <span class="reflection-active-icon">🌊</span>
      <span class="reflection-active-text">${escapeHtml(display)}</span>
      <span class="reflection-active-arrow">›</span>
    </div>
  `;
}

async function addReflectionQuestion(text) {
  // V4-fix: 한 번에 하나씩 — active 있으면 차단
  const all = state.reflectionQuestions || (state.reflectionQuestions = []);
  const activeQ = all.find(q => q.status === 'active');
  if (activeQ) {
    showToast('이미 숙고 중인 질문 있어. 결론 내거나 보류 후 시작.');
    openReflectionChat(activeQ.id);
    return null;
  }

  let qText = text;
  if (!qText) {
    qText = await showInputModal({
      title: '🌊 숙고 질문 추가',
      message: '깊이 보고 싶은 질문 한 줄. 답이 바로 안 나와도 OK — 시간 들여 숙성.',
      placeholder: '예: 이 일 계속할지 / 이 관계 계속할지 / 내가 진짜 원하는 게 뭔지',
      multiline: true,
      maxLength: 300,
      okLabel: '추가'
    });
  }
  if (!qText || !qText.trim()) return null;

  const trimmed = qText.trim();

  // V4-fix: 짧은 카드 표시용 AI 요약 (10-25자)
  let shortText = trimmed.length <= 30 ? trimmed : '';
  if (!shortText && _canAI()) {
    try {
      const resp = await callAnthropic({
        _endpoint: 'reflection',
        model: 'claude-haiku-4-5',
        max_tokens: 60,
        messages: [{ role: 'user', content: `다음 질문을 카드에 한 줄로 넣을 수 있게 짧게 요약. 10-25자, 명사형 또는 짧은 명제. 따옴표/마크다운 X.\n\n원본:\n${trimmed.slice(0, 300)}\n\n짧은 요약 한 줄만 출력.` }]
      });
      const data = await resp.json();
      const raw = (data.content?.[0]?.text || '').trim().replace(/^["'\s]+|["'\s]+$/g, '').replace(/\*\*/g, '');
      if (raw && raw.length <= 40) shortText = raw;
    } catch (e) { console.warn('reflection short summary failed:', e); }
  }
  if (!shortText) shortText = trimmed.slice(0, 28) + (trimmed.length > 28 ? '…' : '');

  const newQ = {
    id: 'rq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text: trimmed,
    shortText,
    createdAt: new Date().toISOString(),
    source: 'manual',
    sourceMsgIdx: null,
    status: 'active',
    resolvedAt: null,
    conclusion: null,
    chatMessages: []
  };
  all.push(newQ);
  saveState();
  renderReflectionHome();
  showToast('🌊 숙고 시작');
  return newQ;
}

async function activateReflectionQuestion(id) {
  const all = state.reflectionQuestions || [];
  const q = all.find(x => x.id === id);
  if (!q) return;
  if (q.status === 'active') return;
  if (q.status === 'resolved') {
    showToast('이미 결론 내린 질문이야');
    return;
  }
  // 기존 active 있으면 paused로 자동 강등 (chatMessages 보존). confirm 모달 X (사용자가 picker에서 명시적 선택했으므로 중복).
  const currentActive = all.find(x => x.status === 'active');
  if (currentActive) currentActive.status = 'paused';
  q.status = 'active';
  saveState();
  renderReflectionHome();
  showToast(currentActive ? '🌊 활성화 — 이전 질문은 보류로' : '🌊 활성화됨');
}

async function pauseReflectionQuestion(id) {
  const q = (state.reflectionQuestions || []).find(x => x.id === id);
  if (!q) return;
  q.status = 'paused';
  saveState();
  renderReflectionHome();
  showToast('⏸ 보류 — "더 깊이 볼 거" 목록에서 다시 시작 가능');
}

async function resolveReflectionQuestion(id) {
  const q = (state.reflectionQuestions || []).find(x => x.id === id);
  if (!q) return;
  const conclusion = await showInputModal({
    title: '✓ 결론',
    message: `"${q.text}"\n\n지금까지 보고 느낀 결론을 한두 문장으로.`,
    placeholder: '예: 다음 학기까지 가보고 그때 결정',
    multiline: true,
    maxLength: 500,
    okLabel: '결론 내고 닫기 ✦'
  });
  if (!conclusion || !conclusion.trim()) return;

  const trimmed = conclusion.trim();
  q.status = 'resolved';
  q.conclusion = trimmed;
  q.resolvedAt = new Date().toISOString();

  // 사용자 명시 2026-05-01 ultrathink: 숙고 결론 = 마법 endChapter 와 동일 메커니즘.
  // 1) 결론 = 사용자 명시 archive push (즉시)
  // 2) 대화 messages = chatArchive 이송 (_pendingExtract:true) → 4AM 일괄 처리 시 case+topic 추출 + archive 숙고 타입 자동 push
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  if (!Array.isArray(state.archive)) state.archive = [];
  state.archive.unshift({
    type: 'reflection',
    headline: q.text.slice(0, 30),
    body: trimmed.slice(0, 200),
    insight: `${q.text} → ${trimmed}`,
    userMemo: trimmed,
    tags: ['숙고', '결론'],
    date,
    source: '🌊 숙고',
    savedAt: q.resolvedAt,
    reflectionQuestionId: q.id
  });

  // 대화 messages 가 충분히 있으면 chatArchive 이송 (4AM 일괄 처리)
  const realMessages = Array.isArray(q.chatMessages)
    ? q.chatMessages.filter(m => !m.typing && !m.error)
    : [];
  if (realMessages.length >= 3) {
    if (!Array.isArray(state.chatArchive)) state.chatArchive = [];
    const firstTs = realMessages[0] && realMessages[0].timestamp;
    const dateKey = firstTs ? getDayKey(firstTs) : todayKey();
    state.chatArchive.unshift({
      id: 'arch_refl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: dateKey,
      summary: `🌊 숙고: ${(q.shortText || q.text || '').slice(0, 24)}`,
      messageCount: realMessages.length,
      messages: realMessages.slice(),
      generatedAt: new Date().toISOString(),
      source: 'reflection_chat',
      reflectionQuestionId: q.id,
      _pendingExtract: true
    });
    q.chatMessages = [];  // 이송 후 비움
    if (typeof pruneOldChatArchive === 'function') pruneOldChatArchive();
  }

  saveState();
  renderReflectionHome();
  if (typeof renderArchive === 'function') renderArchive();
  showToast(`✓ 숙고 결론 — 깨달음에 보관 ✦`);
}

function deleteReflectionQuestion(id) {
  const all = state.reflectionQuestions || [];
  const idx = all.findIndex(x => x.id === id);
  if (idx === -1) return;
  all.splice(idx, 1);
  saveState();
  renderReflectionHome();
}

// 사용자 명시 2026-05-01 ultrathink: closeReflectionScreen 의 confirm + 자동 archive 저장 / 토픽 추출 폐기.
// 단순 닫기만 — 명시 저장은 결론 (resolveReflectionQuestion) 흐름에서.
