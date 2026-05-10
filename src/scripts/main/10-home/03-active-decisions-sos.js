function renderActiveDecisionsHomeV3() {
  const container = document.getElementById('activeDecisionsContainer');
  if (!container) return;
  
  const actionDays = [3, 5, 7, 10, 14];
  const inProgress = (state.decisions || []).filter(d => d.status === 'in_progress');
  
  // Card shows when:
  // (a) today is an action day (3/5/7/10/14), OR
  // (b) it WAS an action day before, but user hasn't visited since
  const cards = inProgress.filter(d => {
    const startTime = new Date(d.startedAt).getTime();
    const days = Math.floor((Date.now() - startTime) / 86400000);
    
    // Find the most recent action day reached
    let lastActionDay = null;
    for (const ad of actionDays) {
      if (ad <= days) lastActionDay = ad;
    }
    if (lastActionDay === null) return false;
    
    // Compute when that action day occurred
    const actionDayDate = new Date(startTime + lastActionDay * 86400000);
    
    // Has the user opened this decision since then?
    const lastInteraction = d.lastOpenedAt ? new Date(d.lastOpenedAt).getTime() : 0;
    
    // Show card if user hasn't interacted since the action day
    return lastInteraction < actionDayDate.getTime();
  });
  
  if (cards.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = cards.map(d => {
    const days = Math.floor((Date.now() - new Date(d.startedAt).getTime()) / 86400000);
    return `
      <div class="action-card decision" onclick="openDecision('${d.id}')">
        <div class="action-icon"><img src="/character/godong-wizard.png" alt="" class="godong-icon godong-mood-wizard" decoding="async"></div>
        <div class="action-text">
          <div class="action-title">결정 들여다볼 때야</div>
          <div class="action-sub">"${escapeHtml(d.title?.slice(0, 40) || '')}"</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  }).join('');
}

// SOS — 방전 비상구
async function triggerSOS() {
  const todayKeyVal = todayKey();
  const yes = await showConfirmModal({
    title: '오늘은 푹 쉬자 🐚',
    message: '체크인·미션·알림 모두 스킵하고\n하루를 닫을게.',
    okLabel: '쉴게',
    cancelLabel: '아니'
  });
  if (!yes) return;
  
  // Mark today as skipped
  let entry = state.entries.find(e => e.date === todayKeyVal);
  if (!entry) {
    entry = { date: todayKeyVal, sosSkipped: true, timestamp: new Date().toISOString() };
    state.entries.push(entry);
  } else {
    entry.sosSkipped = true;
  }
  
  // Set rest mode
  state.modes.rest = true;
  state.modeActiveSince.rest = todayKeyVal;
  
  saveState();
  showToast('잘했어. 오늘은 쉬는 거야 🐚');
  // Visual feedback - dim screen briefly
  document.body.style.transition = 'opacity 0.5s';
  document.body.style.opacity = '0.6';
  setTimeout(() => {
    document.body.style.opacity = '1';
    showScreen('home');
  }, 800);
}

// ═══════════════════════════════════════════════════════════════
// V4-1i: 🌊 REFLECTION QUESTIONS (숙고 질문 시스템)
// ───────────────────────────────────────────────────────────────
// V4 비전 8장 + anchor 30:
// - 사용자가 직접 적용한 큰 질문 1개 (active). AI 자동 큐레이션 X.
// - status: pending | active | paused | resolved
// - 결론은 사용자가 직접 적고 명시적으로 닫음 → archive에 type='reflection' 자동 push.
// - 작업 분량: V4-1i (1차) — 데이터 함수 + 홈 카드 + 추가/활성/결론 흐름.
//   숙고 전용 채팅 화면(screen-reflection)은 V4-1j로 분리.
// ═══════════════════════════════════════════════════════════════

