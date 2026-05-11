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

