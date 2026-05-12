async function sendReflectionChat() {
  const input = document.getElementById('reflectionInput');
  const text = (input?.value || '').trim();
  if (!text) return;
  const q = (state.reflectionQuestions || []).find(x => x.id === _activeReflectionId);
  if (!q) return;
  if (!Array.isArray(q.chatMessages)) q.chatMessages = [];

  q.chatMessages.push({
    role: 'user',
    content: text,
    timestamp: new Date().toISOString()
  });
  input.value = ''; input.style.height = 'auto';
  saveState();
  renderReflectionChat();

  // 사용자 요청 2026-04-30: apiKey 빈 상태 + session 활성 시 백엔드 프록시.
  if (!_canAI() &&(typeof session === 'undefined' || !session?.access_token)) {
    q.chatMessages.push({
      role: 'assistant',
      content: '(로그인이 필요해요. 새로고침 후 다시 시도해주세요.)',
      timestamp: new Date().toISOString()
    });
    saveState();
    renderReflectionChat();
    return;
  }

  // V4 비전 8.4: 숙고 전용 시스템 prompt (페르소나 분석 OFF)
  // 사용자 요청 2026-04-29: 진지 모드 강화 + sticky 룰 (짧은 응답에도 톤 유지)
  // 사용자 명시 2026-05-11 ultrathink: system prompt backend 이전 — buildReflectionSystem 가 _vars.questionText 받아 합성.
  //   1h cache_control 보존.
  const recentMsgs = q.chatMessages.slice(-12).map(m => ({
    role: m.role,
    content: m.content
  }));

  try {
    // 사용자 요청 2026-04-29: prompt caching 적용 (1024 token 미달 시 Anthropic이 자동 무시 — 안전)
    // 사용자 요청 2026-04-30 비용절감: 숙고 응답 opus → sonnet (사용자 헤비 사용 = 가장 큰 비용 driver였음).
    const resp = await callAnthropic({
        _endpoint: 'reflection',
        _vars: { questionText: q.text },
        // V4 (사용자 명시 2026-05-13): per-room useOpus — q.useOpus (이 질문 한정). Premium 만 활성 가능 (canUseOpus 가드).
        model: (q.useOpus && typeof canUseOpus === 'function' && canUseOpus()) ? 'claude-opus-4-7' : 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: recentMsgs
    });
    const data = await resp.json();
    const aiText = data.content?.[0]?.text?.trim() || '(응답 비어있어)';
    q.chatMessages.push({
      role: 'assistant',
      content: aiText,
      timestamp: new Date().toISOString()
    });
    saveState();
    renderReflectionChat();
  } catch (e) {
    console.warn('reflection AI failed:', e);
    q.chatMessages.push({
      role: 'assistant',
      content: '(AI 응답 실패 — 잠시 후 다시 보내봐)',
      error: true,
      timestamp: new Date().toISOString()
    });
    saveState();
    renderReflectionChat();
  }
}

// 간단 목록 모달 (V4-1i 1차 — 별도 화면 X). pending/paused/resolved 보기.
async function showReflectionList() {
  const all = state.reflectionQuestions || [];
  if (all.length === 0) {
    addReflectionQuestion();
    return;
  }
  const grouped = {
    active:   all.filter(q => q.status === 'active'),
    pending:  all.filter(q => q.status === 'pending'),
    paused:   all.filter(q => q.status === 'paused'),
    resolved: all.filter(q => q.status === 'resolved')
  };
  const STATUS_LABEL = { active: '🌊 진행 중', pending: '⏳ 대기', paused: '⏸ 보류', resolved: '✓ 결론' };
  let listHtml = '<div class="reflection-list-modal-content">';
  listHtml += `<div class="reflection-list-title">🌊 숙고 질문</div>`;
  listHtml += `<button class="reflection-add-new" onclick="closeReflectionListModal(); addReflectionQuestion();">+ 새 질문</button>`;
  ['active', 'pending', 'paused', 'resolved'].forEach(s => {
    const qs = grouped[s];
    if (!qs.length) return;
    listHtml += `<div class="reflection-list-group">`;
    listHtml += `<div class="reflection-list-group-label">${STATUS_LABEL[s]} · ${qs.length}</div>`;
    qs.forEach(q => {
      const cls = `reflection-list-item status-${q.status}`;
      // V4-fix: 항목 = 보관소. 클릭 액션 X. inline ✎ 수정 / ✕ 삭제만.
      const conclusion = q.conclusion ? `<div class="reflection-list-conclusion">→ ${escapeHtml(q.conclusion.slice(0, 80))}${q.conclusion.length > 80 ? '…' : ''}</div>` : '';
      listHtml += `
        <div class="${cls}">
          <div class="reflection-list-text">${escapeHtml(q.text)}</div>
          ${conclusion}
          <div class="reflection-list-actions">
            <button class="reflection-list-edit" onclick="editReflectionItem('${q.id}')" title="수정">✎</button>
            <button class="reflection-list-del" onclick="confirmDeleteReflection('${q.id}')" title="삭제">✕</button>
          </div>
        </div>
      `;
    });
    listHtml += `</div>`;
  });
  listHtml += '</div>';

  const overlay = document.createElement('div');
  overlay.id = 'reflectionListModal';
  overlay.className = 'topic-modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeReflectionListModal(); };
  overlay.innerHTML = `
    <div class="topic-modal" onclick="event.stopPropagation()" style="max-height:80vh; overflow-y:auto;">
      <button class="topic-modal-close" onclick="closeReflectionListModal()">×</button>
      ${listHtml}
    </div>
  `;
  document.body.appendChild(overlay);
  // V4-fix: opacity 0 → 1 (.show 클래스 안 적용하면 안 보임 = 먹통 버그)
  setTimeout(() => overlay.classList.add('show'), 20);
}

function closeReflectionListModal() {
  const el = document.getElementById('reflectionListModal');
  if (el) el.remove();
}

async function confirmDeleteReflection(id) {
  if (!await confirmDelete('이 숙고 질문', '히스토리에서 영구 삭제됩니다.')) return;
  deleteReflectionQuestion(id);
  // 모달 안에 있으면 새로고침 (전체 닫지 X)
  if (document.getElementById('reflectionListModal')) {
    closeReflectionListModal();
    showReflectionList();
  }
}

// V4-fix: 숙고 항목 텍스트 수정 (resolved면 결론도 수정)
async function editReflectionItem(id) {
  const q = (state.reflectionQuestions || []).find(x => x.id === id);
  if (!q) return;
  const newText = await showInputModal({
    title: '🌊 질문 수정',
    defaultValue: q.text,
    multiline: true,
    maxLength: 300,
    okLabel: '저장'
  });
  if (newText === null) return;
  const t = newText.trim();
  if (!t) return;
  q.text = t;
  if (q.status === 'resolved' && q.conclusion) {
    const newConcl = await showInputModal({
      title: '✓ 결론 수정 (선택)',
      message: '비워둬도 OK',
      defaultValue: q.conclusion,
      multiline: true,
      maxLength: 500,
      okLabel: '저장'
    });
    if (newConcl !== null && newConcl.trim()) q.conclusion = newConcl.trim();
  }
  saveState();
  // 모달 새로고침
  if (document.getElementById('reflectionListModal')) {
    closeReflectionListModal();
    showReflectionList();
  }
  if (typeof renderReflectionHome === 'function') renderReflectionHome();
  showToast('수정됨 ✦');
}

function openResolvedReflection(id) {
  const q = (state.reflectionQuestions || []).find(x => x.id === id);
  if (!q) return;
  showConfirmModal({
    title: '✓ 결론',
    message: `${q.text}\n\n→ ${q.conclusion || '(결론 없음)'}`,
    okLabel: '닫기',
    cancelLabel: ''
  });
}

// V4-fix: 항목 picker — 자동 교체 X, 사용자가 옵션 선택
async function showReflectionItemActions(id) {
  const q = (state.reflectionQuestions || []).find(x => x.id === id);
  if (!q) return;
  const options = [];
  if (q.status === 'active') {
    options.push({ label: '💬 이어서 숙고', value: 'open' });
    options.push({ label: '✓ 결론 내고 닫기', value: 'resolve' });
    options.push({ label: '⏸ 보류', value: 'pause' });
  } else if (q.status === 'pending' || q.status === 'paused') {
    options.push({ label: '🌊 이걸로 숙고 시작', value: 'activate' });
  } else if (q.status === 'resolved') {
    options.push({ label: '👁 결론 보기', value: 'view' });
  }
  options.push({ label: '🗑 삭제', value: 'delete' });
  options.push({ label: '취소', value: 'cancel' });

  const action = await showOptionsModal({
    title: q.text.length > 40 ? q.text.slice(0, 40) + '…' : q.text,
    options
  });
  if (!action || action === 'cancel') return;
  if (action === 'open') {
    closeReflectionListModal();
    openReflectionChat(id);
  } else if (action === 'resolve') {
    closeReflectionListModal();
    resolveReflectionQuestion(id);
  } else if (action === 'pause') {
    pauseReflectionQuestion(id);
    closeReflectionListModal();
    showReflectionList();  // 새로고침
  } else if (action === 'activate') {
    closeReflectionListModal();
    await activateReflectionQuestion(id);
    // 활성화 후 바로 숙고 채팅 열기 (사용자 흐름 자연스러움)
    openReflectionChat(id);
  } else if (action === 'view') {
    closeReflectionListModal();
    openResolvedReflection(id);
  } else if (action === 'delete') {
    confirmDeleteReflection(id);
  }
}

