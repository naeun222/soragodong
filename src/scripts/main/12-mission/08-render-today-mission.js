function renderTodayMission() {
  const container = document.getElementById('missionContainer');
  if (!container) return;
  const list = getTodayMissions();

  // V4: render 후 잠금 시각 갱신
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 0);

  if (list.length === 0) {
    container.innerHTML = '';
    return;
  }

  // 인덱스 범위 보정
  if (_currentMissionIdx >= list.length) _currentMissionIdx = 0;
  if (_currentMissionIdx < 0) _currentMissionIdx = list.length - 1;
  const mission = list[_currentMissionIdx];
  const total = list.length;

  const navHtml = total > 1 ? `
    <div class="mission-nav">
      <button class="mission-nav-btn" onclick="prevMission()" aria-label="이전 부름">‹</button>
      <span class="mission-nav-pos">${_currentMissionIdx + 1} / ${total}</span>
      <button class="mission-nav-btn" onclick="nextMission()" aria-label="다음 부름">›</button>
    </div>
  ` : '';

  // V3.13.x: 어제·그제 받은 부름 라벨
  const today = todayKey();
  const ageDiff = mission.scheduledFor ? -daysBetweenKeys(mission.scheduledFor, today) : 0;
  const ageLabel = ageDiff === 1 ? ' · 어제 받은 부름' : ageDiff === 2 ? ' · 그제 받은 부름' : '';

  if (mission.status === 'completed') {
    // 사용자 명시 2026-05-09 (#6): 완료 카드 좌측 swipe → dismiss.
    // 사용자 보고 2026-05-10: 완료 카드 회색 박스에 AI 축하 메시지 (completionNote) 만 보여서 원래 미션 컨텍스트 사라짐 →
    //   "딴 말 함" 으로 인식. mission.description (원래 설명) 도 같이 노출.
    container.innerHTML = `
      <div class="mission-card completed mission-swipeable" data-mission-id="${mission.id}">
        <div class="mission-label">🐚 소라의 부름 · 완료 ✦</div>
        <div class="mission-title">${escapeHtml(mission.title)}</div>
        ${mission.description ? `<div class="mission-desc">${escapeHtml(mission.description)}</div>` : ''}
        ${mission.completionNote ? `<div class="mission-completion-msg">${escapeHtml(mission.completionNote)}</div>` : ''}
        ${navHtml}
        <div class="mission-swipe-hint">← 왼쪽으로 밀면 치워둘 수 있어</div>
      </div>
    `;
    setTimeout(() => _attachMissionSwipeDismiss(mission.id), 0);
  } else {
    const rewardEmoji = '⭐';
    container.innerHTML = `
      <div class="mission-card sora-call${ageLabel ? ' carryover' : ''}">
        <div class="mission-label">🐚 소라의 부름${ageLabel}</div>
        <div class="mission-call-reward" title="이거 깨면 빛나는 소라 (가끔 ✨ 특별한 부름)">${rewardEmoji}</div>
        <div class="mission-title">${escapeHtml(mission.title)}</div>
        ${mission.description ? `<div class="mission-desc">${escapeHtml(mission.description)}</div>` : ''}
        <div class="mission-actions">
          <button class="mission-btn complete" onclick="completeMission('${mission.id}')">✓ 해냈어</button>
          <button class="mission-btn skip" onclick="skipMission('${mission.id}')">오늘은 패스</button>
        </div>
        ${navHtml}
      </div>
    `;
  }
}

function nextMission() {
  _currentMissionIdx += 1;
  renderTodayMission();
}
function prevMission() {
  _currentMissionIdx -= 1;
  renderTodayMission();
}

// 사용자 명시 2026-05-09 (#6): 완료 미션 좌swipe-dismiss + undo 토스트 (spec 5-2 + P1-5).
function _attachMissionSwipeDismiss(missionId) {
  const card = document.querySelector(`.mission-card.mission-swipeable[data-mission-id="${missionId}"]`);
  if (!card) return;
  let startX = null, startY = null, locked = null, hostId = null;
  const SWIPE_THRESHOLD = 80;
  const onDown = (e) => {
    startX = e.clientX; startY = e.clientY; locked = null; hostId = e.pointerId;
    try { card.setPointerCapture(e.pointerId); } catch {}
  };
  const onMove = (e) => {
    if (startX == null || e.pointerId !== hostId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (locked == null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (locked === 'h' && dx < 0) {
      try { e.preventDefault(); } catch {}
      const t = Math.max(-150, dx);
      card.style.transform = `translateX(${t}px)`;
      card.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 200));
    }
  };
  const onUp = (e) => {
    if (e.pointerId !== hostId) return;
    if (startX != null && locked === 'h') {
      const dx = e.clientX - startX;
      if (dx < -SWIPE_THRESHOLD) {
        // 좌측 80px+ — dismiss
        card.style.transition = 'transform 0.18s, opacity 0.18s';
        card.style.transform = 'translateX(-100%)';
        card.style.opacity = '0';
        setTimeout(() => dismissMission(missionId), 180);
      } else {
        card.style.transition = 'transform 0.15s, opacity 0.15s';
        card.style.transform = '';
        card.style.opacity = '';
        setTimeout(() => { card.style.transition = ''; }, 160);
      }
    }
    startX = startY = null; locked = null; hostId = null;
    try { card.releasePointerCapture(e.pointerId); } catch {}
  };
  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove, { passive: false });
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
}

function dismissMission(missionId) {
  const m = (state.missions || []).find(x => x.id === missionId);
  if (!m) return;
  const prevStatus = m.status;
  m.status = 'dismissed';
  m.dismissedAt = new Date().toISOString();
  saveState();
  renderTodayMission();
  // 사용자 명시 2026-05-09: 다른 토스트들과 동일한 undo 토스트 ('되돌리기' 버튼) 사용.
  if (typeof showUndoToast === 'function') {
    showUndoToast('치웠어 🐚', () => {
      m.status = prevStatus;
      delete m.dismissedAt;
      saveState();
      renderTodayMission();
    });
  } else if (typeof showToast === 'function') {
    showToast('치웠어 🐚');
  }
}

function createMission(title, description, options = {}) {
  // 사용자 요청 2026-04-30: 같은 strategy 여러 미션 OK. 단 동일 title pending 중복은 차단 (anti-double-click).
  // 사용자 명시 2026-05-11 ultrathink (근본): dupe 비교에 strategyId 포함 — 다른 카드에서 같은 title 등록 시 매핑 mismatch (사용자가 카드 B 에서 등록한 줄 알지만 실제 미션 strategyId 는 카드 A) 방지.
  const titleNorm = (title || '').trim();
  const optStrategyId = options.strategyId || null;
  if (titleNorm) {
    const dupe = (state.missions || []).find(m =>
      m.status === 'pending' &&
      (m.title || '').trim() === titleNorm &&
      (m.strategyId || null) === optStrategyId
    );
    if (dupe) {
      showToast('이미 같은 부름이 등록되어 있어 🐚');
      return dupe;
    }
  }
  const mission = {
    id: 'mis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: titleNorm,
    description: description || '',
    createdAt: new Date().toISOString(),
    scheduledFor: options.scheduledFor || todayKey(),
    status: 'pending',
    sourceMessageIdx: options.sourceMessageIdx,
    linkedStrategy: options.linkedStrategy,
    strategyId: options.strategyId || null,
    generationIdx: options.generationIdx ?? null,
    // V4 (v8 묶음 2): mission 의 *원래 문제* 기록 → 결과 체크 모달 📌 원래 문제 박스 표시
    situation: options.situation || '',
    _situationSource: options._situationSource || null  // 'user_input' | 'llm_extracted' | null
  };
  state.missions.push(mission);
  saveState();
  return mission;
}

