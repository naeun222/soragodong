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
    container.innerHTML = `
      <div class="mission-card completed">
        <div class="mission-label">🐚 소라의 부름 · 완료 ✦</div>
        <div class="mission-title">${escapeHtml(mission.title)}</div>
        ${mission.completionNote ? `<div class="mission-completion-msg">${escapeHtml(mission.completionNote)}</div>` : ''}
        ${navHtml}
      </div>
    `;
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

function createMission(title, description, options = {}) {
  // 사용자 요청 2026-04-30: 같은 strategy 여러 미션 OK. 단 동일 title pending 중복은 차단 (anti-double-click).
  const titleNorm = (title || '').trim();
  if (titleNorm) {
    const dupe = (state.missions || []).find(m =>
      m.status === 'pending' && (m.title || '').trim() === titleNorm
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

