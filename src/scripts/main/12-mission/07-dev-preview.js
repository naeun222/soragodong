// 사용자 명시 2026-05-02 ultrathink: 결과 체크 모달 미리보기 — admin devTools. mission mock + 결과 toast 만 (실제 mission 의 attemptStatus 건드리지 X).
async function devPreviewAttemptResult() {
  if (typeof showAttemptResultModal !== 'function') {
    if (typeof showToast === 'function') showToast('showAttemptResultModal 함수 X');
    return;
  }
  const sampleStrategy = '11시 전 자기';
  try {
    const status = await showAttemptResultModal(sampleStrategy);
    const labelMap = {
      worked: '👍 해결 됐어',
      meh: '🤔 그저 그래',
      didnt: '👎 안 통했어',
      skipped: '😅 못 시도했어',
      defer: '⏸ 아직 결과 안 나왔어',
      cancel: '✕ 취소'
    };
    const label = labelMap[status] || status || '✕ 닫음';
    if (typeof showToast === 'function') showToast(`🔍 미리보기 결과: ${label} (실제 mission 의 attemptStatus 건드리지 X)`);
  } catch (e) {
    console.warn('[dev preview attempt result]', e);
    if (typeof showToast === 'function') showToast('미리보기 실패: ' + (e?.message || e));
  }
}

