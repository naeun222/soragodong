function _measureChatRender(_t0) {
  if (!_t0 || !window.__chatRenderTimes) return;
  window.__chatRenderTimes.push(performance.now() - _t0);
  if (window.__chatRenderTimes.length > 200) window.__chatRenderTimes.shift();
}

// 사용자 명시 2026-05-06: empty bubble 예시 리스트 토글
function toggleChatEmptyExamples() {
  const list = document.getElementById('chatEmptyExamplesList');
  const btn = document.getElementById('chatEmptyExamplesToggle');
  if (!list || !btn) return;
  const isOpen = list.style.display !== 'none' && list.style.display !== '';
  if (isOpen) {
    list.style.display = 'none';
    btn.textContent = '무슨 말 할까? ▾';
  } else {
    list.style.display = 'flex';
    btn.textContent = '무슨 말 할까? ▴';
  }
}

window.__seedChatMessages = function(n) {
  n = n || 1000;
  if (typeof state === 'undefined' || !state) return console.warn('[seed] state X');
  if (!window.__chatBackupForSeed) {
    window.__chatBackupForSeed = (state.chatMessages || []).slice();
    console.log('[seed] backup =', window.__chatBackupForSeed.length, '메시지');
  }
  const fresh = [];
  const baseTs = Date.now() - n * 60000;
  for (let i = 0; i < n; i++) {
    fresh.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i % 5 === 0
        ? '[seed-' + i + '] windowing 동작 확인용 좀 긴 mock 메시지 — 길이 패딩 가나다라마바사아자차카타파하'
        : '[seed-' + i + '] 짧',
      timestamp: new Date(baseTs + i * 60000).toISOString()
    });
  }
  state.chatMessages = fresh;
  if (typeof _chatRenderSig !== 'undefined') _chatRenderSig = null;
  if (typeof _chatWindowStart !== 'undefined') _chatWindowStart = null;
  window.__chatRenderTimes = [];  // 측정 reset
  if (typeof renderChat === 'function') renderChat();
  console.log('[seed]', n, '메시지 → renderChat. saveState X. __restoreChatMessages() 로 복원.');
};

window.__restoreChatMessages = function() {
  if (!window.__chatBackupForSeed) return console.warn('[restore] backup X');
  state.chatMessages = window.__chatBackupForSeed;
  window.__chatBackupForSeed = null;
  if (typeof _chatRenderSig !== 'undefined') _chatRenderSig = null;
  if (typeof _chatWindowStart !== 'undefined') _chatWindowStart = null;
  if (typeof renderChat === 'function') renderChat();
  console.log('[restore] 복원 끝.');
};

window.__measureChatRender = function() {
  const times = window.__chatRenderTimes || [];
  if (!times.length) return console.log('[measure] 데이터 X');
  const sorted = times.slice().sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = sorted[Math.floor(times.length * 0.5)];
  const p95 = sorted[Math.floor(times.length * 0.95)];
  const max = sorted[sorted.length - 1];
  const min = sorted[0];
  console.log('[measure] renderChat n=' + times.length +
    ' avg=' + avg.toFixed(2) + 'ms p50=' + p50.toFixed(2) +
    ' p95=' + p95.toFixed(2) + ' max=' + max.toFixed(2) + ' min=' + min.toFixed(2));
  return { n: times.length, avg, p50, p95, max, min };
};

function renderChat() {
  const _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  const container = document.getElementById('chatMessages');
  if (!container) { _measureChatRender(_t0); return; }  // FIX: prevent null.innerHTML error

  // 사용자 명시 2026-05-10: 시뮬 → 대화 이어가기 = 화면 상단 '💭 시나리오 토론 중' 스티커. chatMessages 안 isSimulationContext 1+ 면 표시. 챕터 마무리 (chatMessages 비움) 시 자동 hide.
  const _simSticker = document.getElementById('chatSimContextSticker');
  if (_simSticker) {
    const _hasSim = (state.chatMessages || []).some(m => m && m.isSimulationContext === true);
    _simSticker.style.display = _hasSim ? 'block' : 'none';
  }

  // 사용자 명시 2026-05-01 ultrathink: ✓ 마무리 hint 배너 — 첫 3 챕터 동안 + dismiss 안 됐을 때만 노출.
  const _endHintBanner = document.getElementById('chatEndHintBanner');
  if (_endHintBanner) {
    const _showHint = ((state.chapterCompletedCount || 0) < 3) && !state._chatEndHintDismissed;
    _endHintBanner.style.display = _showHint ? 'inline-flex' : 'none';
  }

  // Archive header (V3.3)
  let archiveHeader = '';
  if ((state.chatArchive || []).length > 0) {
    archiveHeader = `<div class="chat-archive-header" onclick="openChatArchive()">
      📚 이전 대화 보기
    </div>`;
  }

  const msgs = state.chatMessages || [];
  const archiveLen = (state.chatArchive || []).length;

  if (!msgs.length) {
    // 사용자 명시 2026-05-06: empty bubble — 예시 리스트는 토글 뒤로 숨김 (기본 접힘, 토글 클릭 시 펼침).
    const examples = (typeof EMPTY_STATE_EXAMPLES !== 'undefined' && Array.isArray(EMPTY_STATE_EXAMPLES)) ? EMPTY_STATE_EXAMPLES : [];
    const examplesBlock = examples.length
      ? `<button class="chat-empty-toggle" id="chatEmptyExamplesToggle" onclick="toggleChatEmptyExamples()">무슨 말 할까? ▾</button><ul class="chat-empty-list" id="chatEmptyExamplesList" style="display:none;">${examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}</ul>`
      : '';
    container.innerHTML = archiveHeader + `<div class="msg assistant">
      <div class="msg-bubble">안녕 🐚 왔구나.

오늘 어땠어? 아무 말이나 편하게 해도 돼.
일기처럼 길게 써도 되고, "졸려" 한 마디도 OK.${examplesBlock}</div>
    </div>`;
    _chatRenderSig = null;
    _measureChatRender(_t0);
    return;
  }

  // 사용자 요청 2026-04-29 (perf #4): append-only 분기 — 길이 증가 + 기존 prefix unchanged
  // 안전성: 같은 firstTs + prev.len 위치 메시지의 ts 일치 시에만 발동. 중간 변경(saved 등)은 길이 그대로 → full rebuild fallback.
  const prev = _chatRenderSig;
  const lastIdx = msgs.length - 1;
  const canAppendOnly = prev
    && prev.archiveLen === archiveLen
    && prev.firstTs === (msgs[0] && msgs[0].timestamp)
    && msgs.length > prev.len
    && prev.lastTs === (prev.len > 0 && msgs[prev.len - 1] && msgs[prev.len - 1].timestamp);

  if (canAppendOnly) {
    let html = '';
    for (let i = prev.len; i < msgs.length; i++) {
      html += _renderChatMessageHTML(msgs[i], i);
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const newEls = [];
    while (tmp.firstChild) {
      const el = tmp.firstChild;
      newEls.push(el);
      container.appendChild(el);
    }
    // 단계 2: 신규 메시지 height 측정 + 캐시 (rAF 후 layout 안정).
    if (newEls.length > 0) {
      requestAnimationFrame(() => {
        let nIdx = prev.len;
        for (const el of newEls) {
          if (el && el.classList && el.classList.contains('msg') && msgs[nIdx]) {
            _chatHeights.set(msgs[nIdx], el.offsetHeight);
            nIdx++;
          }
        }
      });
    }
  } else {
    // 단계 2: full rebuild 시 windowing 적용. msgs.length > tail 일 때만 활성.
    if (msgs.length > CHAT_WINDOW_TAIL) {
      // _chatWindowStart 미초기 또는 범위 밖 → msgs.length - tail 으로 reset
      if (_chatWindowStart === null || _chatWindowStart > msgs.length - CHAT_WINDOW_TAIL) {
        _chatWindowStart = Math.max(0, msgs.length - CHAT_WINDOW_TAIL);
      }
      if (_chatWindowStart < 0) _chatWindowStart = 0;
      const start = _chatWindowStart;
      // top spacer height 추정 — cached + placeholder 평균
      let topSpacerHeight = 0;
      for (let i = 0; i < start; i++) {
        const cached = _chatHeights.get(msgs[i]);
        topSpacerHeight += (cached != null ? cached : CHAT_HEIGHT_PLACEHOLDER);
      }
      let html = archiveHeader;
      if (topSpacerHeight > 0) {
        html += `<div class="chat-window-spacer-top" style="height:${topSpacerHeight}px" aria-hidden="true"></div>`;
      }
      for (let i = start; i < msgs.length; i++) {
        html += _renderChatMessageHTML(msgs[i], i);
      }
      container.innerHTML = html;
      // 가시 메시지 height 캐시 (rAF 후)
      requestAnimationFrame(() => {
        const els = container.querySelectorAll('.msg');
        let mIdx = start;
        els.forEach((el) => {
          if (msgs[mIdx]) {
            _chatHeights.set(msgs[mIdx], el.offsetHeight);
            mIdx++;
          }
        });
      });
    } else {
      // tail 이하 = 옛 동작 (전체 mount)
      _chatWindowStart = 0;
      let html = archiveHeader;
      for (let i = 0; i < msgs.length; i++) {
        html += _renderChatMessageHTML(msgs[i], i);
      }
      container.innerHTML = html;
      // height 캐시 (full mount = 모두 가시)
      requestAnimationFrame(() => {
        const els = container.querySelectorAll('.msg');
        els.forEach((el, idx) => {
          if (msgs[idx]) _chatHeights.set(msgs[idx], el.offsetHeight);
        });
      });
    }
  }

  const prevLen = (prev && prev.len) || 0;
  const lenDelta = msgs.length - prevLen;
  _chatRenderSig = {
    len: msgs.length,
    firstTs: msgs[0] && msgs[0].timestamp,
    lastTs: msgs[lastIdx] && msgs[lastIdx].timestamp,
    archiveLen
  };
  // 사용자 요청 2026-04-29 (final): ChatGPT/Claude 표준 동작
  // - 맨 아래에 붙어 있으면 (_stuckToBottom): 자동으로 따라 내려감
  // - 위로 스크롤한 상태면: 그 자리 유지 + 새 메시지 칩으로 알림
  // - 사용자가 직접 보낸 메시지는 무조건 따라가게 (_stuckToBottom 강제 true)
  _initChatScrollWatcher();
  const lastM = msgs[msgs.length - 1];
  const lastIsUserSend = lastM && lastM.role === 'user' && lenDelta > 0;
  if (lastIsUserSend) _stuckToBottom = true;
  if (_stuckToBottom) {
    setTimeout(() => {
      const s = document.getElementById('screen-chat');
      if (s) s.scrollTop = s.scrollHeight;
    }, 50);
    _unseenSinceScroll = 0;
    _updateChatNewMsgChip();
  } else if (lenDelta > 0) {
    _unseenSinceScroll += lenDelta;
    _updateChatNewMsgChip();
  }
  _measureChatRender(_t0);
}

