// ═══════════════════════════════════════════════════════════════
// V6 HOME — Today's Shell, Night Mode, Conditional Decision, SOS
// ═══════════════════════════════════════════════════════════════

function isNightTime() {
  // Manual override first
  if (state.preferences?.nightModeManual === 'on') return true;
  if (state.preferences?.nightModeManual === 'off') return false;
  // Auto: 21:00 ~ DAY_CUTOFF_HOUR (4시) — 체크인 "그 날" 윈도우와 일치
  const hour = new Date().getHours();
  return hour >= 21 || hour < DAY_CUTOFF_HOUR;
}

function applyNightMode() {
  const isNight = isNightTime();
  document.body.classList.toggle('night-mode', isNight);
  // Update greeting based on time
  const hour = new Date().getHours();
  const greetingMain = document.getElementById('greetingMain');
  const greetingSub = document.getElementById('greetingSub');
  if (greetingMain && greetingSub) {
    // V3.7: greetingSub은 init에서 날짜로 설정됨. 여기선 main만 업데이트.
    if (isNight) {
      const greeting = hour >= 21 ? '오늘 수고했어 🌙' : '아직 깨어있구나 🌙';
      greetingMain.innerHTML = greeting + ' <span class="accent">✦</span>';
    } else {
      const greeting = hour < 11 ? '좋은 아침 ☀️' : hour < 18 ? '오후도 잘 🌤' : '저녁이네 🌅';
      greetingMain.innerHTML = greeting + ' <span class="accent">✦</span>';
    }
  }
}

// Main action card — 시간대에 따라 (밤=체크인 / 낮=실행) 자동 변경
function renderMainAction() {
  const container = document.getElementById('mainActionContainer');
  if (!container) return;

  // V3.13.x: 튜토리얼 모드면 시간대/체크인 여부 무관하게 체크인 카드 강제
  // (낮엔 체크인 카드가 작은 링크 또는 아예 없어서 튜토리얼 spotlight 못 잡힘)
  if (window._onbTutorialMode) {
    container.innerHTML = `
      <div class="action-card" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
        <div class="action-icon">✓</div>
        <div class="action-text">
          <div class="action-title">체크인</div>
          <div class="action-sub">매일 짧게 기록하는 곳</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
    return;
  }

  const isNight = isNightTime();
  const todayKeyVal = todayKey();
  const todayEntry = state.entries.find(e => e.date === todayKeyVal);
  const checkinDoneToday = !!(todayEntry && (todayEntry.vitality || todayEntry.note));
  
  // V3.13.x: 메인 카드 + 작은 체크인 링크 항상 (이미 했어도 들어가서 수정 가능)
  let mainCard;
  if (isNight && !checkinDoneToday) {
    // 밤 + 미체크인: 체크인 메인
    mainCard = `
      <div class="action-card" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
        <div class="action-icon">🌙</div>
        <div class="action-text">
          <div class="action-title">오늘 어땠어?</div>
          <div class="action-sub">하루를 차분히 닫아보자</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  } else {
    mainCard = `
      <div class="action-card" onclick="showScreen('execute')">
        <div class="action-icon">🚀</div>
        <div class="action-text">
          <div class="action-title">실행 시작하기</div>
          <div class="action-sub">머릿속 짐 → 오늘의 카드</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  }
  // 메인 카드가 체크인 아닐 때 항상 작은 링크 노출 (이미 했어도 수정 가능)
  let checkinSubLink = '';
  if (!(isNight && !checkinDoneToday)) {
    const label = checkinDoneToday ? '✓ 오늘 체크인 보기 / 수정' : '✨ 오늘 체크인하기 →';
    checkinSubLink = `<div onclick="enterCheckin()" style="font-size:12px; color:var(--text-dim); padding:10px 14px; text-align:center; cursor:pointer; margin-top:6px;">${label}</div>`;
  }
  container.innerHTML = mainCard + checkinSubLink;
  return;
  // legacy code below (unreachable, kept for git history reference)
  if (isNight) {
    if (checkinDoneToday) {
      container.innerHTML = '';
    } else {
      container.innerHTML = '';
    }
  }
}

// 마법의 소라고동 미니 링크 — 작지만 카드 모양
function renderDecisionMiniLink() {
  const container = document.getElementById('decisionMiniLinkContainer');
  if (!container) return;

  // 진행 중인 결정 개수
  const inProgressCount = (state.decisions || []).filter(d => d.status === 'in_progress').length;
  const subText = inProgressCount > 0 ? `숙성 중 ${inProgressCount}개` : '14일 숙성';

  container.innerHTML = `
    <div onclick="showScreen('decisions')" class="decision-mini-card">
      <div class="dm-icon"><img src="/godong.webp" alt="" class="godong-icon" decoding="async"></div>
      <div class="dm-text">
        <div class="dm-title">마법고동</div>
        <div class="dm-sub">${subText}</div>
      </div>
      <div class="dm-arrow">›</div>
    </div>
  `;
  // V4: 잠금 시각 갱신
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 0);
}

// V3.7: Today's Shell 제거 — 자존감 외부화 / habituation / Anti-sycophancy 충돌 우려.
// 함수는 stub으로 남김 (호출처가 어딘가 남아있을 경우 안전).
async function renderTodaysShell() { return; }
async function generateTodaysShellContent() { return ''; }
function refreshTodaysShell() { return; }

// V3.7: renderModeDisplay / expandModeRow — modeDisplay element가 HTML에 없음 (dead code).
// 안전을 위해 stub으로 유지. 실제 사용되는 함수는 renderModes.
function renderModeDisplay() {
  // mode-chip 상태 동기화는 renderModes가 처리함
  document.querySelectorAll('.mode-chip').forEach(c => {
    const m = c.dataset.mode;
    c.classList.toggle('active', !!state.modes[m]);
  });
}
function expandModeRow() { return; }

// Conditional decision card - only on action days (3/5/7/10/14)
function renderActiveDecisionsHomeV3() {
  const container = document.getElementById('activeDecisionsContainer');
  if (!container) return;
  
  const actionDays = [3, 5, 7, 10, 14];
  const inProgress = (state.decisions || []).filter(d => d.status === 'in_progress');
  
  // Card shows when:
  // (a) today is an action day (3/5/7/10/14), OR
  // (b) it WAS an action day before, but user hasn't visited since
  const cards = inProgress.filter(d => {
    const startTime = new Date(d.startedAt).getTime();
    const days = Math.floor((Date.now() - startTime) / 86400000);
    
    // Find the most recent action day reached
    let lastActionDay = null;
    for (const ad of actionDays) {
      if (ad <= days) lastActionDay = ad;
    }
    if (lastActionDay === null) return false;
    
    // Compute when that action day occurred
    const actionDayDate = new Date(startTime + lastActionDay * 86400000);
    
    // Has the user opened this decision since then?
    const lastInteraction = d.lastOpenedAt ? new Date(d.lastOpenedAt).getTime() : 0;
    
    // Show card if user hasn't interacted since the action day
    return lastInteraction < actionDayDate.getTime();
  });
  
  if (cards.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = cards.map(d => {
    const days = Math.floor((Date.now() - new Date(d.startedAt).getTime()) / 86400000);
    return `
      <div class="action-card decision" onclick="openDecision('${d.id}')">
        <div class="action-icon"><img src="/godong.webp" alt="" class="godong-icon" decoding="async"></div>
        <div class="action-text">
          <div class="action-title">결정 들여다볼 때야</div>
          <div class="action-sub">"${escapeHtml(d.title?.slice(0, 40) || '')}"</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  }).join('');
}

// SOS — 방전 비상구
async function triggerSOS() {
  const todayKeyVal = todayKey();
  const yes = await showConfirmModal({
    title: '오늘은 푹 쉬자 🐚',
    message: '체크인·미션·알림 모두 스킵하고\n하루를 닫을게.',
    okLabel: '쉴게',
    cancelLabel: '아니'
  });
  if (!yes) return;
  
  // Mark today as skipped
  let entry = state.entries.find(e => e.date === todayKeyVal);
  if (!entry) {
    entry = { date: todayKeyVal, sosSkipped: true, timestamp: new Date().toISOString() };
    state.entries.push(entry);
  } else {
    entry.sosSkipped = true;
  }
  
  // Set rest mode
  state.modes.rest = true;
  state.modeActiveSince.rest = todayKeyVal;
  
  saveState();
  showToast('잘했어. 오늘은 쉬는 거야 🐚');
  // Visual feedback - dim screen briefly
  document.body.style.transition = 'opacity 0.5s';
  document.body.style.opacity = '0.6';
  setTimeout(() => {
    document.body.style.opacity = '1';
    showScreen('home');
  }, 800);
}

// ═══════════════════════════════════════════════════════════════
// V4-1i: 🌊 REFLECTION QUESTIONS (숙고 질문 시스템)
// ───────────────────────────────────────────────────────────────
// V4 비전 8장 + anchor 30:
// - 사용자가 직접 적용한 큰 질문 1개 (active). AI 자동 큐레이션 X.
// - status: pending | active | paused | resolved
// - 결론은 사용자가 직접 적고 명시적으로 닫음 → archive에 type='reflection' 자동 push.
// - 작업 분량: V4-1i (1차) — 데이터 함수 + 홈 카드 + 추가/활성/결론 흐름.
//   숙고 전용 채팅 화면(screen-reflection)은 V4-1j로 분리.
// ═══════════════════════════════════════════════════════════════

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
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: _anthropicHeaders(),
        body: JSON.stringify({
          _endpoint: 'reflection',
          model: 'claude-haiku-4-5',
          max_tokens: 60,
          messages: [{ role: 'user', content: `다음 질문을 카드에 한 줄로 넣을 수 있게 짧게 요약. 10-25자, 명사형 또는 짧은 명제. 따옴표/마크다운 X.\n\n원본:\n${trimmed.slice(0, 300)}\n\n짧은 요약 한 줄만 출력.` }]
        })
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
function closeReflectionScreen() {
  _activeReflectionId = null;
  if (typeof showScreen === 'function') showScreen('home');
}

// V4-1j-b: 숙고 채팅 별도 화면 — 메인챗과 분리. q.chatMessages 사용.
let _activeReflectionId = null;

function openReflectionChat(qId) {
  const q = (state.reflectionQuestions || []).find(x => x.id === qId);
  if (!q) return;
  // 활성화 안 됐으면 먼저 활성화
  if (q.status === 'pending' || q.status === 'paused') {
    const others = (state.reflectionQuestions || []).filter(x => x.status === 'active');
    others.forEach(o => { o.status = 'pending'; });
    q.status = 'active';
    saveState();
  }
  _activeReflectionId = qId;
  showScreen('reflection');
  renderReflectionChat();
  // 결론 / 삭제 버튼 wire (V4-fix: 보류 → 삭제로 변경)
  const resolveBtn = document.getElementById('reflectionResolveBtn');
  if (resolveBtn) {
    resolveBtn.onclick = () => resolveReflectionQuestion(qId);
  }
  const delBtn = document.getElementById('reflectionDeleteBtn');
  if (delBtn) {
    delBtn.onclick = async () => {
      const ok = await confirmDelete('이 숙고 질문', '대화 내용도 같이 사라져.');
      if (!ok) return;
      deleteReflectionQuestion(qId);
      showScreen('home');
      showToast('🗑 삭제됨');
    };
  }
  // V4-fix: 헤더 = 짧은 요약 (긴 원본은 채팅 첫 메시지에)
  const qEl = document.getElementById('reflectionScreenQ');
  if (qEl) qEl.textContent = q.shortText || q.text;
}

function renderReflectionChat() {
  const container = document.getElementById('reflectionChatArea');
  if (!container) return;
  const q = (state.reflectionQuestions || []).find(x => x.id === _activeReflectionId);
  if (!q) {
    container.innerHTML = '<div style="text-align:center; color:var(--text-dim); padding:40px 20px;">활성 질문 없음.</div>';
    return;
  }
  if (!Array.isArray(q.chatMessages)) q.chatMessages = [];
  if (q.chatMessages.length === 0) {
    container.innerHTML = `
      <div class="msg assistant">
        <div class="msg-bubble">이 질문 같이 보자.\n\n답이 바로 안 나와도 OK. 다양한 각도에서 천천히 — 며칠, 몇 주 걸려도 돼.\n\n첫 한 줄, 떠오르는 생각이나 감각 적어봐.</div>
      </div>
    `;
    return;
  }
  container.innerHTML = q.chatMessages.map((m, i) => {
    const cls = m.role === 'user' ? 'user' : 'assistant';
    // V4-fix: AI 메시지에 ✦ 깨달음으로 버튼 (8.5)
    const insightBtn = (m.role === 'assistant' && !m.error)
      ? `<button class="reflection-msg-insight ${m.savedAsInsight ? 'saved' : ''}" onclick="saveReflectionMsgAsInsight('${q.id}', ${i})">${m.savedAsInsight ? '✦ 저장됨' : '✦ 깨달음으로'}</button>`
      : '';
    return `<div class="msg ${cls}">
      <div class="msg-bubble">${escapeHtml(m.content || '')}</div>
      ${insightBtn}
    </div>`;
  }).join('');
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 30);
}

// 사용자 요청 2026-04-29: 임시 대화창 (숙고/돌연변이/마법) → caseFormulation feed-in 헬퍼.
// 메인 chat은 매 응답 자동 추출, 임시 대화는 사용자가 ✦ 깨달음 누른 시점에만 (가벼운 탐색 본질 유지).
// confidence threshold 0.6 (메인 0.5보다 보수적) + caseFormulation 항목은 unverified 풀로 → 사용자 ✓로 컨펌.
// fail silent (사용자 흐름 방해 X). 키 없으면 skip.
// 사용자 명시 2026-05-01 ultrathink: ✦ 깨달음으로 공통 정리 헬퍼 (haiku).
// 4 핸들러 (메인 chat / 마법 helpChat / 숙고 chat / 돌연변이) 모두 같은 형식 archive entry.
// 반환: { headline, body } 또는 null (실패 시 fallback 으로 호출자 단순 slice).
async function summarizeForArchive(messageContent, userQuestion) {
  if (!_canAI()) return null;
  if (!messageContent || typeof messageContent !== 'string') return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({
        _endpoint: 'archive_summary',
        model: 'claude-haiku-4-5',
        max_tokens: 180,
        messages: [{ role: 'user', content: `아래 대화에서 사용자가 얻은 "지혜(깨달음)"를 뽑아.

[출력 — 정확히 두 줄]
1줄: 헤드라인 (5-14자, 명사형 또는 짧은 명제)
2줄: 본문 (1문장, 30-70자, 깨달음의 핵심을 ~음/~함/~임 어미로 끝맺음)

[좋은 예]
환경이 의지보다 강함
집중 안 될 때 자책 X. 카페로 옮기면 30% 더 됨.

거절은 빠를수록 가벼움
미루면 부채감 누적. 그날 안에 한 줄로 답하면 깨끗해짐.

새벽 결정 의심
졸린 상태 결정은 후회 빈도 ↑. 자고 일어난 후 다시 봐야 함.

[규칙]
- 본문 어미: ~음 / ~함 / ~임 (간결, 명제형). "이다" "하다" "되다" 등 X.
- "지혜" 추출: 사용자가 깨달은 것·앞으로 적용할 것
- 일반 응원·격언·"잘했어" X
- 마크다운/JSON/코드블록/따옴표/이모지 X
- "나는 ~다" 일반 서술 X

${userQuestion ? `[사용자 질문/맥락]\n${userQuestion.slice(0, 400)}\n` : ''}[AI 응답 (이 안에서 지혜 추출)]
${messageContent.slice(0, 1500)}

두 줄만 출력.` }]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    let raw = (data?.content?.[0]?.text || '').trim();
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
    raw = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      return {
        headline: lines[0].replace(/^["']|["']$/g, '').slice(0, 30),
        body: lines.slice(1).join(' ').replace(/^["']|["']$/g, '').slice(0, 200)
      };
    } else if (lines.length === 1) {
      return { headline: '', body: lines[0].replace(/^["']|["']$/g, '') };
    }
    return null;
  } catch (e) {
    console.warn('[summarizeForArchive] fail:', e);
    return null;
  }
}

async function extractAndApplyInsightToModel(insightText, userMsg, source) {
  try {
    if (!_canAI()) return;
    if (!insightText || typeof insightText !== 'string') return;
    const cleanInsight = insightText.trim();
    if (cleanInsight.length < 20) return;  // 너무 짧으면 추출 가치 X

    const prompt = `다음은 사용자가 "✦ 깨달음으로" 보관한 메시지야 (출처: ${source}).
사용자가 의도적으로 가치 있다고 판단한 텍스트라서 자기 인식 / 패턴 / 가치관 신호가 있을 수 있어.

[사용자 직전 발화]
${(userMsg || '').slice(0, 600) || '(없음)'}

[깨달음 메시지]
${cleanInsight.slice(0, 1200)}

이 깨달음에서 사용자가 자기 자신에 대해 새로 발견 / 명확히 한 것이 있으면 JSON으로 뽑아.
강한 신호 (명시적 자기 인식, 행동·감정 증거 동반) 만. 추측·일반론 X. 근거 약하면 빈 배열.

{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}],
  "case_formulation_update": {"new_problem": "...", "new_mechanism": "...", "new_strength": "...", "new_goal": "...", "new_growth": "..."}
}

JSON만, 다른 글 X.`;

    const resp = await callAnthropic({
      _endpoint: 'extract_chapter',
      // 사용자 요청 2026-04-30 (재조정): 깨달음 버튼 ~10/일 자주 호출 → "자주 안 하는 거 = Opus" 원칙 따라 sonnet 복원.
      // 정확도는 confidence 0.5 threshold + user_verified ✓ 컨펌 흐름으로 보호.
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const raw = data?.content?.[0]?.text || '';
    const jm = raw.match(/\{[\s\S]*\}/);
    if (!jm) return;
    let analysis;
    try { analysis = JSON.parse(jm[0]); } catch { return; }
    if (!analysis || typeof analysis !== 'object') return;

    // 사용자 요청 2026-04-29: "임시" 대화도 깊이 있는 내용 → 메인 chat과 동일 0.5 threshold.
    // unverified 마킹은 유지 → 사용자 ✓ 컨펌 흐름.
    const THRESHOLD = 0.5;
    let touched = false;

    if (Array.isArray(analysis.new_traits)) {
      analysis.new_traits.forEach(t => {
        if (!t || !t.name || typeof t.name !== 'string') return;
        const conf = typeof t.confidence === 'number' ? t.confidence : 0;
        const exists = (state.traits || []).find(e => similarText(e.name, t.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.traits = state.traits || [];
          state.traits.push({
            id: 'trait_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: t.name.trim(), description: (t.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: source,
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }

    if (Array.isArray(analysis.new_values)) {
      analysis.new_values.forEach(v => {
        if (!v || !v.name || typeof v.name !== 'string') return;
        const conf = typeof v.confidence === 'number' ? v.confidence : 0;
        const exists = (state.values || []).find(e => similarText(e.name, v.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.values = state.values || [];
          state.values.push({
            id: 'val_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: v.name.trim(), description: (v.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            sdt_need: v.sdt_need || null,
            extractedFrom: source,
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }

    if (Array.isArray(analysis.new_patterns)) {
      analysis.new_patterns.forEach(p => {
        if (!p || !p.name || typeof p.name !== 'string') return;
        const conf = typeof p.confidence === 'number' ? p.confidence : 0;
        const exists = (state.patterns || []).find(e => similarText(e.name, p.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.patterns = state.patterns || [];
          state.patterns.push({
            id: 'pat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: p.name.trim(), description: (p.description || '').trim(),
            trigger: (p.trigger || '').trim(), sequence: (p.sequence || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: source,
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }

    // case formulation → 메인 풀에 push + unverified 마킹 (사용자 ✓로 컨펌)
    const u = analysis.case_formulation_update;
    if (u && typeof u === 'object') {
      const cf = state.caseFormulation = state.caseFormulation || { version: 0, lastUpdated: null, problems: [], mechanisms: [], strengths: [], goals: [], growth: [], unverified: {} };
      if (!cf.unverified) cf.unverified = {};
      const fields = [
        ['new_problem', 'problems'],
        ['new_mechanism', 'mechanisms'],
        ['new_strength', 'strengths'],
        ['new_goal', 'goals'],
        ['new_growth', 'growth']
      ];
      fields.forEach(([key, bucket]) => {
        const txt = u[key];
        if (!txt || typeof txt !== 'string') return;
        const trimmed = txt.trim();
        if (!trimmed) return;
        if (!Array.isArray(cf[bucket])) cf[bucket] = [];
        if (cf[bucket].some(x => similarText(x, trimmed))) return;
        cf[bucket].push(trimmed);
        if (!Array.isArray(cf.unverified[bucket])) cf.unverified[bucket] = [];
        cf.unverified[bucket].push(trimmed);
        touched = true;
      });
      if (touched) {
        cf.version = (cf.version || 0) + 1;
        cf.lastUpdated = new Date().toISOString();
      }
    }

    if (touched) {
      saveState();
      // 모델 화면 열려 있으면 새로고침 (선택)
      if (typeof renderModel === 'function') {
        try { renderModel(); } catch {}
      }
    }
  } catch (e) {
    // silent — 사용자 흐름 방해 X
    console.warn('[insight extract] fail:', e);
  }
}

// 사용자 요청 2026-04-30: 매 메시지 자동 추출 → 챕터 마무리 시점만.
// 사용자 명시 2026-05-02 ultrathink: prompt builder + analysis processor 분리 — Batch API path 가 재사용.
function _buildExtractChapterPrompt(messages) {
  const chatLog = messages.map(m => {
    const role = m.role === 'user' ? '나' : '소라';
    let content = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim();
    content = content.replace(/\{[\s\S]*"(?:new_traits|insight|extracted_tasks)[\s\S]*\}\s*$/g, '').trim();
    return `${role}: ${content}`;
  }).join('\n\n');

  return `사용자가 AI 친구 "소라고동"과 한 챕터(연속 대화 묶음)에서 나눈 대화 전체.
챕터 전반에 걸쳐 발견된 사용자 자기 인식 / 패턴 / 가치관 / 문제·강점·목표를 JSON으로 추출.
강한 신호 (명시적 자기 인식, 행동·감정 증거 동반)만. 추측·일반론 X. 근거 약하면 빈 배열.

[필터 — 자동 거름]
- trivial 일상 (음식·날씨·일정·단순 사건·짧은 잡담) X. 일회성 진술 / 농담 / 일반론 X.
- 사용자 명시 발화 ("나는 ..." / "내가 ... 하더라" / "그때 ... 느꼈어") + 행동·감정 증거 1+ 함께일 때만 추출.
- confidence < 0.6 항목 빈 배열로 (강한 신호 아니면 등록 X).
- 각 description 끝에 사용자 실제 발화 1줄 인용 (예: 'description: 거절 후 부채감 — "거절했더니 미안한 마음이 며칠 가더라"').

[대화 원문]
${chatLog.slice(0, 8000)}

[출력 — JSON만]
{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}],
  "case_formulation_update": {"new_problem": "...", "new_mechanism": "...", "new_strength": "...", "new_goal": "...", "new_growth": "..."},
  "deep_profile_update": {
    "development": {
      "childhood_addition": "어린 시절·가족·양육에 대한 새 정보 한 줄 (있을 때만, 사용자가 명시 언급)",
      "school_addition": "학창 시절 새 정보 한 줄",
      "adhd_addition": "자기 인식·발견 새 정보 한 줄 (진단명 발견 / 큰 깨달음 / 정체성 명명 등 — 사용자가 명시 언급한 것만)",
      "turning_point": {"when": "YYYY-MM 또는 시기", "title": "전환점 제목", "impact": "영향 한 줄"}
    },
    "relationships": [{"name": "이름 (있을 때)", "relation": "가족|친구|연인|동료|전문가|기타", "tone": "안전|자극|혼합", "influence": "positive|negative|mixed", "notes": "한 줄"}],
    "self_narrative": {
      "self_belief": "자신에 대한 신념 한 줄 (\"나는 ...\")",
      "world_belief": "세상에 대한 신념 한 줄 (\"세상은 ...\")",
      "future_belief": "미래에 대한 신념 한 줄 (\"미래는 ...\")",
      "identity_keyword": "정체성 keyword 1개"
    }
  }
}

deep_profile_update는 사용자가 챕터에서 명시적으로 언급한 정보만 (예: "엄마가 늘 비교해" / "그때 진단 받은 후 시야가 달라졌어" / "나는 패턴 인식이 강해"). 추측 X. 빈 부분은 빈 string 또는 null.

JSON만, 마크다운 X.`;
}

// analysis JSON 객체 받아 state 갱신. true 반환 시 saveState 권장.
function _processExtractChapterAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  let touched = false;
  // 사용자 명시 2026-05-03 ultrathink: trivial 노이즈 cut — 0.5 → 0.6 (강한 신호만 등록).
  const THRESHOLD = 0.6;

    if (Array.isArray(analysis.new_traits)) {
      analysis.new_traits.forEach(t => {
        if (!t || !t.name) return;
        const conf = typeof t.confidence === 'number' ? t.confidence : 0.5;
        const exists = (state.traits || []).find(e => similarText(e.name, t.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.traits = state.traits || [];
          state.traits.push({
            id: 'trait_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: t.name.trim(), description: (t.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: 'chapter',
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }
    if (Array.isArray(analysis.new_values)) {
      analysis.new_values.forEach(v => {
        if (!v || !v.name) return;
        const conf = typeof v.confidence === 'number' ? v.confidence : 0.5;
        const exists = (state.values || []).find(e => similarText(e.name, v.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.values = state.values || [];
          state.values.push({
            id: 'val_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: v.name.trim(), description: (v.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            sdt_need: v.sdt_need || null,
            extractedFrom: 'chapter',
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }
    if (Array.isArray(analysis.new_patterns)) {
      analysis.new_patterns.forEach(p => {
        if (!p || !p.name) return;
        const conf = typeof p.confidence === 'number' ? p.confidence : 0.5;
        const exists = (state.patterns || []).find(e => similarText(e.name, p.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.patterns = state.patterns || [];
          state.patterns.push({
            id: 'pat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: p.name.trim(), description: (p.description || '').trim(),
            trigger: (p.trigger || '').trim(), sequence: (p.sequence || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: 'chapter',
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }
    const u = analysis.case_formulation_update;
    if (u && typeof u === 'object') {
      const cf = state.caseFormulation = state.caseFormulation || { version: 0, lastUpdated: null, problems: [], mechanisms: [], strengths: [], goals: [], growth: [], unverified: {} };
      if (!cf.unverified) cf.unverified = {};
      const fields = [
        ['new_problem', 'problems'],
        ['new_mechanism', 'mechanisms'],
        ['new_strength', 'strengths'],
        ['new_goal', 'goals'],
        ['new_growth', 'growth']
      ];
      fields.forEach(([key, bucket]) => {
        const txt = u[key];
        if (!txt || typeof txt !== 'string') return;
        const trimmed = txt.trim();
        if (!trimmed) return;
        if (!Array.isArray(cf[bucket])) cf[bucket] = [];
        if (cf[bucket].some(x => similarText(x, trimmed))) return;
        cf[bucket].push(trimmed);
        // 챕터 자동 추출 = unverified 마킹
        if (!Array.isArray(cf.unverified[bucket])) cf.unverified[bucket] = [];
        cf.unverified[bucket].push(trimmed);
        touched = true;
      });
      if (touched) {
        cf.version = (cf.version || 0) + 1;
        cf.lastUpdated = new Date().toISOString();
      }
    }

    // 사용자 요청 2026-04-30: deep_profile_update 자동 추출 (Q2 더 깊은 나).
    // 사용자가 챕터에서 명시 언급한 발달·관계·자기서사 정보만. user_verified=false → 사용자 ✓ 컨펌.
    const dpu = analysis.deep_profile_update;
    if (dpu && typeof dpu === 'object') {
      if (!state.userDeepProfile) state.userDeepProfile = JSON.parse(JSON.stringify(DEFAULT_STATE.userDeepProfile));
      const udp = state.userDeepProfile;
      let dpuTouched = false;
      // development 추가 — append (기존 텍스트에 누적)
      if (dpu.development && typeof dpu.development === 'object') {
        if (!udp.development) udp.development = { childhood: '', schoolYears: '', adhdDiscovery: '', turningPoints: [] };
        const appendIfNew = (current, addition) => {
          if (!addition || typeof addition !== 'string') return current;
          const t = addition.trim();
          if (!t) return current;
          if ((current || '').includes(t)) return current;
          return (current ? current + '\n' : '') + t;
        };
        const newCh = appendIfNew(udp.development.childhood, dpu.development.childhood_addition);
        if (newCh !== udp.development.childhood) { udp.development.childhood = newCh; dpuTouched = true; }
        const newSc = appendIfNew(udp.development.schoolYears, dpu.development.school_addition);
        if (newSc !== udp.development.schoolYears) { udp.development.schoolYears = newSc; dpuTouched = true; }
        const newAd = appendIfNew(udp.development.adhdDiscovery, dpu.development.adhd_addition);
        if (newAd !== udp.development.adhdDiscovery) { udp.development.adhdDiscovery = newAd; dpuTouched = true; }
        // turning_point — 단일 객체
        const tp = dpu.development.turning_point;
        if (tp && tp.title && typeof tp.title === 'string') {
          if (!Array.isArray(udp.development.turningPoints)) udp.development.turningPoints = [];
          const exists = udp.development.turningPoints.find(t => similarText(t.title, tp.title));
          if (!exists) {
            udp.development.turningPoints.push({
              id: 'tp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              when: (tp.when || '?').toString().slice(0, 30),
              title: tp.title.slice(0, 60),
              description: '',
              impact: (tp.impact || '').slice(0, 100),
              extractedFrom: 'chapter',
              user_verified: false
            });
            dpuTouched = true;
          }
        }
      }
      // relationships
      if (Array.isArray(dpu.relationships)) {
        if (!Array.isArray(udp.relationships)) udp.relationships = [];
        dpu.relationships.forEach(r => {
          if (!r || !r.name || typeof r.name !== 'string') return;
          const exists = udp.relationships.find(e => similarText(e.name, r.name));
          if (!exists) {
            udp.relationships.push({
              id: 'rel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              name: r.name.trim().slice(0, 30),
              relation: (r.relation || '').slice(0, 20),
              tone: (r.tone || '').slice(0, 20),
              influence: (r.influence || '').slice(0, 20),
              notes: (r.notes || '').slice(0, 100),
              extractedFrom: 'chapter',
              user_verified: false
            });
            dpuTouched = true;
          }
        });
      }
      // self_narrative — beliefs + identity keyword
      if (dpu.self_narrative && typeof dpu.self_narrative === 'object') {
        if (!udp.selfNarrative) udp.selfNarrative = { selfStory: '', coreBeliefs: { aboutSelf: [], aboutWorld: [], aboutFuture: [] }, howWantToBeSeen: '', identityKeywords: [] };
        if (!udp.selfNarrative.coreBeliefs) udp.selfNarrative.coreBeliefs = { aboutSelf: [], aboutWorld: [], aboutFuture: [] };
        const cb = udp.selfNarrative.coreBeliefs;
        const sn = dpu.self_narrative;
        const pushBelief = (arrKey, txt) => {
          if (!txt || typeof txt !== 'string') return;
          const t = txt.trim();
          if (!t) return;
          if (!Array.isArray(cb[arrKey])) cb[arrKey] = [];
          if (!cb[arrKey].some(s => similarText(s, t))) {
            cb[arrKey].push(t.slice(0, 100));
            dpuTouched = true;
          }
        };
        pushBelief('aboutSelf', sn.self_belief);
        pushBelief('aboutWorld', sn.world_belief);
        pushBelief('aboutFuture', sn.future_belief);
        if (sn.identity_keyword && typeof sn.identity_keyword === 'string') {
          if (!Array.isArray(udp.selfNarrative.identityKeywords)) udp.selfNarrative.identityKeywords = [];
          const kw = sn.identity_keyword.trim().slice(0, 30);
          if (kw && !udp.selfNarrative.identityKeywords.some(k => similarText(k, kw))) {
            udp.selfNarrative.identityKeywords.push(kw);
            dpuTouched = true;
          }
        }
      }
      if (dpuTouched) {
        udp.version = (udp.version || 0) + 1;
        udp.lastUpdated = new Date().toISOString();
        touched = true;
      }
    }

  return touched;
}

// 일반 path — 5h+ 갭 즉시 (신규유저 첫 3 챕터). 또는 batch fallback timeout 시.
async function extractChapterCaseAnalysis(messages) {
  try {
    if (!_canAI()) return;
    if (window._onbTutorialMode) return;
    if (state.preferences && state.preferences.testerMode) return;
    if (!Array.isArray(messages) || messages.length < 3) return;

    const prompt = _buildExtractChapterPrompt(messages);
    const resp = await callAnthropic({
      _endpoint: 'extract_chapter',
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const raw = data?.content?.[0]?.text || '';
    const jm = raw.match(/\{[\s\S]*\}/);
    if (!jm) return;
    let analysis;
    try { analysis = JSON.parse(jm[0]); } catch { return; }

    const touched = _processExtractChapterAnalysis(analysis);

    if (touched) {
      saveState();
      if (typeof renderModel === 'function') {
        try { renderModel(); } catch {}
      }
    }
  } catch (e) {
    console.warn('[chapter case extract] fail:', e);
  }
}

// 사용자 요청 2026-04-29: 임시대화 (숙고/마법) close 시 → 도서관 토픽 카드 자동 추출.
// 메인 chat extractPreviousChapterTopics 패턴 통일. background, fail silent.
// source: 'reflection' | 'magic_help', sourceId: 추출 중복 방지 키 (q.id 또는 decision:step), context: 짧은 컨텍스트 라벨.
async function extractTopicsFromTempChat(messages, source, sourceId, context) {
  try {
    if (!_canAI()) return;
    if (!Array.isArray(messages) || messages.length < 4) return;
    if (window._onbTutorialMode) return;
    if (state.preferences && state.preferences.testerMode) return;

    // 이미 같은 sourceId로 추출됐으면 skip (중복 prompt + 중복 비용 방지)
    const dupKey = `${source}:${sourceId}`;
    if (Array.isArray(state.topicCards) && state.topicCards.some(c => c.tempChatKey === dupKey)) return;

    const chatLog = messages.map(m => {
      const role = m.role === 'user' ? '나' : '소라';
      let content = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim();
      content = content.replace(/\{[\s\S]*"(?:new_traits|new_values)[\s\S]*\}\s*$/g, '').trim();
      return `${role}: ${content}`;
    }).join('\n\n');

    const sourceLabel = source === 'reflection' ? '🌊 숙고 (사용자가 한 질문에 대해 깊이 파고드는 임시 대화)'
      : source === 'magic_help' ? '🌀 마법 도움 받기 (큰 결정의 한 단계에서 도움 요청한 임시 대화)'
      : '임시 대화';

    const prompt = `사용자가 AI 친구 "소라고동"과 ${sourceLabel} 모드에서 나눈 대화를 토픽 카드로 정리해.

[컨텍스트] ${context || '(없음)'}

[대화 원문]
${chatLog.slice(0, 8000)}

[토픽 카드 추출 규칙]
- 의미 있는 토픽 1-3개 (잡담은 X)
- 카테고리 (V4 8 카테고리): diary | casual | concern | emotion | memory | todo | idea | relationship
- 각 카드: 짧은 제목 (~25자) + 1-2문장 요약
- 의미 없으면 빈 배열

[출력 형식 — JSON만]
{ "topics": [ { "title": "...", "summary": "...", "category": "concern" } ] }

JSON만, 마크다운 X.`;

    const resp = await callAnthropic({
      _endpoint: 'extract_topic',
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let text = (data?.content?.[0]?.text || '').trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return;
    const parsed = JSON.parse(m[0]);
    if (!parsed.topics || !Array.isArray(parsed.topics)) return;

    if (!Array.isArray(state.topicCards)) state.topicCards = [];
    const _dayKey = todayKey();
    const nowIso = new Date().toISOString();
    let pushed = 0;
    parsed.topics.forEach(t => {
      if (!t || !t.title) return;
      const title = String(t.title).trim().slice(0, 60);
      if (!title) return;
      // 정확 동일 제목 + 같은 sourceId면 중복 방지
      if (state.topicCards.some(c => c.title === title && c.tempChatKey === dupKey)) return;
      state.topicCards.push({
        id: 'tc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title,
        summary: String(t.summary || '').trim().slice(0, 300),
        category: ['diary','casual','concern','emotion','memory','todo','idea','relationship'].includes(t.category) ? t.category : 'casual',
        date: _dayKey,
        createdAt: nowIso,
        source: source,           // 'reflection' / 'magic_help'
        tempChatKey: dupKey,      // 중복 방지 키
        sourceLabel: sourceLabel.split(' ')[0]
      });
      pushed += 1;
    });
    if (pushed > 0) {
      saveState();
      if (typeof renderArchive === 'function') {
        try { renderArchive(); } catch {}
      }
    }
  } catch (e) {
    console.warn('[temp topic extract] fail:', e);
  }
}

// V4-fix: 숙고 채팅 안 AI 메시지를 ✦ 깨달음(reflection)으로 archive에 저장
async function saveReflectionMsgAsInsight(qId, msgIdx) {
  const q = (state.reflectionQuestions || []).find(x => x.id === qId);
  if (!q || !Array.isArray(q.chatMessages)) return;
  const msg = q.chatMessages[msgIdx];
  if (!msg || msg.savedAsInsight) return;

  if (!Array.isArray(state.archive)) state.archive = [];
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  // 직전 user 메시지 찾기
  let priorUserMsg = '';
  for (let i = msgIdx - 1; i >= 0; i--) {
    if (q.chatMessages[i]?.role === 'user') { priorUserMsg = q.chatMessages[i].content; break; }
  }

  // 사용자 명시 2026-05-01 ultrathink: haiku 정리 (4 ✦ 핸들러 일관 형식)
  const summary = await summarizeForArchive(msg.content, priorUserMsg);
  const headline = (summary && summary.headline) ? summary.headline : (q.shortText || q.text).slice(0, 30);
  const body = (summary && summary.body) ? summary.body : (msg.content || '').slice(0, 200);

  state.archive.unshift({
    type: 'reflection',
    headline,
    body,
    insight: body,
    original: msg.content,
    question: priorUserMsg,
    date,
    source: '🌊 숙고',
    savedAt: new Date().toISOString(),
    tags: ['숙고'],
    reflectionQuestionId: qId
  });
  msg.savedAsInsight = true;
  saveState();
  renderReflectionChat();
  showToast('✦ 깨달음에 저장됐어');
  // 사용자 요청 2026-04-29: 임시 대화 → caseFormulation feed-in (background, fail silent)
  extractAndApplyInsightToModel(msg.content, priorUserMsg, 'reflection').catch(() => {});
}

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
  const recentMsgs = q.chatMessages.slice(-12).map(m => ({
    role: m.role,
    content: m.content
  }));
  const sysPrompt = `한 질문에 대한 깊은 숙고를 함께 하는 동반자.

[숙고 질문]
"${q.text}"

[톤 / 원칙 — 진지 모드]
- 잡담 X. 답 강요 X. **가벼운 ㅋㅋ / 농담 / 짧은 한 줄 리액션 ❌**.
- 다양한 각도에서 끈질기게 (가치 / 두려움 / 욕구 / 시간 스케일 / 외부 압력 / 네 기록 패턴).
- 오랜 침묵 OK. 사용자 페이스 따라.
- 결론 내려주지 X. 사용자 자기 발견 유도.
- 외재화 톤. "너 X적이야" X.
- 1-3문장 짧게. 차분한 친구 반말.
- 금지어: 대박/아이고/힘내/화이팅/할 수 있어/오늘도 멋진 하루/대단해.

[모드 sticky — 매우 중요]
숙고 = 큰 물음 안고 며칠 살아보는 도구. **무조건 진지 모드 유지**.
- 사용자가 "응" / "맞아" / "그러게" / "음" 같은 짧은 응답 보내도 가벼운 톤으로 튀지 X.
- 짧은 응답 = "듣고 있다 / 정리 중" 신호. 같은 차분한 톤으로 한 적용하자 호흡 주기.
- 의심 시: 이전 응답의 톤 유지가 default.

[네 일]
사용자가 새로 적은 한 줄을 받고, 그 각도로 한 발짝 더 들어가는 질문 1-2개 또는 짧은 관찰 한 줄.`;

  try {
    // 사용자 요청 2026-04-29: prompt caching 적용 (1024 token 미달 시 Anthropic이 자동 무시 — 안전)
    // 사용자 요청 2026-04-30 비용절감: 숙고 응답 opus → sonnet (사용자 헤비 사용 = 가장 큰 비용 driver였음).
    const resp = await callAnthropic({
        _endpoint: 'reflection',
        // 사용자 명시 2026-04-30 (정정): 헤더 모델 토글 = 모든 대화 영향. useOpus 따르기.
        model: (state.preferences && state.preferences.useOpus) ? 'claude-opus-4-7' : 'claude-sonnet-4-6',
        max_tokens: 400,
        // 사용자 요청 2026-04-29 비용절감: 1h cache TTL
        system: [{ type: 'text', text: sysPrompt, cache_control: { type: 'ephemeral' } }],
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

