// V4 (사용자 명시 2026-05-17 ultrathink): 시간대 시뮬 dev toggle.
//   저녁 6시 ~ 새벽 4시 모드 UI (회전카드 priority, 챗 empty 체크인 카드) 를 낮 시간에도 미리볼 수 있음.
//   _rcIsEveningMode (10-home/03-rotating-card.js) + _chatEmptyAreaHtml (19-chat/03-measure-render.js) 둘 다 flag 우선 체크.
//   flag = window._devForceEvening. localStorage 안 박힘 (휘발성 — reload 시 OFF).

function devToggleForceEvening() {
  window._devForceEvening = !window._devForceEvening;
  const btn = document.getElementById('devForceEveningToggleBtn');
  if (btn) btn.textContent = '⏰ 저녁 6시+ 시뮬: ' + (window._devForceEvening ? 'ON' : 'OFF');
  if (typeof showToast === 'function') {
    showToast(window._devForceEvening
      ? '⏰ 저녁 6시+ 시뮬 ON — 홈 priority stack 에 체크인 진입 / 챗 empty 에 체크인 카드'
      : '⏰ 저녁 6시+ 시뮬 OFF — 실제 시간대로 복귀');
  }
  // 즉시 rerender — 홈/챗 보고 있으면 바로 반영.
  if (typeof renderRotatingCard === 'function') { try { renderRotatingCard(); } catch {} }
  if (typeof renderChat === 'function') { try { renderChat(); } catch {} }
}

// V4 (사용자 보고 2026-05-17): chatArchive 진단 — messages 빈 archive 통계 + console 덤프.
//   "이전 대화 → 이어서 → 불러올 수 없어" 토스트 root cause 추적.
function devDiagChatArchive() {
  const arr = Array.isArray(state.chatArchive) ? state.chatArchive : [];
  const total = arr.length;
  const empties = arr.filter(a => !a || !Array.isArray(a.messages) || a.messages.length === 0);
  const emptyCount = empties.length;
  const hasMessagesCount = total - emptyCount;
  const trashCount = arr.filter(a => a && a._deleted).length;
  const pinnedCount = arr.filter(a => a && a.pinned).length;
  const pendingCount = arr.filter(a => a && (a._pendingExtract || a._pendingCaseAnalysis)).length;

  const emptySample = empties.slice(0, 5).map(a => ({
    id: a?.id,
    date: a?.date,
    messageCount: a?.messageCount,
    hasMessagesField: 'messages' in (a || {}),
    messagesType: typeof a?.messages,
    isArray: Array.isArray(a?.messages),
    len: a?.messages?.length,
    pending: !!a?._pendingExtract,
    deleted: !!a?._deleted,
    pinned: !!a?.pinned,
    source: a?.source,
    extractFromIndex: a?._extractFromIndex,
    generatedAt: a?.generatedAt
  }));

  console.group('[chatArchive 진단]');
  console.log('총 archive:', total);
  console.log('messages 채워진 것:', hasMessagesCount);
  console.log('messages 빈 것 ⚠️:', emptyCount);
  console.log('휴지통:', trashCount);
  console.log('핀:', pinnedCount);
  console.log('처리 대기 (_pendingExtract):', pendingCount);
  if (emptySample.length > 0) {
    console.log('빈 archive 샘플 (최대 5개):');
    console.table(emptySample);
  }
  console.log('전체 chatArchive:', arr);
  console.groupEnd();

  if (typeof showToast === 'function') {
    showToast(`📋 chatArchive 진단 — 총 ${total} / 빈 메시지 ⚠️ ${emptyCount} (console 확인)`);
  }
}

// V4 (사용자 보고 2026-05-17 ultrathink): 옛 형식 archive (messages 필드 없거나 빈 거) 일괄 휴지통 이동.
//   복원 불가능한 잔재 archive 정리 — 휴지통 (_deleted=true) 으로 이동 + _pending* 마커 제거.
//   휴지통 7일 후 자동 hard delete + cascade. 잘못 정리한 경우 7일 안 복구 가능.
async function devCleanupEmptyArchives() {
  if (!Array.isArray(state.chatArchive)) {
    if (typeof showToast === 'function') showToast('chatArchive 없음');
    return;
  }
  const empties = state.chatArchive.filter(a => a && !a._deleted && (!Array.isArray(a.messages) || a.messages.length === 0));
  if (empties.length === 0) {
    if (typeof showToast === 'function') showToast('✓ 옛 형식 archive 없음 — 정리 X');
    return;
  }
  const yes = (typeof showConfirmModal === 'function')
    ? await showConfirmModal({
        title: '옛 형식 archive 정리할까?',
        message: `messages 누락된 archive ${empties.length}개를 휴지통으로 이동.\n\n· 복원 불가 (옛 코드 path 부재 — cloud 에도 messages 없음)\n· 휴지통 7일 후 자동 영구 삭제\n· 잘못 정리해도 7일 안 복구 가능`,
        okLabel: '휴지통 이동',
        cancelLabel: '취소'
      })
    : true;
  if (!yes) return;
  const nowIso = new Date().toISOString();
  empties.forEach(a => {
    a._deleted = true;
    a._deletedAt = nowIso;
    // V4 fix (사용자 명시 2026-05-26 ultrathink): _pendingCleanup 도 strip — 좀비 마커 방지.
    //   _softDeleteArchiveCascade 와 동일 위생.
    delete a._pendingCleanup;
    delete a._pendingExtract;
    delete a._pendingCaseAnalysis;
    delete a._batchSubmittedAt;
  });
  try { saveState(true); } catch {}
  if (typeof renderChatArchiveModal === 'function') { try { renderChatArchiveModal(); } catch {} }
  if (typeof showToast === 'function') showToast(`✦ ${empties.length}개 휴지통 이동 완료`);
}
