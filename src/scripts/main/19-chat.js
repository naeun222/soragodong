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

function _renderChatMessageHTML(m, i) {
    let bubbleContent;
    if (m.role === 'assistant' && !m.typing) {
      bubbleContent = formatAIResponse(m.content);
    } else {
      bubbleContent = escapeHtml(m.content);
    }
    const msgClass = m.error ? 'error' : m.role;
    // V3.13.x: 메시지 ⋮ 메뉴 버튼 (복사/수정/삭제). typing/error는 제외.
    const menuBtn = (!m.typing && !m.error)
      ? `<button class="msg-menu-btn" onclick="showMessageMenu(${i})" aria-label="더보기">⋮</button>`
      : '';
    const bubble = `<div class="msg-bubble">${bubbleContent}${menuBtn}</div>`;
    // chapter divider는 line 7810~ 기존 코드가 처리 (m.chapterStart 마커 기준)

    let actions = '';
    if (m.error && m.canRetry) {
      actions = `<div class="msg-actions">
        <button class="msg-action retry" onclick="retryMessage(${i})">↻ 다시 보내기</button>
      </div>`;
    } else if (m.role === 'assistant' && !m.typing) {
      // Detect if response was "short" (no 4-stage labels)
      const has4Stage = /\[내가 본 것\]|\[이게 뭐냐면\]/.test(m.content || '');
      // V4 (v8 묶음 4): show / disabled / hide 분기 — Plan 별 cap + 쿨다운
      const _deeperElig = (typeof _checkDeeperEligibility === 'function') ? _checkDeeperEligibility() : { ok: true };
      const deeperBtn = has4Stage
        ? ''
        : (_deeperElig.ok
            ? `<button class="msg-action" onclick="askDeeper(${i})">더 알고 싶어 ▾</button>`
            : `<button class="msg-action disabled-locked" onclick="_showDeeperCapToast()">더 알고 싶어 ▾</button>`);
      // V4 (v8 묶음 9): Core 2 미잠금 시 4단 응답의 🧬 전략으로 disabled-locked
      // V4 (v2 §6 명시): 클릭 시 단순 토스트 — entry modal 자동 권유는 환영 선물 후
      const _c2Locked = !!state._core2NotUnlocked && !window._onbTutorialMode && !(state.preferences && state.preferences.testerMode);
      // V3.13.x: askDeeper 응답이면 깨달음 버튼 대신 '전략으로' (전략 탭에 저장)
      const saveBtn = m.fromDeeper
        ? (_c2Locked
            ? `<button class="msg-action disabled-locked" onclick="_showCore2LockedToast()">🧬 전략으로</button>`
            : `<button class="msg-action ${m.savedStrategy ? 'saved' : ''}" onclick="saveMsgAsStrategy(${i})">${m.savedStrategy ? '🧬 전략 저장됨' : '🧬 전략으로'}</button>`)
        : `<button class="msg-action ${m.saved ? 'saved' : ''}" onclick="saveMsgAsInsight(${i})">${m.saved ? '✦ 저장됨' : '✦ 깨달음으로'}</button>`;
      actions = `<div class="msg-actions">
        ${saveBtn}
        ${deeperBtn}
      </div>`;
    }

    let proposalBtns = '';
    if (m.role === 'assistant' && m.proposal && !m.proposalResponse && !m.typing) {
      // 사용자 요청 2026-04-28: 제안 별로면 다시 만들기 버튼 (AI에게 다른 제안 요청)
      const regenLabel = m._regenLoading ? '🔄 만드는 중...' : '🔄 다시 만들기';
      const propTitle = m.proposalData?.title ? escapeHtml(m.proposalData.title) : '';
      const propChip = propTitle ? `<div class="proposal-title-chip">🌿 오늘의 제안: <b>${propTitle}</b></div>` : '';
      // V4 (v8 묶음 9): Core 2 미잠금 시 ✦ 해볼게 disabled-locked
      // V4 (v2 §6 명시): 클릭 시 단순 토스트 — entry modal 자동 권유는 환영 선물 후
      const _c2LockedProp = !!state._core2NotUnlocked && !window._onbTutorialMode && !(state.preferences && state.preferences.testerMode);
      proposalBtns = `${propChip}<div class="proposal-buttons">
        ${_c2LockedProp
          ? `<button class="proposal-btn accept disabled-locked" onclick="_showCore2LockedToast()">✦ 해볼게</button>`
          : `<button class="proposal-btn accept" onclick="acceptProposal(${i})">✦ 해볼게</button>`}
        <button class="proposal-btn decline" onclick="declineProposal(${i})">나중에</button>
      </div>`;
    } else if (m.proposalResponse) {
      const icon = m.proposalResponse === 'accept' ? '✦ 미션으로 등록됨' : '✗ 거절함';
      proposalBtns = `<div style="font-size:11px; color:var(--accent); margin-top:8px; padding: 0 4px;">${icon}</div>`;
    }

    // Decision suggestion card
    let decisionCard = '';
    if (m.role === 'assistant' && m.decisionSuggested && !m.decisionResponse && !m.typing) {
      const ds = m.decisionSuggested;
      decisionCard = `<div class="decision-suggest-card">
        <div class="dsc-header"><img src="/godong.webp" alt="" class="godong-icon" decoding="async"> 마법의 소라고동에서 천천히 보면 어때?</div>
        <div class="dsc-title">${escapeHtml(ds.title)}</div>
        ${ds.reason ? `<div class="dsc-reason">${escapeHtml(ds.reason)}</div>` : ''}
        <div class="dsc-buttons">
          <button class="dsc-btn accept" onclick="acceptDecisionSuggestion(${i})">14일 숙성 시작</button>
          <button class="dsc-btn decline" onclick="declineDecisionSuggestion(${i})">괜찮아</button>
        </div>
      </div>`;
    } else if (m.decisionResponse) {
      const icon = m.decisionResponse === 'accept' ? '🐚 마법의 소라고동으로 보냈어' : '괜찮아 — 그냥 듣기만 할게';
      decisionCard = `<div style="font-size:11px; color:var(--purple); margin-top:8px; padding: 0 4px;">${icon}</div>`;
    }

    // 사용자 요청 2026-04-28: 대화 중 '📥 서랍장에 넣을까?' 카드 제거 (난잡함)
    let vaultCard = '';

    // V3.8: 챕터 구분선 (4시간 비활성 후 새 메시지)
    // 사용자 요청 2026-04-28 V3 audit: chapterMeta.category/summary 있으면 같이 표시
    let chapterDivider = '';
    if (m.chapterStart) {
      const ts = m.timestamp ? new Date(m.timestamp) : new Date();
      const dateStr = ts.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
      const timeStr = ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      const meta = m.chapterMeta || {};
      const cat = meta.category || m.chapterCategory;
      const sum = meta.summary || m.chapterSummary;
      const catLabel = cat ? ` · ${escapeHtml(cat)}` : '';
      const sumLine = sum ? `<div style="font-size:11px; color:var(--text-soft); margin-top:4px; line-height:1.5; max-width:280px; margin-left:auto; margin-right:auto; text-align:center;">${escapeHtml(sum)}</div>` : '';
      chapterDivider = `<div class="chapter-divider"><span>${dateStr} · ${timeStr}${catLabel}</span></div>${sumLine}`;
    }

    // V4-1m: 진주 능동 제안 — user 메시지에 행복 신호 감지된 경우 작은 칩
    let pearlSuggestChip = '';
    if (m.role === 'user' && m.pearlSuggestion && !m.pearlSaved) {
      pearlSuggestChip = `<div class="pearl-suggest-chip" onclick="saveMsgAsPearl(${i})">🔮 지금 이 기억 진주에 넣을래?</div>`;
    } else if (m.role === 'user' && m.pearlSaved) {
      pearlSuggestChip = `<div class="pearl-suggest-chip saved">🔮 진주에 보관됨 ✦</div>`;
    }

    return chapterDivider + `<div class="msg ${msgClass}">${bubble}${pearlSuggestChip}${proposalBtns}${decisionCard}${vaultCard}${actions}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// CHAT VIRTUALIZATION — 단계 1: 계측 baseline / 단계 2: windowing core (사용자 결정 2026-05-03 / Plan agent)
// renderChat 시간 측정 + 1000 메시지 mock seed/restore (saveState X, console only).
// 단계 2: msgs.length > CHAT_WINDOW_TAIL 시 = tail 60 메시지만 mount + top spacer = 누적 height 추정.
// dev console:
//   __seedChatMessages(1000) → mock 1000 메시지 inject + renderChat
//   __measureChatRender()    → avg / p50 / p95 / max / min (ms)
//   __restoreChatMessages()  → 본 데이터 복원
// ═══════════════════════════════════════════════════════════════
const CHAT_WINDOW_TAIL = 60;
const CHAT_WINDOW_GROW = 40;
let _chatWindowStart = null;  // null = 미초기 / 숫자 = msg 절대 idx (= window 안 첫 msg)
const _chatHeights = new WeakMap();  // msg object → measured height (px)
const CHAT_HEIGHT_PLACEHOLDER = 80;

window.__chatRenderTimes = window.__chatRenderTimes || [];
window.__chatBackupForSeed = window.__chatBackupForSeed || null;

function _measureChatRender(_t0) {
  if (!_t0 || !window.__chatRenderTimes) return;
  window.__chatRenderTimes.push(performance.now() - _t0);
  if (window.__chatRenderTimes.length > 200) window.__chatRenderTimes.shift();
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
    // V4 (v8 묶음 17): empty state 회전 예시 — 본인 인사 + 1 예시 (회전)
    const example = (typeof _getEmptyStateExample === 'function') ? _getEmptyStateExample() : '';
    const exampleHtml = example ? `<div class="chat-empty-example">${escapeHtml(example)}</div>` : '';
    container.innerHTML = archiveHeader + `<div class="msg assistant">
      <div class="msg-bubble">안녕 🐚 왔구나.

오늘 어땠어? 아무 말이나 편하게 해도 돼.

일기처럼 길게 써도 되고, "졸려" 한 마디도 OK.${exampleHtml}</div>
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

function formatAIResponse(text) {
  let cleaned = text.replace(/```json[\s\S]*?```/g, '').trim();
  cleaned = cleaned.replace(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)[\s\S]*\}\s*$/g, '').trim();
  // V4 (v8 묶음 3): [상황] 섹션 출력 시 제거 — 결과 체크 모달용 메타데이터, 화면 노출 X
  cleaned = cleaned.replace(/\[상황\][\s\S]*?(?=\n*\[내가 본 것\]|\n*\[이게 뭐냐면\]|\n*\[이럴 땐 이렇게\]|\n*\[오늘의 제안\]|$)/g, '').trim();
  let formatted = escapeHtml(cleaned);
  // 사용자 요청 2026-04-30: 4단 라벨 디자인 — bracket 제거 + emoji + stage별 구분.
  // V4 (v8 사용자 명시 2026-05-03 ultrathink): 4단 분석 이모티콘 — 🎯 (관찰) / 🔍 (살펴봄) / 💡 (아이디어) / ⭐ (제안 → 소라의 부름 흐름 강조)
  const labelMap = [
    ['[내가 본 것]',     '🎯 내가 본 것',    'observation'],
    ['[이게 뭐냐면]',    '🔍 이게 뭐냐면',   'concept'],
    ['[이럴 땐 이렇게]', '💡 이럴 땐 이렇게', 'guide'],
    ['[오늘의 제안]',    '⭐ 오늘의 제안',   'proposal']
  ];
  labelMap.forEach(([raw, pretty, stage]) => {
    const regex = new RegExp(raw.replace(/[\[\]]/g, '\\$&'), 'g');
    formatted = formatted.replace(regex, `<span class="stage-label" data-stage="${stage}">${pretty}</span>`);
  });
  // V3.12.x: 인라인 마크다운 (**bold** / *italic*)
  formatted = formatted.replace(/\*\*([^\*\n]+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/(^|[^*])\*([^\*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  return formatted;
}

// 사용자 요청 2026-04-30: 메인 chat 일일 cap 헬퍼. 4시 cutoff 기준. cap=0 = 무제한.
function _checkDailyChatCap() {
  if (!state.preferences) state.preferences = {};
  // 사용자 명시 2026-04-30 (정정): admin 특혜 제거 — admin 도 일반 사용자처럼 cap 적용.
  const cap = state.preferences.dailyChatCap;
  if (cap === 0 || cap == null) return { ok: true };
  const todayK = todayKey();
  if (!state.dailyChatCount || state.dailyChatCount.date !== todayK) {
    state.dailyChatCount = { date: todayK, count: 0 };
  }
  return { ok: state.dailyChatCount.count < cap, current: state.dailyChatCount.count, cap };
}
function _incrementDailyChatCount() {
  const todayK = todayKey();
  if (!state.dailyChatCount || state.dailyChatCount.date !== todayK) {
    state.dailyChatCount = { date: todayK, count: 0 };
  }
  state.dailyChatCount.count += 1;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  // 사용자 명시 2026-05-01: 위기 신호 detect — 자살예방법 §15-6 + 제조물책임 안전 의무.
  // chat 본문 + '일기:' prefix 본문 모두 covered (text 전체 검사).
  if (typeof _detectCrisisSignal === 'function' && _detectCrisisSignal(text)) {
    if (typeof showCrisisCarousel === 'function') showCrisisCarousel('chat_keyword');
  }

  // 사용자 요청 2026-04-30: 일일 cap 체크 (비용 폭발 방지). 도달 시 토스트 + 차단.
  const capCheck = _checkDailyChatCap();
  if (!capCheck.ok) {
    showToast(`📋 오늘 대화 한도 (${capCheck.cap}개) 다 됐어 — 내일 4시 이후 풀려.\n설정에서 한도 조절 가능.`);
    return;
  }

  // V4 사용자 명시 2026-05-01 ultrathink: 5h+ 갭만 (cross-day 조건 폐기 — 5h 자체가 "잠 자고 일어남" 의미).
  // 5h+ 갭 detect 시 직전 챕터 즉시 _archiveCurrentChapter 로 이송 (chapter 분리 = archive 이송 단일 흐름).
  const NEW_CHAPTER_GAP_MS = 5 * 60 * 60 * 1000;
  const lastMsg = state.chatMessages[state.chatMessages.length - 1];
  const _nowMs = Date.now();
  const _lastMs = lastMsg && lastMsg.timestamp ? new Date(lastMsg.timestamp).getTime() : null;
  const _gap = _lastMs == null ? Infinity : (_nowMs - _lastMs);
  let isNewChapter = _gap >= NEW_CHAPTER_GAP_MS;

  // V4 (사용자 보고 2026-05-04 V199): resumeArchiveChat 직후 첫 sendChat 은 갭 detect 강제 skip.
  // 옛 fix (resume 시 마지막 timestamp=now) 외 추가 안전장치 — 첫 메시지 보낼 때 새 챕터 분리 방지.
  if (state._chatResumedAt && (_nowMs - state._chatResumedAt) < NEW_CHAPTER_GAP_MS) {
    isNewChapter = false;
  }
  delete state._chatResumedAt;

  // 5h+ 갭 detect → 직전 챕터 즉시 archive 이송 (chatMessages 비움)
  if (isNewChapter && state.chatMessages.length > 0) {
    _archiveCurrentChapter({ manual: false });
  }
  
  // V3.13: '일기:' 키워드 감지 → 오늘 entry에 원본 그대로 저장
  // 사용자 요청 2026-04-29: 같은 날 여러 번 적으면 덮어쓰기 X — 시각 표시와 함께 append
  const diaryMatch = text.match(/^일기[:：]\s*([\s\S]+)$/);
  let isDiary = false;
  let diaryAppended = false;
  if (diaryMatch) {
    const diaryContent = diaryMatch[1].trim();
    const todayK = todayKey();
    let entry = state.entries.find(e => e.date === todayK);
    if (!entry) {
      entry = { date: todayK, timestamp: new Date().toISOString() };
      state.entries.push(entry);
    }
    if (entry.diary && entry.diary.trim()) {
      // 두 번째 이상 — 시각 마커와 함께 append
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      entry.diary = entry.diary.trimEnd() + '\n\n— ' + timeStr + ' —\n' + diaryContent;
      diaryAppended = true;
    } else {
      entry.diary = diaryContent;
    }
    entry.dailySource = 'diary';
    isDiary = true;
    // V4 (v8 묶음 16): 일기 첫 사용 placeholder dismiss
    if (typeof dismissPlaceholder === 'function') dismissPlaceholder('diary');
  }

  // 사용자 명시 2026-05-01 ultrathink: 단일 챕터 디자인 — chapterStart 마커 push X (5h+ 갭이면 _archiveCurrentChapter 가 직전 챕터 이송 + chatMessages 비움. 새 메시지 = 새 챕터의 자연 시작점, 마커 불필요).
  state.chatMessages.push({
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
    ...(isDiary ? { isDiary: true } : {})
  });
  // 사용자 요청 2026-04-30: 일일 cap 카운트 증가 (메시지 push 직후, AI call 전).
  _incrementDailyChatCount();
  // V4-1m: 진주 능동 제안 신호 감지 (행복/소중함). 같은 날 1회 가드.
  if (typeof detectPearlSignal === 'function' && detectPearlSignal(text)) {
    const todayK = todayKey();
    const alreadyToday = (state.chatMessages || []).some(m =>
      m.pearlSuggestion && m.timestamp && getDayKey(m.timestamp) === todayK
    );
    if (!alreadyToday) {
      state.chatMessages[state.chatMessages.length - 1].pearlSuggestion = true;
    }
  }
  input.value = ''; input.style.height = 'auto';
  renderChat();
  saveState();
  if (isDiary) showToast(diaryAppended ? '📔 오늘 일기에 이어 저장됨' : '📔 오늘 일기로 저장됨');

  // 사용자 명시 2026-05-01 ultrathink: 5h+ 갭 시점 직접 토픽 추출 폐기 — _archiveCurrentChapter 이송 후 4AM 흐름이 일괄 처리 (또는 신규유저 즉시 trigger).

  // V3.12: 프로젝트 측정값 감지 (regex 기반, fire-and-forget)
  const projMatch = detectProjectMeasurement(text);
  if (projMatch) {
    showConfirmModal({
      title: `📊 ${projMatch.value}${projMatch.unit} 발견`,
      message: `"${projMatch.project.title}" 측정값으로 기록할까?`,
      okLabel: '응 기록', cancelLabel: '아니'
    }).then((yes) => {
      if (!yes) return;
      const p = state.projects.find(x => x.id === projMatch.project.id);
      if (!p) return;
      p.measurements = p.measurements || [];
      p.measurements.push({ value: projMatch.value, at: new Date().toISOString(), source: 'chat' });
      const reached = (p.target > p.baseline && projMatch.value >= p.target) || (p.target < p.baseline && projMatch.value <= p.target);
      if (reached) p.status = 'done';
      saveState();
      renderProjects();
      showToast(reached ? `🎉 ${p.title} 목표 달성!` : `${p.emoji || '✦'} 기록`);
    }).catch(() => {});
  }

  await generateAIResponse();

  // V4 사용자 명시 2026-05-01 ultrathink: 옛 chatPairsCount 즉시 추출 폐기.
  // 신규유저 빠른 추출 = _archiveCurrentChapter 안 chapterCompletedCount<3 분기로 이동.
  // 즉 챕터 마무리 (✓ 또는 5h+ 자동) 시점에 첫 3챕터만 즉시 API 호출.
}

// V3.13.x: 일기 템플릿 — 인지심리학 연구 기반 5종.
// 글쓰기 마찰 ↓ + 검증된 효과:
//   1) Three Good Things (Seligman 2005, Park et al.) — 긍정성·우울 ↓ 6개월 효과
//   2) Affect Labeling (Lieberman 2007) — 감정 명명만으로 amygdala 반응 ↓
//   3) Implementation Intention (Gollwitzer 1999) — if-then 형식이 행동 follow-through 2-3배 ↑
//   4) Self-compassion (Neff 2003) — 자기비판 → 자기친절. 회복탄력성 ↑
//   5) Cognitive Reappraisal (Gross 2002) — 감정 재해석 → 정서조절 효과
// V3.13.x: 클릭만 해도 / 한 단어만 답해도 완성된 일기로 자동 send.
const DIARY_TEMPLATES = [
  {
    id: 'short',
    label: '🌙 짧게 닫기 (1분)',
    desc: '오늘 한 단어로',
    prompt: '오늘 한 일을 한 단어로?',
    placeholder: '예: 발표, 공부, 휴식, 산책',
    format: (a) => `일기: 오늘은 ${a || '평범한 하루'}였어. 그래도 살아남음 ✦`
  },
  {
    id: 'tgt',
    label: '✨ Three Good Things',
    desc: '오늘 좋았던 일',
    prompt: '오늘 좋았던 거 한 가지?',
    placeholder: '예: 친구 만남, 발표 잘됨',
    format: (a) => `일기: 오늘 좋았던 거 — ${a || '특별한 거 없지만 그래도 무사히 보냄'} ✦`
  },
  {
    id: 'hard',
    label: '🌧 힘든 날',
    desc: '자기친절 모드',
    prompt: '오늘 힘들었던 거 한 줄?',
    placeholder: '예: 발표 망함, 잠 못 잠, 답답',
    format: (a) => `일기: 오늘 힘들었던 거 — ${a || '뚜렷한 이유 없이 그냥 힘듦'}. 그래도 여기까지 온 게 어디야 🌊`
  },
  {
    id: 'plan',
    label: '🎯 내일 계획 (if-then)',
    desc: '내일 가장 중요한 거',
    prompt: '내일 가장 중요한 거?',
    placeholder: '예: 마감, 공부 시작, 약속',
    format: (a) => `일기: 내일 가장 중요한 건 ${a || '아직 모름. 천천히 시작해보자'}. 작게 시작해도 OK.`
  },
  {
    id: 'feel',
    label: '🌊 감정 정리',
    desc: '지금 기분 한 단어',
    prompt: '지금 기분을 한 단어로?',
    placeholder: '예: 피곤, 답답, 평온, 설렘',
    format: (a) => `일기: 지금 기분은 ${a || '뭔지 잘 모르겠음'}. 이대로도 괜찮아.`
  }
];

// V3.13.x: + 메뉴 토글 (일기 템플릿/대화 마무리 통합)
function toggleChatPlusMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('chatPlusMenu');
  const btn = document.getElementById('chatPlusBtn');
  if (!menu || !btn) return;
  if (menu.hidden) {
    menu.hidden = false;
    btn.classList.add('open');
    // V4 (v8 묶음 16): + 메뉴 첫 열기 placeholder dismiss
    if (typeof dismissPlaceholder === 'function') dismissPlaceholder('plus');
  } else {
    menu.hidden = true;
    btn.classList.remove('open');
  }
}
function closeChatPlusMenu() {
  const menu = document.getElementById('chatPlusMenu');
  const btn = document.getElementById('chatPlusBtn');
  if (menu && !menu.hidden) menu.hidden = true;
  if (btn) btn.classList.remove('open');
}
function chatPlusAction(kind) {
  closeChatPlusMenu();
  if (kind === 'diary') showDiaryTemplates();
  else if (kind === 'memo') addMemoArchive();
  // 'end'는 + 메뉴 밖 별도 ✓ 버튼으로 빼냄 (V4-fix)
}
document.addEventListener('click', function(e) {
  const menu = document.getElementById('chatPlusMenu');
  if (!menu || menu.hidden) return;
  const btn = document.getElementById('chatPlusBtn');
  if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeChatPlusMenu();
});

// V4 사용자 명시 2026-05-01 ultrathink: 챕터 분리 = archive 이송 (단일 흐름).
// chatMessages 의 현재 챕터를 chatArchive 로 이송 + chatMessages 비움.
// archive item: date = firstMsg day-key (cross-cutoff 챕터 시작 날), 별도 entry (merge X), _pendingExtract: true.
// 신규유저 (chapterCompletedCount < 3) 만 즉시 API 호출 (case + topic). 그 외 = 4AM 일괄.
function _archiveCurrentChapter(opts) {
  opts = opts || {};
  const validMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  const minLen = (typeof opts.minMessages === 'number') ? opts.minMessages : 3;
  if (validMsgs.length < minLen) return null;
  if (!Array.isArray(state.chatArchive)) state.chatArchive = [];

  const firstMsgTs = validMsgs[0] && validMsgs[0].timestamp;
  const dateKey = firstMsgTs ? getDayKey(firstMsgTs) : todayKey();

  // V4 (사용자 명시 2026-05-04 V191): summary 필드 제거 — 히스토리 API 줄거리 요약 기능 폐기.
  // 표시 / system prompt 주입 / review 입력 모두 raw messages + topicCards 기반으로 통일.
  const archiveItem = {
    id: 'arch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    date: dateKey,
    messageCount: validMsgs.length,
    messages: validMsgs.slice(),
    generatedAt: new Date().toISOString(),
    endedManually: !!opts.manual,
    _pendingExtract: true   // 4AM 일괄 처리 마커 (case_analysis + topic_extract 둘 다)
  };
  state.chatArchive.unshift(archiveItem);
  state.chatMessages = [];
  // 단계 2: chapter 분리 시 _chatWindowStart reset (새 챕터 = 신규 시작).
  if (typeof _chatWindowStart !== 'undefined') _chatWindowStart = null;
  pruneOldChatArchive();

  // 신규유저 빠른 추출 — 첫 3 챕터만 즉시 API 호출 (case + topic 둘 다)
  if (typeof state.chapterCompletedCount !== 'number') state.chapterCompletedCount = 0;
  state.chapterCompletedCount += 1;
  saveState();

  if (state.chapterCompletedCount <= 3 && typeof _canAI === 'function' && _canAI()
      && !window._onbTutorialMode
      && !(state.preferences && state.preferences.testerMode)
      && archiveItem.messages.length >= 6) {
    setTimeout(async () => {
      try {
        if (typeof extractChapterCaseAnalysis === 'function') {
          try { await extractChapterCaseAnalysis(archiveItem.messages); }
          catch (e) { console.warn('[new-user extract] case fail:', e); }
        }
        if (typeof extractPreviousChapterTopics === 'function') {
          try { await extractPreviousChapterTopics(archiveItem.messages); }
          catch (e) { console.warn('[new-user extract] topic fail:', e); }
        }
        delete archiveItem._pendingExtract;
        delete archiveItem._pendingCaseAnalysis;  // legacy 호환
        saveState();
        if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
      } catch (e) { console.warn('[new-user extract] guard:', e); }
    }, 1500);
  }
  return archiveItem;
}

// V4 (v8 묶음 5): 튜토리얼 step ID 체크 helper — 현재 _onbStep 이 주어진 stepId 인지
function _isOnboardingStep(stepId) {
  if (!window._onbTutorialMode) return false;
  if (typeof _onbStep !== 'number' || !Array.isArray(ONBOARDING_STEPS)) return false;
  const step = ONBOARDING_STEPS[_onbStep];
  return !!(step && step.id === stepId);
}

// 사용자 명시 2026-05-01 ultrathink: ✓ 마무리 hint 배너 dismiss.
function dismissChatEndHint() {
  state._chatEndHintDismissed = true;
  saveState();
  const _b = document.getElementById('chatEndHintBanner');
  if (_b) _b.style.display = 'none';
}

// V3.13.x: 대화 마무리 — 사용자가 능동적으로 챕터 끊기.
// V4 사용자 명시 2026-05-01 ultrathink: _archiveCurrentChapter 단일 흐름으로 통일.
async function endChapter() {
  const validMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  if (validMsgs.length < 2) {
    showToast('대화가 너무 짧아 마무리할 게 없어');
    return;
  }
  const yes = await showConfirmModal({
    title: '이 대화 마무리할까?',
    message: '원본은 7일 뒤 자동으로 사라져.',
    okLabel: '마무리 ✦',
    cancelLabel: '취소'
  });
  if (!yes) return;
  const archived = _archiveCurrentChapter({ manual: true, minMessages: 2 });
  // V4 (v8 묶음 5): chapter_close_intro 시점 archive 핀 영구 + intakeArchiveId stash → 7일 cap 우회 (pruneOldChatArchive pinned=true 분기)
  if (archived && _isOnboardingStep('chapter_close_intro')) {
    archived.pinned = true;
    state._intakeArchiveId = archived.id;
    saveState();
  }
  // V4 (v8 묶음 16): 챕터 마무리 첫 사용 placeholder dismiss
  if (archived && typeof dismissPlaceholder === 'function') dismissPlaceholder('chapter');
  if (typeof renderChat === 'function') renderChat();
  showToast(archived ? '정리 됐어 ✦' : '대화가 짧아 정리 안 했어');
}

// V4-fix: chatArchive 7일 cap (잠깐 보관용)
// 사용자 요청 2026-04-29: pinned=true 항목은 영구 보관 (7일 cap 무시)
function pruneOldChatArchive() {
  if (!Array.isArray(state.chatArchive)) return;
  const cutoff = Date.now() - 7 * 86400000;
  const before = state.chatArchive.length;
  state.chatArchive = state.chatArchive.filter(a => {
    if (!a) return false;
    if (a.pinned) return true;  // 핀 꽂힌 거 영구 보관
    if (!a.date) return false;
    const t = new Date(a.date + 'T12:00:00').getTime();
    return t >= cutoff;
  });
  if (state.chatArchive.length < before) saveState();
}

// 사용자 요청 2026-04-29: chatArchive 항목 핀 토글 — 영구 보관 / 7일 cap 복귀
function toggleArchivePin(date) {
  if (!Array.isArray(state.chatArchive)) return;
  const item = state.chatArchive.find(a => a && a.date === date);
  if (!item) return;
  item.pinned = !item.pinned;
  saveState();
  if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
  if (typeof showToast === 'function') {
    showToast(item.pinned ? '📌 영구 보관됨 — 7일 자동 삭제 안 돼' : '📌 핀 풀림 — 7일 cap 다시 적용');
  }
}

async function showDiaryTemplates() {
  const choice = await showOptionsModal({
    title: '📝 일기 템플릿',
    message: '클릭만 해도, 한 단어만 답해도 자동으로 완성!',
    options: DIARY_TEMPLATES.map(t => ({ label: t.label, value: t.id, desc: t.desc }))
  });
  if (!choice) return;
  const tpl = DIARY_TEMPLATES.find(t => t.id === choice);
  if (!tpl) return;
  // V4-fix v3 (사용자 요청): 테스터 모드 → placeholder 예시 자동 채움
  const isTester = !!(state.preferences && state.preferences.testerMode);
  const tplExamples = {
    'short':  '오늘 잘 지냄. 큰 일 X.',
    'good':   '카페에서 작업 잘 됨',
    'hard':   '집중 안 됨. 무력감.',
    'plan':   '보고서 한 단락',
    'feel':   '평온'
  };
  const answer = await showInputModal({
    title: tpl.label,
    message: tpl.prompt + ' (비워두고 OK 누르면 그냥 저장)',
    placeholder: tpl.placeholder,
    defaultValue: isTester ? (tplExamples[tpl.id] || '') : '',
    okLabel: '완성 ✦'
  });
  if (answer === null) return;  // 취소
  const completed = tpl.format((answer || '').trim());
  // chatInput에 set + 즉시 send
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = completed;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof sendChat === 'function') {
    setTimeout(() => sendChat(), 50);
  }
}

// V3.13.x: 메시지 ⋮ 메뉴 — 복사 / 수정 / 삭제
async function showMessageMenu(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.typing) return;
  const isUser = msg.role === 'user';
  const options = [{ label: '📋 복사', value: 'copy' }];
  if (isUser) {
    options.push({ label: '✎ 텍스트만 수정', value: 'editText' });
    options.push({ label: '↻ 여기서부터 다시 보내기', value: 'editResend' });
  }
  // V4-1j-a: 숙고 질문으로 보내기 (메시지 텍스트 → 질문 prefill)
  options.push({ label: '🌊 숙고 질문으로 보내기', value: 'reflection' });
  options.push({ label: '✕ 삭제', value: 'delete' });
  const action = await showOptionsModal({
    title: isUser ? '내 메시지' : '소라고동 메시지',
    options
  });
  if (!action) return;
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      showToast('📋 복사됨');
    } catch (e) {
      showToast('복사 실패. 직접 선택해서 복사해줘.');
    }
    return;
  }
  if (action === 'reflection') {
    // V4-1j-a: 메시지 텍스트를 prefill로 → 사용자 편집 → addReflectionQuestion
    const prefilled = (msg.content || '').slice(0, 280);
    const qText = await showInputModal({
      title: '🌊 숙고 질문으로',
      message: '깊이 보고 싶은 질문 형태로 다듬어. 답이 바로 안 나와도 OK.',
      defaultValue: prefilled,
      multiline: true,
      maxLength: 300,
      okLabel: '추가'
    });
    if (qText && qText.trim()) {
      const q = await addReflectionQuestion(qText.trim());
      if (q && q.id) {
        // sourceMsgIdx 넣음 (스크랩 출처 추적)
        q.source = 'scrap';
        q.sourceMsgIdx = idx;
        saveState();
      }
    }
    return;
  }
  if (action === 'editText') {
    const newText = await showInputModal({
      title: '메시지 수정 (텍스트만)',
      message: '내용만 바꿔. AI 재호출 X.',
      defaultValue: msg.content || '',
      multiline: true,
      okLabel: '저장'
    });
    if (newText === null) return;
    const t = newText.trim();
    if (!t) return;
    msg.content = t;
    saveState();
    renderChat();
    showToast('수정됨 ✦');
    return;
  }
  if (action === 'editResend') {
    const newText = await showInputModal({
      title: '여기서부터 다시 보내기',
      message: '이 메시지 이후 모든 대화가 삭제되고 AI가 다시 답해.',
      defaultValue: msg.content || '',
      multiline: true,
      okLabel: '다시 보내기'
    });
    if (newText === null) return;
    const t = newText.trim();
    if (!t) return;
    msg.content = t;
    msg.timestamp = new Date().toISOString();
    state.chatMessages = state.chatMessages.slice(0, idx + 1);
    saveState();
    renderChat();
    await generateAIResponse();
    return;
  }
  if (action === 'delete') {
    const yes = await showConfirmModal({
      title: '이 메시지 삭제',
      message: isUser
        ? '이 메시지 + 직후 AI 응답이 같이 삭제돼.\n되돌릴 수 없어.'
        : '이 메시지가 삭제돼.\n되돌릴 수 없어.',
      okLabel: '삭제', cancelLabel: '취소'
    });
    if (!yes) return;
    if (isUser) {
      // 사용자 메시지 + 직후 AI 응답 (있으면) 삭제
      let removeCount = 1;
      if (state.chatMessages[idx + 1] && state.chatMessages[idx + 1].role === 'assistant') {
        removeCount = 2;
      }
      state.chatMessages.splice(idx, removeCount);
    } else {
      state.chatMessages.splice(idx, 1);
    }
    saveState();
    renderChat();
    showToast('삭제됨');
    return;
  }
}

async function retryMessage(errorIdx) {
  // V3.4: 같은 user message에 대한 retry 시 직전 N분 내 추출된 trait/pattern 추적
  state._lastRetryAt = Date.now();
  state.chatMessages.splice(errorIdx, 1);
  renderChat();
  saveState();
  await generateAIResponse();
}

// 사용자 요청 2026-04-30 ultrathink Task 7: Hybrid Opus 토글 — chat 모드 전환 + 토스트 차감 안내
// 사용자 명시 2026-05-02 ultrathink: Opus 사용 가드 — Premium 전용. 튜토리얼 동안은 자유.
function canUseOpus() {
  if (window._onbTutorialMode) return true;  // 튜토리얼 자유
  // refreshBillingStatus 가 set 하는 마지막 cache 활용
  const billing = window._billingCache;
  if (!billing) return false;  // billing 정보 없으면 안전 차단
  if (billing.subscription_plan !== 'premium') return false;
  if (!billing.subscription_active) return false;
  // 일일 한도 체크는 server에서 (consume_opus_daily_atomic). 클라는 토글만 막음.
  return true;
}

function toggleChatModel() {
  state.preferences = state.preferences || {};
  const next = !state.preferences.useOpus;
  // 사용자 명시 2026-05-02 ultrathink: Premium 아닌 사용자가 Opus 켜려고 하면 차단 + 구독 안내.
  if (next && !canUseOpus()) {
    showToast('🦉 Opus 깊은 대화는 Premium 에서만');
    if (typeof openSubscribeModal === 'function') {
      setTimeout(() => openSubscribeModal(), 700);
    }
    return;
  }
  state.preferences.useOpus = next;
  saveState();
  updateChatModeBtn();
  if (next) {
    showToast('🦉 Opus 모드 — 깊게 (일일 30번)');
  } else {
    showToast('고동이 (Sonnet) 모드 — 기본 (충분히 깊은 대화)');
  }
  // V4 (v8 묶음 18): Opus 토글 첫 사용 inline tip
  if (typeof _showInlineTip === 'function') _showInlineTip('opusToggle');
}
function updateChatModeBtn() {
  // 사용자 요청 2026-04-30: 모델 토글 4곳 통일 (메인 헤더 + 숙고의 방 + 마법 helpChat + 돌연변이 임시대화창). 모든 .js-chat-mode-btn 인스턴스 동기 갱신.
  // Sonnet 표시 = godongicon.png 이미지, Opus = 🦉 이모지.
  const useOpus = !!(state.preferences && state.preferences.useOpus);
  const titleAttr = useOpus
    ? '🦉 Opus 모드 (잔액 5x 빠르게 차감) — 누르면 Sonnet으로'
    : '고동이 (Sonnet) 모드 — 누르면 Opus로'; // 사용자 명시 2026-04-30: 고동이 페르소나
  document.querySelectorAll('.js-chat-mode-btn').forEach(btn => {
    btn.classList.toggle('opus', useOpus);
    btn.innerHTML = useOpus ? '🦉' : '<img src="/godongicon.png" alt="" class="chat-mode-img">';
    btn.setAttribute('title', titleAttr);
  });
}

async function generateAIResponse(modelOverride) {
  state.chatMessages = state.chatMessages.filter(m => !m.typing);
  state.chatMessages.push({ role: 'assistant', content: '...', typing: true });
  renderChat();

  // 사용자 요청 2026-04-30 (Phase C): apiKey 비어있어도 백엔드 프록시로 동작.
  // session 활성 여부만 체크 (fetch interceptor가 자동으로 /api/chat 라우팅).
  if (!_canAI() &&(typeof session === 'undefined' || !session || !session.access_token)) {
    state.chatMessages[state.chatMessages.length - 1] = {
      role: 'assistant', content: '로그인이 필요해! 새로고침 후 다시 시도해줘 🐚',
      timestamp: new Date().toISOString()
    };
    saveState(); renderChat(); return;
  }

  try {
    // V3.8: 프롬프트 캐싱 — stable 부분 캐시 (90% 비용 절감)
    const promptParts = buildSystemPromptParts();
    const systemBlocks = [];
    if (promptParts.stable && promptParts.stable.length > 0) {
      systemBlocks.push({
        type: 'text',
        text: promptParts.stable,
        // 사용자 요청 2026-04-29 비용절감: 1h cache TTL — ADHD burst+break 패턴, 5분 default 만료 회피 → 헤비 사용자 ~10% 절감.
        cache_control: { type: 'ephemeral' }
      });
    }
    if (promptParts.volatile && promptParts.volatile.length > 0) {
      systemBlocks.push({
        type: 'text',
        text: promptParts.volatile
      });
    }
    
    // V3.8: 현재 챕터(마지막 chapterStart 이후) 메시지만 컨텍스트로
    // 이전 챕터는 caseFormulation/traits/vault에 이미 흡수됨 → 비용 ↓
    const validMsgs = state.chatMessages.filter(m => !m.typing && !m.error);
    let chapterStartIdx = 0;
    for (let i = validMsgs.length - 1; i >= 0; i--) {
      if (validMsgs[i].chapterStart) { chapterStartIdx = i; break; }
    }
    // 사용자 명시 2026-05-02 ultrathink: 챕터 시작 후 cap 25 → 20 (sweet spot 20-30 안 하단).
    // 5h+ 갭이면 archive 이송 후 챕터 비워지므로 단절 위험 낮음. messages 영역 ~15% 토큰 절감.
    const fromChapter = validMsgs.slice(chapterStartIdx);
    const sliced = fromChapter.length > 20
      ? fromChapter.slice(-20)
      : fromChapter.length > 0
        ? fromChapter
        : validMsgs.slice(-20);
    const messages = sliced.map(m => ({ role: m.role, content: m.content }));

    // 사용자 명시 2026-05-01 ultrathink: messages prefix cache_control — 마지막 user 메시지 직전 turn 에 ephemeral breakpoint.
    // 같은 챕터 안 연속 호출 (1h TTL) 시 옛 turn 들이 90% 할인 prefix cache hit. 4단 분석 응답 (~1000 토큰) 비싼 turn 도 cached.
    // breakpoint 위치 매 호출마다 끝쪽으로 이동 — Anthropic 의 prefix-match 자동 cache 패턴 활용.
    if (messages.length >= 2) {
      const _cacheIdx = messages.length - 2;
      const _last = messages[_cacheIdx];
      messages[_cacheIdx] = {
        role: _last.role,
        content: [{ type: 'text', text: _last.content, cache_control: { type: 'ephemeral' } }]
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({
        _endpoint: 'chat_main',
        // 사용자 요청 2026-04-30 ultrathink Task 7: useOpus 토글 시 Opus, 아니면 Sonnet
        model: modelOverride || ((state.preferences && state.preferences.useOpus) ? 'claude-opus-4-7' : 'claude-sonnet-4-6'),
        max_tokens: 2000,
        stream: true,
        system: systemBlocks,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('API error response:', err);
      let parsed = {};
      try { parsed = JSON.parse(err); } catch {}
      // 사용자 요청 2026-04-30: 402 (잔액·cap 도달) → 결제 모달 자동 표시 (Claude 패턴)
      if (response.status === 402) {
        if (state.chatMessages[state.chatMessages.length - 1]?.typing) state.chatMessages.pop();
        saveState(); renderChat();
        if (typeof showBudgetExceededModal === 'function') {
          showBudgetExceededModal(parsed.error || '잔액 / 한도 도달');
        }
        return;
      }
      // 사용자 명시 2026-05-02 ultrathink: Opus Premium 전용 + 일일 30번 한도 응답 처리.
      if (response.status === 403 && parsed.code === 'OPUS_PREMIUM_ONLY') {
        if (state.chatMessages[state.chatMessages.length - 1]?.typing) state.chatMessages.pop();
        // Sonnet 으로 자동 fallback
        state.preferences.useOpus = false;
        if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
        saveState(); renderChat();
        showToast('🦉 Opus 깊은 대화는 Premium 에서만');
        if (typeof openSubscribeModal === 'function') {
          setTimeout(() => openSubscribeModal(), 700);
        }
        return;
      }
      if (response.status === 429 && parsed.code === 'OPUS_DAILY_LIMIT') {
        if (state.chatMessages[state.chatMessages.length - 1]?.typing) state.chatMessages.pop();
        // Sonnet 으로 자동 fallback
        state.preferences.useOpus = false;
        if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
        saveState(); renderChat();
        if (typeof showOpusLimitReachedModal === 'function') {
          showOpusLimitReachedModal();
        } else {
          showToast('🫂 오늘 깊은 대화 다 나눴네');
        }
        return;
      }
      // V3.13.x: 응답 본문에서 message 추출해서 사용자에게 보여주기
      let detail = '';
      if (parsed.error?.message) detail = ' — ' + parsed.error.message.slice(0, 150);
      else if (err) detail = ' — ' + err.slice(0, 100);
      throw new Error('API ' + response.status + detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    state.chatMessages[state.chatMessages.length - 1] = { role: 'assistant', content: '', timestamp: new Date().toISOString() };

    // V4.0: 스트리밍 부분 업데이트 — 첫 청크만 renderChat (빈 bubble DOM 생성), 이후엔 마지막 bubble innerHTML만 갱신.
    // 이전: 매 청크마다 전체 메시지 N개 escape+format 재생성 → 200+ 메시지에서 lag.
    let _streamFirstChunk = true;
    let _streamPending = null;
    let _streamRafId = null;
    const flushStreamUpdate = () => {
      _streamRafId = null;
      if (_streamPending === null) return;
      const text = _streamPending; _streamPending = null;
      const container = document.getElementById('chatMessages');
      if (!container) return;
      const bubbles = container.querySelectorAll('.msg.assistant .msg-bubble');
      const lastBubble = bubbles[bubbles.length - 1];
      if (!lastBubble) return;
      // formatAIResponse 호출은 1개 bubble만 → 전체 재렌더보다 압도적으로 빠름.
      // ⋮ 메뉴 버튼은 typing/error 아닌 메시지에만 붙는데, 스트리밍 중엔 typing 끝난 상태라
      // renderChat이 이미 menuBtn을 포함해서 그렸음. 우린 .innerHTML로 통째 교체하니
      // formatAIResponse 결과 + menuBtn HTML을 같이 써줘야 함.
      const lastIdx = state.chatMessages.length - 1;
      lastBubble.innerHTML = formatAIResponse(text) +
        `<button class="msg-menu-btn" onclick="showMessageMenu(${lastIdx})" aria-label="더보기">⋮</button>`;
      // 사용자 요청 2026-04-29 (final): _stuckToBottom 일 때만 streaming 자동 스크롤 (ChatGPT 표준)
      // 사용자가 위로 스크롤한 상태면 자동 스크롤 X — 칩으로 새 메시지 알림.
      if (_stuckToBottom) {
        const screen = document.getElementById('screen-chat');
        if (screen) screen.scrollTop = screen.scrollHeight;
      }
    };
    const scheduleStreamUpdate = (text) => {
      _streamPending = text;
      if (_streamRafId !== null) return;
      _streamRafId = requestAnimationFrame(flushStreamUpdate);
    };

    // V4 (사용자 보고 2026-05-03): SSE chunk *line buffer* 누락 fix — chunk 가 line 중간에서 끝나면 split 시 마지막 불완전 line 이 잘려 다음 chunk 첫 line 과 합쳐야 하는데 안 됨 → delta text 누락 → 답변 중간 끊김.
    let _sseBuffer = '';  // 불완전 line 보관
    const _processSSELine = (line) => {
      if (!line.startsWith('data: ')) return;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        // V4 (사용자 보고 2026-05-03): error type 처리 — silent fail 차단. throw → catch 분기에서 사용자 메시지 표시.
        if (parsed.type === 'error') {
          const _emsg = parsed.error?.message || 'Anthropic SSE error';
          throw new Error('SSE error: ' + _emsg);
        }
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          let display = fullText;
          display = display.replace(/```json[\s\S]*?```/g, '');
          display = display.replace(/```json[\s\S]*$/g, '');
          display = display.replace(/```[\s\S]*$/g, ''); // 미완성 fence
          display = display.replace(/\n*\{[\s\S]*$/g, (match) => {
            if (/"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)/.test(match)) {
              return '';
            }
            return match;
          });
          // V3.12.x: orphan JSON 키 (앞에 { 없이 시작) 잡기 — streaming 중 잘렸을 때
          display = display.replace(/[\s,]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)"[\s\S]*$/g, '');
          display = display.trim();
          state.chatMessages[state.chatMessages.length - 1].content = display;
          if (_streamFirstChunk) {
            renderChat();  // 첫 청크: 빈 bubble DOM 생성
            _streamFirstChunk = false;
          } else {
            scheduleStreamUpdate(display);  // 이후: 마지막 bubble innerHTML만 갱신
          }
        }
      } catch (parseErr) {
        // SSE error type → 위로 throw (user-facing 메시지 분기 진입)
        if (parseErr && parseErr.message && parseErr.message.startsWith('SSE error:')) throw parseErr;
        // JSON parse 실패 — silent skip (일반 처리)
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // V4 fix: chunk + 직전 buffer 결합 후 line 단위로 split. 마지막 line 이 *불완전* 가능성 (newline 없이 잘림) → buffer 보관, 다음 chunk 와 합침.
      _sseBuffer += decoder.decode(value, { stream: true });
      const lines = _sseBuffer.split('\n');
      _sseBuffer = lines.pop() || '';  // 마지막 = 불완전 line (다음 chunk 와 합치기 위해 보관)
      for (const line of lines) {
        _processSSELine(line);
      }
    }
    // 스트리밍 끝 — buffer 잔여 처리 (마지막 line 이 newline 없이 끝났다면)
    if (_sseBuffer) {
      _processSSELine(_sseBuffer);
      _sseBuffer = '';
    }
    if (_streamRafId !== null) {
      cancelAnimationFrame(_streamRafId);
      flushStreamUpdate();
    }

    // Extract analysis JSON
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
    let analysisData = null;
    if (jsonMatch) {
      try {
        analysisData = JSON.parse(jsonMatch[1]);
        await processAnalysis(analysisData, state.chatMessages.length - 1);
      } catch (e) { console.error('Analysis parse error:', e); }
    } else {
      const rawJsonMatch = fullText.match(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|proposal|extracted_tasks|decision_suggested)[\s\S]*\}/);
      if (rawJsonMatch) {
        try {
          analysisData = JSON.parse(rawJsonMatch[0]);
          await processAnalysis(analysisData, state.chatMessages.length - 1);
        } catch (e) {}
      }
    }

    const finalDisplay = fullText
      .replace(/```json[\s\S]*?```/g, '')
      .replace(/```[\s\S]*$/g, '')
      .replace(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)[\s\S]*\}/g, '')
      .replace(/[\s,]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)"[\s\S]*$/g, '')
      .trim();
    state.chatMessages[state.chatMessages.length - 1].content = finalDisplay;

    // V3.13.x: 4단 응답 ([오늘의 제안] 또는 다른 4단 라벨 포함) 판정
    // askDeeper로 트리거됐든, 사용자 직접 '어떡하지' 등 도움 요청 → 자동 4단이든 다 해당
    // → fromDeeper(전략으로) + proposal(해볼게) 두 버튼 노출
    const has4Stage = /\[내가 본 것\]|\[이게 뭐냐면\]|\[오늘의 제안\]/.test(fullText);
    if (has4Stage) {
      state.chatMessages[state.chatMessages.length - 1].fromDeeper = true;
      // V4 (v8 묶음 3): [상황] 추출 → message.situation stash → acceptProposal 시 mission.situation 으로 전달
      const sitMatch = fullText.match(/\[상황\]\s*([\s\S]*?)(?=\n*\[내가 본 것\]|\n*\[이게 뭐냐면\]|\n*\[이럴 땐 이렇게\]|\n*\[오늘의 제안\]|$)/);
      if (sitMatch && sitMatch[1] && sitMatch[1].trim()) {
        state.chatMessages[state.chatMessages.length - 1].situation = sitMatch[1].trim().slice(0, 200);
      }
    }

    // Check for proposal in response
    if (fullText.includes('[오늘의 제안]') || (analysisData && analysisData.proposal)) {
      state.chatMessages[state.chatMessages.length - 1].proposal = true;
      if (analysisData && analysisData.proposal) {
        state.chatMessages[state.chatMessages.length - 1].proposalData = analysisData.proposal;
      }
    }

    saveState();
    renderChat();
    renderModelPreview();

  } catch (err) {
    // 사용자 요청 2026-04-28: 에러 종류별 명확한 메시지 (이전엔 'err.message' 그대로 노출 — 이해 어려움)
    // 사용자 보고 2026-04-30 ultrathink: Phase C 마이그 후 키 모델 폐기 — 401은 session 만료. 메시지 분기.
    const m = (err && err.message) || '';
    let userMsg;
    if (/401/.test(m) || /authentication/i.test(m) || /invalid.*api.*key/i.test(m) || /api[_ ]?key/i.test(m)) {
      // 사용자 명시 2026-05-01 (agent audit): state.apiKey 영구 wipe (마이그레이션) 후 Phase C 백엔드 프록시 — 본인 키 분기 dead. session 만료 분기만 보존.
      if (typeof session !== 'undefined' && session && session.access_token) {
        userMsg = '⏰ 로그인 세션이 만료된 것 같아.\n\n페이지 새로고침 또는 로그아웃 → 다시 로그인 해줘.';
      } else {
        userMsg = '🔑 로그인 필요 — 다시 로그인 해줘.';
      }
    } else if (/429/.test(m) || /rate[_ ]?limit/i.test(m) || /quota/i.test(m)) {
      userMsg = '⏳ 잠깐 너무 빨라. 1분 정도 후 다시 시도하거나 Anthropic 대시보드에서 사용량 확인해봐.';
    } else if (/network|failed to fetch|offline/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      userMsg = '📡 인터넷 연결을 확인해봐.\n\n복구되면 "다시 보내기" 눌러줘.';
    } else if (/5\d\d/.test(m)) {
      userMsg = '⚠️ Anthropic 서버 일시 불안정. 잠시 후 다시 보내기 눌러봐.';
    } else {
      userMsg = '연결이 안 됐어 😅\n(' + (m || '알 수 없는 오류') + ')\n\n다시 보내기 버튼을 눌러봐.';
    }
    // V4 (사용자 보고 2026-05-04 VB024): 스트리밍 도중 끊겨도 부분 응답 유지 — 옛 코드는 lastMsg 통째 교체 → 80% 받은 답변도 사라짐.
    // partial content 가 있으면 보존 + 끊김 안내만 suffix 로 붙임. 없으면 옛 동작 (full error 메시지).
    const _lastIdx = state.chatMessages.length - 1;
    const _lastMsg = state.chatMessages[_lastIdx];
    const _hasPartial = _lastMsg && !_lastMsg.typing && typeof _lastMsg.content === 'string' && _lastMsg.content.trim().length > 30;
    if (_hasPartial) {
      _lastMsg.content = _lastMsg.content.trimEnd() + '\n\n— ⚠️ 답변 도중 끊김 — 다시 보내기로 이어가';
      _lastMsg.error = true;
      _lastMsg.canRetry = true;
      _lastMsg.partial = true;
      _lastMsg.timestamp = _lastMsg.timestamp || new Date().toISOString();
    } else {
      state.chatMessages[_lastIdx] = {
        role: 'assistant',
        content: userMsg,
        error: true,
        canRetry: true,
        timestamp: new Date().toISOString()
      };
    }
    saveState(); renderChat();
  }
}

async function processAnalysis(analysis, messageIdx) {
  // V3.4: retry로 인한 중복 방지. 직전 3분 내 retry 호출되었다면 신규 추가 X
  const recentRetry = state._lastRetryAt && (Date.now() - state._lastRetryAt < 3 * 60 * 1000);

  // 사용자 요청 2026-04-30: traits/values/patterns/case_formulation_update 처리 → extractChapterCaseAnalysis (endChapter 시점).
  // 매 메시지 추출 + isUITrigger 가드 + _prevUserIdx 부분 dead code로 제거. insight/proposal/decision_suggested/extracted_tasks 등 메시지 단위는 아래 유지.
  // === [나 탭 자동 정리] 신규 추가 후 완전 일치 strict dedupe 한 번 더 ===
  // similarText fuzzy로 못 잡힌 케이스 (다른 이름인데 description 완전 일치 등) 정리
  dedupeAllModelExactDuplicates();
  if (analysis.insight) {
    state.chatMessages[messageIdx].insightCandidate = analysis.insight;
  }
  if (analysis.proposal) {
    state.chatMessages[messageIdx].proposalData = analysis.proposal;
  }
  // Decision suggestion (V3.1)
  if (analysis.decision_suggested && analysis.decision_suggested.title) {
    const ds = analysis.decision_suggested;
    // Don't suggest if user already declined a similar one in last 30 messages
    const recentDeclines = state.chatMessages.slice(-30).filter(m => 
      m.decisionResponse === 'decline' && m.decisionSuggested
    );
    const alreadyDeclined = recentDeclines.find(m => 
      similarText(m.decisionSuggested.title || '', ds.title || '')
    );
    // Don't suggest if there's already an active decision with similar title
    const hasActive = (state.decisions || []).some(d => 
      d.status === 'in_progress' && similarText(d.title || '', ds.title || '')
    );
    if (!alreadyDeclined && !hasActive) {
      state.chatMessages[messageIdx].decisionSuggested = {
        title: String(ds.title).trim().slice(0, 60),
        reason: ds.reason ? String(ds.reason).trim().slice(0, 200) : ''
      };
    }
  }
  // V3: Memory Vault auto-extraction → 확인 step (V3.6)
  // 변경: 즉시 추가 X. 사용자에게 카드로 물어보고 "응" 누를 때만 저장.
  if (analysis.extracted_tasks && Array.isArray(analysis.extracted_tasks)) {
    const proposals = [];
    analysis.extracted_tasks.forEach(taskText => {
      if (!taskText || typeof taskText !== 'string') return;
      const cleanText = taskText.trim().slice(0, 200);
      if (!cleanText) return;
      // 이미 vault에 있는지 (최근 20개) — fuzzy로 먼저 차단
      const existsInVault = (state.memoryVault || []).slice(-20).find(v => 
        v.content && similarText(v.content, cleanText)
      );
      if (existsInVault) return;
      // 같은 메시지에 같은 제안 중복도 차단
      if (proposals.some(p => exactSameText(p.content, cleanText))) return;
      proposals.push({
        proposalId: 'vp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        content: cleanText,
        responded: false,
        accepted: null
      });
    });
    if (proposals.length > 0) {
      // 메시지에 pending proposal로 저장 (renderChat에서 카드로 표시)
      state.chatMessages[messageIdx].vaultProposals = proposals;
    }
  }
  // 사용자 요청 2026-04-28: 채팅에서 일정 추출 → 자동 todaySchedule 등록
  if (analysis.extracted_schedule && Array.isArray(analysis.extracted_schedule)) {
    if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
    const todayK = todayKey();
    const colors = ['#d4a76a','#8fc88f','#7ec8e3','#b39ddb','#ff8da1','#ffb86b','#5fcfba'];
    let added = 0;
    analysis.extracted_schedule.forEach((it, i) => {
      if (!it || !it.title || !it.start || !it.end) return;
      if (!/^\d{1,2}:\d{2}$/.test(it.start) || !/^\d{1,2}:\d{2}$/.test(it.end)) return;
      // 같은 시간대 중복 방지
      const dup = state.todaySchedule.some(s =>
        s.date === todayK && s.title === String(it.title).trim().slice(0,40) && s.start === it.start
      );
      if (dup) return;
      state.todaySchedule.push({
        id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        title: String(it.title).trim().slice(0,40),
        start: it.start,
        end: it.end,
        date: todayK,
        source: 'chat',
        taskId: null,
        color: colors[(state.todaySchedule.length + i) % colors.length]
      });
      added++;
    });
    if (added > 0) {
      showToast(`📅 ${added}개 일정 추가됨`);
      // 실행 탭 (timetable 포함) 즉시 갱신
      if (typeof renderExecute === 'function') { try { renderExecute(); } catch {} }
      // V4 (v8 묶음 16): 일정 자동 추가 placeholder dismiss
      if (typeof dismissPlaceholder === 'function') dismissPlaceholder('schedule');
    }
  }
  // 사용자 요청 2026-04-28: 채팅에서 진주 추가 요청 추출 → state.pearls에 자동 등록
  if (analysis.extracted_pearls && Array.isArray(analysis.extracted_pearls)) {
    if (!Array.isArray(state.pearls)) state.pearls = [];
    const validCats = ['음악', '음식', '장소', '순간', '사람', '기타'];
    let addedPearls = 0;
    analysis.extracted_pearls.forEach(p => {
      if (!p || !p.content || typeof p.content !== 'string') return;
      const content = p.content.trim().slice(0, 200);
      if (!content) return;
      const category = validCats.includes(p.category) ? p.category : '기타';
      // 같은 content 중복 방지 (대소문자 무시)
      const dup = state.pearls.some(x => x && x.content &&
        x.content.toLowerCase().trim() === content.toLowerCase()
      );
      if (dup) return;
      state.pearls.push({
        id: 'pearl_chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        category,
        content,
        note: p.note ? String(p.note).trim().slice(0, 200) : null,
        createdAt: new Date().toISOString(),
        type: 'pearl',
        source: 'chat'
      });
      addedPearls++;
    });
    if (addedPearls > 0) {
      showToast(`🔮 ${addedPearls}개 진주 추가됨`);
      // 진주 화면 / 도서관 hero 즉시 갱신
      if (typeof renderLensPearls === 'function') { try { renderLensPearls(); } catch {} }
      if (typeof renderLibraryHero === 'function') { try { renderLibraryHero(); } catch {} }
    }
  }
  saveState();
}

// V3.6: showVaultToast deprecated — vaultProposals 카드로 대체됨 (V3.7에서 제거)



// V4 (v8 묶음 4): 더 알아보기 빈도 cap (Plan 별) — Free 1 / Light 2 / Earlybird 3 / Premium 8 / 튜토리얼 무제한 + 쿨다운 30분
function _getDailyDeeperCap() {
  if (window._onbTutorialMode) return Infinity;
  if (state.preferences && state.preferences.testerMode) return Infinity;
  const billing = window._billingCache;
  const plan = billing?.subscription_plan;
  if (plan === 'premium') return 8;
  if (plan === 'light') return 2;
  if (billing?.earlybird) return 3;
  return 1;
}
function _getTodayDeeperCount() {
  const todayK = todayKey();
  if (!state._dailyDeeperCount || state._dailyDeeperCount.date !== todayK) {
    state._dailyDeeperCount = { date: todayK, count: 0, lastAt: 0, capToastShown: false };
  }
  return state._dailyDeeperCount.count;
}
function _incrementDailyDeeperCount() {
  _getTodayDeeperCount();
  state._dailyDeeperCount.count += 1;
  state._dailyDeeperCount.lastAt = Date.now();
  saveState();
}
function _checkDeeperEligibility() {
  const cap = _getDailyDeeperCap();
  if (cap === Infinity) return { ok: true, current: 0, cap: Infinity };
  const current = _getTodayDeeperCount();
  const lastAt = (state._dailyDeeperCount && state._dailyDeeperCount.lastAt) || 0;
  const cooldownLeft = (lastAt + 30 * 60 * 1000) - Date.now();
  if (cooldownLeft > 0 && current > 0) return { ok: false, current, cap, cooldown: cooldownLeft, reason: 'cooldown' };
  return { ok: current < cap, current, cap, reason: current < cap ? null : 'cap' };
}
function _showDeeperCapToast() {
  const elig = _checkDeeperEligibility();
  if (elig.reason === 'cooldown') {
    const minLeft = Math.ceil((elig.cooldown || 0) / 60000);
    showToast(`⏳ 깊은 분석 쿨다운 — ${minLeft}분 후 다시`);
  } else {
    showToast(`🔒 오늘 깊은 분석 ${elig.cap}회 다 썼어 — 내일 또`);
  }
}

// V3: 짧은 답을 더 깊게 분석 요청
async function askDeeper(messageIdx) {
  // V4 (v8 묶음 4): 진입 시 eligibility 체크
  const elig = _checkDeeperEligibility();
  if (!elig.ok) {
    _showDeeperCapToast();
    return;
  }
  // V4 (v8 묶음 16): 더 알아보기 첫 사용 placeholder dismiss
  if (typeof dismissPlaceholder === 'function') dismissPlaceholder('deeper');
  // Find the user message before this assistant response
  let userMsgIdx = messageIdx - 1;
  while (userMsgIdx >= 0 && state.chatMessages[userMsgIdx].role !== 'user') {
    userMsgIdx--;
  }
  if (userMsgIdx < 0) {
    showToast('관련 대화를 찾을 수 없어');
    return;
  }
  const userMsg = state.chatMessages[userMsgIdx];
  
  // V4-fix v3 (사용자 요청): 더 알고 싶어 → 4단 + 진단 인용 강제
  // V4 (v8 묶음 3): [상황] prefix 추가 — 결과 체크 모달 📌 원래 문제 박스용. 사용자 화면에선 출력 시 제거됨 (formatAIResponse).
  state.chatMessages.push({
    role: 'user',
    content: '아까 그 얘기, 4단계로 더 깊게 분석해줘. [상황] / [내가 본 것] / [이게 뭐냐면] / [이럴 땐 이렇게] / [오늘의 제안] 형식으로. [상황]은 사용자가 시도하려는 *원래 문제*를 한 줄로 요약 (50자 내, 미션 결과 체크 모달용 — 화면엔 안 보임). 그 외 4단은 네가 관찰한 패턴도 한 줄 자연스럽게 인용해줘.',
    timestamp: new Date().toISOString(),
    isDeeperRequest: true
  });
  saveState();
  renderChat();
  // 사용자 요청 2026-04-30: '더 알아보기' 4단 응답 = 깊은 분석 → opus 4.7. 평소 메인 chat은 sonnet 유지.
  await generateAIResponse('claude-opus-4-7');
  // V4 (v8 묶음 4): 사용 후 increment + cap 도달 시 한 번만 토스트
  if (!window._onbTutorialMode && !(state.preferences && state.preferences.testerMode)) {
    _incrementDailyDeeperCount();
    const after = _checkDeeperEligibility();
    if (!after.ok && after.reason === 'cap' && state._dailyDeeperCount && !state._dailyDeeperCount.capToastShown) {
      state._dailyDeeperCount.capToastShown = true;
      saveState();
      showToast(`🔒 오늘 깊은 분석 ${after.cap}회 다 썼어 — 내일 또`);
    }
  }
}

function similarText(a, b) {
  if (!a || !b) return false;
  const n = s => s.toLowerCase().replace(/\s+/g, '');
  return n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a));
}

// === [나 탭 자동 정리] 완전 일치 문장만 strict 비교 ===
// similarText는 fuzzy(부분일치 포함). 사용자 명시 요구는 "전체 문장이 완전히 일치하면" 만.
// 대소문자/공백 normalize는 하되, 부분 일치는 안 잡음.
function exactSameText(a, b) {
  if (!a || !b) return false;
  const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

// 두 항목이 "내용상 완전히 같은 항목"인지 (이름 + 설명 모두 완전 일치)
function exactSameModelItem(a, b, fields) {
  return fields.every(f => exactSameText(a[f] || '', b[f] || ''));
}

// 배열에서 완전 일치 항목 제거 (먼저 들어온 것 보존, 나중에 들어온 중복 제거)
function dedupeExactArray(arr, fields) {
  if (!Array.isArray(arr)) return arr;
  const out = [];
  arr.forEach(item => {
    if (!item) return;
    const dup = out.find(existing => exactSameModelItem(existing, item, fields));
    if (dup) {
      // 중복인 경우: evidence_count 합산 + confidence 유지
      dup.evidence_count = (dup.evidence_count || 1) + (item.evidence_count || 1);
      if ((item.confidence || 0) > (dup.confidence || 0)) dup.confidence = item.confidence;
      if (item.user_verified) dup.user_verified = true;
    } else {
      out.push(item);
    }
  });
  return out;
}

// case_formulation의 problems/mechanisms/strengths는 단순 문자열 배열
function dedupeStringArray(arr) {
  if (!Array.isArray(arr)) return arr;
  const out = [];
  arr.forEach(s => {
    if (!s) return;
    if (!out.some(existing => exactSameText(existing, s))) out.push(s);
  });
  return out;
}

// 한 번에 모든 모델 데이터 정리
function dedupeAllModelExactDuplicates() {
  let changed = false;
  const beforeT = (state.traits || []).length;
  const beforeV = (state.values || []).length;
  const beforeP = (state.patterns || []).length;
  state.traits = dedupeExactArray(state.traits || [], ['name', 'description']);
  state.values = dedupeExactArray(state.values || [], ['name', 'description']);
  state.patterns = dedupeExactArray(state.patterns || [], ['name', 'description', 'trigger', 'sequence']);
  if (state.caseFormulation) {
    const cf = state.caseFormulation;
    const bP = (cf.problems || []).length;
    const bM = (cf.mechanisms || []).length;
    const bS = (cf.strengths || []).length;
    cf.problems = dedupeStringArray(cf.problems || []);
    cf.mechanisms = dedupeStringArray(cf.mechanisms || []);
    cf.strengths = dedupeStringArray(cf.strengths || []);
    if (bP !== cf.problems.length || bM !== cf.mechanisms.length || bS !== cf.strengths.length) changed = true;
  }
  if (beforeT !== state.traits.length || beforeV !== state.values.length || beforeP !== state.patterns.length) changed = true;
  if (changed) {
    console.log(`✦ 나 탭 정리: traits ${beforeT}→${state.traits.length}, values ${beforeV}→${state.values.length}, patterns ${beforeP}→${state.patterns.length}`);
  }
  return changed;
}

