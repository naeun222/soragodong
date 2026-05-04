// ═══════════════════════════════════════════════════════════════
// V3.12: PROJECT TRACKING (B-B-C) — "나" 탭 카드 / AI 추출 / 진행률+그래프
// ═══════════════════════════════════════════════════════════════
const PROJECT_TYPES = [
  { value: 'diet', emoji: '⚖️', label: '체중/식단', defaultUnit: 'kg' },
  { value: 'exercise', emoji: '🏃', label: '운동', defaultUnit: '분' },
  { value: 'study', emoji: '📚', label: '공부/연구', defaultUnit: '시간' },
  { value: 'habit', emoji: '🌱', label: '습관', defaultUnit: '회' },
  { value: 'custom', emoji: '🎯', label: '직접', defaultUnit: '' }
];

function renderProjects() {
  const container = document.getElementById('projectsSection');
  if (!container) return;
  const visible = (state.projects || []).filter(p => p.status !== 'abandoned' && p.target !== undefined);
  // 사용자 명시 2026-05-02 ultrathink: collapse wrap (default 펼침 — 입력 마찰 ↓).
  // 사용자 fold 시 hidden — 본인 통제. 헤더 + 추가 button 보존 (펼침 X 도 click 가능 stopPropagation).
  let html = `<details class="project-section" open>
    <summary class="project-section-header">
      <span class="project-section-title">📊 추적 항목${visible.length > 0 ? ` <span style="font-size:11px; color:var(--text-soft); font-weight:500; margin-left:4px;">(${visible.length})</span>` : ''}</span>
      <button class="project-add-btn" onclick="event.preventDefault(); event.stopPropagation(); addNewTracker()">+ 추가</button>
    </summary>
    <div class="project-section-body">`;
  if (visible.length === 0) {
    html += `<div style="font-size:12px; color:var(--text-dim); padding:10px 0 4px; line-height:1.7;">
      추적 중인 항목 없어.<br>
      체크인 화면 "📊 추적 항목"에서 추가하면 매일 기록 + 그래프.
    </div>`;
  } else {
    visible.forEach(p => { html += renderProjectCard(p); });
  }
  html += `</div></details>`;
  container.innerHTML = html;
}

function renderProjectCard(p) {
  const progress = computeProjectProgress(p);
  const progressPct = Math.max(0, Math.min(100, progress.pct));
  const statusCls = p.status === 'paused' ? 'paused' : (p.status === 'done' ? 'done' : '');
  const fillCls = progress.pct >= 100 ? 'done' : '';
  const statusText = p.status === 'done' ? '✓ 완료' : p.status === 'paused' ? '⏸ 일시중지' : '진행 중';
  return `
    <div class="project-card ${statusCls}">
      <div class="pc-head">
        <div class="pc-emoji">${p.emoji || '🎯'}</div>
        <div class="pc-title-wrap">
          <div class="pc-title">${escapeHtml(p.title)}</div>
          <div class="pc-sub">${statusText}${p.unit ? ` · ${escapeHtml(p.unit)}` : ''}</div>
        </div>
        <button class="pc-menu-btn" onclick="openProjectMenu('${p.id}')">⋯</button>
      </div>
      <div class="pc-progress-row">
        <div class="pc-progress-bar">
          <div class="pc-progress-fill ${fillCls}" style="width:${progressPct}%"></div>
        </div>
        <div class="pc-progress-text">${progress.label}</div>
      </div>
      <div class="pc-actions">
        <button class="pc-action primary" onclick="addProjectMeasurement('${p.id}')">📊 측정 기록</button>
        <button class="pc-action" onclick="toggleProjectGraph('${p.id}')">${p.showGraph ? '▲ 그래프 닫기' : '📈 그래프'}</button>
      </div>
      <div class="pc-graph-wrap ${p.showGraph ? 'show' : ''}">
        ${p.showGraph ? renderProjectGraphSVG(p) : ''}
      </div>
    </div>`;
}

function computeProjectProgress(p) {
  const measurements = p.measurements || [];
  const last = measurements.length > 0
    ? measurements[measurements.length - 1].value
    : p.baseline;
  const hasBaseline = p.baseline !== null && p.baseline !== undefined;
  const hasTarget = p.target !== null && p.target !== undefined;

  // baseline/target 없으면 그냥 현재값 표시
  if (!hasBaseline || !hasTarget) {
    return {
      pct: 0,
      label: last !== null && last !== undefined ? `${last}${p.unit || ''}${!hasTarget ? ' (목표 X)' : ''}` : '아직 기록 없음'
    };
  }
  const total = Math.abs(p.target - p.baseline);
  if (total === 0) return { pct: 0, label: '시작 전' };
  const moved = Math.abs(last - p.baseline);
  const pct = (moved / total) * 100;
  const direction = p.target > p.baseline ? '↑' : '↓';
  return {
    pct: pct,
    label: `${last}${p.unit || ''} ${direction} ${p.target}${p.unit || ''} (${Math.round(pct)}%)`
  };
}

function renderProjectGraphSVG(p) {
  // 사용자 보고 2026-04-30 ultrathink Task 1: 그래프 예쁘게
  // - area gradient (line 아래 fill fade)
  // - 마지막 점 강조 (drop-shadow + pulsing ring)
  // - 현재값 floating tag
  // - 시작/끝 날짜 축 라벨
  // - target line + tag (라벨 위치 자동 보정)
  // - 목표 도달 (>=100%) 시 success 색 톤 전환
  const hasBaseline = p.baseline !== null && p.baseline !== undefined;
  const hasTarget = p.target !== null && p.target !== undefined;
  const points = hasBaseline
    ? [{ value: p.baseline, at: p.startDate || p.createdAt }, ...(p.measurements || [])]
    : (p.measurements || []);
  if (points.length < 2) {
    return `<div class="pc-graph-empty">
      <div class="ge-icon">📈</div>
      측정 기록 쌓이면 곡선 적용됨.<br>
      <span style="color:var(--text-soft);">최소 2개 필요 (지금 ${points.length}개)</span>
    </div>`;
  }
  const values = points.map(pt => pt.value).concat(hasTarget ? [p.target] : []);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = (maxV - minV) || 1;
  // 살짝 padding (위/아래 여유 8%)
  const minVPad = minV - range * 0.08;
  const maxVPad = maxV + range * 0.08;
  const rangePad = (maxVPad - minVPad) || 1;

  const w = 320, h = 150;
  const padL = 12, padR = 16, padT = 18, padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const xy = (i, v) => {
    const x = padL + (i / Math.max(points.length - 1, 1)) * innerW;
    const y = padT + innerH - ((v - minVPad) / rangePad) * innerH;
    return { x, y };
  };

  // 목표 도달 (마지막 측정 = target 방향 도달율 100%+) 색조
  const lastVal = points[points.length - 1].value;
  let isDone = false;
  if (hasTarget && hasBaseline) {
    const total = Math.abs(p.target - p.baseline);
    const moved = Math.abs(lastVal - p.baseline);
    isDone = total > 0 && moved >= total;
  }
  const doneCls = isDone ? ' done' : '';

  // path (line + area)
  const linePts = points.map((pt, i) => xy(i, pt.value));
  const linePath = linePts.map((pt, i) => (i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)).join(' ');
  const areaPath = `${linePath} L ${linePts[linePts.length-1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${linePts[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  // 그라디언트 색
  const gradColor = isDone ? '#9ed4a0' : 'var(--accent)';
  const gradId = `pcg-${p.id.slice(-6)}`;

  // 수평 grid 3줄 (top/mid/bottom of inner)
  const gridLines = [0, 0.5, 1].map(t => {
    const y = padT + innerH * t;
    return `<line class="pc-graph-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}"/>`;
  }).join('');

  // dots (last 제외 일반)
  const dotsBefore = linePts.slice(0, -1).map(pt =>
    `<circle class="pc-graph-dot${doneCls}" cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="2.5"/>`
  ).join('');

  // 마지막 점 — 큰 ring + filled
  const lastPt = linePts[linePts.length - 1];
  const lastDotHtml = `
    <circle class="pc-graph-dot-last-ring${doneCls}" cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="6"/>
    <circle class="pc-graph-dot-last${doneCls}" cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="4"/>`;

  // 현재값 floating tag (마지막 점 위쪽; padding 충분치 않으면 아래로)
  const tagText = `${lastVal}${p.unit || ''}`;
  const tagW = Math.max(34, tagText.length * 6.5 + 12);
  const tagH = 18;
  let tagX = lastPt.x - tagW / 2;
  // 좌우 boundary 보정
  if (tagX < padL) tagX = padL;
  if (tagX + tagW > w - padR) tagX = w - padR - tagW;
  const tagYAbove = lastPt.y - 14;
  const tagYBelow = lastPt.y + 14;
  // 위로 너무 가까우면 아래로
  const tagY = (tagYAbove - tagH < padT + 2) ? tagYBelow : (tagYAbove - tagH);
  const tagTextY = tagY + 12.5;
  const currentTag = `
    <rect class="pc-graph-current-tag-bg${doneCls}" x="${tagX.toFixed(1)}" y="${tagY.toFixed(1)}" width="${tagW}" height="${tagH}" rx="6"/>
    <text class="pc-graph-current-tag-text" x="${(tagX + tagW/2).toFixed(1)}" y="${tagTextY.toFixed(1)}" text-anchor="middle">${escapeHtml(tagText)}</text>`;

  // target line
  let targetHtml = '';
  if (hasTarget) {
    const targetY = padT + innerH - ((p.target - minVPad) / rangePad) * innerH;
    if (targetY >= padT - 1 && targetY <= padT + innerH + 1) {
      // 라벨 위쪽 vs 아래쪽 자동 (target 라인이 너무 위면 아래로)
      const labelY = targetY < padT + 12 ? targetY + 12 : targetY - 4;
      targetHtml = `
        <line class="pc-graph-target-line" x1="${padL}" y1="${targetY.toFixed(1)}" x2="${w-padR}" y2="${targetY.toFixed(1)}"/>
        <text class="pc-graph-target-tag" x="${w-padR}" y="${labelY.toFixed(1)}" text-anchor="end">목표 ${p.target}${p.unit || ''}</text>`;
    }
  }

  // 축 라벨 — 시작/끝 날짜 (M/D)
  const fmtDate = (iso) => {
    if (!iso) return '';
    try { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()}`; } catch { return ''; }
  };
  const startLabel = fmtDate(points[0].at);
  const endLabel   = fmtDate(points[points.length-1].at);
  const axisY = h - 6;
  const axisHtml = `
    <text class="pc-graph-axis-tick" x="${padL}" y="${axisY}" text-anchor="start">${startLabel}</text>
    <text class="pc-graph-axis-tick" x="${w-padR}" y="${axisY}" text-anchor="end">${endLabel}</text>`;

  return `<svg class="pc-graph-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-label="${escapeHtml(p.title)} 추적 그래프">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="${gradColor}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${gradColor}" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${targetHtml}
    <path class="pc-graph-area" d="${areaPath}" fill="url(#${gradId})"/>
    <path class="pc-graph-line${doneCls}" d="${linePath}"/>
    ${dotsBefore}
    ${lastDotHtml}
    ${currentTag}
    ${axisHtml}
  </svg>`;
}

function toggleProjectGraph(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  p.showGraph = !p.showGraph;
  saveState();
  renderProjects();
}

async function addNewProject() {
  const type = await showOptionsModal({
    title: '뭘 추적할까?',
    options: PROJECT_TYPES.map(t => ({ label: `${t.emoji} ${t.label}`, value: t.value })),
    allowCustom: false
  });
  if (!type) return;
  const meta = PROJECT_TYPES.find(t => t.value === type);

  const title = await showInputModal({
    title: '프로젝트 이름',
    placeholder: meta.value === 'diet' ? '예: 체중 -5kg' : meta.value === 'exercise' ? '예: 매주 3회 달리기' : '간결하게',
    maxLength: 40
  });
  if (!title) return;

  const unit = await showInputModal({
    title: '측정 단위',
    placeholder: '예: kg, 분, 회, 페이지...',
    defaultValue: meta.defaultUnit || ''
  });
  if (unit === null) return;

  const baselineStr = await showInputModal({
    title: '시작값 (지금 상태)',
    placeholder: '숫자만'
  });
  if (!baselineStr) return;
  const baseline = parseFloat(baselineStr);
  if (isNaN(baseline)) { showToast('숫자가 아니야'); return; }

  const targetStr = await showInputModal({
    title: '목표값',
    placeholder: '숫자만'
  });
  if (!targetStr) return;
  const target = parseFloat(targetStr);
  if (isNaN(target)) { showToast('숫자가 아니야'); return; }

  const project = {
    id: 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title, emoji: meta.emoji, type: meta.value,
    unit: unit || '',
    baseline, target,
    measurements: [],
    status: 'active',
    showGraph: false,
    createdAt: new Date().toISOString(),
    startDate: todayKey()
  };
  if (!state.projects) state.projects = [];
  state.projects.push(project);
  saveState();
  renderProjects();
  showToast(`${project.emoji} ${project.title} 시작 ✦`);
}

async function addProjectMeasurement(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  if (p.status !== 'active') {
    const resume = await showConfirmModal({
      title: '재개할까?',
      message: '일시중지/완료 상태야. 측정 추가하려면 재개해야 해.',
      okLabel: '재개', cancelLabel: '취소'
    });
    if (!resume) return;
    p.status = 'active';
  }
  const lastVal = (p.measurements || []).length > 0
    ? p.measurements[p.measurements.length - 1].value
    : p.baseline;
  const valStr = await showInputModal({
    title: `${p.emoji} ${p.title}`,
    placeholder: `숫자 (이전: ${lastVal}${p.unit || ''})`
  });
  if (!valStr) return;
  const val = parseFloat(valStr);
  if (isNaN(val)) { showToast('숫자가 아니야'); return; }
  if (!p.measurements) p.measurements = [];
  p.measurements.push({ value: val, at: new Date().toISOString(), source: 'manual' });
  const reached = (p.target > p.baseline && val >= p.target) || (p.target < p.baseline && val <= p.target);
  if (reached) {
    p.status = 'done';
    showToast(`🎉 ${p.title} 목표 달성!`);
  } else {
    showToast('기록 ✦');
  }
  saveState();
  renderProjects();
}

async function openProjectMenu(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  const options = [
    { label: '✏️ 이름 수정', value: 'rename' },
    { label: '🎯 목표값 수정', value: 'retarget' },
    { label: p.status === 'paused' ? '▶ 재개' : '⏸ 일시중지', value: 'pause_toggle' }
  ];
  if (p.status !== 'done') options.push({ label: '✓ 완료 처리', value: 'mark_done' });
  options.push({ label: '🗑 포기/삭제', value: 'abandon' });

  const action = await showOptionsModal({ title: p.title, options, allowCustom: false });
  if (!action) return;

  if (action === 'rename') {
    const newTitle = await showInputModal({ title: '새 이름', defaultValue: p.title, maxLength: 40 });
    if (newTitle) { p.title = newTitle; saveState(); renderProjects(); }
  } else if (action === 'retarget') {
    const newTargetStr = await showInputModal({ title: '새 목표값', defaultValue: String(p.target) });
    if (newTargetStr) {
      const t = parseFloat(newTargetStr);
      if (!isNaN(t)) { p.target = t; saveState(); renderProjects(); }
    }
  } else if (action === 'pause_toggle') {
    p.status = p.status === 'paused' ? 'active' : 'paused';
    saveState(); renderProjects();
  } else if (action === 'mark_done') {
    p.status = 'done'; saveState(); renderProjects();
    showToast('✓ 완료 처리됨');
  } else if (action === 'abandon') {
    const yes = await confirmDelete(p.title);
    if (yes) {
      p.status = 'abandoned'; saveState(); renderProjects();
      showToast('포기했어. 괜찮아.');
    }
  }
}

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
  html += `<button class="checkin-tracker-add" onclick="addNewTracker()">+ 항목 추가</button>`;
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

// V3.12: 채팅 자연어 → 측정값 추출 (regex 기반 — AI 호출 절약)
// 사용자 메시지에 "체중 65kg" 같은 패턴 발견 + 활성 프로젝트 매칭 → 제안 카드
function detectProjectMeasurement(text) {
  const active = (state.projects || []).filter(p => p.status === 'active' && p.target !== undefined);
  if (active.length === 0) return null;
  // 숫자 + 단위 매칭
  const re = /(\d+(?:\.\d+)?)\s*(kg|km|분|회|시간|페이지|점|개|시)/g;
  let m;
  const matches = [];
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]);
    const unit = m[2];
    const matchedProject = active.find(p => p.unit && p.unit.includes(unit));
    if (matchedProject) {
      matches.push({ project: matchedProject, value, unit });
    }
  }
  return matches.length > 0 ? matches[0] : null;
}

function showShortcutGuide() {
  showScreen('shortcut-guide');
}

// === START QUEST — V4 redesign: ritual 모달 폐기 (V191 V4-1u 흐름 단순화) ===
// 옛 _ritualState / startRitualGame / renderRitualStep / setupRitualEnter / ritualChooseType /
//    ritualSkipToLaunch / ritualNextStep / ritualBackStep / ritualLaunch 모두 제거.
// 신: startQuest / openImmerseStart 가 _quickStart 직접 호출 → 즉시 단축어 trigger.
function startQuest(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  // V4 redesign (사용자 명시 2026-05-04 ultrathink): IF-THEN 모달 skip — 즉시 단축어 trigger.
  _quickStart({ taskId, taskTitle: task.title });
}


function closeRitual() {
  document.getElementById('ritualOverlay').style.display = 'none';
}

function showRitualActiveBar() {
  // Remove existing if any
  document.getElementById('ritualActiveBar')?.remove();
  
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) { return; }
  if (!active) return;
  
  const bar = document.createElement('div');
  bar.className = 'ritual-active-bar';
  bar.id = 'ritualActiveBar';
  // V4 redesign: taskTitle 없으면 "몰입 중" 만 (옛 "몰입 중: 몰입" 중복 제거)
  const titleText = active.taskTitle ? `몰입 중: ${escapeHtml(active.taskTitle)}` : '몰입 중';
  bar.innerHTML = `
    <span class="icon">🌧</span>
    <span class="text">${titleText}</span>
    <button class="check-btn" onclick="event.stopPropagation(); ritualReturn()">✓ 돌아옴</button>
  `;
  bar.onclick = () => ritualReturn();
  document.body.appendChild(bar);
}

function hideRitualActiveBar() {
  document.getElementById('ritualActiveBar')?.remove();
}

function ritualReturn() {
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) { return; }
  if (!active) { hideRitualActiveBar(); return; }
  
  // Show return check modal
  const stage = document.getElementById('ritualStage');
  if (!stage) return;
  
  document.getElementById('ritualOverlay').style.display = 'flex';
  
  const elapsed = Math.floor((Date.now() - active.launchedAt) / 60000);
  const elapsedLabel = elapsed < 1 ? '방금' : elapsed < 60 ? `${elapsed}분` : `${Math.floor(elapsed/60)}시간 ${elapsed%60}분`;
  
  stage.innerHTML = `
    <div class="ritual-step-label">— 돌아왔구나 —</div>
    <div class="ritual-icon">🐚</div>
    <div class="ritual-question">"${escapeHtml(active.taskTitle || '몰입')}"<br>어땠어?</div>
    <div class="ritual-sub">${elapsedLabel} 동안 갔다 왔네</div>
    <div class="ritual-actions">
      <button class="ritual-btn primary" onclick="ritualOutcome('done')">✓ 했어 (또는 진전 있었어)</button>
      <button class="ritual-btn secondary" onclick="ritualOutcome('partial')">조금만</button>
      <button class="ritual-btn secondary" onclick="ritualOutcome('off')">딴 거 했어 / 못 했어</button>
    </div>
  `;
}

function ritualOutcome(outcome) {
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) {}
  
  // Update start record
  if (active?.startId) {
    const startEntry = state.starts.find(s => s.id === active.startId);
    if (startEntry) {
      startEntry.returnedAt = new Date().toISOString();
      startEntry.outcome = outcome;
      saveState();
    }
  }
  
  // Clear active ritual
  try { localStorage.removeItem('soragodong_active_ritual'); } catch(e) {}
  hideRitualActiveBar();
  closeRitual();
  
  // Feedback based on outcome
  if (outcome === 'done') {
    if (active?.taskId) {
      // Offer to mark task complete
      setTimeout(() => {
        if (confirm('카드도 완료 처리할까?')) {
          completeQuest(active.taskId);
        }
      }, 300);
    } else {
      showToast('잘했어 ✦');
    }
  } else if (outcome === 'partial') {
    showToast('조금이라도 한 거, 충분해 🐚');
  } else {
    showToast('괜찮아. 시도한 것도 한 걸음이야 🐚');
  }
}

// Restore active ritual bar on app load
function restoreActiveRitualOnLoad() {
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) { return; }
  if (!active) return;
  // If older than 8 hours, expire silently
  if (Date.now() - active.launchedAt > 8 * 3600 * 1000) {
    try { localStorage.removeItem('soragodong_active_ritual'); } catch(e) {}
    return;
  }
  showRitualActiveBar();
}

// === BLOCK PICKER (timetable empty block click) ===
let _currentPickerBlock = null;

function openBlockPicker(block) {
  _currentPickerBlock = block;
  const labels = {
    morning: '🌅 오전 (~12시)',
    afternoon1: '☀️ 오후 1부 (12-15시)',
    afternoon2: '🌤 오후 2부 (15-18시)',
    evening: '🌆 저녁 (18-21시)',
    night: '🌙 밤 (21시~)'
  };
  document.getElementById('blockPickerTitle').textContent = labels[block] || block;
  renderBlockPickerContent();
  const overlay = document.getElementById('blockPickerOverlay');
  overlay.style.display = 'flex';
  // 사용자 명시 2026-05-01 (agent audit): ESC = 닫기.
  if (window._blockPickerEscDetach) window._blockPickerEscDetach();
  window._blockPickerEscDetach = _registerModalEsc(overlay, () => closeBlockPicker());
}

function closeBlockPicker() {
  _currentPickerBlock = null;
  document.getElementById('blockPickerOverlay').style.display = 'none';
  if (window._blockPickerEscDetach) { window._blockPickerEscDetach(); window._blockPickerEscDetach = null; }
}

function renderBlockPickerContent() {
  const container = document.getElementById('blockPickerContent');
  if (!container) return;
  
  const todayKeyVal = todayKey();
  // Available tasks: now3 + drawer + memoryVault items
  const now3OtherBlocks = (state.tasks || []).filter(t => 
    t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done' && t.assignedBlock !== _currentPickerBlock
  );
  const drawer = (state.tasks || []).filter(t => 
    t.slot === 'drawer' && t.status !== 'done'
  );
  const vault = (state.memoryVault || []).filter(v => !v.processed);
  
  let html = '';
  
  if (now3OtherBlocks.length > 0) {
    html += `<div class="vault-section">
      <div class="vault-section-label">🐚 오늘의 카드</div>`;
    now3OtherBlocks.forEach(t => {
      html += `
        <div class="vault-item">
          <div class="content">${escapeHtml(t.title)}</div>
          <button class="promote-btn" onclick="assignTaskToBlock('${t.id}')">→ 여기로</button>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (drawer.length > 0) {
    html += `<div class="vault-section">
      <div class="vault-section-label">📋 서랍장 — 카드</div>`;
    drawer.forEach(t => {
      html += `
        <div class="vault-item">
          <div class="content">${escapeHtml(t.title)}</div>
          <button class="promote-btn" onclick="promoteAndAssign('${t.id}')">→ 여기로</button>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (vault.length > 0) {
    html += `<div class="vault-section">
      <div class="vault-section-label">🐚 서랍장 — 대화에서 흘린 것</div>`;
    vault.forEach(v => {
      html += `
        <div class="vault-item">
          <div class="content">${escapeHtml(v.content)}</div>
          <button class="promote-btn" onclick="vaultPromoteAndAssign('${v.id}')">→ 여기로</button>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (now3OtherBlocks.length === 0 && drawer.length === 0 && vault.length === 0) {
    html = `<div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px; line-height:1.8;">
      <div style="font-size:32px; margin-bottom:12px;">🐚</div>
      넣을 게 없어.<br>
      "🧠 머릿속 풀기"로 카드 발급받거나<br>
      대화에서 할 일 흘리면 여기 모여.
    </div>`;
  }
  
  container.innerHTML = html;
}

function assignTaskToBlock(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.assignedBlock = _currentPickerBlock;
  saveState();
  showToast('이동됨 ✦');
  closeBlockPicker();
  renderExecute();
}

function promoteAndAssign(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.slot = 'now3';
  task.status = 'active';
  task.date = todayKey();
  task.assignedBlock = _currentPickerBlock;
  saveState();
  showToast('오늘의 카드 + 시간 지정 ✦');
  closeBlockPicker();
  renderExecute();
}

function vaultPromoteAndAssign(itemId) {
  const item = state.memoryVault.find(v => v.id === itemId);
  if (!item) return;
  state.tasks.push({
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: item.content,
    status: 'active',
    slot: 'now3',
    date: todayKey(),
    weight: 'daily',
    energy: 'medium',
    priority: typeof item.priority === 'number' ? item.priority : nextPriority(),
    source: 'vault_promoted',
    assignedBlock: _currentPickerBlock,
    createdAt: new Date().toISOString()
  });
  item.processed = true;
  saveState();
  showToast('카드 추가됨 ✦');
  closeBlockPicker();
  renderExecute();
}

// === MOVE TO TIME BLOCK ===
async function moveToBlock(taskId) {
  const options = [
    { label: '🌅 오전 (~12시)', value: 'morning' },
    { label: '☀️ 오후 1부 (12-15시)', value: 'afternoon1' },
    { label: '🌤 오후 2부 (15-18시)', value: 'afternoon2' },
    { label: '🌆 저녁 (18-21시)', value: 'evening' },
    { label: '🌙 밤 (21시~)', value: 'night' },
    { label: '시간 미지정', value: '__none__' }
  ];
  const choice = await showOptionsModal({
    title: '어느 시간대?',
    options
  });
  if (!choice) return;
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.assignedBlock = choice === '__none__' ? null : choice;
  saveState();
  renderExecute();
  if (choice === '__none__') {
    showToast('시간 미지정');
  } else {
    const lbl = options.find(o => o.value === choice)?.label.split(' ')[0] || '';
    showToast(`${lbl}로 이동`);
  }
}

function getBlockLabel(block) {
  return ({
    morning: '🌅 오전',
    afternoon1: '☀️ 오후1',
    afternoon2: '🌤 오후2',
    evening: '🌆 저녁',
    night: '🌙 밤'
  })[block] || '';
}

function getCurrentBlock() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 15) return 'afternoon1';
  if (h < 18) return 'afternoon2';
  if (h < 21) return 'evening';
  return 'night';
}

// === TIMETABLE ===
function renderTimetableHTML() {
  const todayKeyVal = todayKey();
  const blocks = ['morning', 'afternoon1', 'afternoon2', 'evening', 'night'];
  const labels = {
    morning: '🌅 오전',
    afternoon1: '☀️ 오후 1부',
    afternoon2: '🌤 오후 2부',
    evening: '🌆 저녁',
    night: '🌙 밤'
  };
  const current = getCurrentBlock();

  let html = `<div class="exec-timetable">
    <div class="exec-timetable-title">📅 오늘의 큰 그림</div>
  `;
  blocks.forEach(b => {
    const tasksInBlock = (state.tasks || []).filter(t => 
      t.date === todayKeyVal && t.assignedBlock === b && t.slot === 'now3'
    );
    html += `
      <div class="exec-tt-block ${b === current ? 'current' : ''}" onclick="openBlockPicker('${b}')" style="cursor:pointer;">
        <div class="exec-tt-label">${labels[b]}</div>
        <div class="exec-tt-cards">
          ${tasksInBlock.length > 0 
            ? tasksInBlock.map(t => `
                <div class="exec-tt-card ${t.status === 'done' ? 'completed' : ''}" onclick="event.stopPropagation(); toggleQuestComplete('${t.id}')">
                  ${escapeHtml(t.title.slice(0, 30))}
                </div>
              `).join('')
            : '<div class="exec-tt-empty">+ 여기 작업 넣기</div>'
          }
        </div>
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

// === LIQUID FLOW (auto-cascade incomplete tasks) ===
function liquidFlow() {
  const todayKeyVal = todayKey();
  const blocks = ['morning', 'afternoon1', 'afternoon2', 'evening', 'night'];
  const current = getCurrentBlock();
  const currentIdx = blocks.indexOf(current);

  (state.tasks || []).forEach(t => {
    if (t.date !== todayKeyVal) return;
    if (t.status === 'done') return;
    if (!t.assignedBlock) return;
    const taskIdx = blocks.indexOf(t.assignedBlock);
    // If task's block is in the past and not done, cascade to current
    if (taskIdx >= 0 && taskIdx < currentIdx) {
      t.assignedBlock = current;
    }
  });
}

// 사용자 명시 2026-05-03: VAULT modal 의 dead code 일괄 제거 (메인 section drawer-row list 와 중복).
// 옛 함수 (openVault / closeVault / renderVault / todoComplete / todoDelete / todoToToday) 제거.
// memoryVault state / push 는 보존 (chat 의 vaultProposals / promoteFromVault / nextPriority / todoDrag* = 별도 cleanup task 자리).
// V3.9: 드래그 & 드롭 재정렬
let _todoDragId = null;
let _todoDragKind = null;

function todoDragStart(e) {
  const item = e.currentTarget;
  _todoDragId = item.dataset.id;
  _todoDragKind = item.dataset.kind;
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Firefox 호환
  try { e.dataTransfer.setData('text/plain', _todoDragId); } catch(_) {}
}

function todoDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target.dataset.id === _todoDragId) return;
  // 위/아래 placeholder 표시
  const rect = target.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  document.querySelectorAll('.todo-item').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
  target.classList.add(above ? 'drop-above' : 'drop-below');
}

function todoDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (!_todoDragId || target.dataset.id === _todoDragId) {
    todoDragEnd(e);
    return;
  }
  
  // 드래그된 항목과 타깃 항목 찾기
  const findItem = (kind, id) => {
    if (kind === 'task') return state.tasks.find(t => t.id === id);
    if (kind === 'vault') return state.memoryVault.find(v => v.id === id);
    return null;
  };
  
  const dragItem = findItem(_todoDragKind, _todoDragId);
  const targetItem = findItem(target.dataset.kind, target.dataset.id);
  if (!dragItem || !targetItem) {
    todoDragEnd(e);
    return;
  }
  
  // 위치 계산: above면 targetItem.priority - 0.5, below면 +0.5
  const rect = target.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  const newPriority = above 
    ? (targetItem.priority || 0) - 0.5 
    : (targetItem.priority || 0) + 0.5;
  dragItem.priority = newPriority;
  
  // 모든 priority 정수화 (재정렬 후 0,1,2,...)
  const all = [];
  (state.tasks || []).filter(t => t.status !== 'done').forEach(t => all.push({ kind: 'task', item: t }));
  (state.memoryVault || []).filter(v => !v.processed).forEach(v => all.push({ kind: 'vault', item: v }));
  all.sort((a, b) => (a.item.priority || 0) - (b.item.priority || 0));
  all.forEach((entry, idx) => { entry.item.priority = idx; });
  
  saveState();
  todoDragEnd(e);
  renderVault();
}

function todoDragEnd(e) {
  document.querySelectorAll('.todo-item').forEach(el => {
    el.classList.remove('dragging', 'drop-above', 'drop-below');
  });
  _todoDragId = null;
  _todoDragKind = null;
}

// V3.9: priority 자동 부여 헬퍼
// 모든 task/vault 생성 지점에서 사용 → 일관된 정렬
function nextPriority() {
  const all = [
    ...(state.tasks || []).map(x => x.priority),
    ...(state.memoryVault || []).map(x => x.priority)
  ].filter(p => typeof p === 'number');
  return all.length === 0 ? 0 : Math.max(...all) + 1;
}

function promoteFromVault(itemId) {
  const item = state.memoryVault.find(v => v.id === itemId);
  if (!item) return;
  const todayKeyVal = todayKey();
  const now3Count = (state.tasks || []).filter(t => t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done').length;
  
  state.tasks.push({
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: item.content,
    status: now3Count < 3 ? 'active' : 'drawer',
    slot: now3Count < 3 ? 'now3' : 'drawer',
    date: todayKeyVal,
    weight: 'daily',
    energy: 'medium',
    priority: typeof item.priority === 'number' ? item.priority : nextPriority(),
    source: 'vault_promoted',
    createdAt: new Date().toISOString()
  });
  item.processed = true;
  saveState();
  renderVault();
  renderExecute();
  showToast(now3Count < 3 ? '오늘의 카드에 추가됨' : '서랍장으로');
}

function promoteTaskToNow3(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const todayKeyVal = todayKey();
  const now3Count = (state.tasks || []).filter(t => t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done').length;
  if (now3Count >= 3) {
    showToast('오늘의 카드가 꽉 찼어. 하나 끝내거나 리롤 해.');
    return;
  }
  task.slot = 'now3';
  task.status = 'active';
  task.date = todayKeyVal;
  saveState();
  renderVault();
  renderExecute();
  showToast('오늘의 카드에 추가됨');
}

async function deleteVaultItem(itemId) {
  if (!await confirmDelete('이 항목')) return;
  state.memoryVault = state.memoryVault.filter(v => v.id !== itemId);
  saveState();
  renderVault();
  renderExecute();
}

// V3.13.x: 서랍장 → 오늘 할 일 목록으로 (체크박스 작은 항목)
function promoteToToday(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  task.isToday = true;
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast('📋 오늘 할 일로');
}
// V3.13.x: 오늘 할 일 → 서랍장으로 되돌리기
function demoteFromToday(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  task.isToday = false;
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast('📂 서랍장으로');
}

// V3.13.x: 서랍장 중복 합치기 — 내용상 완전 같은 task 그룹화 후 가장 오래된 것만 keep
async function mergeDuplicateTasks() {
  const drawerTasks = (state.tasks || []).filter(t => t.slot === 'drawer' && t.status !== 'done');
  if (drawerTasks.length < 2) { showToast('합칠 항목이 없어'); return; }
  // 그룹화: title이 exactSameText로 같은 것
  const groups = [];
  drawerTasks.forEach(task => {
    const found = groups.find(g => exactSameText(g[0].title || '', task.title || ''));
    if (found) found.push(task);
    else groups.push([task]);
  });
  const dupGroups = groups.filter(g => g.length > 1);
  const dupCount = dupGroups.reduce((sum, g) => sum + g.length - 1, 0);
  if (dupCount === 0) {
    // 합칠 거 없으면 그대로 두고 짧은 토스트만
    if (typeof renderExecute === 'function') renderExecute();
    showToast('✦ 깔끔한 상태야');
    return;
  }
  const yes = await showConfirmModal({
    title: '중복 합치기',
    message: `완전히 같은 카드 ${dupCount}개를 합칠게.\n각 그룹에서 가장 오래된 카드만 남기고 나머지 제거.\n되돌릴 수 없어.`,
    okLabel: '합치기',
    cancelLabel: '취소'
  });
  if (!yes) return;
  const removeIds = new Set();
  dupGroups.forEach(g => {
    g.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    g.slice(1).forEach(t => removeIds.add(t.id));
  });
  state.tasks = state.tasks.filter(t => !removeIds.has(t.id));
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast(`✦ ${dupCount}개 합쳐짐`);
}

// V3.13.x: 카드 제목/설명 수정
async function editTaskCard(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  const newTitle = await showInputModal({
    title: '카드 수정',
    message: '제목 바꾸기',
    placeholder: '카드 제목',
    defaultValue: task.title || '',
    okLabel: '저장'
  });
  if (newTitle === null) return;
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  task.title = trimmed;
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast('카드 수정됨 ✦');
}

async function deleteTask(taskId) {
  if (!await confirmDelete('이 카드')) return;
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  saveState();
  renderVault();
  renderExecute();
}

// === NIGHT SHUTDOWN — 미완료 자동 처리 ===
function nightShutdown() {
  // Called when user opens app at night and has incomplete tasks
  const todayKeyVal = todayKey();
  const incomplete = (state.tasks || []).filter(t => 
    t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done'
  );
  
  if (incomplete.length === 0) return;
  
  // Move to drawer for tomorrow (gentle, no shame)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().split('T')[0];
  
  incomplete.forEach(t => {
    t.date = tomorrowKey;
    t.slot = 'drawer';
    t.status = 'rolled_over';
    t.rolledOverAt = new Date().toISOString();
  });
  saveState();
}

function showArchiveReviews() {
  showScreen('archive-reviews');
  renderArchiveReviews();
}

// V4-1z: Stories 컴포넌트 (분기/연간 리뷰 Replay식)
// 진지(변화/진화/AI 새 특징/패턴/narrative) + 감성(hook/곡/진주/재미/시) 5:5
let _storiesState = null;

async function openQuarterlyStories(reviewId) {
  const review = (state.quarterlyReviews || []).find(r => r.id === reviewId);
  if (!review) {
    showToast('분기 리뷰 데이터 없음');
    return;
  }
  const slides = await buildQuarterlySlides(review);
  _openStoriesPlayer(slides, 'quarterly');
}

function _openStoriesPlayer(slides, type) {
  if (!Array.isArray(slides) || slides.length === 0) {
    showToast('표시할 슬라이드 없음');
    return;
  }
  // V4-fix: 진주 음악 모음 (previewUrl 있는 것만, 슬라이드 cycle용)
  const musicTracks = (state.pearls || [])
    .filter(p => p.category === '음악' && p.track && p.track.previewUrl)
    .map(p => p.track);
  const muted = !!(state.preferences && state.preferences.storiesMuted);
  _storiesState = {
    slides,
    idx: 0,
    type,
    autoTimer: null,
    paused: false,
    fillTimer: null,
    fillStart: 0,
    fillElapsed: 0,
    musicTracks,
    musicAudio: null,
    muted
  };
  const overlay = document.getElementById('storiesOverlay');
  if (!overlay) return;
  overlay.style.display = 'block';
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = 'hidden';
  const reflBar = document.getElementById('reflectionInputBar');
  if (reflBar) reflBar.classList.remove('active');
  // mute 버튼 초기 상태
  const muteBtn = document.getElementById('storiesMuteBtn');
  if (muteBtn) {
    muteBtn.textContent = muted ? '🔇' : '🔊';
    // 음악 진주 X면 mute 버튼 숨김
    muteBtn.style.display = musicTracks.length > 0 ? '' : 'none';
  }
  _renderStoriesProgress();
  _renderStoriesSlide();
  _startStoriesAutoTimer();
}

// V4-fix: Stories 음소거 토글
function toggleStoriesMute() {
  if (!_storiesState) return;
  _storiesState.muted = !_storiesState.muted;
  if (!state.preferences) state.preferences = {};
  state.preferences.storiesMuted = _storiesState.muted;
  saveState();
  const muteBtn = document.getElementById('storiesMuteBtn');
  if (muteBtn) muteBtn.textContent = _storiesState.muted ? '🔇' : '🔊';
  if (_storiesState.muted) {
    if (_storiesState.musicAudio) {
      try { _storiesState.musicAudio.pause(); } catch {}
    }
    const info = document.getElementById('storiesMusicInfo');
    if (info) info.classList.remove('show');
  } else {
    _playStoriesSlideMusic();
  }
}

// V4-fix v3 (사용자 요청): 한 슬라이드마다 다른 곡 — 음악 진주 X면 안 나옴
function _playStoriesSlideMusic() {
  if (!_storiesState || _storiesState.muted) return;
  if (!_storiesState.musicTracks || _storiesState.musicTracks.length === 0) return;
  const trackIdx = _storiesState.idx % _storiesState.musicTracks.length;
  const track = _storiesState.musicTracks[trackIdx];
  if (!track || !track.previewUrl) return;
  // 이미 같은 트랙 재생 중이면 skip (슬라이드 변경 시 끊김 X)
  if (_storiesState.musicAudio && _storiesState.musicAudio.src === track.previewUrl && !_storiesState.musicAudio.paused) {
    return;
  }
  // 사용자 보고 2026-04-28: 자동 슬라이드 넘김 시 음악 안 나오던 버그 — autoplay 정책 (user gesture 없으면 새 Audio 차단)
  // 같은 audio element 재활용 + src 교체로 unlock 유지 (첫 play는 stories open 시 user gesture로 발생)
  let audio;
  if (_storiesState.musicAudio) {
    audio = _storiesState.musicAudio;
    try { audio.pause(); } catch {}
    audio.src = track.previewUrl;
  } else {
    audio = new Audio(track.previewUrl);
    audio.loop = true;
    _storiesState.musicAudio = audio;
  }
  audio.volume = 0;
  const playPromise = audio.play();
  if (playPromise && playPromise.then) {
    playPromise.then(() => {
      // fade-in 0.3s
      let v = 0;
      const targetVol = 0.45;
      const fadeStep = setInterval(() => {
        v += 0.05;
        if (v >= targetVol) { v = targetVol; clearInterval(fadeStep); }
        audio.volume = v;
      }, 60);
    }).catch(e => console.warn('stories music play failed:', e));
  }
  // music info 표시
  const info = document.getElementById('storiesMusicInfo');
  if (info) {
    info.innerHTML = `
      <div class="stories-music-info-art">${track.artworkUrl ? `<img src="${escapeHtml(track.artworkUrl)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML='🎵'">` : '🎵'}</div>
      <div class="stories-music-info-text">${escapeHtml(track.title || '')} — ${escapeHtml(track.artist || '')}</div>
    `;
    info.classList.add('show');
  }
}

function closeStories() {
  if (_storiesState) {
    if (_storiesState.autoTimer) clearTimeout(_storiesState.autoTimer);
    if (_storiesState.fillTimer) clearInterval(_storiesState.fillTimer);
    // V4-fix: 배경 음악 멈춤
    if (_storiesState.musicAudio) {
      try { _storiesState.musicAudio.pause(); } catch {}
      _storiesState.musicAudio = null;
    }
  }
  _storiesState = null;
  const overlay = document.getElementById('storiesOverlay');
  if (overlay) overlay.style.display = 'none';
  const info = document.getElementById('storiesMusicInfo');
  if (info) info.classList.remove('show');
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = '';
  // 일반 음악 미리듣기도 멈춤
  if (_currentMusicAudio) {
    try { _currentMusicAudio.pause(); } catch {}
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  }
}

function storiesNext() {
  if (!_storiesState) return;
  if (_storiesState.idx < _storiesState.slides.length - 1) {
    _storiesState.idx += 1;
    _renderStoriesProgress();
    _renderStoriesSlide();
    _startStoriesAutoTimer();
  } else {
    closeStories();
  }
}

function storiesPrev() {
  if (!_storiesState) return;
  if (_storiesState.idx > 0) {
    _storiesState.idx -= 1;
    _renderStoriesProgress();
    _renderStoriesSlide();
    _startStoriesAutoTimer();
  }
}

// 사용자 요청 2026-04-28: 인스타식 long-press pause — 200ms 이상 누르면 pause, 짧게 누르면 navigation
let _storiesPressTimer = null;
let _storiesPressTriggered = false;
function _storiesHandlePressStart(e) {
  if (_storiesPressTimer) clearTimeout(_storiesPressTimer);
  _storiesPressTriggered = false;
  _storiesPressTimer = setTimeout(() => {
    _storiesPressTriggered = true;
    storiesPause();
  }, 200);
}
function _storiesHandlePressEnd(e) {
  if (_storiesPressTimer) {
    clearTimeout(_storiesPressTimer);
    _storiesPressTimer = null;
  }
  if (_storiesPressTriggered) {
    storiesResume();
    if (e && e.preventDefault) e.preventDefault();
    setTimeout(() => { _storiesPressTriggered = false; }, 50);
  }
}
function _storiesHandleClick(action) {
  if (_storiesPressTriggered) return;  // long-press 중이면 click 무시
  if (action === 'prev') storiesPrev();
  else if (action === 'next') storiesNext();
}

function storiesPause() {
  if (!_storiesState || _storiesState.paused) return;
  _storiesState.paused = true;
  if (_storiesState.autoTimer) {
    clearTimeout(_storiesState.autoTimer);
    _storiesState.autoTimer = null;
  }
  if (_storiesState.fillTimer) {
    clearInterval(_storiesState.fillTimer);
    _storiesState.fillTimer = null;
  }
  _storiesState.fillElapsed += Date.now() - _storiesState.fillStart;
  // V4-fix: 음악도 같이 pause
  if (_storiesState.musicAudio) {
    try { _storiesState.musicAudio.pause(); } catch {}
  }
}

function storiesResume() {
  if (!_storiesState || !_storiesState.paused) return;
  _storiesState.paused = false;
  _startStoriesAutoTimer();
  // V4-fix: 음악 resume
  if (_storiesState.musicAudio && !_storiesState.muted) {
    try { _storiesState.musicAudio.play(); } catch {}
  }
}

function _startStoriesAutoTimer() {
  if (!_storiesState) return;
  const SLIDE_DUR = 6000;  // 6초
  if (_storiesState.autoTimer) clearTimeout(_storiesState.autoTimer);
  if (_storiesState.fillTimer) clearInterval(_storiesState.fillTimer);
  // resume이면 fillElapsed 유지 / 새 슬라이드면 reset
  if (!_storiesState.paused) {
    // 새 슬라이드 — fillElapsed 리셋 (단 resume에서는 유지)
  }
  _storiesState.fillStart = Date.now();
  _storiesState.autoTimer = setTimeout(() => {
    storiesNext();
  }, SLIDE_DUR - _storiesState.fillElapsed);
  // progress fill 진행
  const fillEl = document.querySelector('.stories-progress-bar.current .stories-progress-fill');
  if (fillEl) {
    _storiesState.fillTimer = setInterval(() => {
      if (!_storiesState || _storiesState.paused) return;
      const elapsed = (Date.now() - _storiesState.fillStart) + _storiesState.fillElapsed;
      const pct = Math.min(100, (elapsed / SLIDE_DUR) * 100);
      fillEl.style.width = pct + '%';
    }, 50);
  }
}

function _renderStoriesProgress() {
  const container = document.getElementById('storiesProgress');
  if (!container || !_storiesState) return;
  container.innerHTML = _storiesState.slides.map((s, i) => {
    const cls = i < _storiesState.idx ? ' done' : (i === _storiesState.idx ? ' current' : '');
    return `<div class="stories-progress-bar${cls}"><div class="stories-progress-fill"></div></div>`;
  }).join('');
}

function _renderStoriesSlide() {
  if (!_storiesState) return;
  const slide = _storiesState.slides[_storiesState.idx];
  if (!slide) return;
  const container = document.getElementById('storiesSlide');
  if (!container) return;
  container.className = 'stories-slide ' + (slide.tone || 'tone-deep');
  container.innerHTML = slide.html;
  // 일반 음악 미리듣기 (진주 카드 안의) 멈춤
  if (_currentMusicAudio) {
    try { _currentMusicAudio.pause(); } catch {}
    _currentMusicAudio = null;
    _currentMusicBtn = null;
  }
  // fillElapsed 리셋
  _storiesState.fillElapsed = 0;
  // V4-fix: 슬라이드별 배경 음악 (진주 음악 cycle, mute 안 한 경우)
  // 한 곡이 여러 슬라이드 걸쳐 재생 — 같은 트랙이면 끊김 X
  _playStoriesSlideMusic();
}

// 분기 리뷰 → 10 슬라이드 빌더
async function buildQuarterlySlides(review) {
  const stats = review.stats || {};
  const range = (() => {
    const m = String(review.quarterKey || '').match(/^(\d{4})-Q(\d)$/);
    if (!m) return null;
    return getQuarterRange(review.quarterKey);
  })();
  const startMs = range ? new Date(range.start).getTime() : 0;
  const endMs   = range ? new Date(range.end).getTime() : Date.now();
  const inRange = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= startMs && t <= endMs;
  };

  // 직전 분기 비교
  const prevQ = (() => {
    const m = String(review.quarterKey || '').match(/^(\d{4})-Q(\d)$/);
    if (!m) return null;
    let y = parseInt(m[1]); let q = parseInt(m[2]) - 1;
    if (q < 1) { q = 4; y -= 1; }
    return (state.quarterlyReviews || []).find(r => r.quarterKey === `${y}-Q${q}`)?.stats || null;
  })();

  const slides = [];

  // 사용자 보고 2026-04-29: 신규 슬라이드 4종 추가 — Mood arc / Highlight 한 순간 / Forecast 후일담 / Timecapsule
  // 1. 감성 hook — 큰 숫자 + 사진 + 직전 분기 비교
  const heroPhoto = (() => {
    const entries = (state.entries || []).filter(e => e.photo && e.date && new Date(e.date + 'T12:00:00').getTime() >= startMs && new Date(e.date + 'T12:00:00').getTime() <= endMs);
    return entries.length > 0 ? entries[Math.floor(Math.random() * entries.length)].photo : null;
  })();
  // V4-fix v3 (사용자 요청 — 더 설명적, 친절한 톤): 평균 빈도 + 직전 분기 비교
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000));
  const checkinsCnt = stats.checkins || 0;
  const avgGap = checkinsCnt > 0 ? Math.round(totalDays / checkinsCnt) : 0;
  const prevCheckins = prevQ?.checkins;
  let heroComparison = '';
  if (prevCheckins != null && checkinsCnt > prevCheckins) {
    const diff = checkinsCnt - prevCheckins;
    heroComparison = `<div class="stories-body">지난 분기보다 ${diff}번 더. 자기 자신한테 더 가까이 와 있었네.</div>`;
  } else if (prevCheckins != null && checkinsCnt < prevCheckins) {
    const diff = prevCheckins - checkinsCnt;
    heroComparison = `<div class="stories-body">지난 분기보다 ${diff}번 적었어. 바빴거나 다른 데 살았던 분기일 거야.</div>`;
  } else if (avgGap > 0) {
    heroComparison = `<div class="stories-body">평균 ${avgGap}일에 한 번씩 체크인. 꾸준한 흐름이야.</div>`;
  }
  slides.push({
    tone: 'tone-emo',
    html: `
      <div class="stories-label">${escapeHtml((typeof seasonLabelOf === 'function' ? seasonLabelOf(review.quarterKey) : review.quarterKey) || '')}</div>
      ${heroPhoto ? `<img class="stories-photo" src="${heroPhoto}" alt="">` : ''}
      <div class="stories-hero-num">${checkinsCnt}</div>
      <div class="stories-hero-unit">번 체크인했어</div>
      <div style="font-size:11px; color:rgba(255,255,255,0.55); margin-top:6px;">자기 자신을 기록한 시간</div>
      ${heroComparison}
    `
  });

  // 사용자 요청 2026-04-29: Mood arc 슬라이드 제거
  // 2. 진지 변화 — 8 차원 + 모드
  slides.push({
    tone: 'tone-deep',
    html: _buildChangeSlideHTML(stats, prevQ)
  });

  // 3. 감성 top 곡
  const topMusic = (() => {
    const musicPearls = (state.pearls || []).filter(p => p.category === '음악' && p.track && inRange(p.createdAt));
    if (musicPearls.length === 0) return null;
    // 가장 최근 또는 random
    return musicPearls[Math.floor(Math.random() * musicPearls.length)];
  })();
  slides.push({
    tone: 'tone-emo-2',
    html: topMusic ? `
      <div class="stories-label">네 사운드트랙</div>
      <div class="stories-music-card">
        <img class="stories-music-art" src="${escapeHtml(topMusic.track.artworkUrl || '')}" alt="">
        <div>
          <div class="stories-music-title">${escapeHtml(topMusic.track.title || '')}</div>
          <div class="stories-music-artist">${escapeHtml(topMusic.track.artist || '')}</div>
        </div>
        ${topMusic.track.previewUrl ? `<button class="stories-music-play" onclick="event.stopPropagation(); toggleMusicPreview(this, '${escapeHtml(topMusic.track.previewUrl)}')">▶</button>` : ''}
      </div>
    ` : `
      <div class="stories-label">네 사운드트랙</div>
      <div class="stories-empty">이 분기 음악 진주 없음<br>다음 분기엔 ✦</div>
    `
  });

  // 사용자 요청 2026-04-29: '전략이 네 무기' 슬라이드(_buildEvolutionSlideHTML) 제거
  // → '🌳 통한 전략들' + '🐚 모은 소라' 두 신규 긍정 슬라이드로 대체
  const workedSlideHtml = _buildWorkedStrategiesSlideHTML(stats, inRange);
  if (workedSlideHtml) slides.push({ tone: 'tone-emo-2', html: workedSlideHtml });
  const shellsSlideHtml = _buildShellsCollectedSlideHTML(stats, inRange, startMs, endMs);
  if (shellsSlideHtml) slides.push({ tone: 'tone-emo-4', html: shellsSlideHtml });

  // 5. 감성 top 진주
  // 사용자 요청 2026-04-28: 튜토리얼/테스터 모드면 '엄마 김치찌개' 카드 고정 (시각 검증)
  const isAutoFix = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode));
  const topPearl = (() => {
    if (isAutoFix) {
      const fixed = (state.pearls || []).find(p => p && p.content === '엄마 김치찌개');
      if (fixed) return fixed;
    }
    const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl' && p.category !== '음악' && inRange(p.createdAt));
    if (pearls.length === 0) {
      // 음악 빼고 없으면 음악도 OK
      const allP = (state.pearls || []).filter(p => p.type !== 'dna_pearl' && inRange(p.createdAt));
      return allP.length > 0 ? allP[Math.floor(Math.random() * allP.length)] : null;
    }
    return pearls[Math.floor(Math.random() * pearls.length)];
  })();
  slides.push({
    tone: 'tone-emo-3',
    html: topPearl ? `
      <div class="stories-label">잊지 못할 순간</div>
      <div class="stories-pearl-card">
        ${topPearl.photo ? `<img src="${escapeHtml(topPearl.photo)}" alt="" style="width:100%; max-width:240px; aspect-ratio:1; object-fit:cover; border-radius:14px; margin:0 auto 14px; display:block; border:1px solid rgba(255,255,255,0.2);">` : `<div class="stories-pearl-emoji">${({음악:'🎵',음식:'🍴',장소:'📍',순간:'✨',사람:'👥'})[topPearl.category] || '💎'}</div>`}
        <div class="stories-pearl-content">${escapeHtml(topPearl.content || '')}</div>
        ${topPearl.note ? `<div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:10px; font-style:italic;">${escapeHtml(topPearl.note)}</div>` : ''}
      </div>
    ` : `
      <div class="stories-label">잊지 못할 순간</div>
      <div class="stories-empty">이 분기 진주 없음</div>
    `
  });

  // 사용자 요청 2026-04-29: '기억나는 한 순간' (highlight) 슬라이드 제거
  // 6. 진지 AI 새 특징
  slides.push({
    tone: 'tone-deep-2',
    html: _buildNewFeaturesSlideHTML(inRange)
  });

  // 7. 감성 재미 — Spotify식 light stat
  slides.push({
    tone: 'tone-emo-4',
    html: _buildFunStatsSlideHTML(stats, inRange)
  });

  // 8. 진지 패턴 — 진단
  slides.push({
    tone: 'tone-deep-3',
    html: _buildPatternsSlideHTML(inRange)
  });

  // 8.5. 진지 깨달음 정리 (V4-fix v3 사용자 요청)
  slides.push({
    tone: 'tone-deep-2',
    html: _buildArchiveSummarySlideHTML(inRange)
  });

  // 8.7. 진지 — 직전 분기 예측 후일담 (사용자 요청 2026-04-29)
  const forecastHtml = _buildForecastFollowupSlideHTML(review.quarterKey);
  if (forecastHtml) {
    slides.push({ tone: 'tone-deep-3', html: forecastHtml });
  }

  // 8.8. 감성 — 1년 전 너 (Timecapsule) (사용자 요청 2026-04-29)
  const timecapsuleHtml = _buildTimecapsuleSlideHTML(review.quarterKey);
  if (timecapsuleHtml) {
    slides.push({ tone: 'tone-emo-5', html: timecapsuleHtml });
  }

  // 9. 진지 narrative + prompt
  slides.push({
    tone: 'tone-deep',
    html: _buildNarrativeSlideHTML(review)
  });

  // 10. 감성 시적 한 줄
  slides.push({
    tone: 'tone-emo-5',
    html: _buildClosingSlideHTML(review, stats)
  });

  return slides;
}

// === 슬라이드 HTML 빌더 ===

// 사용자 요청 2026-04-29: 직전 분기 '🧭 다음 분기에' 본문 후일담으로 보여줌 (auto, 사용자 입력 X)
function _buildForecastFollowupSlideHTML(currentQuarterKey) {
  const m = String(currentQuarterKey || '').match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  let y = parseInt(m[1]); let q = parseInt(m[2]) - 1;
  if (q < 1) { q = 4; y -= 1; }
  const prevReview = (state.quarterlyReviews || []).find(r => r.quarterKey === `${y}-Q${q}`);
  if (!prevReview || !Array.isArray(prevReview.sections)) return null;
  const forecast = prevReview.sections.find(s => s && s.label && (s.label.includes('다음 분기') || s.label.includes('다음에')));
  if (!forecast || !forecast.body) return null;
  return `
    <div class="stories-label">🔮 직전 분기 예측</div>
    <div class="stories-title" style="margin-bottom:14px;">"${escapeHtml(prevReview.quarterKey)}"에서 던진 한 마디</div>
    <div style="font-size:14px; color:rgba(255,255,255,0.92); font-style:italic; padding:16px 18px; background:rgba(212,167,106,0.12); border-left:3px solid rgba(212,167,106,0.55); border-radius:4px 12px 12px 4px; margin:10px auto; max-width:280px; line-height:1.65; text-align:left;">"${escapeHtml(forecast.body)}"</div>
    <div class="stories-body" style="margin-top:18px; font-size:12px; opacity:0.7;">실제로는 어땠어? 한 분기 풀어볼게.</div>
  `;
}

// 사용자 요청 2026-04-29: 1년 전 같은 분기 리뷰 한 문장 (Timecapsule)
function _buildTimecapsuleSlideHTML(currentQuarterKey) {
  const m = String(currentQuarterKey || '').match(/^(\d{4})-Q(\d)$/);
  if (!m) return null;
  const prevYear = parseInt(m[1]) - 1;
  const prevKey = `${prevYear}-Q${m[2]}`;
  const prevReview = (state.quarterlyReviews || []).find(r => r.quarterKey === prevKey);
  if (!prevReview || (!prevReview.summary && !(Array.isArray(prevReview.sections) && prevReview.sections[0]))) return null;
  const quote = prevReview.summary || prevReview.sections[0].body || '';
  if (!quote) return null;
  return `
    <div class="stories-label">📦 1년 전 너는</div>
    <div class="stories-title" style="margin-bottom:14px;">${escapeHtml(prevKey)}</div>
    <div style="font-size:15px; color:white; font-style:italic; padding:18px; background:linear-gradient(135deg, rgba(168,157,200,0.15), rgba(212,167,106,0.10)); border:1px solid rgba(168,157,200,0.3); border-radius:14px; margin:10px auto; max-width:280px; line-height:1.65;">"${escapeHtml(quote.slice(0, 220))}"</div>
    <div class="stories-body" style="margin-top:18px; font-size:11px; opacity:0.6;">그 분기 너와 비교해보면 어때?</div>
  `;
}

function _buildChangeSlideHTML(stats, prevQ) {
  const rows = [];
  const trend = (cur, prev) => {
    if (prev == null) return '';
    if (cur > prev) return `<span class="stories-stat-trend" style="color:#8fc88f;">↑${cur - prev}</span>`;
    if (cur < prev) return `<span class="stories-stat-trend" style="color:#c98c8c;">↓${prev - cur}</span>`;
    return `<span class="stories-stat-trend" style="opacity:0.5;">→</span>`;
  };
  const cls = (cur, prev) => {
    if (prev == null) return 'neutral';
    if (cur > prev) return 'up';
    if (cur < prev) return 'down';
    return 'neutral';
  };
  // strengths 늘어남
  rows.push({
    label: '✨ 강점 발견',
    val: stats.strengthsTotal || 0,
    prev: prevQ?.strengthsTotal,
    direction: 'up'
  });
  // problems
  rows.push({
    label: '💧 문제 인식',
    val: stats.problemsTotal || 0,
    prev: prevQ?.problemsTotal,
    direction: 'down'
  });
  // growth 차원
  rows.push({
    label: '🌱 성장 차원',
    val: stats.growthCount || 0,
    prev: prevQ?.growthCount,
    direction: 'up'
  });
  // 모드 빈도 변화 (가장 큰 모드)
  const topMode = stats.modeCount ? Object.entries(stats.modeCount).sort((a,b) => b[1] - a[1])[0] : null;
  if (topMode) {
    const modeMap = { exam:'📚 시험', travel:'✈️ 여행', sick:'🤒 아픔', rest:'🏖 휴식', period:'🩸 월경', drained:'🪫 방전' };
    rows.push({
      label: modeMap[topMode[0]] || topMode[0],
      val: topMode[1] + '일',
      prev: prevQ?.modeCount?.[topMode[0]] != null ? prevQ.modeCount[topMode[0]] : null,
      direction: 'neutral',
      raw: topMode[1]
    });
  }
  // V4-fix v3 (사용자 요청 — 더 설명적, 친절한 톤): 한 줄 통찰
  const insight = (() => {
    const sP = stats.strengthsTotal || 0;
    const pP = stats.problemsTotal || 0;
    const gP = stats.growthCount || 0;
    if (gP >= 2 && sP > pP) return '강점도 새로 보였고, 성장 축도 여러 개 움직였어. 네 모양이 더 또렷해진 분기야.';
    if (gP >= 2) return `성장 축이 ${gP}개나 움직였어. 멈춰있던 게 아니야 — 이 자체가 큰 의미야.`;
    if (sP > pP) return '강점이 문제보다 더 많이 보였어. 네 안에 단단한 게 있어.';
    if (pP > sP) return '문제가 더 또렷이 보인 분기야. 그게 보이는 것 자체가 첫 단계니까, 부담 가지지 마.';
    return '큰 흔들림 없이 균형 잡힌 분기였어. 머무는 시간도 너에게 필요한 시간이야.';
  })();
  return `
    <div class="stories-label">네 변화</div>
    <div class="stories-title">이 분기 네 안에서 일어난 변화</div>
    <div class="stories-stat-list">
      ${rows.map(r => `
        <div class="stories-stat-row ${cls(r.raw != null ? r.raw : r.val, r.prev)}">
          <span class="stories-stat-label">${r.label}</span>
          <span class="stories-stat-value">${r.val}${trend(r.raw != null ? r.raw : r.val, r.prev)}</span>
        </div>
      `).join('')}
    </div>
    <div class="stories-body" style="margin-top:14px;">${escapeHtml(insight)}</div>
  `;
}

// 사용자 요청 2026-04-29 (재): '🌳 너의 전략들' — 3 카테고리 카드 (체화 / 가장 많이 진화 / 성장 중)
// 카테고리별 1개씩. 비면 그 카드 스킵. 셋 다 비면 슬라이드 자체 skip.
function _buildWorkedStrategiesSlideHTML(stats, inRange) {
  const cards = (state.topicCards || []).filter(c => c.category === 'strategy' && inRange(c.createdAt));

  // 1. 체화된 전략 — 가장 최근 체화
  const embodied = cards.filter(c => c.embodimentStatus === 'embodied')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

  // 2. 가장 많이 진화한 전략 — generations.length 최대 (체화 제외, ≥2)
  const mostEvolved = cards
    .filter(c => c.embodimentStatus !== 'embodied')
    .filter(c => Array.isArray(c.generations) && c.generations.length >= 2)
    .sort((a, b) => (b.generations.length) - (a.generations.length))[0];

  // 3. 성장 중인 전략 — working / trying 중 worked 가장 많이 (체화/most-evolved 제외)
  const growing = cards
    .filter(c => (c.embodimentStatus === 'working' || c.embodimentStatus === 'trying'))
    .filter(c => !embodied || c.id !== embodied.id)
    .filter(c => !mostEvolved || c.id !== mostEvolved.id)
    .map(c => {
      let worked = 0, total = 0;
      (c.generations || []).forEach(g => {
        (g.attempts || []).forEach(a => { total++; if (a.status === 'worked') worked++; });
      });
      return { card: c, worked, total };
    })
    .sort((a, b) => b.worked - a.worked)[0];

  // 셋 다 비면 슬라이드 자체 skip
  if (!embodied && !mostEvolved && !growing) return null;

  const buildCardBox = (titleLabel, emoji, gradient, border, card, sub) => `
    <div style="background:${gradient}; border:1px solid ${border}; border-radius:14px; padding:14px 16px; max-width:300px; margin:0 auto;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <span style="font-size:18px;">${emoji}</span>
        <span style="font-size:11px; color:rgba(255,255,255,0.75); font-weight:600; letter-spacing:0.04em;">${titleLabel}</span>
      </div>
      <div style="font-size:14px; color:white; font-weight:500; line-height:1.4; margin-bottom:5px;">${escapeHtml((card.title || '').slice(0, 36))}</div>
      <div style="font-size:11px; color:rgba(255,255,255,0.6);">${sub}</div>
    </div>
  `;

  const parts = [];
  if (embodied) {
    const _workedAll = (embodied.generations || []).flatMap(g => g.attempts || []).filter(a => a.status === 'worked').length;
    parts.push(buildCardBox(
      '✨ 체화 완료',
      '✨',
      'linear-gradient(135deg, rgba(212,167,106,0.22), rgba(255,210,80,0.12))',
      'rgba(212,167,106,0.50)',
      embodied,
      `${_workedAll}번 통하고 네 일부가 됨`
    ));
  }
  if (mostEvolved) {
    parts.push(buildCardBox(
      '🧬 가장 많이 진화한',
      '🧬',
      'linear-gradient(135deg, rgba(168,157,200,0.22), rgba(140,160,210,0.12))',
      'rgba(168,157,200,0.50)',
      mostEvolved,
      `${mostEvolved.generations.length}세대 진화 중`
    ));
  }
  if (growing) {
    const _stat = `${growing.worked}번 통함${growing.total > 0 ? ` / ${growing.total}번 시도` : ''}`;
    const _statusLbl = growing.card.embodimentStatus === 'working' ? '🌳 성장 중' : '🌿 양생 중';
    parts.push(buildCardBox(
      _statusLbl,
      growing.card.embodimentStatus === 'working' ? '🌳' : '🌿',
      'linear-gradient(135deg, rgba(143,200,143,0.20), rgba(126,200,227,0.12))',
      'rgba(143,200,143,0.45)',
      growing.card,
      _stat
    ));
  }

  return `
    <div class="stories-label">너의 전략들</div>
    <div class="stories-title" style="margin-bottom:6px;">🌳 자라고 있는 무기들</div>
    <div style="font-size:12px; color:rgba(255,255,255,0.7); margin-bottom:18px; font-style:italic;">이번 분기에 이만큼 자랐어! 🌱</div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${parts.join('')}
    </div>
  `;
}

// 사용자 요청 2026-04-29: '🐚 모은 소라' — 분기 안 등급별 소라 카운트
function _buildShellsCollectedSlideHTML(stats, inRange, startMs, endMs) {
  const inRangeShells = (state.shellCollection || []).filter(s => {
    if (!s.date) return false;
    const t = new Date(s.date).getTime();
    return t >= startMs && t <= endMs;
  });
  if (inRangeShells.length === 0) return null;

  const TIER_INFO = [
    { tier: 'legend', emoji: '✨', label: '특별',   color: '#ffd93d' },
    { tier: 'call',   emoji: '⭐', label: '부름',   color: '#ff8da1' },
    { tier: 'golden', emoji: '🦞', label: '황금',   color: '#ffb86b' },
    { tier: 'main',   emoji: '🐢', label: '메인',   color: '#ffb86b' },
    { tier: 'daily',  emoji: '🌀', label: '일상',   color: '#7ec8e3' },
    { tier: 'light',  emoji: '🐚', label: '가벼움', color: '#a89dc8' }
  ];
  const counts = {};
  inRangeShells.forEach(s => { counts[s.tier || 'light'] = (counts[s.tier || 'light'] || 0) + 1; });
  const visible = TIER_INFO.filter(t => counts[t.tier] > 0);
  const total = inRangeShells.length;
  // 가장 빛난 등급 (legend > call > golden > main > daily > light 순으로 첫 0 아닌)
  const topTier = TIER_INFO.find(t => counts[t.tier] > 0);

  // 사용자 요청 2026-04-29: 대표 소라 아이콘들 (각 티어당 1-2개, 상위 티어 우선) 6-7개
  const representativeShells = [];
  const TIER_PRIORITY = ['legend', 'call', 'golden', 'main', 'daily', 'light'];
  TIER_PRIORITY.forEach(tier => {
    const found = inRangeShells.find(s => (s.tier || 'light') === tier);
    if (found) representativeShells.push(found);
  });
  if (representativeShells.length < 7) {
    for (const tier of TIER_PRIORITY) {
      const more = inRangeShells.filter(s => (s.tier || 'light') === tier).slice(1, 4);
      for (const s of more) {
        if (representativeShells.length >= 7) break;
        representativeShells.push(s);
      }
      if (representativeShells.length >= 7) break;
    }
  }
  const tierColorMap = {
    legend: '#ffd93d', call: '#ff8da1', golden: '#ffb86b',
    main: '#ffb86b', daily: '#7ec8e3', light: '#a89dc8'
  };

  return `
    <div class="stories-label">모은 소라</div>
    <div class="stories-title" style="margin-bottom:18px;">🐚 한 분기 동안</div>

    <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:0 auto 22px; max-width:300px;">
      ${representativeShells.map(s => {
        const tc = tierColorMap[s.tier || 'light'];
        return `<div style="width:44px; height:44px; display:flex; align-items:center; justify-content:center; background:radial-gradient(circle at 30% 30%, ${tc}33, ${tc}10); border:1.5px solid ${tc}80; border-radius:50%; font-size:22px; box-shadow:0 0 12px ${tc}30;">${s.type}</div>`;
      }).join('')}
    </div>

    <div style="margin-bottom:20px;">
      <div style="font-size:42px; color:#d4a76a; font-weight:700; line-height:1;">${total}</div>
      <div style="font-size:11px; color:rgba(255,255,255,0.55); margin-top:6px;">개의 소라</div>
    </div>

    ${topTier ? `
      <div style="display:inline-block; margin-bottom:18px; padding:8px 14px; background:linear-gradient(135deg, ${topTier.color}33, ${topTier.color}10); border:1px solid ${topTier.color}66; border-radius:14px;">
        <span style="font-size:11px; color:rgba(255,255,255,0.65); margin-right:6px;">가장 빛난 등급</span>
        <span style="font-size:14px; color:white; font-weight:600;">${topTier.emoji} ${topTier.label}</span>
      </div>
    ` : ''}

    <div style="display:flex; flex-direction:column; gap:6px; max-width:280px; margin:0 auto;">
      ${visible.map(t => {
        const cnt = counts[t.tier];
        const pct = Math.min(100, (cnt / total) * 100);
        return `
          <div style="display:flex; align-items:center; gap:10px; padding:6px 10px; background:rgba(255,255,255,0.04); border-radius:10px;">
            <span style="font-size:18px; flex-shrink:0; width:24px;">${t.emoji}</span>
            <span style="font-size:12px; color:rgba(255,255,255,0.85); flex-shrink:0; width:48px; text-align:left;">${t.label}</span>
            <div style="flex:1; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
              <div style="height:100%; width:${pct.toFixed(1)}%; background:${t.color}; border-radius:3px;"></div>
            </div>
            <span style="font-size:13px; color:white; font-weight:600; flex-shrink:0; width:32px; text-align:right;">${cnt}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function _buildEvolutionSlideHTML(stats, inRange) {
  // 분기 안 strategy 카드 + DNA 진주
  const cards = (state.topicCards || []).filter(c => c.category === 'strategy' && inRange(c.createdAt));
  const dnaInRange = (state.pearls || []).filter(p => p.type === 'dna_pearl' && inRange(p.createdAt));
  const totalAttempts = stats.attempts || 0;
  // 사용자 요청 2026-04-28: 체화된 전략 표시 — '네 거가 된 전략' 시각적으로 뿌듯하게
  const embodiedStrategies = (state.topicCards || []).filter(c =>
    c.category === 'strategy' && c.embodimentStatus === 'embodied' && inRange(c.createdAt)
  );

  // 가장 진화 많이 한 가닥 1개
  const mostEvolved = cards.slice().sort((a, b) =>
    ((b.generations || []).length) - ((a.generations || []).length)
  )[0];

  // path 분포
  const pathCount = { 'one-shot': 0, 'evolved': 0, 'quick-discovery': 0 };
  dnaInRange.forEach(p => {
    if (p.embodimentPath && pathCount[p.embodimentPath] != null) pathCount[p.embodimentPath]++;
  });

  let evolHtml = '';
  if (mostEvolved && mostEvolved.generations && mostEvolved.generations.length >= 2) {
    const _layerEmoji = { L1:'🧠', L2:'🎯', L3:'🌍', L4:'👥', L5:'🪞' };
    const _layerName  = { L1:'인지', L2:'행동', L3:'환경', L4:'사회', L5:'메타' };
    evolHtml = `
      <div class="stories-evol-tree">
        <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-bottom:8px;">가장 진화한 가닥 — "${escapeHtml((mostEvolved.title || '').slice(0, 30))}"</div>
        ${mostEvolved.generations.map((g, gi) => `
          <div class="stories-evol-row" style="padding-left:${gi * 14}px;">
            <span style="opacity:0.6;">${gi === 0 ? '·' : '└─'}</span>
            <span>${_layerEmoji[g.layer] || '✦'} ${_layerName[g.layer] || g.layer}</span>
            ${g.status === 'mutated' ? '<span style="opacity:0.5;">🪦</span>' : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // V4-fix v3 (사용자 요청 — 더 따뜻하게): 성장·진화 따뜻한 톤
  // 사용자 요청 2026-04-29: 성공한 거에 집중해서 뿌듯함 ↑
  const workedCount = stats.worked || 0;
  const warmInsight = (() => {
    if (dnaInRange.length > 0) {
      return `🎉 ${dnaInRange.length}개 전략이 진짜 네 일부가 됐어. 이건 너만의 무기야.`;
    }
    if (embodiedStrategies.length > 0) {
      return `✨ 체화한 전략 ${embodiedStrategies.length}개. 같은 상황 와도 이젠 자동이야.`;
    }
    if (workedCount >= 5) {
      return `🌳 ${workedCount}번 통했어. 곧 체화 직전 — 곧 너의 무기가 돼.`;
    }
    if (workedCount > 0) {
      return `🌱 ${workedCount}번 통한 시도 — 진짜 작동하는 전략이 쌓이는 중.`;
    }
    if (totalAttempts > 0) {
      return `🌿 ${totalAttempts}번 시도해봤어. 시도 자체가 너의 무기야.`;
    }
    return '🍃 다음 분기에 새 시도 시작해보자.';
  })();
  // 사용자 요청 2026-04-28: 체화된 전략 카드 — 뿌듯하게, 시각적으로
  const embodiedHtml = embodiedStrategies.length > 0 ? `
    <div style="margin-top:18px; padding:14px 16px; background:linear-gradient(135deg, rgba(212,167,106,0.18), rgba(143,200,143,0.14)); border:1px solid rgba(212,167,106,0.35); border-radius:14px;">
      <div style="font-size:11px; color:rgba(255,255,255,0.7); margin-bottom:8px; letter-spacing:0.04em;">🧬 네 것이 된 전략</div>
      ${embodiedStrategies.slice(0, 4).map(s => `
        <div style="font-size:14px; color:white; padding:5px 0; line-height:1.5; font-weight:500;">
          ✨ ${escapeHtml((s.title || '').slice(0, 36))}
        </div>
      `).join('')}
      ${embodiedStrategies.length > 4 ? `<div style="font-size:11px; color:rgba(255,255,255,0.55); margin-top:6px;">+ ${embodiedStrategies.length - 4}개 더</div>` : ''}
    </div>
  ` : '';

  return `
    <div class="stories-label">네 성장·진화</div>
    <div class="stories-title">전략이 네 무기가 되어가는 시간</div>
    <div class="stories-stat-list">
      <div class="stories-stat-row neutral">
        <span class="stories-stat-label">새 가닥</span>
        <span class="stories-stat-value">${cards.length}개</span>
      </div>
      ${dnaInRange.length > 0 ? `
        <div class="stories-stat-row up">
          <span class="stories-stat-label">🧬 네 일부가 된 DNA 진주</span>
          <span class="stories-stat-value">${dnaInRange.length}개</span>
        </div>
        <div class="stories-stat-row neutral">
          <span class="stories-stat-label">단번 / 진화 / 빠른 발견</span>
          <span class="stories-stat-value">${pathCount['one-shot']}·${pathCount['evolved']}·${pathCount['quick-discovery']}</span>
        </div>
      ` : ''}
      ${totalAttempts > 0 ? `
        <div class="stories-stat-row neutral">
          <span class="stories-stat-label">네 시도</span>
          <span class="stories-stat-value">${totalAttempts}회</span>
        </div>
      ` : ''}
    </div>
    ${embodiedHtml}
    ${evolHtml ? evolHtml.replace('가장 진화한 가닥', '네가 가장 깊이 시도한 가닥') : ''}
    <div class="stories-body" style="margin-top:14px; max-width:300px;">${escapeHtml(warmInsight)}</div>
  `;
}

function _buildNewFeaturesSlideHTML(inRange) {
  // 분기 안 created_at + conf >= 0.5 + user_verified=false (NEW)
  const newTraits = (state.traits || []).filter(t => inRange(t.created_at) && (t.confidence || 0) >= 0.5);
  const newValues = (state.values || []).filter(v => inRange(v.created_at) && (v.confidence || 0) >= 0.5);
  const newPatterns = (state.patterns || []).filter(p => inRange(p.created_at) && (p.confidence || 0) >= 0.5);
  // 사용자 보고 2026-04-29: 4번째 카테고리 — caseFormulation 8 차원 (문제/메커니즘/강점/목표/성장)
  // 이전엔 빠져있어서 3개로만 보임
  const cf = state.caseFormulation || {};
  const _collectCf = (key) => (cf[key] || [])
    .filter(it => it && (typeof it === 'object') && it.created_at && inRange(it.created_at) && (it.confidence == null || it.confidence >= 0.5))
    .map(it => ({ name: it.text || it.name || '', confidence: it.confidence != null ? it.confidence : 0.6, _cfType: key }));
  const newCf = [
    ..._collectCf('problems'),
    ..._collectCf('mechanisms'),
    ..._collectCf('strengths'),
    ..._collectCf('goals'),
    ..._collectCf('growth')
  ].filter(it => it.name);

  const total = newTraits.length + newValues.length + newPatterns.length + newCf.length;

  if (total === 0) {
    return `
      <div class="stories-label">AI가 포착한 새 특징</div>
      <div class="stories-title">이번 분기엔 새 특징이 떠오르지 않았어</div>
      <div class="stories-body">데이터가 더 쌓이면 보일 거야.</div>
    `;
  }

  // 4 카테고리 카드 그리드 + 그라디언트 + top 항목 highlight
  const cats = [
    { key: 'traits',   icon: '🪞', label: '특성',     list: newTraits,   gradient: 'linear-gradient(135deg, rgba(168,157,200,0.28), rgba(140,160,210,0.18))', border: 'rgba(168,157,200,0.5)' },
    { key: 'values',   icon: '⭐', label: '가치',     list: newValues,   gradient: 'linear-gradient(135deg, rgba(212,167,106,0.28), rgba(255,210,80,0.18))',   border: 'rgba(212,167,106,0.5)' },
    { key: 'patterns', icon: '🌫', label: '패턴',     list: newPatterns, gradient: 'linear-gradient(135deg, rgba(143,200,143,0.26), rgba(126,200,227,0.18))', border: 'rgba(143,200,143,0.5)' },
    { key: 'cf',       icon: '🧭', label: '자기 이해', list: newCf,       gradient: 'linear-gradient(135deg, rgba(126,200,227,0.26), rgba(168,157,200,0.18))', border: 'rgba(126,200,227,0.5)' }
  ];
  const visible = cats.filter(c => c.list.length > 0);

  // 사용자 요청 2026-04-29: 빈 카테고리 완전 숨김 (placeholder X) — 있는 것만 2x2 grid
  return `
    <div class="stories-label">AI가 포착한 새 특징</div>
    <div class="stories-title" style="margin-bottom:18px;">${total}개가 네 안에서 처음 보였어</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:300px; margin:0 auto;">
      ${visible.map(c => {
        const first = c.list[0];  // 정렬 X — 첫 아이템 그대로
        return `
          <div style="background:${c.gradient}; border:1px solid ${c.border}; border-radius:14px; padding:13px; min-height:96px; display:flex; flex-direction:column; justify-content:space-between;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:16px;">${c.icon}</span>
                <span style="font-size:11px; color:rgba(255,255,255,0.85); font-weight:600;">${c.label}</span>
              </div>
              <span style="font-size:11px; color:rgba(255,255,255,0.7);">${c.list.length}개</span>
            </div>
            <div style="font-size:13px; color:white; font-weight:500; line-height:1.35; margin-top:6px;">${escapeHtml((first.name || '').slice(0, 24))}</div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="font-size:11px; color:rgba(255,255,255,0.55); margin-top:14px; max-width:280px;">
      나 탭에서 ✓ 맞아 / 아니야 확인할 수 있어
    </div>
  `;
}

// V4-fix v3 (사용자 요청): 너만의 데이터 — 더 재미있고 흥미롭게
function _buildFunStatsSlideHTML(stats, inRange) {
  const items = [];
  const entries = (state.entries || []);
  const inRangeEntries = entries.filter(e => e.timestamp && inRange(e.timestamp));

  // 1) ⚡ 가장 활력 빵빵한 날
  const topVit = inRangeEntries.filter(e => e.vitality != null).sort((a,b) => (b.vitality - a.vitality))[0];
  if (topVit) {
    const dateStr = new Date(topVit.date + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    items.push({ icon: '⚡', big: `${topVit.vitality}/5`, label: `${dateStr} — 가장 빵빵`, tone: 'gold' });
  }

  // 2) 😴 가장 긴 잠
  const sleeps = inRangeEntries.filter(e => e.sleepStart && e.sleepEnd).map(e => {
    const [sh, sm] = e.sleepStart.split(':').map(Number);
    const [eh, em] = e.sleepEnd.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return { date: e.date, mins };
  });
  const longest = sleeps.sort((a,b) => b.mins - a.mins)[0];
  if (longest) {
    const dateStr = new Date(longest.date + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    items.push({ icon: '😴', big: `${Math.floor(longest.mins / 60)}h ${longest.mins % 60}m`, label: `${dateStr} — 가장 긴 잠`, tone: 'blue' });
  }

  // 3) 🐚 가장 많이 받은 shell emoji
  const shells = (state.shellCollection || []).filter(s => s.date && inRange(s.date));
  if (shells.length > 0) {
    const emojiCount = {};
    shells.forEach(s => { emojiCount[s.type] = (emojiCount[s.type] || 0) + 1; });
    const topEmoji = Object.entries(emojiCount).sort((a,b) => b[1] - a[1])[0];
    if (topEmoji && topEmoji[1] >= 2) {
      items.push({ icon: topEmoji[0], big: `${topEmoji[1]}번`, label: `이 분기 네 시그니처 소라`, tone: 'pink' });
    }
  }

  // 4) 🔥 연속 체크인 streak (가장 긴)
  if (inRangeEntries.length >= 3) {
    const sortedByDate = inRangeEntries.slice().sort((a, b) => a.date.localeCompare(b.date));
    let bestStreak = 1, curStreak = 1;
    for (let i = 1; i < sortedByDate.length; i++) {
      const prev = new Date(sortedByDate[i-1].date + 'T12:00:00').getTime();
      const cur = new Date(sortedByDate[i].date + 'T12:00:00').getTime();
      const diffDays = Math.round((cur - prev) / 86400000);
      if (diffDays === 1) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
      else { curStreak = 1; }
    }
    if (bestStreak >= 3) {
      items.push({ icon: '🔥', big: `${bestStreak}일`, label: `연속 체크인 — 가장 긴 streak`, tone: 'orange' });
    }
  }

  // 5) 진주 카테고리 분포 + top emoji
  const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl' && inRange(p.createdAt));
  if (pearls.length > 0) {
    const catCount = {};
    pearls.forEach(p => { const c = p.category || '기타'; catCount[c] = (catCount[c] || 0) + 1; });
    const topCat = Object.entries(catCount).sort((a,b) => b[1] - a[1])[0];
    const iconMap = { 음악:'🎵', 음식:'🍴', 장소:'📍', 순간:'✨', 사람:'👥' };
    if (topCat) {
      items.push({ icon: iconMap[topCat[0]] || '💎', big: `${topCat[1]}개`, label: `${topCat[0]} 진주 — 네 취향`, tone: 'purple' });
    }
  }

  // 6) 🎵 가장 자주 들은 곡 (음악 진주의 track.id 빈도)
  const musicTracks = pearls.filter(p => p.category === '음악' && p.track && p.track.id);
  if (musicTracks.length >= 2) {
    const trackCount = {};
    musicTracks.forEach(p => { trackCount[p.track.id] = (trackCount[p.track.id] || 0) + 1; });
    const topTrackId = Object.entries(trackCount).sort((a,b) => b[1] - a[1])[0];
    if (topTrackId && topTrackId[1] >= 2) {
      const t = musicTracks.find(p => p.track.id === topTrackId[0]).track;
      items.push({ icon: '🎵', big: `${topTrackId[1]}번`, label: `"${t.title || ''}" — ${t.artist || ''}`, tone: 'gold' });
    }
  }

  // 7) ↻ 가장 다시 본 깨달음
  const arrs = (state.archive || []).filter(a => a.savedAt && inRange(a.savedAt));
  const topRevisit = arrs.slice().sort((a,b) => (b.revisitCount || 0) - (a.revisitCount || 0))[0];
  if (topRevisit && (topRevisit.revisitCount || 0) >= 2) {
    items.push({ icon: '↻', big: `${topRevisit.revisitCount}번`, label: `"${(topRevisit.headline || '').slice(0,18)}" — 살아있는 통찰`, tone: 'teal' });
  }

  // 8) 자주 활성된 모드
  const topMode = stats.modeCount ? Object.entries(stats.modeCount).sort((a,b) => b[1] - a[1])[0] : null;
  if (topMode) {
    const modeMap = { exam:'📚', travel:'✈️', sick:'🤒', rest:'🏖', period:'🩸', drained:'🪫' };
    const modeName = { exam:'시험', travel:'여행', sick:'아픔', rest:'휴식', period:'월경', drained:'방전' };
    items.push({ icon: modeMap[topMode[0]] || '🌀', big: `${topMode[1]}일`, label: `${modeName[topMode[0]] || topMode[0]} 모드`, tone: 'gray' });
  }

  // 9) 🌅 가장 일찍 일어난 날
  if (sleeps.length > 0) {
    const earliestEnd = inRangeEntries.filter(e => e.sleepEnd).sort((a, b) => a.sleepEnd.localeCompare(b.sleepEnd))[0];
    if (earliestEnd) {
      const dateStr = new Date(earliestEnd.date + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      items.push({ icon: '🌅', big: earliestEnd.sleepEnd, label: `${dateStr} — 가장 빠른 기상`, tone: 'gold' });
    }
  }

  if (items.length === 0) {
    return `
      <div class="stories-label">너만의 데이터</div>
      <div class="stories-empty">이 분기 데이터 부족<br>다음 분기엔 더 풍부하게 ✦</div>
    `;
  }

  // 최대 6개 표시 (랜덤 selection으로 분기마다 다른 stat — 재미)
  const shuffled = items.slice().sort(() => Math.random() - 0.5).slice(0, 6);
  const toneClass = (t) => `fun-tile fun-tile-${t || 'gold'}`;
  return `
    <div class="stories-label">너만의 데이터 ✨</div>
    <div class="stories-title">너 자신만의 통계</div>
    <div class="stories-fun-grid">
      ${shuffled.map(it => `
        <div class="${toneClass(it.tone)}">
          <div class="fun-tile-icon">${it.icon}</div>
          <div class="fun-tile-big">${it.big}</div>
          <div class="fun-tile-label">${it.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function _buildPatternsSlideHTML(inRange) {
  const diags = (state.diagnoses || []).filter(d => inRange(d.detectedAt));
  if (diags.length === 0) {
    return `
      <div class="stories-label">작동 중인 패턴</div>
      <div class="stories-title">이번 분기엔 큰 패턴 신호가 없었어</div>
      <div class="stories-body">평탄한 흐름. 그것도 안정.</div>
    `;
  }

  const labels = {
    weak_tool: '🔧 도구 약함',
    wrong_layer: '📐 차원 안 맞음',
    value_clash: '⚖️ 가치 상충',
    avoidance: '🌫 회피 패턴',
    willpower_cap: '🪫 의지 임계치'
  };
  // 가장 confidence 높은 진단 1-2개
  const topDiags = diags.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 2);

  // 사용자 요청 2026-04-28: 미적 보강 — type별 색 그라디언트, confidence bar, 깔끔한 메타
  const statusBadge = (s) => s === 'active' ? '<span style="background:rgba(255,80,80,0.28); color:#ffaaaa; font-size:9px; padding:2px 7px; border-radius:6px; letter-spacing:0.04em;">ACTIVE</span>' : s === 'shown' ? '<span style="background:rgba(168,157,200,0.28); color:#cfc4e8; font-size:9px; padding:2px 7px; border-radius:6px; letter-spacing:0.04em;">인용됨</span>' : '';
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };
  const typeStyles = {
    weak_tool:    { gradient: 'linear-gradient(135deg, rgba(255,140,90,0.22), rgba(212,167,106,0.14))', border: 'rgba(255,140,90,0.5)',  desc: '시도해도 안 통하는 도구. 다른 차원으로.' },
    wrong_layer:  { gradient: 'linear-gradient(135deg, rgba(126,200,227,0.22), rgba(140,160,210,0.14))', border: 'rgba(126,200,227,0.5)', desc: '차원 자체가 안 맞을 가능성.' },
    value_clash:  { gradient: 'linear-gradient(135deg, rgba(212,167,106,0.22), rgba(168,157,200,0.14))', border: 'rgba(212,167,106,0.5)', desc: '두 가치 충돌. 우선순위 정리 필요.' },
    avoidance:    { gradient: 'linear-gradient(135deg, rgba(168,157,200,0.22), rgba(140,140,180,0.14))', border: 'rgba(168,157,200,0.5)', desc: '회피 신호 — 의식적으로 직면하거나 우회 설계.' },
    willpower_cap:{ gradient: 'linear-gradient(135deg, rgba(143,200,143,0.22), rgba(126,200,227,0.14))', border: 'rgba(143,200,143,0.5)', desc: '의지 자원 임계치. 환경 자동화 ↑.' }
  };
  return `
    <div class="stories-label">작동 중인 패턴</div>
    <div class="stories-title" style="margin-bottom:18px;">네 안에서 작동 중</div>
    <div style="display:flex; flex-direction:column; gap:11px; max-width:300px;">
      ${topDiags.map(d => {
        const ts = typeStyles[d.type] || typeStyles.wrong_layer;
        const confPct = Math.round((d.confidence || 0) * 100);
        return `
          <div style="background:${ts.gradient}; border:1px solid ${ts.border}; border-radius:14px; padding:14px 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
              <span style="font-size:14px; color:white; font-weight:600;">${labels[d.type] || d.type}</span>
              ${statusBadge(d.status)}
            </div>
            <div style="font-size:12px; color:rgba(255,255,255,0.78); line-height:1.5; margin-bottom:10px;">
              ${ts.desc}
            </div>
            <div style="height:4px; background:rgba(255,255,255,0.14); border-radius:2px; overflow:hidden; margin-bottom:6px;">
              <div style="height:100%; width:${confPct}%; background:${ts.border}; border-radius:2px;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:10px; color:rgba(255,255,255,0.55);">
              <span>${d.detectedAt ? `📅 ${fmtDate(d.detectedAt)}` : ''}${d.lastUpdate ? ` → ${fmtDate(d.lastUpdate)}` : ''}</span>
              <span>신뢰도 ${confPct}%</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="font-size:11px; color:rgba(255,255,255,0.55); margin-top:14px; max-width:280px; line-height:1.6; text-align:center; font-style:italic;">
      너 ≠ 그 패턴. 작동 중일 뿐.
    </div>
  `;
}

function _buildNarrativeSlideHTML(review) {
  const summary = review.summary || '';
  const sectionsArr = Array.isArray(review.sections) ? review.sections : [];
  const nextSection = sectionsArr.find(s => (s.label || '').includes('다음'));
  const otherSections = sectionsArr.filter(s => s !== nextSection);
  // 사용자 요청 2026-04-28: 매거진식 pull-quote — 박스 줄이고 type 자체로 elegant
  const sectionAccent = (label) => {
    const l = label || '';
    if (l.includes('흐름'))  return '#7ec8e3';   // 파랑
    if (l.includes('자라') || l.includes('성장')) return '#9fd49f';  // 녹
    if (l.includes('패턴'))  return '#b3a4d6';   // 보라
    return '#d4a76a';                              // 금 (default)
  };
  return `
    <div style="display:flex; flex-direction:column; align-items:center; max-width:320px; padding:20px 16px;">
      <!-- 라벨 + 가는 양쪽 선 -->
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:24px;">
        <div style="width:20px; height:1px; background:rgba(212,167,106,0.45);"></div>
        <div class="stories-label" style="margin:0;">네 분기, 한 단락</div>
        <div style="width:20px; height:1px; background:rgba(212,167,106,0.45);"></div>
      </div>

      <!-- pull quote: 큰 따옴표 + serif 본문 -->
      <div style="position:relative; padding:8px 6px; margin-bottom:26px;">
        <div style="position:absolute; top:-12px; left:-8px; font-size:48px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif;">"</div>
        <div style="font-size:18px; line-height:1.85; color:white; font-family:'Gowun Batang', serif; font-weight:400; text-align:center; padding:0 14px; letter-spacing:0.005em;">
          ${escapeHtml(summary || '데이터가 더 쌓이면 narrative가 보일 거야.')}
        </div>
        <div style="position:absolute; bottom:-30px; right:-4px; font-size:48px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif;">"</div>
      </div>

      <!-- 가는 구분 ✦ -->
      ${otherSections.length > 0 ? `
        <div style="display:flex; align-items:center; gap:8px; margin:20px 0 18px; opacity:0.55;">
          <div style="width:30px; height:1px; background:rgba(212,167,106,0.4);"></div>
          <span style="color:rgba(212,167,106,0.75); font-size:11px;">✦</span>
          <div style="width:30px; height:1px; background:rgba(212,167,106,0.4);"></div>
        </div>

        <!-- section: 라벨 + 색 dot + 본문 (박스 X, 인라인) -->
        <div style="display:flex; flex-direction:column; gap:13px; width:100%;">
          ${otherSections.map(s => {
            const accent = sectionAccent(s.label);
            return `
              <div style="border-left:2px solid ${accent}; padding:2px 0 2px 12px;">
                <div style="font-size:10px; color:${accent}; margin-bottom:4px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">${escapeHtml(s.label || '')}</div>
                <div style="font-size:13px; color:rgba(255,255,255,0.88); line-height:1.6;">${escapeHtml(s.body || '')}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      <!-- next: 분리된 가벼운 highlight -->
      ${nextSection ? `
        <div style="margin-top:22px; padding:14px 16px; background:linear-gradient(135deg, rgba(143,200,143,0.18), rgba(212,167,106,0.10)); border-radius:14px; width:100%; box-sizing:border-box;">
          <div style="font-size:10px; color:rgba(143,200,143,0.95); margin-bottom:5px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;">${escapeHtml(nextSection.label || '다음 분기에')}</div>
          <div style="font-size:13px; color:white; line-height:1.6;">${escapeHtml(nextSection.body || '')}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// V4-fix v3 (사용자 요청): 깨달음 정리 슬라이드 — 분기/연간/주간/월간 공통
function _buildArchiveSummarySlideHTML(inRange) {
  const arrs = (state.archive || []).filter(a => a.savedAt && inRange(a.savedAt));
  if (arrs.length === 0) {
    return `
      <div class="stories-label">네 깨달음</div>
      <div class="stories-title">이 분기 깨달음 카드 없음</div>
      <div class="stories-body">대화에서 ✦ 깨달음으로, 또는 ✎ 메모로 직접. 다음 분기엔 작은 한 줄도 OK.</div>
    `;
  }
  // type 분포
  const typeCount = { scrap: 0, memo: 0, reflection: 0 };
  arrs.forEach(a => { typeCount[a.type || 'scrap'] = (typeCount[a.type || 'scrap'] || 0) + 1; });
  // 태그 빈도
  const tagFreq = {};
  arrs.forEach(a => (a.tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; }));
  const topTags = Object.entries(tagFreq).sort((a,b) => b[1] - a[1]).slice(0, 4).map(t => t[0]);
  // 헤드라인 top 5 (최신 또는 풍부한 헤드라인)
  const topHeadlines = arrs.filter(a => a.headline).slice(0, 5);

  return `
    <div class="stories-label">네 깨달음</div>
    <div class="stories-title">${arrs.length}개의 통찰이 자라났어</div>
    <div class="stories-body" style="margin-bottom:12px;">📌 스크랩 ${typeCount.scrap || 0} · ✎ 메모 ${typeCount.memo || 0}${typeCount.reflection ? ` · 🌊 숙고 ${typeCount.reflection}` : ''}</div>
    ${topTags.length > 0 ? `<div style="font-size:11px; color:rgba(255,255,255,0.55); margin-bottom:14px; letter-spacing:0.04em;">자주 떠올린: ${topTags.map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
    ${topHeadlines.length > 0 ? `<div class="stories-archive-list">
      ${topHeadlines.map(a => `<div class="stories-archive-item">✦ ${escapeHtml(a.headline)}</div>`).join('')}
    </div>` : ''}
    <div class="stories-body" style="margin-top:14px; font-size:12px;">네 안에서 자라난 통찰들. 다음 분기에도 이어질 거야.</div>
  `;
}

function _buildClosingSlideHTML(review, stats) {
  // sections에서 흐름 또는 첫 번째 section을 시적으로
  const flow = Array.isArray(review.sections) && review.sections[0] ? review.sections[0].body : '';
  const poem = flow ? flow.split(/[.\n]/)[0].slice(0, 28) : `${review.quarterKey || '분기'} — 네 흔적`;
  // 사용자 요청 2026-04-28: 미적 — emoji 화환 + 큰 gradient + 시구 카드 + 흐릿한 별 효과
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; padding:36px 22px; max-width:320px; position:relative;">
      <!-- 배경 별 -->
      <div style="position:absolute; top:18px; left:14px; font-size:14px; opacity:0.35;">✦</div>
      <div style="position:absolute; top:64px; right:22px; font-size:11px; opacity:0.30;">·</div>
      <div style="position:absolute; bottom:36px; left:24px; font-size:13px; opacity:0.32;">✧</div>
      <div style="position:absolute; bottom:80px; right:18px; font-size:10px; opacity:0.28;">·</div>

      <!-- 메인 emoji + 광원 -->
      <div style="position:relative; display:flex; align-items:center; justify-content:center;">
        <div style="position:absolute; width:100px; height:100px; background:radial-gradient(circle, rgba(212,167,106,0.30) 0%, transparent 70%); border-radius:50%;"></div>
        <div style="font-size:60px; line-height:1; position:relative; filter: drop-shadow(0 0 14px rgba(212,167,106,0.5));">🐚</div>
      </div>

      <!-- 라벨 + 가는 구분선 -->
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
        <div class="stories-label" style="text-align:center; margin:0;">${escapeHtml(review.quarterKey || '')}</div>
        <div style="width:24px; height:1px; background:rgba(212,167,106,0.5);"></div>
      </div>

      <!-- 시구 카드 -->
      <div style="background:linear-gradient(135deg, rgba(212,167,106,0.25), rgba(168,157,200,0.20), rgba(143,200,143,0.18)); border:1px solid rgba(212,167,106,0.45); border-radius:20px; padding:26px 22px; text-align:center; box-shadow:0 4px 24px rgba(212,167,106,0.18);">
        <div class="stories-poem" style="font-size:19px; line-height:1.7; color:white; font-family:'Gowun Batang', serif; font-weight:500;">${escapeHtml(poem)}</div>
      </div>

      <!-- 마무리 인사 -->
      <div style="font-size:13px; color:rgba(255,255,255,0.78); text-align:center; line-height:1.8; letter-spacing:0.02em;">
        한 페이지가 끝났어.<br>
        <span style="color:rgba(212,167,106,0.95); font-weight:500;">다음 페이지도 같이 ✦</span>
      </div>
    </div>
  `;
}

// V4-fix: 분기 리뷰 deep dive — 6 비교 축 시각 카드 (anchor 3 / 비전 7.10)
// 1. 8 차원 (problems↓ / strengths↑) / 2. 추적 항목 / 3. 모드 빈도
// 4. 진화율 / 5. 진주 수 / 6. growth 차원
// 직전 분기와 비교 (있으면) → ↑↓ 표시. 정체 감지 → "변화 X도 의미"
function renderQuarterlyDeepDive(review) {
  const s = review.stats || {};
  // 직전 분기 stats (비교용)
  const prevQ = (() => {
    const m = String(review.quarterKey || '').match(/^(\d{4})-Q(\d)$/);
    if (!m) return null;
    let y = parseInt(m[1]);
    let q = parseInt(m[2]) - 1;
    if (q < 1) { q = 4; y -= 1; }
    const prevKey = `${y}-Q${q}`;
    const prev = (state.quarterlyReviews || []).find(r => r.quarterKey === prevKey);
    return prev?.stats || null;
  })();

  const trend = (cur, prev) => {
    if (prev == null || cur == null) return '';
    if (cur > prev) return `<span class="dd-up" title="이전 분기 ${prev}">↑${cur - prev}</span>`;
    if (cur < prev) return `<span class="dd-down" title="이전 분기 ${prev}">↓${prev - cur}</span>`;
    return '<span class="dd-flat" title="이전 분기와 같음">→</span>';
  };

  // 1. 진화율 — 막대 + %
  const workRate = s.workRate != null ? Math.round(s.workRate * 100) : null;
  const prevWorkRate = prevQ?.workRate != null ? Math.round(prevQ.workRate * 100) : null;
  const workCard = workRate != null
    ? `<div class="dd-card">
         <div class="dd-card-label">🎯 진화율</div>
         <div class="dd-card-value">${workRate}<span class="dd-card-unit">%</span> ${trend(workRate, prevWorkRate)}</div>
         <div class="dd-bar-track"><div class="dd-bar-fill" style="width:${workRate}%;"></div></div>
         <div class="dd-card-sub">${s.worked || 0}/${s.attempts || 0} 시도</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">🎯 진화율</div>
         <div class="dd-card-empty-msg">아직 시도 X</div>
       </div>`;

  // 2. 진주 수
  const pearlsTotal = (s.pearls || 0) + (s.dnaPearls || 0);
  const prevPearlsTotal = prevQ ? (prevQ.pearls || 0) + (prevQ.dnaPearls || 0) : null;
  const pearlCard = `<div class="dd-card">
    <div class="dd-card-label">🔮 진주</div>
    <div class="dd-card-value">${pearlsTotal} ${trend(pearlsTotal, prevPearlsTotal)}</div>
    <div class="dd-card-sub">${s.pearls || 0} 일반${s.dnaPearls ? ` · ${s.dnaPearls} DNA` : ''}</div>
  </div>`;

  // 3. 체크인 일수
  const checkinCard = `<div class="dd-card">
    <div class="dd-card-label">📔 체크인</div>
    <div class="dd-card-value">${s.checkins || 0}<span class="dd-card-unit">일</span> ${trend(s.checkins || 0, prevQ?.checkins)}</div>
  </div>`;

  // 4. 모드 빈도 (top 1)
  const modes = s.modeCount || {};
  const topMode = Object.entries(modes).sort((a,b) => b[1] - a[1])[0];
  const modeMap = { exam: '📚 시험', travel: '✈️ 여행', sick: '🤒 아픔', rest: '🏖 휴식', period: '🩸 월경', drained: '🪫 방전' };
  const modeCard = topMode
    ? `<div class="dd-card">
         <div class="dd-card-label">🌫 자주 활성된 모드</div>
         <div class="dd-card-value-text">${modeMap[topMode[0]] || topMode[0]}</div>
         <div class="dd-card-sub">${topMode[1]}일</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">🌫 모드</div>
         <div class="dd-card-empty-msg">활성 모드 거의 없음</div>
       </div>`;

  // 5. 추적 항목 변화 (top 1)
  const trackerTop = (s.trackerStats || [])[0];
  const trackerCard = trackerTop
    ? `<div class="dd-card">
         <div class="dd-card-label">📊 추적 항목</div>
         <div class="dd-card-value-text">${escapeHtml(trackerTop.title)}</div>
         <div class="dd-card-sub">${trackerTop.first ?? '?'} → ${trackerTop.last ?? '?'}${trackerTop.unit || ''} (${trackerTop.count}회)</div>
       </div>`
    : `<div class="dd-card dd-card-empty">
         <div class="dd-card-label">📊 추적 항목</div>
         <div class="dd-card-empty-msg">기록 X</div>
       </div>`;

  // 6. 8 차원 (problems / strengths / growth)
  const dimsCard = `<div class="dd-card">
    <div class="dd-card-label">🪞 8 차원</div>
    <div class="dd-card-dim-row">
      <span title="문제"><span class="dd-dim-icon">💧</span> ${s.problemsTotal || 0}</span>
      <span title="강점"><span class="dd-dim-icon">✨</span> ${s.strengthsTotal || 0}</span>
      <span title="성장"><span class="dd-dim-icon">🌱</span> ${s.growthCount || 0}</span>
    </div>
  </div>`;

  // 정체 감지 — 모든 비교 축에서 변화 거의 없음
  let stagnationMsg = '';
  if (prevQ) {
    const flat = (workRate === prevWorkRate) && (pearlsTotal === prevPearlsTotal) && ((s.checkins || 0) === (prevQ.checkins || 0));
    if (flat && (workRate != null || pearlsTotal > 0)) {
      stagnationMsg = `<div class="dd-stagnation">머무는 시간도 의미 있어. 변화 X = 안정 또는 숙성 중일 수도.</div>`;
    }
  }

  return `<div class="dd-grid">
    ${workCard}
    ${pearlCard}
    ${checkinCard}
    ${modeCard}
    ${trackerCard}
    ${dimsCard}
  </div>${stagnationMsg}`;
}

function renderArchiveReviews() {
  const container = document.getElementById('archiveReviewsList');
  if (!container) return;

  const weekly = (state.weeklyReviews || []).map(r => ({...r, type: 'weekly'}));
  const monthly = (state.monthlyReviews || []).map(r => ({...r, type: 'monthly'}));
  // V4-1y-3: 분기 리뷰 추가
  const quarterly = (state.quarterlyReviews || []).map(r => ({...r, type: 'quarterly'}));
  const all = [...weekly, ...monthly, ...quarterly].sort((a, b) =>
    new Date(b.completedAt) - new Date(a.completedAt)
  );

  // 사용자 요청 2026-04-28: 한 해 분기 4개 모두 있으면 '🌟 연간 Stories' 카드 맨 위에 노출
  const yearGroups = {};
  (state.quarterlyReviews || []).forEach(r => {
    const yr = (r.quarterKey || '').split('-')[0];
    if (!yr) return;
    if (!yearGroups[yr]) yearGroups[yr] = 0;
    yearGroups[yr]++;
  });
  const fullYears = Object.keys(yearGroups).filter(yr => yearGroups[yr] >= 4).sort().reverse();
  let annualCardHtml = '';
  if (fullYears.length > 0) {
    annualCardHtml = fullYears.map(yr => `
      <div class="timeline-day annual-stories-card" data-year="${yr}" onclick="event.stopPropagation(); openAnnualReview(${yr})" style="cursor:pointer; background: linear-gradient(135deg, rgba(212,167,106,0.18), rgba(168,157,200,0.18)); border: 1px solid var(--accent);">
        <div class="timeline-day-date">🌟 ${yr}년 연간 리뷰</div>
        <div class="timeline-day-summary" style="font-family: 'Gowun Batang', serif; font-size: 14px;">
          올 한 해, 너의 이야기.
        </div>
        <div class="timeline-day-meta"><span>▶ 같이 보자</span></div>
      </div>
    `).join('');
  }

  if (all.length === 0) {
    container.innerHTML = `<div class="timeline-empty">
      <div class="icon">🌙</div>
      아직 리뷰가 없어.<br>
      주말 / 매월 1주차 / 매분기 1주차에<br>
      자동으로 정리돼.
    </div>`;
    return;
  }

  container.innerHTML = annualCardHtml + all.map((r, idx) => {
    const date = new Date(r.completedAt);
    const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    // 사용자 요청 2026-04-29: 분기 리뷰 라벨을 봄/여름/가을/겨울 + 연도 + 이모지로
    const seasonLabel = r.type === 'quarterly' && r.quarterKey && typeof seasonLabelOf === 'function'
      ? seasonLabelOf(r.quarterKey, { withEmoji: true })
      : null;
    const typeLabel = r.type === 'weekly' ? '🌙 주간 리뷰'
      : r.type === 'monthly' ? '📅 월간 리뷰'
      : (seasonLabel ? `${seasonLabel} 리뷰` : '📊 분기 리뷰');
    const periodLabel = r.type === 'quarterly' ? '' : (r.weekKey || r.monthKey || '');
    const autoTag = r.auto ? ' <span style="font-size:9px; color:var(--purple); padding:1px 6px; background:var(--purple-dim); border-radius:6px; margin-left:4px;">🤖 자동</span>' : '';

    // 사용자 명시 2026-05-01: 카드 = 한 줄 요약만, 클릭 → screen-review 풀화면 (readonly).
    // one_word 우선 + pattern.headline 부제 / 없으면 summary fallback.
    let summaryLine = '';
    if (r.one_word || r.one_word_weekly) {
      const ow = r.one_word || r.one_word_weekly;
      summaryLine = `<span style="color:var(--accent); font-weight:600;">${escapeHtml(ow)}</span>`;
      if (r.pattern && r.pattern.headline) summaryLine += ` · <span style="opacity:0.85;">${escapeHtml(r.pattern.headline)}</span>`;
    } else if (r.pattern && r.pattern.headline) {
      summaryLine = escapeHtml(r.pattern.headline);
    } else if (r.summary) {
      summaryLine = escapeHtml(r.summary);
    } else {
      summaryLine = '(요약 없음)';
    }
    const reviewKey = r.weekKey || r.monthKey || r.quarterKey || '';
    const completedAtJs = r.completedAt ? `'${r.completedAt}'` : 'null';

    return `
      <div class="timeline-day" onclick="openSavedReview('${r.type}', '${escapeHtml(reviewKey)}', ${completedAtJs})" style="cursor:pointer;">
        <div class="timeline-day-date">${typeLabel}${periodLabel ? ` · ${periodLabel}` : ''}${autoTag}</div>
        <div class="timeline-day-summary" style="font-family: 'Gowun Batang', serif; font-size: 14px;">
          ${summaryLine}
        </div>
        <div class="timeline-day-meta"><span>${dateStr} · ▶ 같이 보자</span></div>
      </div>
    `;
  }).join('');
}

// 사용자 명시 2026-05-01: 리뷰 모음 카드 클릭 → 풀화면 readonly view (주간 리뷰 미리보기와 동일 흐름).
function openSavedReview(type, key, completedAt) {
  let arr;
  let keyField;
  if (type === 'weekly') { arr = state.weeklyReviews || []; keyField = 'weekKey'; }
  else if (type === 'monthly') { arr = state.monthlyReviews || []; keyField = 'monthKey'; }
  else if (type === 'quarterly') { arr = state.quarterlyReviews || []; keyField = 'quarterKey'; }
  else { showToast('알 수 없는 리뷰 타입: ' + type); return; }

  const review = arr.find(r => r[keyField] === key && (!completedAt || r.completedAt === completedAt));
  if (!review) { showToast('리뷰 못 찾음 (이미 삭제됐을 수 있어)'); return; }

  showScreen('review');
  renderReviewScreen(type, review, { readonly: true });
  // 위로 스크롤
  const screen = document.getElementById('screen-review');
  if (screen) screen.scrollTop = 0;
}

// 사용자 요청 2026-05-01: 리뷰 모음에서 카드 삭제. type + key 매칭. completedAt 도 같이 받아 동일 key 여러 개 있을 시 정확히 그 instance 만 제거 (방어).
// return bool — readonly fullscreen 에서 success 시 list 화면 복귀 위함.
function deleteReview(type, key, completedAt) {
  if (!confirm('이 리뷰 삭제할까? 되돌릴 수 X.')) return false;
  const matchInstance = (r) => {
    if (completedAt && r.completedAt) return r.completedAt === completedAt;
    return true;  // completedAt 없으면 key 매칭만
  };
  if (type === 'weekly') {
    state.weeklyReviews = (state.weeklyReviews || []).filter(r => !(r.weekKey === key && matchInstance(r)));
  } else if (type === 'monthly') {
    state.monthlyReviews = (state.monthlyReviews || []).filter(r => !(r.monthKey === key && matchInstance(r)));
  } else if (type === 'quarterly') {
    state.quarterlyReviews = (state.quarterlyReviews || []).filter(r => !(r.quarterKey === key && matchInstance(r)));
  } else {
    showToast('알 수 없는 리뷰 타입: ' + type);
    return false;
  }
  saveState();
  if (typeof saveToCloudNow === 'function') saveToCloudNow().catch(() => {});
  if (typeof renderArchiveReviews === 'function') renderArchiveReviews();
  showToast('🗑 리뷰 삭제됨');
  return true;
}

// V4-fix v3 (사용자 요청 — 1~6 통합): 리뷰별 깨달음 깊은 가공
// 사용자 명시 2026-04-30 ultrathink: opts.archiveOverride 추가 — 주간 리뷰 본 화면 (저장 전 / preview 시드) 통째로 호출 가능.
function _buildReviewArchiveSummaryHTML(review, opts) {
  opts = opts || {};
  const _archiveSource = Array.isArray(opts.archiveOverride) ? opts.archiveOverride : (state.archive || []);
  let startMs = null, endMs = null;
  if (review.quarterKey && typeof getQuarterRange === 'function') {
    const range = getQuarterRange(review.quarterKey);
    if (range) { startMs = new Date(range.start).getTime(); endMs = new Date(range.end).getTime(); }
  } else if (review.monthKey) {
    const mm = String(review.monthKey).match(/^(\d{4})-(\d{2})$/);
    if (mm) {
      const y = parseInt(mm[1]); const mo = parseInt(mm[2]) - 1;
      startMs = new Date(y, mo, 1).getTime();
      endMs = new Date(y, mo + 1, 0, 23, 59, 59).getTime();
    }
  } else if (review.weekKey || review.completedAt) {
    const compMs = new Date(review.completedAt).getTime();
    startMs = compMs - 7 * 86400000;
    endMs = compMs;
  }
  if (startMs == null || endMs == null) return '';
  const arrs = _archiveSource.filter(a => {
    if (!a.savedAt) return false;
    const t = new Date(a.savedAt).getTime();
    return t >= startMs && t <= endMs;
  });
  if (arrs.length === 0) return '';
  const total = arrs.length;

  // 1) 태그 + 분기 비교
  const tagFreq = {};
  arrs.forEach(a => (a.tags || []).forEach(t => { tagFreq[t] = (tagFreq[t] || 0) + 1; }));
  const topTags = Object.entries(tagFreq).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const periodLen = endMs - startMs;
  const prevArrs = _archiveSource.filter(a => {
    if (!a.savedAt) return false;
    const t = new Date(a.savedAt).getTime();
    return t >= (startMs - periodLen) && t < startMs;
  });
  const prevTags = new Set();
  prevArrs.forEach(a => (a.tags || []).forEach(t => prevTags.add(t)));
  const curTags = new Set(Object.keys(tagFreq));
  const newTags = [...curTags].filter(t => !prevTags.has(t));
  const goneTags = [...prevTags].filter(t => !curTags.has(t));
  const stayedTags = [...curTags].filter(t => prevTags.has(t));

  // 2) type 분포 = 사고 모드
  const tCount = { scrap: 0, memo: 0, reflection: 0 };
  arrs.forEach(a => { const t = a.type || 'scrap'; tCount[t] = (tCount[t] || 0) + 1; });
  const scrapPct = Math.round((tCount.scrap || 0) / total * 100);
  const memoPct  = Math.round((tCount.memo  || 0) / total * 100);
  const reflPct  = Math.round((tCount.reflection || 0) / total * 100);
  const modeInsight = (() => {
    if (scrapPct >= 60) return '대화 흐름에서 통찰을 잡는 편 — 외부 자극이 트리거.';
    if (memoPct >= 50)  return '자유롭게 ✎ 메모 — 능동적으로 통찰을 적용하는 편.';
    if (reflPct >= 30)  return '🌊 숙고로 깊이 파는 편 — 큰 질문을 안고 가.';
    return '세 가지 모드 골고루 — 다층 사고가 흐르고 있어.';
  })();

  // 3) 시간 분포 (3등분)
  const third = periodLen / 3;
  const timeBins = [0, 0, 0];
  arrs.forEach(a => {
    const t = new Date(a.savedAt).getTime();
    const bin = Math.min(2, Math.max(0, Math.floor((t - startMs) / third)));
    timeBins[bin]++;
  });
  const timeMaxBin = timeBins.indexOf(Math.max(...timeBins));
  const timeInsight = (() => {
    if (Math.max(...timeBins) - Math.min(...timeBins) <= 1) return '기간 내내 균등하게 — 꾸준한 사색.';
    if (timeMaxBin === 0) return '초반에 통찰 몰림 — 시작이 또렷했어.';
    if (timeMaxBin === 2) return '말미에 통찰 몰림 — 정리할 때 깊어지는 편.';
    return '중반에 통찰 몰림 — 흐름 중간이 깊어.';
  })();
  const tbMax = Math.max(...timeBins, 1);
  const timeBars = timeBins.map((n, i) => {
    const pct = (n / tbMax) * 100;
    const labels = ['초반', '중반', '말미'];
    return `<div style="flex:1; text-align:center;"><div style="height:36px; display:flex; align-items:flex-end;"><div style="width:100%; height:${pct}%; background:linear-gradient(180deg, var(--accent), rgba(212,167,106,0.25)); border-radius:3px 3px 0 0; min-height:3px;"></div></div><div style="font-size:9px; color:var(--text-soft); margin-top:3px;">${labels[i]} ${n}</div></div>`;
  }).join('');

  // 4) 클러스터
  const clusters = topTags.slice(0, 3).map(([tag, count]) => ({
    tag, count,
    items: arrs.filter(a => (a.tags || []).includes(tag)).sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt))
  })).filter(c => c.items.length >= 2);

  // 6) ★ + 다시 본
  const starredArrs = arrs.filter(a => a.starred);
  const topRevisited = arrs.slice().sort((a, b) => (b.revisitCount || 0) - (a.revisitCount || 0)).filter(a => (a.revisitCount || 0) > 0).slice(0, 3);

  // 5) AI 메타 요약 (캐시)
  const metaSummary = review.archiveMetaSummary || '';
  const heads = arrs.filter(a => a.headline).slice(0, 6);

  return `<div class="review-archive-summary">
    <div class="ras-title">✨ 이 기간 깨달음 ${total}개</div>
    ${metaSummary ? `<div class="ras-meta">"${escapeHtml(metaSummary)}"</div>` : (review.id ? `
      <div style="margin-bottom:12px;"><button class="ras-meta-btn" onclick="event.stopPropagation(); generateReviewArchiveMetaSummary('${review.id}')">🤖 AI 핵심 통찰 요약 받기</button></div>
    ` : `
      <div style="margin-bottom:12px; font-size:11px; color:var(--text-soft); padding:8px 10px; background:rgba(255,255,255,0.03); border-radius:6px; line-height:1.6;">🤖 리뷰 저장 후 AI 핵심 통찰 요약 받기 가능</div>
    `)}
    <div class="ras-section">
      <div class="ras-section-label">네 사고 모드</div>
      <div class="ras-mode-bars">
        <div class="ras-mode-row"><span>📌 스크랩 (대화에서)</span><span>${tCount.scrap || 0} · ${scrapPct}%</span></div>
        <div class="ras-mode-row"><span>✎ 메모 (자유)</span><span>${tCount.memo || 0} · ${memoPct}%</span></div>
        ${tCount.reflection ? `<div class="ras-mode-row"><span>🌊 숙고 (깊이)</span><span>${tCount.reflection} · ${reflPct}%</span></div>` : ''}
      </div>
      <div class="ras-insight">${escapeHtml(modeInsight)}</div>
    </div>
    ${topTags.length > 0 ? `<div class="ras-section">
      <div class="ras-section-label">네 화두 무게중심</div>
      <div style="font-size:11px; line-height:2;">${topTags.map(([t, c]) => `<span class="ras-tag">#${escapeHtml(t)} <span class="ras-tag-count">${c}</span></span>`).join('')}</div>
      ${(newTags.length || goneTags.length || stayedTags.length) ? `<div style="margin-top:10px; font-size:11px; line-height:1.7;">
        ${stayedTags.length > 0 ? `<div style="color:var(--text-dim);">↻ 계속되는: ${stayedTags.slice(0,4).map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
        ${newTags.length > 0 ? `<div style="color:#8fc88f;">+ 새로 등장: ${newTags.slice(0,4).map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
        ${goneTags.length > 0 ? `<div style="color:var(--text-soft);">− 사라진: ${goneTags.slice(0,4).map(t => '#' + escapeHtml(t)).join(' · ')}</div>` : ''}
      </div>` : ''}
    </div>` : ''}
    <div class="ras-section">
      <div class="ras-section-label">언제 통찰이 깊었나</div>
      <div style="display:flex; gap:6px; align-items:flex-end; padding:4px 0; max-width:240px;">${timeBars}</div>
      <div class="ras-insight">${escapeHtml(timeInsight)}</div>
    </div>
    ${(starredArrs.length > 0 || topRevisited.length > 0) ? `<div class="ras-section">
      <div class="ras-section-label">살아있는 통찰</div>
      ${starredArrs.length > 0 ? `<div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">★ 즐겨찾기 ${starredArrs.length}개</div>` : ''}
      ${topRevisited.length > 0 ? `<div style="display:flex; flex-direction:column; gap:4px;">${topRevisited.map(a => `<div style="font-size:12px; padding:4px 0;"><span style="color:var(--accent);">↻ ${a.revisitCount}번</span> ${escapeHtml(a.headline || (a.body || '').slice(0,40))}</div>`).join('')}</div>` : ''}
    </div>` : ''}
    ${clusters.length > 0 ? `<div class="ras-section">
      <div class="ras-section-label">테마별 갈래 — 한 화두가 어떻게 자랐나</div>
      ${clusters.map(c => `<div class="ras-cluster"><div class="ras-cluster-tag">#${escapeHtml(c.tag)} (${c.count})</div><div class="ras-cluster-path">${c.items.slice(0, 4).map((a, i) => `<div class="ras-cluster-step"><span class="ras-cluster-num">${i + 1}</span><span class="ras-cluster-text">${escapeHtml(a.headline || (a.body || '').slice(0, 30))}</span></div>`).join('')}</div></div>`).join('')}
    </div>` : ''}
    ${heads.length > 0 ? `<div class="ras-section">
      <div class="ras-section-label">전체 헤드라인</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${heads.map(h => `<div style="font-size:12px; line-height:1.55; padding:5px 0; border-top:1px dashed var(--border);">${h.starred ? '<span style="color:#ffd93d;">★</span> ' : ''}<span style="color:var(--accent);">✦</span> ${escapeHtml(h.headline)}${h.body ? `<div style="font-size:10.5px; color:var(--text-dim); margin-top:2px; padding-left:14px;">${escapeHtml((h.body || '').slice(0, 70))}</div>` : ''}</div>`).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

// V4-fix v3 (5번): AI 메타 요약 — 깨달음들 한 단락 narrative
async function generateReviewArchiveMetaSummary(reviewId) {
  if (!_canAI()) {
    showToast('⚠️ API 키 필요');
    return;
  }
  const review = (state.weeklyReviews || []).concat(state.monthlyReviews || []).concat(state.quarterlyReviews || []).find(r => r.id === reviewId);
  if (!review) { showToast('리뷰 못 찾음'); return; }
  showToast('🤖 AI 통찰 요약 진행 중...');
  let startMs = null, endMs = null;
  if (review.quarterKey && typeof getQuarterRange === 'function') {
    const range = getQuarterRange(review.quarterKey);
    if (range) { startMs = new Date(range.start).getTime(); endMs = new Date(range.end).getTime(); }
  } else if (review.monthKey) {
    const mm = String(review.monthKey).match(/^(\d{4})-(\d{2})$/);
    if (mm) { const y = parseInt(mm[1]); const mo = parseInt(mm[2]) - 1; startMs = new Date(y, mo, 1).getTime(); endMs = new Date(y, mo + 1, 0, 23, 59, 59).getTime(); }
  } else { const compMs = new Date(review.completedAt).getTime(); startMs = compMs - 7 * 86400000; endMs = compMs; }
  const arrs = (state.archive || []).filter(a => { if (!a.savedAt) return false; const t = new Date(a.savedAt).getTime(); return t >= startMs && t <= endMs; });
  if (arrs.length === 0) { showToast('이 기간 깨달음 X'); return; }
  const archiveText = arrs.map(a => `[${a.type}] ${a.headline || ''}: ${a.body || a.userMemo || ''}`).join('\n');
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({
        _endpoint: 'review_insight',
        model: 'claude-haiku-4-5', max_tokens: 250,
        messages: [{ role: 'user', content: `이 기간 사용자 깨달음 ${arrs.length}개. 핵심 통찰 한 단락 (3-4문장)으로 요약. 친구 톤, 외재화 ("X 패턴이 작동" / "너 X적이야" X), 따뜻하게.\n\n${archiveText.slice(0, 3500)}\n\n[출력 — 한 단락만, 마크다운/인용부호 X]` }]
      })
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text?.trim() || '';
    if (text) {
      review.archiveMetaSummary = text.slice(0, 400);
      saveState();
      if (typeof renderArchiveReviews === 'function') renderArchiveReviews();
      showToast('✓ 핵심 통찰 요약됨');
    } else { showToast('AI 응답 비어있음'); }
  } catch (e) { showToast('실패: ' + (e.message || '')); }
}

// 사용자 요청 2026-04-28: 도서관 마법의 소라고동 = 홈의 마법고동 같은 방. archive 별도 화면 X, decisions 화면으로 통일
function showArchiveDecisions() {
  showScreen('decisions');
  if (typeof renderDecisionsList === 'function') renderDecisionsList();
}

// renderArchiveDecisions 함수 삭제 (사용자 요청 2026-04-28) — showArchiveDecisions가 'decisions' 화면으로 통일된 후 dead code

// Update count badges on archive quick buttons
function updateArchiveQuickCounts() {
  const reviewCount = (state.weeklyReviews || []).length + (state.monthlyReviews || []).length + (state.quarterlyReviews || []).length;
  const decisionCount = (state.decisions || []).length;
  const reviewEl = document.getElementById('aqReviewCount');
  const decisionEl = document.getElementById('aqDecisionCount');
  if (reviewEl) reviewEl.textContent = reviewCount > 0 ? `${reviewCount}건` : '';
  if (decisionEl) decisionEl.textContent = decisionCount > 0 ? `${decisionCount}건` : '';
}

// === LENS 3: PEARLS — 진주 바구니 ===
// V4-1r: 🔮 진주 그리드 = Pinterest 갤러리. 카테고리 칩 필터 + masonry-style.
let _pearlCatFilter = null;

function setPearlCatFilter(cat) {
  _pearlCatFilter = (_pearlCatFilter === cat) ? null : cat;
  renderLensPearls();
}

function renderLensPearls() {
  const container = document.getElementById('lensPearls');
  if (!container) return;

  let pearls = (state.pearls || [])
    .filter(p => p.type !== 'dna_pearl')  // DNA 진주는 모래사장 — 도서관 진주 갤러리 X (V4 비전 7.2)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  // 사용자 보고 2026-04-29: 검색 미적용 버그 fix
  const _qPearls = _archiveSearchQuery;
  if (_qPearls) {
    pearls = pearls.filter(p => {
      const fields = [p.content, p.note, p.category];
      if (p.track) fields.push(p.track.title, p.track.artist);
      return fields.filter(Boolean).join(' ').toLowerCase().includes(_qPearls);
    });
  }
  const categories = state.preferences?.pearlBasketCategories || ['음악', '음식', '장소', '순간', '사람'];

  // V3.12.x: 진주 비언어적 인트로
  let html = `
    <div class="pearls-intro">
      <div class="pearls-intro-header">
        <span class="pearls-intro-emoji">💎</span>
        <div class="pearls-intro-text">살아있다 느낀 순간들</div>
      </div>
      <div class="pearls-intro-grid">
        <div class="pi-cat${_pearlCatFilter === '음악' ? ' active' : ''}" onclick="setPearlCatFilter('음악')" role="button" tabindex="0">🎵<span>음악</span></div>
        <div class="pi-cat${_pearlCatFilter === '음식' ? ' active' : ''}" onclick="setPearlCatFilter('음식')" role="button" tabindex="0">🍴<span>맛</span></div>
        <div class="pi-cat${_pearlCatFilter === '장소' ? ' active' : ''}" onclick="setPearlCatFilter('장소')" role="button" tabindex="0">📍<span>장소</span></div>
        <div class="pi-cat${_pearlCatFilter === '순간' ? ' active' : ''}" onclick="setPearlCatFilter('순간')" role="button" tabindex="0">✨<span>순간</span></div>
        <div class="pi-cat${_pearlCatFilter === '사람' ? ' active' : ''}" onclick="setPearlCatFilter('사람')" role="button" tabindex="0">👥<span>사람</span></div>
      </div>
    </div>
    <button class="pearls-add-btn" onclick="addPearl()">+ 진주 하나 더하기</button>
  `;

  // 사용자 요청 2026-04-29: 진주 grid 뷰의 별도 카테고리 칩 제거 — 위 '살아있다 느낀 순간들' 인트로의 pi-cat이 같은 역할
  if (_pearlCatFilter) {
    pearls = pearls.filter(p => (p.category || '기타') === _pearlCatFilter);
  }

  if (pearls.length === 0) {
    html += `<div class="pearls-empty">
      <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-top:8px;">
        "좋다" 떠올린 거 → 진주.<br>
        <span style="opacity:0.7;">대화에서 흘린 취향도 나중에 자동으로 ✦</span>
      </div>
    </div>`;
  } else if (_libView === 'grid') {
    // V4-fix v2 (사용자 보고): Pinterest masonry — 다양 사이즈 + 미세 회전 + 날짜 + 음악 placeholder
    html += `<div class="pearls-pinterest">`;
    pearls.forEach((p, idx) => {
      // deterministic seed per pearl
      const seed = (p.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), idx);
      // 미세 회전 (4 variant) — 진짜 흩뿌림 느낌
      const tiltVariants = ['', 'left', 'right', 'leftS', 'rightS', '', '', ''];
      const tiltAttr = tiltVariants[seed % tiltVariants.length];
      // 1/4 확률로 큰 타일 (강조)
      const isLarge = (seed % 7 === 0);
      const sizeClass = isLarge ? ' tile-large' : '';
      const tiltStr = tiltAttr ? ` data-tilt="${tiltAttr}"` : '';
      // 날짜
      const dateStr = p.createdAt
        ? new Date(p.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
        : '';
      if (p.category === '음악' && p.track) {
        // 사용자 보고 2026-04-29: artwork onerror replaceWith가 DOM 변경 → masonry layout 재계산 → 첫 카드 깜빡임.
        // onerror=null로 무한 retry 차단 + decoding/loading 힌트로 안정적 로드.
        const artHtml = p.track.artworkUrl
          ? `<img src="${escapeHtml(p.track.artworkUrl)}" alt="${escapeHtml(p.track.title || '')}" class="tile-music-art" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none';this.parentElement.classList.add('art-failed');">`
          : `<div class="tile-music-art music-card-art-placeholder">${_MUSIC_WAVE_SVG}</div>`;
        // 사용자 요청 2026-04-29: 진주에서 ▶ 미리듣기 + 🎵 음악 서비스 (사용자 명시 2026-05-02: 5 서비스 중 사용자 선택)
        const playBtnHtml = p.track.previewUrl
          ? `<button class="pearl-tile-play" onclick="event.stopPropagation(); toggleMusicPreview(this, '${escapeHtml(p.track.previewUrl)}')" aria-label="미리듣기">▶</button>`
          : '';
        const appleBtnHtml = (p.track.trackUrl || p.track.title)
          ? `<button class="pearl-tile-apple" onclick="event.stopPropagation(); _openMusicServiceByPearlId('${escapeHtml(p.id)}')" aria-label="음악 듣기">${_MUSIC_WAVE_SVG}</button>`
          : '';
        html += `
          <div class="pinterest-tile tile-music${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            <div class="tile-music-art-wrap">
              ${artHtml}
              ${playBtnHtml}
              ${appleBtnHtml}
            </div>
            <div class="tile-music-meta">
              <div class="tile-music-title">${escapeHtml(p.track.title || '')}</div>
              <div class="tile-music-artist">${escapeHtml(p.track.artist || '')}</div>
              ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 40))}</div>` : ''}
              ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
            </div>
          </div>
        `;
      } else if (p.video) {
        // V4 (사용자 명시): 동영상 진주 pinterest-tile — 썸네일만 (사진과 동일). 클릭 시 모달에서 재생.
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        const thumb = p.videoThumbnail;
        // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거)
        const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(p.content || '') : (p.content || '');
        const visual = thumb
          ? `<img src="${thumb}" alt="${escapeHtml(_vTitle)}" class="tile-photo-art">`
          : `<div class="tile-photo-art video-thumb-placeholder">📹</div>`;
        html += `
          <div class="pinterest-tile tile-photo${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            ${visual}
            <div class="tile-music-meta">
              <div class="tile-music-title">${escapeHtml(_vTitle)}</div>
              ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 40))}</div>` : ''}
              ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
            </div>
          </div>
        `;
      } else if (p.photo) {
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        html += `
          <div class="pinterest-tile tile-photo${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            <img src="${p.photo}" alt="${escapeHtml(p.content || '')}" class="tile-photo-art">
            <div class="tile-music-meta">
              <div class="tile-music-title">${icon} ${escapeHtml(p.content || '')}</div>
              ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 40))}</div>` : ''}
              ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 기타: '💎' };
        const icon = iconMap[p.category || '기타'] || '💎';
        html += `
          <div class="pinterest-tile tile-text${sizeClass}"${tiltStr} onclick="openPearl('${p.id}')">
            <div class="tile-icon">${icon}</div>
            <div class="tile-text-content">${escapeHtml(p.content || '')}</div>
            ${p.note ? `<div class="tile-note">${escapeHtml(p.note.slice(0, 50))}</div>` : ''}
            ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
          </div>
        `;
      }
    });
    html += `</div>`;
  } else {
    // timeline (시간순 평면 — 카테고리 그룹 X)
    html += `<div class="pearls-timeline">`;
    pearls.forEach(p => {
      if (p.category === '음악' && p.track) {
        html += `
          <div class="pearl-music-row pearl-card pearl-music-card" onclick="openPearl('${p.id}')">
            ${renderMusicCardHTML(p.track)}
            ${p.note ? `<div style="font-size:11px; color:var(--text-dim); margin-top:6px; padding:0 4px;">${escapeHtml(p.note)}</div>` : ''}
          </div>
        `;
      } else if (p.video) {
        // V4 (사용자 명시): 동영상 진주 timeline — 썸네일만 (사진 패턴). 클릭 시 모달에서 재생.
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        const thumb = p.videoThumbnail;
        // 사용자 명시 2026-05-04: 영상 진주 제목 = bare content (이모티콘 prefix 제거)
        const _vTitle = (typeof _stripLeadingEmoji === 'function') ? _stripLeadingEmoji(p.content || '') : (p.content || '');
        const visual = thumb
          ? `<img src="${thumb}" alt="" class="pearl-photo-thumb">`
          : `<div class="pearl-photo-thumb video-thumb-placeholder">📹</div>`;
        html += `
          <div class="pearl-card pearl-photo-card" onclick="openPearl('${p.id}')">
            ${visual}
            <div class="pearl-photo-meta">
              <div class="pearl-card-content">${escapeHtml(_vTitle)}</div>
              ${p.note ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        `;
      } else if (p.photo) {
        // V4-fix: 사진 진주 timeline (작은 thumbnail + 메타)
        const iconMap = { 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
        const icon = iconMap[p.category] || '💎';
        html += `
          <div class="pearl-card pearl-photo-card" onclick="openPearl('${p.id}')">
            <img src="${p.photo}" alt="" class="pearl-photo-thumb">
            <div class="pearl-photo-meta">
              <div class="pearl-card-content">${icon} ${escapeHtml(p.content || '')}</div>
              ${p.note ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">${escapeHtml(p.note)}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="pearl-card" onclick="openPearl('${p.id}')">
            <div class="pearl-card-content">${escapeHtml(p.content || '')}</div>
            ${p.note ? `<div style="font-size:10px; color:var(--text-dim); margin-top:6px;">${escapeHtml(p.note.slice(0,50))}</div>` : ''}
          </div>
        `;
      }
    });
    html += `</div>`;
  }

  container.innerHTML = html;
  if (typeof hydratePearlVideos === 'function') hydratePearlVideos();
}

