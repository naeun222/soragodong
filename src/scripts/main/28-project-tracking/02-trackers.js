// V3.12.x: 체크인 통합 — 추적 항목 추가
// V3.13.x: 측정 방식 (숫자 / 체크) 분기
async function addNewTracker() {
  const title = await showInputModal({
    title: '추적할 항목',
    placeholder: '예: 체중, 운동, 약 복용, 페이지',
    maxLength: 30
  });
  if (!title || !title.trim()) return;

  const kind = await showOptionsModal({
    title: '어떻게 측정할까?',
    message: '숫자 — 체중·시간·페이지 같이 값 입력\n체크 — 운동·약 복용 같이 했/안 했만',
    options: [
      { label: '🔢 숫자로', value: 'numeric' },
      { label: '✓ 체크로', value: 'check' }
    ]
  });
  if (!kind) return;

  let unit = '';
  let target = null;

  if (kind === 'numeric') {
    const u = await showInputModal({
      title: '단위 (선택)',
      placeholder: '예: kg, 분, 페이지',
      defaultValue: ''
    });
    if (u === null) return;
    unit = (u || '').trim();

    const targetStr = await showInputModal({
      title: '목표값 (선택)',
      message: '안 정해도 OK. 나중에 메뉴에서 추가 가능.',
      placeholder: '숫자만',
      defaultValue: ''
    });
    if (targetStr === null) return;
    if (targetStr.trim()) {
      const t = parseFloat(targetStr);
      if (!isNaN(t)) target = t;
    }
  } else {
    // check
    const targetStr = await showInputModal({
      title: '목표 횟수 (선택)',
      message: '몇 번 누적되면 완료? 안 정해도 OK.',
      placeholder: '예: 30',
      defaultValue: ''
    });
    if (targetStr === null) return;
    if (targetStr.trim()) {
      const t = parseFloat(targetStr);
      if (!isNaN(t)) target = t;
    }
    unit = '회';
  }

  const project = {
    id: 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    emoji: kind === 'check' ? '✓' : '📊',
    type: 'custom',
    kind,
    unit,
    baseline: kind === 'check' ? 0 : null,
    target,
    measurements: [],
    status: 'active',
    showGraph: false,
    createdAt: new Date().toISOString(),
    startDate: todayKey()
  };
  if (!state.projects) state.projects = [];
  state.projects.push(project);
  saveState();
  renderCheckinTrackers();
  if (typeof renderProjects === 'function') renderProjects();
  showToast(`${project.emoji} ${project.title} 추적 시작`);
}

// V3.12.x: 체크인 화면에 활성 추적 항목 입력 필드 렌더
// V3.13.x: kind에 따라 숫자 input vs 체크 토글 분기
function renderCheckinTrackers() {
  const container = document.getElementById('checkinTrackersContainer');
  if (!container) return;
  const active = (state.projects || []).filter(p => p.status === 'active');
  const todayK = todayKey();

  let html = '';
  if (active.length > 0) {
    active.forEach(p => {
      const kind = p.kind || 'numeric';
      if (kind === 'check') {
        const checkedToday = (p.measurements || []).some(m => m.dayKey === todayK);
        const totalCount = (p.measurements || []).length;
        const hint = checkedToday
          ? '오늘 ✓'
          : (p.target ? `${totalCount}/${p.target}` : '탭해서 체크');
        html += `
          <div class="checkin-tracker-row checkin-tracker-check ${checkedToday ? 'is-checked' : ''}" onclick="toggleTrackerCheck('${p.id}')">
            <span class="ct-emoji">${checkedToday ? '✓' : '○'}</span>
            <span class="ct-label">${escapeHtml(p.title)}</span>
            <span class="ct-toggle-hint">${escapeHtml(hint)}</span>
          </div>
        `;
      } else {
        const last = (p.measurements || []).length > 0
          ? p.measurements[p.measurements.length - 1].value
          : (p.baseline !== null && p.baseline !== undefined ? p.baseline : '');
        const placeholder = last !== '' ? `이전: ${last}${p.unit || ''}` : '숫자';
        html += `
          <div class="checkin-tracker-row">
            <span class="ct-emoji">${p.emoji || '📊'}</span>
            <span class="ct-label">${escapeHtml(p.title)}</span>
            <input type="number" step="any" id="track_${p.id}" placeholder="${escapeHtml(placeholder)}">
            <span class="ct-unit">${escapeHtml(p.unit || '')}</span>
          </div>
        `;
      }
    });
  }
  html += `<button class="checkin-tracker-add" onclick="addNewTracker()">✦ 트래커 추가</button>`;
  container.innerHTML = html;
}

// V3.13.x: 체크형 추적 — 오늘 토글 (즉시 저장)
function toggleTrackerCheck(id) {
  const p = (state.projects || []).find(x => x.id === id);
  if (!p) return;
  const todayK = todayKey();
  p.measurements = p.measurements || [];
  const existingIdx = p.measurements.findIndex(m => m.dayKey === todayK);
  if (existingIdx >= 0) {
    p.measurements.splice(existingIdx, 1);
  } else {
    p.measurements.push({ value: 1, at: new Date().toISOString(), dayKey: todayK, source: 'checkin' });
    if (p.baseline === null || p.baseline === undefined) p.baseline = 0;
    if (!p.startDate) p.startDate = todayK;
    if (p.target !== null && p.target !== undefined) {
      const total = p.measurements.length;
      if (total >= p.target && p.status === 'active') {
        p.status = 'done';
        showToast(`🎉 ${p.title} 목표 달성!`);
      }
    }
  }
  saveState();
  renderCheckinTrackers();
  if (typeof renderProjects === 'function') renderProjects();
}

