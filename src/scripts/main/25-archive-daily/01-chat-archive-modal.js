// ═══════════════════════════════════════════════════════════════
// V3.3: 대화 일별 아카이브 (raw → AI 요약)
// ═══════════════════════════════════════════════════════════════

let _expandedArchiveDates = new Set();

let _chatArchiveEscDetach = null;
function openChatArchive() {
  _expandedArchiveDates.clear();
  _chatArchiveTrashView = false;
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

// V4 사용자 명시 2026-05-04: 휴지통 보기 토글 (false = 일반, true = 삭제됨만).
let _chatArchiveTrashView = false;

function renderChatArchiveModal() {
  const container = document.getElementById('chatArchiveContent');
  if (!container) return;

  // V4 사용자 명시 2026-05-04: 휴지통 분리 — 일반은 !_deleted, 휴지통은 _deleted 만.
  const allArchive = (state.chatArchive || []).slice();
  const trashCount = allArchive.filter(a => a._deleted).length;
  const archive = allArchive
    .filter(a => _chatArchiveTrashView ? a._deleted : !a._deleted)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // 헤더 (휴지통 토글 / 비우기)
  const headerHtml = `
    <div class="cac-toolbar" style="display:flex; gap:6px; align-items:center; justify-content:space-between; padding:8px 4px 12px; border-bottom:1px solid var(--border); margin-bottom:10px;">
      <div style="font-size:12px; color:var(--text-soft);">
        ${_chatArchiveTrashView ? `🗑️ 휴지통 — ${trashCount}개` : `📚 보관된 대화 — ${archive.length}개`}
      </div>
      <div style="display:flex; gap:4px;">
        ${_chatArchiveTrashView && trashCount > 0
          ? `<button class="btn-secondary" onclick="emptyChatArchiveTrash()" style="font-size:11px; padding:4px 8px; color:#c44;">비우기</button>` : ''}
        <button class="btn-secondary" onclick="toggleChatArchiveTrashView()" style="font-size:11px; padding:4px 8px;">
          ${_chatArchiveTrashView ? '← 보관함' : `🗑️ 휴지통${trashCount > 0 ? ` (${trashCount})` : ''}`}
        </button>
      </div>
    </div>`;

  if (archive.length === 0) {
    if (_chatArchiveTrashView) {
      container.innerHTML = headerHtml + `<div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px; line-height:1.8;">
        <div style="font-size:32px; margin-bottom:12px;">🗑️</div>
        휴지통이 비어 있어.<br>
        <span style="font-size:11px; opacity:0.8;">대화 카드 ✕ 누르면 여기로 와.</span>
      </div>`;
    } else {
      container.innerHTML = headerHtml + `<div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px; line-height:1.8;">
        <div style="font-size:32px; margin-bottom:12px;">📚</div>
        아직 보관된 대화가 없어.<br>
        7일 넘은 대화가 자동으로 여기 모일 거야.<br>
        <span style="font-size:11px; opacity:0.8;">📌 핀 꽂으면 영구 보관됨.</span>
      </div>`;
    }
    return;
  }

  // 사용자 요청 2026-04-29: 핀 꽂힌 거 위로
  const sortedArchive = archive.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return 0;
  });

  container.innerHTML = headerHtml + sortedArchive.map(a => {
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

    // V4 사용자 명시 2026-05-04: 휴지통/일반 별 액션 버튼 분기.
    const isTrash = !!a._deleted;
    const headerActionsHtml = isTrash ? `
      <button class="cac-pin-btn" onclick="event.stopPropagation(); restoreChatArchive('${archId}')" title="복구" style="background:transparent; border:none; cursor:pointer; font-size:14px; padding:2px 6px;">↻</button>
      <button class="cac-pin-btn" onclick="event.stopPropagation(); purgeChatArchive('${archId}')" title="영구 삭제" style="background:transparent; border:none; cursor:pointer; font-size:14px; padding:2px 6px; color:#c44;">✕</button>
    ` : `
      <button class="cac-pin-btn" onclick="event.stopPropagation(); toggleArchivePin('${a.date}')" title="${pinTitle}" style="background:transparent; border:none; cursor:pointer; font-size:14px; padding:2px 6px; opacity:${a.pinned ? '1' : '0.5'};">${pinIcon}</button>
      <button class="cac-pin-btn" onclick="event.stopPropagation(); softDeleteChatArchive('${archId}')" title="삭제 (휴지통으로)" style="background:transparent; border:none; cursor:pointer; font-size:14px; padding:2px 6px; opacity:0.5;">🗑️</button>
    `;
    const expandedActions = isTrash ? `
      <div style="display:flex; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
        <button class="btn-secondary" onclick="event.stopPropagation(); restoreChatArchive('${archId}')" style="flex:1; font-size:11.5px; padding:8px;">↻ 복구</button>
        <button class="btn-secondary" onclick="event.stopPropagation(); purgeChatArchive('${archId}')" style="flex:1; font-size:11.5px; padding:8px; color:#c44;">✕ 영구 삭제</button>
      </div>
    ` : `
      <div style="display:flex; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
        <button class="btn-secondary" onclick="event.stopPropagation(); resumeArchiveChat('${archId}')" style="flex:1; font-size:11.5px; padding:8px;">↩️ 이어서 하기</button>
      </div>
    `;
    return `
      <div class="chat-archive-card${a.pinned ? ' pinned' : ''}${isTrash ? ' deleted' : ''}" style="opacity:${isTrash ? '0.6' : cardOpacity};">
        <div class="cac-header" onclick="toggleArchiveDay('${archId}')">
          <div class="cac-date">${isTrash ? '🗑️ ' : (a.pinned ? '📌 ' : '')}${dateLabel}</div>
          <div class="cac-meta">
            <span>${a.messageCount || 0}개 메시지</span>
            ${headerActionsHtml}
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
            ${expandedActions}
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

// V4 사용자 명시 2026-05-04: 챗 히스토리 카드 삭제 (휴지통 이동) — _softDeleteArchiveCascade 가
// derived 항목 (traits/values/patterns/insights/pearls/topicCards/cf.* 등) 도 _deleted 박음 →
// 미래 주/월/계절/연 분석에 들어가지 않음. 휴지통에서 복구 또는 영구 삭제 가능.
async function softDeleteChatArchive(archId) {
  const yes = await showConfirmModal({
    title: '🗑️ 이 대화를 삭제할까?',
    message: '휴지통으로 이동돼.\n이 대화에서 추출된 깨달음·특성·가치·패턴도 함께 숨김 처리되고, 앞으로의 주·월·계절·연 분석에 들어가지 않아.\n\n휴지통에서 복구하거나 영구 삭제할 수 있어.',
    okLabel: '삭제',
    cancelLabel: '취소'
  });
  if (!yes) return;
  if (typeof _softDeleteArchiveCascade !== 'function') {
    showToast('삭제 helper 가 로드 안 됐어');
    return;
  }
  const counts = _softDeleteArchiveCascade(archId);
  saveState();
  // 토스트 — cascade 영향 요약
  if (counts) {
    const total = (counts.traits || 0) + (counts.values || 0) + (counts.patterns || 0)
                + (counts.archive || 0) + (counts.pearls || 0) + (counts.insights || 0)
                + (counts.topicCards || 0) + (counts.udpTurningPoints || 0) + (counts.udpRelationships || 0);
    if (total > 0) {
      showToast(`🗑️ 삭제 — 추출된 ${total}개 항목도 함께 숨김`);
    } else {
      showToast('🗑️ 휴지통으로 이동');
    }
  } else {
    showToast('🗑️ 휴지통으로 이동');
  }
  renderChatArchiveModal();
  // 도서관 / 나탭 등 영향받는 화면 갱신
  if (typeof renderArchive === 'function') try { renderArchive(); } catch {}
  if (typeof renderModelTab === 'function') try { renderModelTab(); } catch {}
}

async function restoreChatArchive(archId) {
  if (typeof _restoreArchiveCascade !== 'function') {
    showToast('복구 helper 가 로드 안 됐어');
    return;
  }
  _restoreArchiveCascade(archId);
  saveState();
  showToast('↻ 복구됨');
  renderChatArchiveModal();
  if (typeof renderArchive === 'function') try { renderArchive(); } catch {}
  if (typeof renderModelTab === 'function') try { renderModelTab(); } catch {}
}

async function purgeChatArchive(archId) {
  const yes = await showConfirmModal({
    title: '✕ 영구 삭제할까?',
    message: '복구할 수 없어.\n이 대화 + 그 대화에서 추출된 derived 항목 (객체형) 이 완전히 사라져.',
    okLabel: '영구 삭제',
    cancelLabel: '취소'
  });
  if (!yes) return;
  if (typeof _purgeArchive !== 'function') {
    showToast('영구삭제 helper 가 로드 안 됐어');
    return;
  }
  _purgeArchive(archId);
  saveState();
  showToast('✕ 영구 삭제됨');
  renderChatArchiveModal();
  if (typeof renderArchive === 'function') try { renderArchive(); } catch {}
  if (typeof renderModelTab === 'function') try { renderModelTab(); } catch {}
}

function toggleChatArchiveTrashView() {
  _chatArchiveTrashView = !_chatArchiveTrashView;
  _expandedArchiveDates.clear();
  renderChatArchiveModal();
}

async function emptyChatArchiveTrash() {
  const trashIds = (state.chatArchive || []).filter(a => a._deleted).map(a => a.id || a.date);
  if (trashIds.length === 0) {
    showToast('휴지통이 이미 비어 있어');
    return;
  }
  const yes = await showConfirmModal({
    title: '🗑️ 휴지통 비우기',
    message: `${trashIds.length}개 대화 + 그 대화에서 추출된 derived 항목들이 영구 삭제돼. 복구 X.`,
    okLabel: '비우기',
    cancelLabel: '취소'
  });
  if (!yes) return;
  if (typeof _purgeArchive !== 'function') {
    showToast('영구삭제 helper 가 로드 안 됐어');
    return;
  }
  trashIds.forEach(id => _purgeArchive(id));
  saveState();
  showToast(`🗑️ ${trashIds.length}개 영구 삭제됨`);
  renderChatArchiveModal();
  if (typeof renderArchive === 'function') try { renderArchive(); } catch {}
  if (typeof renderModelTab === 'function') try { renderModelTab(); } catch {}
}

// V3.8: 챕터 토픽 추출. 사용자 명시 2026-05-01 ultrathink: passedMessages arg 받음 (4AM 일괄 batch.messages 직접 처리).
