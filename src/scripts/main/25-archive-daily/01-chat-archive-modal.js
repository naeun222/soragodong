// ═══════════════════════════════════════════════════════════════
// V3.3: 대화 일별 아카이브 (raw → AI 요약)
// ═══════════════════════════════════════════════════════════════

let _expandedArchiveDates = new Set();

let _chatArchiveEscDetach = null;
function openChatArchive() {
  _expandedArchiveDates.clear();
  renderChatArchiveModal();
  const overlay = document.getElementById('chatArchiveOverlay');
  overlay.style.display = 'flex';
  // V4-fix: 모달이 chat-input-bar에 가려지는 것 방지
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = 'hidden';
  // 사용자 명시 2026-05-01 (agent audit): ESC = 닫기.
  if (_chatArchiveEscDetach) _chatArchiveEscDetach();
  _chatArchiveEscDetach = _registerModalEsc(overlay, () => closeChatArchive());
}

function closeChatArchive() {
  document.getElementById('chatArchiveOverlay').style.display = 'none';
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = '';
  if (_chatArchiveEscDetach) { _chatArchiveEscDetach(); _chatArchiveEscDetach = null; }
}

function renderChatArchiveModal() {
  const container = document.getElementById('chatArchiveContent');
  if (!container) return;
  
  const archive = (state.chatArchive || []).slice().sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  if (archive.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px; line-height:1.8;">
      <div style="font-size:32px; margin-bottom:12px;">📚</div>
      아직 보관된 대화가 없어.<br>
      7일 넘은 대화가 자동으로 여기 모일 거야.<br>
      <span style="font-size:11px; opacity:0.8;">📌 핀 꽂으면 영구 보관됨.</span>
    </div>`;
    return;
  }

  // 사용자 요청 2026-04-29: 핀 꽂힌 거 위로
  const sortedArchive = archive.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return 0;
  });

  container.innerHTML = sortedArchive.map(a => {
    const dateLabel = new Date(a.date).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    });
    // archive entry id (별도 entry — 같은 날 여러 챕터 구분)
    const archId = a.id || a.date;
    // 사용자 보고 2026-05-02 ultrathink: 더보기 (carret ▸/▾) 눌러도 안 보이는 버그.
    // root cause: toggleArchiveDay(archId) 으로 toggle 했는데 isExpanded 는 a.date 만 검사 → archId !== a.date 시 매칭 X.
    // fix: archId 으로 통일.
    const isExpanded = _expandedArchiveDates.has(archId);
    const messages = isExpanded ? (a.messages || []) : [];
    const pinIcon = a.pinned ? '📌' : '📍';
    const pinTitle = a.pinned ? '핀 풀기 (7일 cap 다시)' : '핀 꽂기 (영구 보관)';
    // 사용자 명시 2026-05-01 ultrathink: 4AM 처리 전 (pending) = 소프트 placeholder. legacy flag 도 호환.
    // 사용자 명시 2026-05-02 ultrathink: batch submit 후엔 "정리 중 ⏳" 로 변경 (오류 X 처리 중 명시).
    const isPending = !!(a._pendingExtract || a._pendingCaseAnalysis);
    const isBatchProcessing = !!a._batchSubmittedAt;
    const pendingNote = isPending
      ? (isBatchProcessing
          ? `<div class="cac-pending-note" style="font-size:11px; color:var(--text-soft); opacity:0.7; margin-top:4px; line-height:1.6;">🌙 정리 중 ⏳ — 보통 5분~2시간 후 자리잡아.</div>`
          : `<div class="cac-pending-note" style="font-size:11px; color:var(--text-soft); opacity:0.65; margin-top:4px; line-height:1.6;">🌙 새벽 4시에 자동 정리될 예정 — 그때 나 탭 / 도서관에 깔끔히 자리잡아.</div>`)
      : '';
    const cardOpacity = isPending ? '0.7' : '1';

    return `
      <div class="chat-archive-card${a.pinned ? ' pinned' : ''}" style="opacity:${cardOpacity};">
        <div class="cac-header" onclick="toggleArchiveDay('${archId}')">
          <div class="cac-date">${a.pinned ? '📌 ' : ''}${dateLabel}</div>
          <div class="cac-meta">
            <span>${a.messageCount || 0}개 메시지</span>
            <button class="cac-pin-btn" onclick="event.stopPropagation(); toggleArchivePin('${a.date}')" title="${pinTitle}" style="background:transparent; border:none; cursor:pointer; font-size:14px; padding:2px 6px; opacity:${a.pinned ? '1' : '0.5'};">${pinIcon}</button>
            <span class="cac-toggle">${isExpanded ? '▾' : '▸'}</span>
          </div>
        </div>
        ${pendingNote}
        ${isExpanded ? `
          <div class="cac-messages">
            ${messages.map(m => {
              const cls = m.role === 'user' ? 'user' : 'assistant';
              let content = m.content || '';
              content = content.replace(/```json[\s\S]*?```/g, '').trim();
              content = content.replace(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)[\s\S]*\}\s*$/g, '').trim();
              const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
              return `<div class="cac-msg ${cls}">
                <div class="cac-msg-time">${time}</div>
                <div class="cac-msg-content">${escapeHtml(content.slice(0, 500))}${content.length > 500 ? '...' : ''}</div>
              </div>`;
            }).join('')}
            <div style="display:flex; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
              <button class="btn-secondary" onclick="event.stopPropagation(); resumeArchiveChat('${archId}')" style="flex:1; font-size:11.5px; padding:8px;">↩️ 이어서 하기</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// 사용자 명시 2026-05-02 ultrathink: 이전 대화 이어서 — archive.messages 를 state.chatMessages 으로 복원.
// 마무리 안 된 현재 대화 있으면 = 덮어쓰기 confirm 모달 (확인 시 _archiveCurrentChapter 강제 후 복원).
async function resumeArchiveChat(archId) {
  const archive = (state.chatArchive || []).find(a => (a.id || a.date) === archId);
  if (!archive || !Array.isArray(archive.messages) || archive.messages.length === 0) {
    showToast('대화를 불러올 수 없어');
    return;
  }
  const currentMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  if (currentMsgs.length > 0) {
    const yes = await showConfirmModal({
      title: '⚠️ 잠깐, 현재 대화는?',
      message: '지금 대화 마무리 안 했는데 — 이대로 이어서 불러오면 현재 대화는 자동으로 도서관에 보관돼.\n\n그래도 진행할까?',
      okLabel: '응, 보관하고 이어서',
      cancelLabel: '아니, 그만'
    });
    if (!yes) return;
    // 현재 대화 = archive 으로 보관 (수동 마무리 단 batch 에 안 들어감)
    if (typeof _archiveCurrentChapter === 'function') {
      _archiveCurrentChapter({ manual: true, minMessages: 1 });
    }
  }
  // V4 사용자 명시 2026-05-04: 이어서 후 변경 X 마무리/보관 시 = 원본 archive 그대로 복귀
  // (4AM cutoff 재처리 / API 재호출 방지). 원본 snapshot + 원래 index 보관.
  const _origIdx = (state.chatArchive || []).findIndex(a => (a.id || a.date) === archId);
  let _origSnapshot = null;
  try { _origSnapshot = JSON.parse(JSON.stringify(archive)); } catch (e) { _origSnapshot = null; }
  // archive.messages → state.chatMessages 복원 + 그 archive 제거
  state.chatMessages = archive.messages.slice();
  // 사용자 보고 2026-05-03: 이어서 → 새 채팅 가는 버그.
  // root cause: archive 의 옛 timestamp (며칠 전) → sendChat 의 5h+ 갭 detect → _archiveCurrentChapter 자동 분리 → state.chatMessages = [].
  // fix: 마지막 message timestamp = now 으로 update (resume 시점이 새 시작점). 5h+ 갭 detect skip.
  if (state.chatMessages.length > 0) {
    state.chatMessages[state.chatMessages.length - 1].timestamp = new Date().toISOString();
  }
  // V4 (사용자 보고 2026-05-04 V199): belt-and-suspenders — resume 직후 sendChat 1회는 갭 detect 강제 skip.
  // 옛 fix (마지막 timestamp=now) 만으론 edge case (마지막 메시지 객체 다른 곳에서 mutated 등) 에 취약.
  // _chatResumedAt 마커 — sendChat 가 5h 내면 isNewChapter=false 강제 후 마커 클리어.
  state._chatResumedAt = Date.now();
  state.chatArchive = (state.chatArchive || []).filter(a => (a.id || a.date) !== archId);
  if (_origSnapshot) {
    state._resumedFromArchive = { snapshot: _origSnapshot, originalIndex: _origIdx };
  } else {
    delete state._resumedFromArchive;
  }
  saveState();
  if (typeof closeChatArchive === 'function') closeChatArchive();
  if (typeof renderChat === 'function') renderChat();
  if (typeof showScreen === 'function') showScreen('chat');
  showToast('↩️ 대화 이어서 시작');
}

function toggleArchiveDay(date) {
  if (_expandedArchiveDates.has(date)) {
    _expandedArchiveDates.delete(date);
  } else {
    _expandedArchiveDates.add(date);
  }
  renderChatArchiveModal();
}

// V3.8: 챕터 토픽 추출. 사용자 명시 2026-05-01 ultrathink: passedMessages arg 받음 (4AM 일괄 batch.messages 직접 처리).
