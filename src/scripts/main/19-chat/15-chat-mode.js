// V4 사용자 요청 2026-05-25 ultrathink — 챗 탭 배경 모드별 tint helper. #screen-chat 만 적용 (다른 탭 영향 X).
//   null = 색 없음 (default 다크). state.chatMode set/morph/reload 시 자동 호출.
function _applyChatModeBg() {
  const el = document.getElementById('screen-chat');
  if (!el) return;
  const mode = (state && state.chatMode) || null;
  el.classList.remove('chat-bg-daily', 'chat-bg-inquiry', 'chat-bg-vent');
  if (mode) el.classList.add(`chat-bg-${mode}`);
}

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

// V4 사용자 명시 2026-05-26 ultrathink — 모드별 default 표정.
//   welcome bubble + m.expression 없는 legacy 메시지 fallback. null = 'soft-smile' (default 일상고동).
const _CHAT_MODE_DEFAULT_EXPR = { daily: 'warm', inquiry: 'curious', vent: 'empathic' };
function _chatModeDefaultExpr(mode) {
  return _CHAT_MODE_DEFAULT_EXPR[mode] || 'soft-smile';
}

// V4 사용자 명시 2026-05-26 ultrathink — 모드별 표정 제약.
//   vent (마음 털어놓기) 에선 laugh 부적절 → warm fallback. AI 가 prompt 무시한 경우 가드.
function _sanitizeChatExpression(mode, expression) {
  if (mode === 'vent' && expression === 'laugh') return 'warm';
  return expression;
}

// 표정 파일 경로 — 'serious' 만 public/character/ 에, 나머지는 public/expressions/.
// V4 사용자 명시 2026-05-23 ultrathink — default 표정 = 'soft-smile' (옛 serious 폐기). 모드 없는 default 표정도 soft-smile.
function _chatModeExprPath(expression) {
  const e = CHAT_MODE_EXPRESSIONS.has(expression) ? expression : 'soft-smile';
  return e === 'serious' ? '/character/godong-serious.svg' : `/expressions/godong-${e}.svg`;
}

// 3 layer 합성 — HTML string 반환. 호출처가 element.innerHTML 또는 template literal 에 삽입.
//   { mode: 'daily'|'inquiry'|'vent'|null, useGlasses: bool, expression: '...' }
//   null = 아우라 X (default 일상고동 시각). daily = 살구 아우라. inquiry = 보라 아우라. vent = amber 아우라.
//   V4 사용자 명시 2026-05-23 (재재) — daily 도 살구 아우라 추가 (amber SVG + CSS hue-rotate 살짝).
function composedCharacterHtml({ mode, useGlasses, expression } = {}) {
  const showAura = mode === 'daily' || mode === 'inquiry' || mode === 'vent';
  const auraVariant = mode === 'inquiry' ? ' aura-inquiry'
                    : mode === 'daily'   ? ' aura-daily'
                    : '';
  const showGlasses = !!useGlasses;
  // V4 사용자 명시 2026-05-26 ultrathink — 모드 제약 sanitize (vent + laugh → warm) + null fallback.
  const _exprRaw = expression || _chatModeDefaultExpr(mode);
  const exprSrc = _chatModeExprPath(_sanitizeChatExpression(mode, _exprRaw));
  let html = '';
  if (showAura) {
    html += `<img class="char-layer aura${auraVariant}" src="/expressions/godong-aura-amber.svg" alt="" aria-hidden="true">`;
  }
  html += `<img class="char-layer base" src="${exprSrc}" alt="" aria-hidden="true">`;
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
  // V4 사용자 명시 2026-05-23 — 안경 (메모리 ON) 시각은 Plus/Premium 만. 그 외 = 안경 X.
  const useGlasses = _isChatRagEligible() && (state?.preferences?.useRag !== false);
  btn.classList.remove('rag-on', 'rag-off', 'rag-blink', 'brand-only', 'opus',
                       'mode-daily', 'mode-inquiry', 'mode-vent');
  btn.classList.add('is-mode');
  // halo 색 — null 도 daily 색으로 통일 (default 일상고동).
  const halo = (mode === 'inquiry') ? 'mode-inquiry'
             : (mode === 'vent')    ? 'mode-vent'
             : 'mode-daily';
  btn.classList.add(halo);
  // V4 fix (사용자 보고 2026-05-26 ultrathink) — 헤더 토글은 항상 soft-smile (모드 default warm/curious/empathic 무관).
  btn.innerHTML = composedCharacterHtml({ mode, useGlasses, expression: 'soft-smile' });
  const label = (mode === 'inquiry') ? '물어보기'
              : (mode === 'vent')    ? '털어놓기'
              : '얘기하기';
  const memo  = useGlasses ? '· 기억 ON' : '· 기억 OFF';
  btn.setAttribute('aria-label', `대화 모드 ${label} ${memo}`);
  btn.setAttribute('title', `${label} ${memo} — 누르면 변경`);
}

// 헤더 클릭 dispatch — 모든 사용자 시트 open. 모드 시스템 자체는 plan 무관 사용.
//   메모리 토글 (옛 챕터 기억) 만 시트 안에서 Plus/Premium 가드 (사용자 명시 2026-05-23).
function onChatModeHeaderClick() {
  openChatModeSheet();
}

function _isChatRagEligible() {
  if (!state || state.isGuest) return false;
  const billing = window._billingCache;
  const plan = billing?.subscription_plan;
  const active = !!billing?.subscription_active;
  return active && (plan === 'light' || plan === 'premium');
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
  // V4 사용자 명시 2026-05-23 — 메모리 영역은 Plus/Premium 만 노출. 그 외 = 모드 카드만.
  const showMemo = _isChatRagEligible();
  const overlay = document.createElement('div');
  overlay.id = 'chatModeSheetOverlay';
  overlay.className = 'chat-mode-sheet-overlay';
  overlay.innerHTML = `
    <div class="chat-mode-sheet" role="dialog" aria-modal="true">
      <button class="chat-mode-sheet-close" type="button" aria-label="닫기" onclick="closeChatModeSheet()">✕</button>
      <div class="chat-mode-sheet-cards" id="chatModeSheetCards"></div>
      ${showMemo ? `
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
      ` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  _renderChatModeSheetCards();
  if (showMemo) _renderChatModeSheetMemoState();
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
  // V4 fix (사용자 보고 2026-05-25 ultrathink) — force=true: 강제 새로고침 시 mode 풀림 방지.
  //   debounce (local 400ms idle / cloud 1s) 안에 reload 떨어지면 미저장 → null 복귀. force 면 즉시 동기 flush + cloud PATCH 발사.
  try { saveState(true); } catch {}
  // 시트 카드 재렌더 + 헤더 캐릭터 morph + 기존 메시지 아바타 morph + 챗 화면 배경 tint.
  _renderChatModeSheetCards();
  if (typeof updateMainHeaderBtnVisual === 'function') updateMainHeaderBtnVisual();
  _refreshAllMsgAvatars();
  _applyChatModeBg();
  // V4 사용자 명시 2026-05-23 ultrathink — chatMessages 비어있을 때 empty entry 재 render (chip hide + welcome avatar morph).
  if (((state && state.chatMessages) || []).length === 0 && typeof renderChat === 'function') {
    renderChat();
  }
  // 신규 선택 시만 토스트. deselect 는 silent (사용자가 명시 의도).
  if (next && next !== prev) {
    const card = CHAT_MODE_CARDS.find(c => c.id === next);
    if (card && typeof showToast === 'function') showToast(card.toast);
  }
}

// V4 사용자 명시 2026-05-23 — 모드 변경 시 chatMessages 안 모든 AI 메시지 아바타도 morph (renderChat 전체 X, light DOM update).
// V4 사용자 명시 2026-05-26 ultrathink — 메시지별 m.expression 보존 (mode 만 morph). welcome bubble = mode default 표정.
function _refreshAllMsgAvatars() {
  if (typeof composedCharacterHtml !== 'function') return;
  const mode = (state && state.chatMode) || null;
  // 02-render-message.js 의 avatar 가드 (assistant && !error) 와 동일 순서로 매칭.
  const validAssistMsgs = ((state && state.chatMessages) || []).filter(m => m && m.role === 'assistant' && !m.error);
  document.querySelectorAll('.msg.assistant:not(.ces-welcome) .msg-avatar').forEach((av, i) => {
    const m = validAssistMsgs[i];
    const expression = (m && m.expression) || _chatModeDefaultExpr(mode);
    av.innerHTML = composedCharacterHtml({ mode, useGlasses: false, expression });
  });
  // V4 fix (사용자 보고 2026-05-26 ultrathink) — empty entry welcome bubble avatar = 항상 soft-smile (모드 default 무관).
  const welcomeAv = document.querySelector('.msg.assistant.ces-welcome .msg-avatar');
  if (welcomeAv) {
    welcomeAv.innerHTML = composedCharacterHtml({ mode, useGlasses: false, expression: 'soft-smile' });
  }
}

// V4 cleanup 2026-05-23 — empty entry chatMessages 안 통합 (renderChat 의 _chatEmptyAreaHtml).
//   별도 #chatEmptyState element / updateChatEmptyState 함수 / toggleChatEmptyDiaryInfo 함수 폐기.
//   textarea placeholder = 기존 CHAT_PLACEHOLDERS pool (15-navigation.js rotateChatPlaceholder) 회전 — 모드별 swap X.

// V4 사용자 명시 2026-05-23 (재재) — welcome 텍스트 helper. 두 자리 사용:
//   1) _chatEmptyAreaHtml 의 placeholder welcome bubble (DOM only, chatMessages 비어있을 때).
//   2) sendChat 의 첫 메시지 push 직전 welcome 실제 메시지 (state.chatMessages 안 박음 — AI 가 자기 첫 발화로 인식).
const _CHAT_WELCOME_TEXTS = {
  daily:   '오늘 뭐 했어?',
  inquiry: '고민이 뭐야?',
  vent:    '편하게 말해줘. 다 괜찮아.'
};
function _chatWelcomeText(mode) {
  return _CHAT_WELCOME_TEXTS[mode] || _CHAT_WELCOME_TEXTS.daily;
}

// V4 cleanup 2026-05-23 (재) — onChatEmptyChip 폐기 (chip 3개 자체 제거).
// V4 cleanup 2026-05-23 — toggleChatEmptyDiaryInfo 폐기 (ⓘ 일기 안내 = static div 로 변경).

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
