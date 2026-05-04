function openDnaPearlStory(pearlId) {
  const pearl = (state.pearls || []).find(p => p.id === pearlId && p.type === 'dna_pearl');
  if (!pearl) return;
  const card = getStrategyCard(pearl.strategyId);

  const dateStr = new Date(pearl.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // pearl_design_spec_2026-05-03 §3 + §9: v20 진주 SVG (3 path 분기 — gradient/sparkle/strands 차등)
  const path = pearl.embodimentPath || 'one-shot';
  const pathLabel = ({
    'one-shot':        '🌱 빠른 발견',
    'quick-discovery': '🌳 성장의 길',
    'evolved':         '🧬 진화한 길'
  })[path] || '✨ DNA 진주';

  // 진주 안 소라: pearl.shellsUsed 사용 — 비어있으면 즉석 pick (legacy 데이터 호환)
  let shells = (Array.isArray(pearl.shellsUsed) && pearl.shellsUsed.length > 0)
    ? pearl.shellsUsed.slice()
    : pickLegendaryShells(pearl.workedCount || 5);
  if (!Array.isArray(pearl.shellsUsed) || pearl.shellsUsed.length === 0) {
    pearl.shellsUsed = shells.slice();
    if (typeof saveState === 'function') saveState();
  }

  const strands = (path === 'evolved') ? 2 : 1;
  const speed = (path === 'evolved') ? 0.0011 : (path === 'quick-discovery' ? 0.0009 : 0.0006);
  const groupId = ({'one-shot': 'shells-os', 'quick-discovery': 'shells-q', 'evolved': 'shells-e'})[path] || 'shells-os';

  const overlay = document.createElement('div');
  overlay.className = 'shell-story-overlay';
  let _shellEscDetach = null;
  let _pearlRafId = null;
  const _close = () => {
    if (_pearlRafId) { cancelAnimationFrame(_pearlRafId); _pearlRafId = null; }
    if (_shellEscDetach) { _shellEscDetach(); _shellEscDetach = null; }
    overlay.remove();
  };
  overlay.onclick = (e) => { if (e.target === overlay) _close(); };
  overlay.innerHTML = `
    <div class="shell-story-card dna-pearl-story">
      <div class="dna-pearl-stage-v20">
        ${_buildDnaPearlSvgV20(path)}
        <div class="dpv20-sparkle-wrap">${_buildDnaPearlSparklesV20(path)}</div>
      </div>
      <div class="shell-story-tier">${pathLabel}</div>
      <div class="shell-story-date">${dateStr}</div>
      <div class="shell-story-text">${escapeHtml(pearl.content || '')}</div>
      <div style="font-size:11px; color:var(--text-soft); margin-top:8px;">
        ${pearl.totalAttempts || 0}번 시도 · ${pearl.workedCount || 0}번 작동${pearl.totalGens > 1 ? ` · ${pearl.totalGens}세대` : ''}
      </div>
      ${card ? `<div style="font-size:11px; color:var(--text-dim); margin-top:6px;">가닥: ${escapeHtml(card.title)}</div>` : ''}
      <button class="btn-secondary" id="dnaPearlCloseBtn" style="margin-top:18px;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const _btn = overlay.querySelector('#dnaPearlCloseBtn');
  if (_btn) _btn.addEventListener('click', _close);
  if (typeof _registerModalEsc === 'function') {
    _shellEscDetach = _registerModalEsc(overlay, _close);
  }
  // helix shell 시뮬 (path별 strands/speed 차등)
  _pearlRafId = _initDnaPearlHelixV20(overlay, groupId, shells, strands, speed);
}

// pearl_design_spec_2026-05-03 §3·§9: 모래사장 미니 진주 (v20 톤 — 정적, 44×44)
function _renderDnaPearlMiniV20(p) {
  const path = p.embodimentPath || 'one-shot';
  const pid = String(p.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const isEvolved = path === 'evolved';
  const isQuick   = path === 'quick-discovery';
  const haloColor   = isEvolved ? '#ffd0c0' : (isQuick ? '#ffd870' : '#a8d8a8');
  const sphereLight = isEvolved ? '#fff5e0' : (isQuick ? '#fff5d0' : '#dff5df');
  const sphereMid   = isEvolved ? '#f0d8b8' : (isQuick ? '#ffd870' : '#a8d8a8');
  const sphereDark  = isEvolved ? '#a89dc8' : (isQuick ? '#b8841a' : '#6aa86a');
  const iridLight   = isEvolved ? '#ffc0a8' : (isQuick ? '#fff5b8' : '#e8ffe8');
  const rimStroke   = isEvolved ? `url(#miniRainbow-${pid})` : (isQuick ? '#d4a020' : '#a8d8a8');
  const swirlDef = isEvolved ? `
    <linearGradient id="miniSwirl-${pid}" x1="20%" y1="15%" x2="80%" y2="85%">
      <stop offset="0%"   stop-color="#ffe5d4" stop-opacity="0.5"/>
      <stop offset="50%"  stop-color="#ffd870" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#9080c0" stop-opacity="0.35"/>
    </linearGradient>` : '';
  const rainbowDef = isEvolved ? `
    <linearGradient id="miniRainbow-${pid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#ff6b6b"/>
      <stop offset="33%"  stop-color="#ffd93d"/>
      <stop offset="66%"  stop-color="#5fcfba"/>
      <stop offset="100%" stop-color="#a89dc8"/>
    </linearGradient>` : '';
  const swirlHtml = isEvolved
    ? `<circle cx="22" cy="22" r="15" fill="url(#miniSwirl-${pid})"/>`
    : '';
  return `<div class="beach-shell beach-dna-shell" onclick="openDnaPearlStory('${p.id}')" title="${escapeHtml(p.content || '')}">
    <svg class="dna-mini-svg" viewBox="0 0 44 44" width="40" height="40" aria-hidden="true">
      <defs>
        <radialGradient id="miniHalo-${pid}" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stop-color="${haloColor}" stop-opacity="0"/>
          <stop offset="80%" stop-color="${haloColor}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${haloColor}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="miniSphere-${pid}" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="${sphereLight}" stop-opacity="0.7"/>
          <stop offset="50%"  stop-color="${sphereMid}"   stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${sphereDark}"  stop-opacity="0.1"/>
        </radialGradient>
        <radialGradient id="miniIrid-${pid}" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.42"/>
          <stop offset="60%"  stop-color="${iridLight}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${iridLight}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="miniHi-${pid}" cx="35%" cy="28%" r="35%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.92"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        ${swirlDef}
        ${rainbowDef}
      </defs>
      <circle cx="22" cy="22" r="22" fill="url(#miniHalo-${pid})"/>
      ${swirlHtml}
      <circle cx="22" cy="22" r="15" fill="url(#miniSphere-${pid})"/>
      <circle cx="22" cy="22" r="11" fill="url(#miniIrid-${pid})"/>
      <circle cx="22" cy="22" r="15" fill="none" stroke="${rimStroke}" stroke-width="0.65" stroke-opacity="0.6"/>
      <ellipse cx="18" cy="17" rx="4" ry="2.5" fill="url(#miniHi-${pid})"/>
    </svg>
  </div>`;
}

// pearl_design_spec_2026-05-03 §9-2: 🌱 one-shot SVG
