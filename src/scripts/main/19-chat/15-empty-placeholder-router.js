// hook-system spec (2026-05-18) — 챗 탭 empty placeholder 우선순위 라우터 + 일기 inline 카드 + 부재 후속 placeholder
// spec: _hook-system-spec.md §5-7
//
// 흐름:
//   1. showScreen('chat') 진입 시 → _evaluateChatEntryInjects() 호출
//   2. 챕터 마무리 5분 안 → inject 안 함 (default 만)
//   3. 일기 큐 unread 1개 → chatMessages 첫 자리 inject (isDiaryInlineCard)
//   4. 일기 큐 빈 + 1일+ 부재 + 5일 cooldown 통과 → chatMessages 첫 자리 inject (isAbsenceFollowup)
//   5. 02-render-message.js 가 inject 된 entry 의 isDiaryInlineCard / isAbsenceFollowup flag 보고 별도 카드 마크업 render
//   6. 일기 entry: 3초 자동 readAt + "못 본 척 하기" 버튼 (1일 cooldown)
//   7. 부재 후속: 메시지 첫 입력 시 splice (1회성). 렌더 시 lastAbsenceAcknowledgedAt set 으로 5일 cooldown 시작.
//   8. 챕터 archive 시 isDiaryInlineCard / isAbsenceFollowup 항목 자동 splice (archive 에 포함 X)

const _HSP_ABSENCE_THRESHOLD_MS = 24 * 60 * 60 * 1000;   // 1일+ 부재
const _HSP_ABSENCE_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000; // 5일 cooldown
const _HSP_DIARY_DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // dismiss 1일 cooldown
const _HSP_CHAPTER_END_GRACE_MS = 5 * 60 * 1000;         // 챕터 마무리 5분 grace
const _HSP_DIARY_READ_DELAY_MS = 3 * 1000;               // 3초 머묾 = 자동 read
const _HSP_DIARY_QUEUE_CAP = 30;                          // 큐 30개 cap

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — 평가 / 추출
// ─────────────────────────────────────────────────────────────────────────────

function _isWithinChapterEndGrace() {
  const t = state._chatChapterEndedAt;
  if (!t) return false;
  const ts = new Date(t).getTime();
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) < _HSP_CHAPTER_END_GRACE_MS;
}

function _pickUnreadDiaryEntry() {
  const queue = Array.isArray(state.godongDiaryQueue) ? state.godongDiaryQueue : [];
  if (queue.length === 0) return null;
  const now = Date.now();
  // unread = !readAt AND (!dismissedAt OR dismiss cooldown 통과)
  const candidates = queue.filter(e => {
    if (!e || e.readAt) return false;
    if (e.dismissedAt) {
      const dt = new Date(e.dismissedAt).getTime();
      if (!Number.isFinite(dt)) return true;
      return (now - dt) >= _HSP_DIARY_DISMISS_COOLDOWN_MS;
    }
    return true;
  });
  if (candidates.length === 0) return null;
  // oldest first (generatedAt ASC)
  candidates.sort((a, b) => {
    const at = new Date(a.generatedAt || 0).getTime();
    const bt = new Date(b.generatedAt || 0).getTime();
    return at - bt;
  });
  return candidates[0];
}

function _shouldShowAbsenceFollowup() {
  // 일기 큐 unread 있으면 X (spec L166-167)
  if (_pickUnreadDiaryEntry()) return false;
  const pref = state.preferences || {};
  const lastEntry = pref.lastChatTabEntryAt;
  if (!lastEntry) return false;  // 첫 진입 자체엔 부재 후속 X
  const lastEntryMs = new Date(lastEntry).getTime();
  if (!Number.isFinite(lastEntryMs)) return false;
  // 마지막 진입이 *이번 진입의 직전 진입* 이라 — 갱신 *전* 평가 보장: showScreen('chat') 안 lastChatTabEntryAt 갱신은 이 함수 호출 *전* 이므로,
  // 정확한 부재 계산 = 갱신 *전* lastChatTabEntryAt 와 now 비교 필요. showScreen 에서 evaluate → save → render 순서 따라야 함.
  // (현 navigation 코드: lastChatTabEntryAt = now → _evaluateChatEntryInjects() → saveState. 즉 이 함수가 호출될 땐 이미 now 로 갱신됨.)
  // → showScreen 에서 evaluate 를 *갱신 전* 으로 옮기는 게 정확. 단순화 위해 navigation 에서 갱신 전 evaluate 하도록 보장됨 (아래 patch 노트 참고).
  const now = Date.now();
  if ((now - lastEntryMs) < _HSP_ABSENCE_THRESHOLD_MS) return false;
  // 5일 cooldown
  const lastAck = state.lastAbsenceAcknowledgedAt;
  if (lastAck) {
    const ackMs = new Date(lastAck).getTime();
    if (Number.isFinite(ackMs) && (now - ackMs) < _HSP_ABSENCE_COOLDOWN_MS) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inject — chat tab entry 시점에 evaluate + chatMessages 첫 자리에 카드 entry inject
// ─────────────────────────────────────────────────────────────────────────────

function _evaluateChatEntryInjects() {
  if (!state || !Array.isArray(state.chatMessages)) return;
  // 기존 카드 항목 정리 — 중복 inject 방지 (같은 diaryId / 부재 후속)
  _cleanupChatCardInjects();

  // 챕터 마무리 5분 안 → default 만 (inject 안 함)
  if (_isWithinChapterEndGrace()) return;

  // 1. 일기 큐 unread
  const diaryEntry = _pickUnreadDiaryEntry();
  if (diaryEntry) {
    _injectDiaryInlineCard(diaryEntry);
    // 3초 자동 read — setTimeout 으로 silent set
    setTimeout(() => _markDiaryEntryRead(diaryEntry.id), _HSP_DIARY_READ_DELAY_MS);
    return;
  }

  // 2. 부재 후속 (일기 큐 빈 시만)
  if (_shouldShowAbsenceFollowup()) {
    _injectAbsenceFollowup();
    // 렌더 시점 = ack 시점 (5일 cooldown 시작)
    state.lastAbsenceAcknowledgedAt = new Date().toISOString();
    return;
  }
}

function _cleanupChatCardInjects() {
  if (!Array.isArray(state.chatMessages)) return;
  state.chatMessages = state.chatMessages.filter(m => m && !m.isDiaryInlineCard && !m.isAbsenceFollowup);
}

function _injectDiaryInlineCard(entry) {
  if (!entry || !entry.id) return;
  // 중복 가드
  const has = (state.chatMessages || []).some(m => m && m.isDiaryInlineCard && m.diaryId === entry.id);
  if (has) return;
  const card = {
    role: 'assistant',
    isDiaryInlineCard: true,
    diaryId: entry.id,
    content: entry.body || '',
    timestamp: new Date().toISOString(),
  };
  state.chatMessages.unshift(card);
}

function _injectAbsenceFollowup() {
  // 잠정 카피 — spec 15번 #1 본인 결정 자리. 사용자 후속 교체.
  const body = '며칠 만이네 ㅎㅎ 어디 갔다 왔어?';
  const card = {
    role: 'assistant',
    isAbsenceFollowup: true,
    content: body,
    timestamp: new Date().toISOString(),
  };
  state.chatMessages.unshift(card);
}

// ─────────────────────────────────────────────────────────────────────────────
// Read / Dismiss / Cleanup
// ─────────────────────────────────────────────────────────────────────────────

function _markDiaryEntryRead(id) {
  if (!id) return;
  const queue = Array.isArray(state.godongDiaryQueue) ? state.godongDiaryQueue : [];
  const entry = queue.find(e => e && e.id === id);
  if (!entry || entry.readAt) return;
  entry.readAt = new Date().toISOString();
  if (typeof saveState === 'function') { try { saveState(); } catch {} }
}

function dismissDiaryEntry(id) {
  if (!id) return;
  const queue = Array.isArray(state.godongDiaryQueue) ? state.godongDiaryQueue : [];
  const entry = queue.find(e => e && e.id === id);
  if (entry) entry.dismissedAt = new Date().toISOString();
  // chatMessages 에서 해당 카드 splice
  if (Array.isArray(state.chatMessages)) {
    state.chatMessages = state.chatMessages.filter(m => !(m && m.isDiaryInlineCard && m.diaryId === id));
  }
  if (typeof saveState === 'function') { try { saveState(); } catch {} }
  if (typeof renderChat === 'function') { try { renderChat(); } catch {} }
}

function _dismissAbsenceFollowupFromChat() {
  if (!Array.isArray(state.chatMessages)) return false;
  const before = state.chatMessages.length;
  state.chatMessages = state.chatMessages.filter(m => !(m && m.isAbsenceFollowup));
  return state.chatMessages.length !== before;
}

function pruneGodongDiaryQueue() {
  if (!Array.isArray(state.godongDiaryQueue)) return;
  if (state.godongDiaryQueue.length <= _HSP_DIARY_QUEUE_CAP) return;
  // generatedAt ASC 정렬 후 oldest prune (단, unread 우선 보존? — spec 단순: FIFO)
  state.godongDiaryQueue.sort((a, b) => new Date(a.generatedAt || 0).getTime() - new Date(b.generatedAt || 0).getTime());
  state.godongDiaryQueue = state.godongDiaryQueue.slice(-_HSP_DIARY_QUEUE_CAP);
}

// ─────────────────────────────────────────────────────────────────────────────
// 카드 마크업 — 02-render-message.js 가 isDiaryInlineCard / isAbsenceFollowup 분기에서 호출
// ─────────────────────────────────────────────────────────────────────────────

function _renderDiaryInlineCardHtml(m) {
  const body = (typeof escapeHtml === 'function') ? escapeHtml(m.content || '') : String(m.content || '');
  const id = m.diaryId || '';
  // spec 14번 #4: 헤더 없음 옵션. 본인 결정 자리.
  return `
    <div class="diary-inline-card" data-diary-id="${id}">
      <div class="dic-body">${body}</div>
      <button class="dic-dismiss" type="button" onclick="dismissDiaryEntry('${id}')">못 본 척 하기</button>
    </div>
  `;
}

function _renderAbsenceFollowupHtml(m) {
  const body = (typeof escapeHtml === 'function') ? escapeHtml(m.content || '') : String(m.content || '');
  return `
    <div class="absence-followup-card">
      <div class="afc-body">${body}</div>
    </div>
  `;
}
