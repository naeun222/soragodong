// ═══════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════
// 사용자 요청 2026-04-29 (perf #4): renderChat append-only — 새 메시지만 append, 기존 변경 시 full rebuild
let _chatRenderSig = null;

// 사용자 요청 2026-04-29: 자동 스크롤 가드 + '↓ 새 메시지' 플로팅 칩
let _stuckToBottom = true;
let _unseenSinceScroll = 0;
function _initChatScrollWatcher() {
  const screen = document.getElementById('screen-chat');
  if (!screen || screen._scrollWatcherInited) return;
  screen._scrollWatcherInited = true;
  screen.addEventListener('scroll', () => {
    const dist = screen.scrollHeight - screen.scrollTop - screen.clientHeight;
    const wasStuck = _stuckToBottom;
    _stuckToBottom = dist < 80;
    if (_stuckToBottom && !wasStuck) {
      _unseenSinceScroll = 0;
      _updateChatNewMsgChip();
    }
    // 단계 3: 위로 scroll 시 windowing expand. scrollTop < 200 + windowStart > 0 시 grow.
    if (screen.scrollTop < 200 && typeof _chatWindowStart === 'number' && _chatWindowStart > 0) {
      _chatExpandWindow();
    }
  }, { passive: true });
}

// 단계 3: window 위로 prepend + scroll restoration 공식.
// oldHeight / oldTop 기록 → renderChat 후 newHeight 측정 → scrollTop = oldTop + delta.
let _chatExpanding = false;
function _chatExpandWindow() {
  if (_chatExpanding) return;
  if (typeof _chatWindowStart !== 'number' || _chatWindowStart <= 0) return;
  _chatExpanding = true;
  const screen = document.getElementById('screen-chat');
  const container = document.getElementById('chatMessages');
  if (!screen || !container) { _chatExpanding = false; return; }

  const oldHeight = container.scrollHeight;
  const oldTop = screen.scrollTop;

  _chatWindowStart = Math.max(0, _chatWindowStart - CHAT_WINDOW_GROW);
  // signature mismatch 강제 → full rebuild 분기
  _chatRenderSig = null;
  renderChat();

  // render 직후 scrollHeight 측정 — innerHTML set 후 layout sync 자리.
  // rAF + setTimeout 0 둘 다 사용 = 보수적.
  requestAnimationFrame(() => {
    const newHeight = container.scrollHeight;
    const delta = newHeight - oldHeight;
    if (delta > 0) {
      screen.scrollTop = oldTop + delta;
    }
    _chatExpanding = false;
  });
}
function _updateChatNewMsgChip() {
  const chip = document.getElementById('chatNewMsgChip');
  if (!chip) return;
  // 사용자 요청 2026-04-29 (final): ChatGPT/Claude 표준 — 사용자가 위로 스크롤 했을 때만 칩 표시
  // (맨 아래에 있으면 자동 스크롤로 따라가니 칩 X)
  if (!_stuckToBottom && _unseenSinceScroll > 0) {
    chip.textContent = _unseenSinceScroll > 1 ? `↓ 새 메시지 ${_unseenSinceScroll}` : '↓ 새 메시지';
    chip.style.display = '';
  } else {
    chip.style.display = 'none';
  }
}
function scrollChatToBottom(force) {
  const screen = document.getElementById('screen-chat');
  if (!screen) return;
  if (force) _stuckToBottom = true;
  if (_stuckToBottom) {
    screen.scrollTop = screen.scrollHeight;
    _unseenSinceScroll = 0;
    _updateChatNewMsgChip();
  }
}

