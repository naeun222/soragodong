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
      // 사용자 명시 2026-06-02: '더 알아보기' 4단 깔때기 → 가벼운 비트 + 가지로 재구성.
      //   메시지 종류별 actions: 일반→'이거 짚어줘' / 비트(fromBeat)→깨달음+가지3 / '그럼뭐하지'(fromDeeper)→전략 / 가지(fromBranch)→깨달음.
      // V4 (v8 묶음 9): Core 2 미잠금 시 🧬 전략으로 disabled-locked. 클릭 시 단순 토스트.
      const _c2Locked = !!state._core2NotUnlocked && !window._onbTutorialMode && !(state.preferences && state.preferences.testerMode);
      const _beatElig = (typeof _checkBeatEligibility === 'function') ? _checkBeatEligibility() : { ok: true };
      const _deeperElig = (typeof _checkDeeperEligibility === 'function') ? _checkDeeperEligibility() : { ok: true };
      const _saveInsightBtn = `<button class="msg-action ${m.saved ? 'saved' : ''}" onclick="saveMsgAsInsight(${i})">${m.saved ? '✦ 저장됨' : '✦ 깨달음으로'}</button>`;

      if (m.fromDeeper) {
        // '그럼 뭐 하지' 결과 — 기존 4단/전략/proposal 온램프 그대로 (proposal 카드는 아래 proposalBtns).
        const saveBtn = _c2Locked
          ? `<button class="msg-action disabled-locked" onclick="_showCore2LockedToast()">🧬 전략으로</button>`
          : `<button class="msg-action ${m.savedStrategy ? 'saved' : ''}" onclick="saveMsgAsStrategy(${i})">${m.savedStrategy ? '🧬 전략 저장됨' : '🧬 전략으로'}</button>`;
        actions = `<div class="msg-actions">${saveBtn}</div>`;
      } else if (m.fromBeat) {
        // 1층 비트 — ✦ 깨달음으로 + 2층 가지 (왜 그런지 더 / 이어보기[관련 있을 때만] / 그럼 뭐 하지).
        const whyBtn = _beatElig.ok
          ? `<button class="msg-action" onclick="askWhyDeeper(${i})">왜 그런지 더</button>`
          : `<button class="msg-action disabled-locked" onclick="_showBeatCapToast()">왜 그런지 더</button>`;
        const connectBtn = (Array.isArray(m.relatedCandidates) && m.relatedCandidates.length)
          ? (_beatElig.ok
              ? `<button class="msg-action" onclick="askConnect(${i})">이어보기</button>`
              : `<button class="msg-action disabled-locked" onclick="_showBeatCapToast()">이어보기</button>`)
          : '';
        // '그럼 뭐 하지' = 무거운 4단·미션 온램프 → 기존 deeper cap.
        const thenWhatBtn = _deeperElig.ok
          ? `<button class="msg-action" onclick="askDeeper(${i})">그럼 뭐 하지</button>`
          : `<button class="msg-action disabled-locked" onclick="_showDeeperCapToast()">그럼 뭐 하지</button>`;
        actions = `<div class="msg-actions">${_saveInsightBtn}${whyBtn}${connectBtn}${thenWhatBtn}</div>`;
      } else if (m.fromBranch) {
        // 가지 결과 (왜 그런지 더 / 이어보기) — 깨달음 핀만.
        actions = `<div class="msg-actions">${_saveInsightBtn}</div>`;
      } else {
        // 일반 assistant 메시지 — ✦ 깨달음으로 + '이거 짚어줘' 진입 칩.
        // 이미 4단 응답이거나 3턴 게이트 미충족 시 진입 칩 숨김 (옛 deeper 게이트 의도 유지).
        const has4Stage = /\[내가 본 것\]|\[이게 뭐냐면\]/.test(m.content || '');
        // V4 (사용자 명시 2026-05-16 cowork): 챕터당 user 3회 누적 후 노출. testerMode/튜토/기존 사용자는 우회.
        const _chapterUserMsgs = (state.chatMessages || []).filter(mm => mm && mm.role === 'user').length;
        const _isExistingChatUser = (state.chatPairsCount || 0) >= 3
          || (typeof _isTutorialEligibleUser === 'function' && !_isTutorialEligibleUser());
        const _bypassTurnGate = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode) || _isExistingChatUser);
        const _turnsOk = _bypassTurnGate || _chapterUserMsgs >= 3;
        const beatBtn = (has4Stage || !_turnsOk)
          ? ''
          : (_beatElig.ok
              ? `<button class="msg-action" onclick="askInsightBeat(${i})">이거 짚어줘</button>`
              : `<button class="msg-action disabled-locked" onclick="_showBeatCapToast()">이거 짚어줘</button>`);
        // V4 (사용자 명시 2026-05-17 ultrathink): 게스트 첫 '이거 짚어줘' 노출 시 튜토 모달 2page chain.
        if (beatBtn && state.isGuest
            && !(state._shownInlineTips || []).includes('firstDeeperBtn')
            && !window._firstDeeperTutoQueued
            && typeof _showFirstDeeperTutoIfGuest === 'function') {
          window._firstDeeperTutoQueued = true;
          setTimeout(() => _showFirstDeeperTutoIfGuest(), 250);
        }
        actions = `<div class="msg-actions">${_saveInsightBtn}${beatBtn}</div>`;
      }
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
        <div class="dsc-header"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 마법고동에서 천천히 보면 어때?</div>
        <div class="dsc-title">${escapeHtml(ds.title)}</div>
        ${ds.reason ? `<div class="dsc-reason">${escapeHtml(ds.reason)}</div>` : ''}
        <div class="dsc-buttons">
          <button class="dsc-btn accept" onclick="acceptDecisionSuggestion(${i})">14일 숙성 시작</button>
          <button class="dsc-btn decline" onclick="declineDecisionSuggestion(${i})">괜찮아</button>
        </div>
      </div>`;
    } else if (m.decisionResponse) {
      const icon = m.decisionResponse === 'accept' ? '🐚 마법고동으로 보냈어' : '괜찮아 — 그냥 듣기만 할게';
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

    // V4 (사용자 명시 2026-05-14 ultrathink): 전략 resurface chip — assistant bubble 끝 inline.
    //   응답 완료 후 _maybeResurfaceStrategyAfterAIResponse 가 m.resurfacedStrategyId stash → 여기서 렌더.
    let resurfaceChip = '';
    if (m.role === 'assistant' && !m.typing && !m.error && m.resurfacedStrategyId) {
      const card = (typeof getStrategyCard === 'function') ? getStrategyCard(m.resurfacedStrategyId) : null;
      if (card && card.embodimentStatus !== 'embodied' && !card._deleted) {
        if (typeof _renderStrategyResurfaceChipHTML === 'function') {
          resurfaceChip = _renderStrategyResurfaceChipHTML(card, i);
        }
      }
    }

    // V4 사용자 명시 2026-05-23 — AI 메시지 왼쪽에 합성 캐릭터 아바타. 모드별 모자/아우라, 안경 X.
    //   error 메시지엔 아바타 X (오류 시각을 친구 표정으로 표현 부자연).
    // V4 사용자 명시 2026-05-26 ultrathink — m.expression (AI prefix [expr:XXX] 파싱 결과) 전달. 없으면 mode default fallback.
    const _avatarMode = (typeof state !== 'undefined' && state && state.chatMode) || null;
    const _avatarExpr = (m && m.expression) || (typeof _chatModeDefaultExpr === 'function' ? _chatModeDefaultExpr(_avatarMode) : 'soft-smile');
    const avatarHtml = (m.role === 'assistant' && !m.error && typeof composedCharacterHtml === 'function')
      ? `<div class="msg-avatar" role="button" tabindex="0" aria-label="대화 모드 변경" onclick="onChatModeHeaderClick()">${composedCharacterHtml({ mode: _avatarMode, useGlasses: false, expression: _avatarExpr })}</div>`
      : '';
    return chapterDivider + `<div class="msg ${msgClass}">${avatarHtml}${bubble}${pearlSuggestChip}${proposalBtns}${decisionCard}${vaultCard}${actions}${resurfaceChip}</div>`;
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

// V4 (사용자 명시 2026-05-17 ultrathink): 게스트 첫 '더 알아보기' 노출 시 2page 모달 chain.
//   page 1 = hook 사용법, page 2 = E2EE / AI 학습 0 / 비번 잠금 안내.
function _showFirstDeeperTutoIfGuest() {
  if (!state || !state.isGuest) return;
  if (typeof _showSimpleTutoModal !== 'function') return;
  _showSimpleTutoModal({
    key: 'firstDeeperBtn',
    pages: [
      { html: `고민이 있을 때, 어찌해야 할지 모르겠을 때,<br>고동이에게 털어놓고 <b>'이거 짚어줘'</b>를 눌러보세요.<br><br>마법의 소라고동이 이름값을 할 거예요. 🐚` },
      // V4 (사용자 명시 2026-05-17 ultrathink): page 2 카피 단순화 + okLabel='오호라'.
      { html: `이 앱의 모든 정보는<br><b>AI 학습에 전혀 쓰이지 않고</b>,<br>종단간 암호화로 보호됩니다.<br><br><span style="color:var(--text-dim); font-size:13px;">(로그인 후)</span>`, okLabel: '오호라' }
    ]
  });
}

