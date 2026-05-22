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

  // V4 (사용자 명시 2026-05-15): ✓ 마무리 hint 배너 — 첫 ✓ 누를 때까지만 (chapterCompletedCount === 0) + x dismiss 도 유지.
  //   첫 챕터 마무리 (endChapter 가 chapterCompletedCount 1 로 만듦) 자체가 자연 dismiss trigger.
  const _endHintBanner = document.getElementById('chatEndHintBanner');
  if (_endHintBanner) {
    const _showHint = ((state.chapterCompletedCount || 0) === 0) && !state._chatEndHintDismissed;
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
    // V4 (사용자 명시 2026-05-16 ultrathink): empty state opener / examples 토글 완전 제거.
    // 사용자가 들어오면 입력창만. 첫 줄 안내 X.
    // V4 (사용자 명시 2026-05-17 ultrathink): 저녁 6시+ + 미체크인 + dayK 내 미dismiss → 체크인 floating 카드 1개.
    //   메시지 send 시 dismiss (sendChat 의 set flag 후 자연 진입). push 진입 (hookTrigger) 시 chatMessages 가
    //   이미 채워져 있어 empty branch 진입 X → 자동 suppress.
    container.innerHTML = archiveHeader + _chatEmptyAreaHtml();
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

// V4 (사용자 명시 2026-05-17 ultrathink): 챗 empty 영역 dispatcher.
//   저녁 (h >= 18 OR h < 4, dev flag 우선) + 미체크인 + 미dismiss → 체크인 floating 카드.
//   낮 → '안녕?' 어시 버블 + '무슨 말 할까?' 토글 (예시 10개 펼침).
//   튜토리얼 / onbMode → '' (방해 X).
//   push 진입은 chatMessages 가 차서 empty branch 진입 X → 자동 suppress.
function _chatEmptyAreaHtml() {
  try {
    if (window._onbTutorialMode) return '';
    // V4 사용자 명시 2026-05-23 ultrathink — empty entry 디자인 명세:
    //   1. AI welcome bubble — avatar (모드별, default expression = soft-smile) + 말풍선 2줄 (편하게 말해 보소 / 모드별 부수).
    //   2. ⓘ 일기 안내 — null/daily 모드만. 클릭 시 hint 펼침/접힘.
    //   3. chip 3 (말풍선 형태, 좌측 정렬, 모드별 고유 색) — chatMode null 일 때만 노출. 누르면 selectChatMode 만 (자동 send X).
    //   4. 저녁 미체크인 = 추가 체크인 카드 (별개 system).
    const chatMode = (typeof state !== 'undefined' && state && state.chatMode) || null;
    // V4 사용자 명시 2026-05-23 (재) — 아바타 click → 시트 open (= 헤더 토글과 동일 동작, 둘 다 entry).
    const avatarHtml = (typeof composedCharacterHtml === 'function')
      ? `<div class="msg-avatar" role="button" tabindex="0" aria-label="대화 모드 변경" onclick="onChatModeHeaderClick()">${composedCharacterHtml({ mode: chatMode, useGlasses: false })}</div>`
      : '';
    // V4 사용자 명시 2026-05-23 (재재) — welcome 텍스트 helper 사용. sendChat 시점에 같은 텍스트가 chatMessages 에 박힘 (AI 첫 발화 인식).
    const welcomeText = (typeof _chatWelcomeText === 'function') ? _chatWelcomeText(chatMode || 'daily') : '편하게 말해 보소.';
    const welcomeBubble = `<div class="msg assistant ces-welcome">${avatarHtml}<div class="msg-bubble">${welcomeText}</div></div>`;
    // ⓘ 일기 안내 — daily 모드만 ('그냥 재밌게 얘기하고 싶어' 누른 후). null 상태 = 미선택, 안 노출.
    const showDiary = (chatMode === 'daily');
    const diaryHtml = showDiary ? `<div class="ces-diary-info-static">ⓘ '일기:' 로 쓰면 원본으로 저장돼</div>` : '';
    // chip 3 — null 만.
    const chipsHtml = (chatMode == null) ? `<div class="ces-chips-inline">
        <button type="button" class="ces-chip-bubble mode-daily" onclick="onChatEmptyChip('daily')">그냥 재밌게 얘기하고 싶어</button>
        <button type="button" class="ces-chip-bubble mode-inquiry" onclick="onChatEmptyChip('inquiry')">어떻게 해야할지 모르겠어 도와줘</button>
        <button type="button" class="ces-chip-bubble mode-vent" onclick="onChatEmptyChip('vent')">마음이 심란하다</button>
      </div>` : '';
    // V4 사용자 명시 2026-05-23 — 저녁 체크인 카드 자체 폐기 (대화탭 체크인 띄우지 않음).
    return welcomeBubble + diaryHtml + chipsHtml;
  } catch (e) { return ''; }
}

function _chatIsEveningMode() {
  if (window._devForceEvening) return true;
  const h = new Date().getHours();
  return (h >= 18 || h < 4);
}

// 저녁 체크인 floating 카드 (옛 _chatEmptyCheckinCardHtml 재명명).
// 사용자 명시 2026-05-17 (재): 체크인 done 인 저녁 시간대엔 '편하게 말해 보소 + 오늘 하루 어땠는지 궁금하오' 어시 버블.
function _chatEmptyEveningCheckinHtml() {
  const todayKVal = (typeof todayKey === 'function') ? todayKey() : '';
  const todayEntry = (state.entries || []).find(e => e.date === todayKVal);
  const checkinDone = !!(todayEntry && (todayEntry.vitality || todayEntry.note));
  // V4 사용자 명시 2026-05-23 — 체크인 완료 fake AI bubble 폐기. 새 empty entry 가 자리 대체.
  if (checkinDone) return '';
  // 미체크인 + dismiss 안 함 → floating 체크인 카드.
  if (state._chatEmptyCheckinDismissedDayK === todayKVal) return '';
  const slot = (typeof getCheckinTimeSlot === 'function') ? getCheckinTimeSlot() : 'night';
  const copy = (typeof _checkinCardCopy === 'function') ? _checkinCardCopy(slot, false) : { icon: '🌙', title: '오늘 하루 닫아보기', sub: '' };
  const subHtml = copy.sub ? `<div class="cec-sub">${escapeHtml(copy.sub)}</div>` : '';
  return `
    <div class="chat-empty-checkin-card" onclick="enterCheckin()">
      <div class="cec-label">${copy.icon} 체크인</div>
      <div class="cec-title">${escapeHtml(copy.title)}</div>
      ${subHtml}
    </div>
  `;
}

// 낮 어시 버블 — '안녕?' + '무슨 말 할까?' 토글 (사용자 명시 2026-05-17 ultrathink, 옛 5-06 패턴 재진입).
function _chatEmptyDaytimeHelloHtml() {
  const examples = (typeof EMPTY_STATE_EXAMPLES !== 'undefined' && Array.isArray(EMPTY_STATE_EXAMPLES)) ? EMPTY_STATE_EXAMPLES : [];
  const examplesBlock = examples.length
    ? `<button class="chat-empty-toggle" id="chatEmptyExamplesToggle" onclick="toggleChatEmptyExamples()">무슨 말 할까? ▾</button><ul class="chat-empty-list" id="chatEmptyExamplesList" style="display:none;">${examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}</ul>`
    : '';
  return `
    <div class="msg assistant">
      <div class="msg-bubble">편하게 말해 보소${examplesBlock}</div>
    </div>
  `;
}

