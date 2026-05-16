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
  // 사용자 명시 2026-05-06 ultrathink: default 접힘 + 헤더 작은 + 아이콘 (Notion 패턴). 5/2 default open 결정 번복.
  // 사용자 명시 2026-05-06 (추가): + 추가 버튼 제거 — 추적 항목 추가는 체크인 화면 (.checkin-tracker-add) 만.
  let html = `<details class="project-section">
    <summary class="project-section-header">
      <span class="project-section-title">트래커${visible.length > 0 ? ` <span style="font-size:11px; color:var(--text-soft); font-weight:500; margin-left:4px;">(${visible.length})</span>` : ''}</span>
    </summary>
    <div class="project-section-body">`;
  if (visible.length === 0) {
    html += `<div style="font-size:12px; color:var(--text-dim); padding:10px 0 4px; line-height:1.7;">
      추적 중인 트래커 없어요.<br>
      체크인 화면 "📊 트래커"에서 추가하면 매일 기록 + 그래프.
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

