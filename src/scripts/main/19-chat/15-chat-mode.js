// V4 사용자 명시 2026-05-22 ultrathink — 대화탭 3 모드 시스템 (CHAT-MODE-DESIGN.md).
//   모드: 'daily' (일상고동) / 'inquiry' (고민고동, 마법사 모자) / 'vent' (마음고동, amber 아우라).
//   메모리: state.preferences.useRag (기존). ON 시 안경 overlay.
//   합성: amber 아우라(back) → 표정 base → 모자(top) → 안경(top). 모자만 viewBox 위로 25% 튀어나옴 (4:5 비율).
//   null state = default 일상고동 visual (모자 X, 아우라 X). 사용자가 chip 또는 시트로 명시 선택해야 모드 set.

// 12 표정 ID 풀 — system prompt expression 필드와 1:1 매칭. 풀에 없는 ID 는 serious fallback.
const CHAT_MODE_EXPRESSIONS = new Set([
  'serious', 'soft-smile', 'bright-smile', 'laugh', 'surprised',
  'curious', 'thinking', 'tilt', 'empathic', 'warm', 'nod', 'focused'
]);

// 표정 파일 경로 — 'serious' 만 public/character/ 에, 나머지는 public/expressions/.
function _chatModeExprPath(expression) {
  const e = CHAT_MODE_EXPRESSIONS.has(expression) ? expression : 'serious';
  return e === 'serious' ? '/character/godong-serious.svg' : `/expressions/godong-${e}.svg`;
}

// 4 layer 합성 — HTML string 반환. 호출처가 element.innerHTML 또는 template literal 에 삽입.
//   { mode: 'daily'|'inquiry'|'vent'|null, useGlasses: bool, expression: '...' }
//   mode null 또는 'daily' = 모자 X, 아우라 X (= 일상고동 default).
function composedCharacterHtml({ mode, useGlasses, expression } = {}) {
  const showAura = mode === 'vent';
  const showHat  = mode === 'inquiry';
  const showGlasses = !!useGlasses;
  const exprSrc = _chatModeExprPath(expression || 'serious');
  let html = '';
  if (showAura) {
    html += `<img class="char-layer aura" src="/expressions/godong-aura-amber.svg" alt="" aria-hidden="true">`;
  }
  html += `<img class="char-layer base" src="${exprSrc}" alt="" aria-hidden="true">`;
  if (showHat) {
    html += `<img class="char-layer hat" src="/expressions/godong-wizard-hat-overlay.svg" alt="" aria-hidden="true">`;
  }
  if (showGlasses) {
    html += `<img class="char-layer glasses" src="/expressions/godong-glasses-overlay.svg" alt="" aria-hidden="true">`;
  }
  return html;
}

// 헤더 캐릭터 visual — 대화탭일 때만 사용. updateMainHeaderBtnVisual 의 대화탭 분기에서 호출.
//   state.chatMode + state.preferences.useRag → 6 variants (3 모드 × 2 메모리). 평온 표정 only.
function updateModeHeaderVisual(btn) {
  if (!btn) return;
  const mode = (state && state.chatMode) || null;   // null → default daily visual
  const useGlasses = state?.preferences?.useRag !== false;  // default ON
  btn.classList.remove('rag-on', 'rag-off', 'rag-blink', 'brand-only', 'opus',
                       'mode-daily', 'mode-inquiry', 'mode-vent');
  btn.classList.add('is-mode');
  // halo 색 — null 도 daily 색으로 통일 (default 일상고동).
  const halo = (mode === 'inquiry') ? 'mode-inquiry'
             : (mode === 'vent')    ? 'mode-vent'
             : 'mode-daily';
  btn.classList.add(halo);
  btn.innerHTML = composedCharacterHtml({ mode, useGlasses, expression: 'serious' });
  const label = (mode === 'inquiry') ? '물어보기'
              : (mode === 'vent')    ? '털어놓기'
              : '얘기하기';
  const memo  = useGlasses ? '· 기억 ON' : '· 기억 OFF';
  btn.setAttribute('aria-label', `대화 모드 ${label} ${memo}`);
  btn.setAttribute('title', `${label} ${memo} — 누르면 변경`);
}

// 헤더 클릭 dispatch — 대화탭 + Plus/Premium 자격 검사 후 시트 open.
function onChatModeHeaderClick() {
  // 게스트 = 결제 유도.
  if (typeof state !== 'undefined' && state && state.isGuest) {
    if (typeof showGuestConversionModal === 'function') showGuestConversionModal({ reason: 'rag_toggle' });
    return;
  }
  // Plan 검사 — Plus/Premium 만.
  const billing = window._billingCache;
  const plan = billing?.subscription_plan;
  const active = !!billing?.subscription_active;
  const ragEligible = active && (plan === 'light' || plan === 'premium');
  if (!ragEligible) return;
  openChatModeSheet();
}

// ─── 모드 선택 시트 (popover) ─────────────────────────────────────
//   §4 — 세로 카드 스택 (3 모드) + 메모리 토글. transform-origin = 헤더 캐릭터.
//   클릭: 즉시 모드 set + 헤더 morph + 토스트 short label. 시트 안 닫힘.
//   닫기: ✕ / 바깥 탭 / ESC.
const CHAT_MODE_CARDS = [
  { id: 'daily',   label: '오늘 하루 어땠는지 얘기하기',           toast: '얘기하기' },
  { id: 'inquiry', label: '어떻게 해야할지 모르겠을 때 물어보기', toast: '물어보기' },
  { id: 'vent',    label: '마음이 심란할 때 털어놓기',             toast: '털어놓기' }
];

function openChatModeSheet() {
  if (document.getElementById('chatModeSheetOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'chatModeSheetOverlay';
  overlay.className = 'chat-mode-sheet-overlay';
  overlay.innerHTML = `
    <div class="chat-mode-sheet" role="dialog" aria-modal="true">
      <button class="chat-mode-sheet-close" type="button" aria-label="닫기" onclick="closeChatModeSheet()">✕</button>
      <div class="chat-mode-sheet-cards" id="chatModeSheetCards"></div>
      <div class="chat-mode-sheet-divider"></div>
      <div class="chat-mode-sheet-memo">
        <label class="chat-mode-sheet-memo-label">
          <span class="chat-mode-sheet-memo-text">옛 챕터 기억</span>
          <button type="button" id="chatModeMemoToggle" class="chat-mode-memo-toggle" role="switch" aria-checked="false" onclick="toggleChatModeMemory()">
            <span class="chat-mode-memo-thumb"></span>
          </button>
        </label>
        <div class="chat-mode-sheet-memo-hint" id="chatModeMemoHint"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _renderChatModeSheetCards();
  _renderChatModeSheetMemoState();
  // 바깥 탭 닫기.
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeChatModeSheet(); });
  // ESC 닫기.
  const escHandler = (e) => { if (e.key === 'Escape') { closeChatModeSheet(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
  overlay._escHandler = escHandler;
  // 진입 트랜지션 — next frame 에 .open 클래스.
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeChatModeSheet() {
  const overlay = document.getElementById('chatModeSheetOverlay');
  if (!overlay) return;
  if (overlay._escHandler) {
    try { document.removeEventListener('keydown', overlay._escHandler); } catch {}
  }
  overlay.classList.remove('open');
  // 트랜지션 끝나면 제거. CSS 200ms 와 일치.
  setTimeout(() => { overlay.remove(); }, 220);
}

function _renderChatModeSheetCards() {
  const wrap = document.getElementById('chatModeSheetCards');
  if (!wrap) return;
  const current = (state && state.chatMode) || null;
  wrap.innerHTML = CHAT_MODE_CARDS.map(card => {
    const selected = (card.id === current);
    return `<button type="button"
        class="chat-mode-card ${selected ? 'selected' : ''} mode-${card.id}"
        data-mode="${card.id}"
        aria-pressed="${selected ? 'true' : 'false'}"
        onclick="selectChatMode('${card.id}')">
      ${card.label}
    </button>`;
  }).join('');
}

function _renderChatModeSheetMemoState() {
  const btn = document.getElementById('chatModeMemoToggle');
  const hint = document.getElementById('chatModeMemoHint');
  if (!btn || !hint) return;
  const on = state?.preferences?.useRag !== false;
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  hint.textContent = on ? '안경 쓴 고동이가 너를 기억해' : '이번 대화만 기억해';
}

function selectChatMode(mode) {
  if (!mode || (mode !== 'daily' && mode !== 'inquiry' && mode !== 'vent')) return;
  if (!state) return;
  const prev = state.chatMode || null;
  // V4 사용자 명시 2026-05-23 — 같은 모드 재선택 = deselect (null 로 복귀, 기본 상태). 토스트 silent.
  const next = (prev === mode) ? null : mode;
  state.chatMode = next;
  try { saveState(); } catch {}
  // 시트 카드 재렌더 + 헤더 캐릭터 morph + empty placeholder 텍스트 swap + 기존 메시지 아바타 morph.
  _renderChatModeSheetCards();
  if (typeof updateMainHeaderBtnVisual === 'function') updateMainHeaderBtnVisual();
  if (typeof updateChatEmptyState === 'function') updateChatEmptyState();
  _refreshAllMsgAvatars();
  // 신규 선택 시만 토스트. deselect 는 silent (사용자가 명시 의도).
  if (next && next !== prev) {
    const card = CHAT_MODE_CARDS.find(c => c.id === next);
    if (card && typeof showToast === 'function') showToast(card.toast);
  }
}

// V4 사용자 명시 2026-05-23 — 모드 변경 시 chatMessages 안 모든 AI 메시지 아바타도 morph (renderChat 전체 X, light DOM update).
function _refreshAllMsgAvatars() {
  if (typeof composedCharacterHtml !== 'function') return;
  const mode = (state && state.chatMode) || null;
  const html = composedCharacterHtml({ mode, useGlasses: false, expression: 'serious' });
  document.querySelectorAll('.msg.assistant .msg-avatar').forEach(av => {
    av.innerHTML = html;
  });
}

// ─── empty placeholder (chip + mode-aware 안내) ──────────────────
//   호출 시점: 화면 진입 / 메시지 send / textarea input / selectChatMode / mode toggle.
//   조건:
//     A) chatMessages 비어있고 screen-chat 활성 → empty state 보임.
//     B) A + chatMode === null + textarea 비어있음 → chip 보임. 한 번 chip 누르면 모드 set + chip hide.
//     C) A + (chatMode === null || chatMode === 'daily') → ⓘ 일기 안내 아이콘 보임.
const _CHAT_EMPTY_LINES = {
  daily:   { l1: '편하게 말해 보소', l2: '오늘 하루 어땠는지 궁금하오' },
  inquiry: { l1: '편하게 말해 보소', l2: '고민이 무엇인가' },
  vent:    { l1: '편하게 말해 보소', l2: '다 괜찮다. 난 여기 있으니.' }
};
// V4 사용자 명시 2026-05-23 — textarea placeholder 도 모드별 swap.
const _CHAT_TA_PLACEHOLDERS = {
  daily:   '오늘 하루 어땠는지 궁금하오',
  inquiry: '고민이 무엇인가',
  vent:    '다 괜찮다. 난 여기 있으니.'
};
function updateChatEmptyState() {
  // ─── 1. textarea placeholder 갱신 — chat 화면 활성/비활성 무관. 모드 바뀌면 즉시 반영. ───
  const ta = document.getElementById('chatInput');
  if (ta) {
    const mode = (state && state.chatMode) || 'daily';
    ta.placeholder = _CHAT_TA_PLACEHOLDERS[mode] || _CHAT_TA_PLACEHOLDERS.daily;
  }
  // ─── 2. empty state element (chip + 안내) visibility + line text. chat 화면 + chatMessages 비어있을 때만. ───
  const el = document.getElementById('chatEmptyState');
  if (!el) return;
  const screenChat = document.getElementById('screen-chat');
  const isChatActive = screenChat && screenChat.classList.contains('active');
  const chatMsgs = document.getElementById('chatMessages');
  const isEmpty = !!chatMsgs && chatMsgs.children.length === 0;
  if (!isChatActive || !isEmpty) {
    el.hidden = true;
    const hint = document.getElementById('chatEmptyDiaryHint');
    if (hint) hint.hidden = true;
    return;
  }
  el.hidden = false;
  const mode = (state && state.chatMode) || 'daily';
  const lines = _CHAT_EMPTY_LINES[mode] || _CHAT_EMPTY_LINES.daily;
  const line1 = document.getElementById('chatEmptyLine1');
  const line2 = document.getElementById('chatEmptyLine2');
  if (line1) line1.textContent = lines.l1;
  if (line2) line2.textContent = lines.l2;
  // ⓘ 일기 안내 — daily 또는 null (= daily 시각) 일 때만.
  const showDiaryInfo = !state?.chatMode || state.chatMode === 'daily';
  const info = document.getElementById('chatEmptyDiaryInfo');
  if (info) info.hidden = !showDiaryInfo;
  if (!showDiaryInfo) {
    const hint = document.getElementById('chatEmptyDiaryHint');
    if (hint) hint.hidden = true;
  }
  // chip — chatMode null + textarea 비어있을 때만.
  const chips = document.getElementById('chatEmptyChips');
  if (chips) {
    const ta = document.getElementById('chatInput');
    const taEmpty = !ta || !ta.value || ta.value.length === 0;
    const showChips = !state?.chatMode && taEmpty;
    chips.hidden = !showChips;
  }
}

function onChatEmptyChip(mode) {
  selectChatMode(mode);
  // 시트와 다르게 empty placeholder 의 chip 누르면 텍스트 swap + chip hide (chatMode set 됐으니 자동).
  updateChatEmptyState();
}

function toggleChatEmptyDiaryInfo() {
  const hint = document.getElementById('chatEmptyDiaryHint');
  if (!hint) return;
  hint.hidden = !hint.hidden;
}

// chatMessages mutation → empty state 자동 갱신. send / receive / chapter clear 모두 cover.
document.addEventListener('DOMContentLoaded', () => {
  const cm = document.getElementById('chatMessages');
  if (cm && typeof MutationObserver !== 'undefined') {
    try {
      new MutationObserver(() => {
        if (typeof updateChatEmptyState === 'function') updateChatEmptyState();
      }).observe(cm, { childList: true });
    } catch (e) { console.warn('[chat-mode] chatMessages observer:', e); }
  }
});

function toggleChatModeMemory() {
  if (!state) return;
  state.preferences = state.preferences || {};
  const currentlyOn = state.preferences.useRag !== false;
  state.preferences.useRag = !currentlyOn;
  state.preferences._ragToggleSeen = true;
  try { saveState(); } catch {}
  _renderChatModeSheetMemoState();
  if (typeof updateMainHeaderBtnVisual === 'function') updateMainHeaderBtnVisual();
  if (typeof showToast === 'function') {
    showToast(state.preferences.useRag
      ? '✨ 옛 챕터 기억 ON — 다음 메시지부터 적용'
      : '🪶 옛 챕터 기억 OFF');
  }
  // RAG 처음 ON 시 옛 archive 자동 백필 — 옛 onMainHeaderToggleClick 동작 유지.
  if (state.preferences.useRag && typeof _ragBackfillAll === 'function') {
    setTimeout(() => { _ragBackfillAll().catch(e => console.warn('[rag] backfill:', e)); }, 100);
  }
}
