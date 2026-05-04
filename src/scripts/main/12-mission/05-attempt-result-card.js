async function triggerAttemptResultFromCard(strategyId) {
  const candidates = (state.missions || []).filter(m =>
    m.strategyId === strategyId && m.status === 'completed' && !m.attemptStatus
  );
  if (candidates.length === 0) {
    showToast('결과 체크 대기 중인 미션이 없어');
    return;
  }
  // 가장 최근 completedAt 우선 (혹시 여러 개 있으면 최신)
  candidates.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  await triggerAttemptResultFlow(candidates[0]);
}

// V3.13.x: 오늘 list = 오늘 + 1·2일 전 pending. 0일 먼저 정렬. 없으면 오늘 완료 1개.
