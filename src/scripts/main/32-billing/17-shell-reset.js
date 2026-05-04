// V3.13.x: 소라 컬렉션만 초기화 (다른 데이터는 유지)
// V4-fix: 보류된 숙고 찌꺼기 일괄 정리 (paused 항목만)
async function cleanupPausedReflections() {
  const all = state.reflectionQuestions || [];
  const paused = all.filter(q => q.status === 'paused');
  if (paused.length === 0) {
    showToast('보류된 숙고 없음 — 깨끗해');
    return;
  }
  const ok = await showConfirmModal({
    title: `🌊 보류된 숙고 ${paused.length}개 삭제`,
    message: `옛 보류 데이터 일괄 정리. active / resolved 항목은 안 건드림.`,
    okLabel: '정리',
    cancelLabel: '취소'
  });
  if (!ok) return;
  state.reflectionQuestions = all.filter(q => q.status !== 'paused');
  saveState();
  if (typeof renderReflectionHome === 'function') renderReflectionHome();
  showToast(`🗑 ${paused.length}개 정리됨`);
}

async function resetShellCollection() {
  const count = (state.shellCollection || []).length;
  if (count === 0) {
    showToast('이미 비어있어');
    return;
  }
  const yes = await showConfirmModal({
    title: '소라 컬렉션 초기화',
    message: `모래사장 소라 ${count}개가 모두 삭제돼.\n다른 데이터(체크인/대화/할 일 등)는 그대로.\n되돌릴 수 없어.`,
    okLabel: '삭제', cancelLabel: '취소'
  });
  if (!yes) return;
  state.shellCollection = [];
  saveState();
  if (typeof renderBeach === 'function') renderBeach();
  if (typeof renderShellBar === 'function') renderShellBar();
  showToast(`🐚 소라 ${count}개 초기화 완료`);
}

