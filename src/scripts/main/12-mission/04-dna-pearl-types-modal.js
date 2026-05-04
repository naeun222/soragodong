function showDnaPearlTypesModal() {
  const types = [
    {
      path: 'one-shot',
      emoji: '🌱',
      label: '빠른 발견',
      color: '#8fc88f',
      description: '한 가지에서 바로 통한 전략.\n시도 = 첫 번째에 통함. 너 자신을 잘 알아서 빠르게 찾았어.',
      shells: ['⭐', '🌟', '✨', '💫', '🌙']
    },
    {
      path: 'quick-discovery',
      emoji: '🌳',
      label: '성장의 길',
      color: '#ffd93d',
      description: '한 가지에서 반복 시도로 도달.\n같은 방향 끈질기게 — 7번 8번 시도해서 성장했어.',
      shells: ['⭐', '⭐', '🌟', '✨', '💫', '⭐', '🌟']
    },
    {
      path: 'evolved',
      emoji: '🧬',
      label: '진화한 길',
      color: 'gradient',
      description: '여러 가지 거쳐 진화로 도달.\n안 통한 가지 → 다른 가지 시도 → 결국 너에게 맞는 모양.',
      shells: ['⭐', '🌟', '🦄', '✨', '💎', '🌌']
    }
  ];
  _dnaPearlTypesIdx = 0;
  let overlay = document.getElementById('dnaPearlTypesOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'dnaPearlTypesOverlay';
  overlay.className = 'dna-pearl-types-overlay';
  overlay.innerHTML = `
    <div class="dna-pearl-types-modal" onclick="event.stopPropagation()">
      <button class="dna-pearl-types-close" onclick="closeDnaPearlTypesModal()">✕</button>
      <div class="dna-pearl-types-slide" id="dnaPearlTypesSlide"></div>
      <div class="dna-pearl-types-nav">
        <button class="dna-pearl-types-arrow" onclick="navDnaPearlTypes(-1)">‹</button>
        <div class="dna-pearl-types-dots" id="dnaPearlTypesDots"></div>
        <button class="dna-pearl-types-arrow" onclick="navDnaPearlTypes(1)">›</button>
      </div>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeDnaPearlTypesModal(); };
  document.body.appendChild(overlay);
  window._dnaPearlTypesData = types;
  _renderDnaPearlTypesSlide();
}
function _renderDnaPearlTypesSlide() {
  const types = window._dnaPearlTypesData || [];
  const t = types[_dnaPearlTypesIdx];
  if (!t) return;
  const slideEl = document.getElementById('dnaPearlTypesSlide');
  const dotsEl = document.getElementById('dnaPearlTypesDots');
  if (!slideEl || !dotsEl) return;
  // 미니 진주 SVG (간단 + path별 색)
  const colorFill = t.color === 'gradient' ? 'url(#dpt-rainbow)' : t.color;
  const shellsRing = t.shells.map((emoji, i) => {
    const angle = (i / t.shells.length) * 360 - 90;
    const cx = 100 + 70 * Math.cos(angle * Math.PI / 180);
    const cy = 100 + 70 * Math.sin(angle * Math.PI / 180);
    return `<text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle" font-size="18" style="filter:drop-shadow(0 0 3px gold);">${emoji}</text>`;
  }).join('');
  slideEl.innerHTML = `
    <svg viewBox="0 0 200 200" width="220" height="220" style="display:block; margin: 0 auto;">
      <defs>
        <radialGradient id="dpt-pearl-${t.path}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
          <stop offset="60%" stop-color="${t.color === 'gradient' ? '#ffd93d' : t.color}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${t.color === 'gradient' ? '#5fcfba' : t.color}" stop-opacity="0.4"/>
        </radialGradient>
        <linearGradient id="dpt-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff6b6b"/>
          <stop offset="33%" stop-color="#ffd93d"/>
          <stop offset="66%" stop-color="#5fcfba"/>
          <stop offset="100%" stop-color="#8b7ec4"/>
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="38" fill="url(#dpt-pearl-${t.path})" stroke="${t.color === 'gradient' ? '#ffd93d' : t.color}" stroke-width="2" opacity="0.9"/>
      <text x="100" y="115" text-anchor="middle" font-size="40">${t.emoji}</text>
      ${shellsRing}
    </svg>
    <div class="dna-pearl-types-label">${t.emoji} ${t.label}</div>
    <div class="dna-pearl-types-desc">${escapeHtml(t.description).replace(/\n/g, '<br>')}</div>
    <div class="dna-pearl-types-counter">${_dnaPearlTypesIdx + 1} / ${types.length}</div>
  `;
  dotsEl.innerHTML = types.map((_, i) =>
    `<span class="dpt-dot${i === _dnaPearlTypesIdx ? ' active' : ''}" onclick="_jumpDnaPearlTypes(${i})"></span>`
  ).join('');
}
function navDnaPearlTypes(delta) {
  const types = window._dnaPearlTypesData || [];
  _dnaPearlTypesIdx = (_dnaPearlTypesIdx + delta + types.length) % types.length;
  _renderDnaPearlTypesSlide();
}
function _jumpDnaPearlTypes(idx) {
  _dnaPearlTypesIdx = idx;
  _renderDnaPearlTypesSlide();
}
function closeDnaPearlTypesModal() {
  const overlay = document.getElementById('dnaPearlTypesOverlay');
  if (overlay) overlay.remove();
  window._dnaPearlTypesData = null;
}

// DNA 적용되는 효과 — 가닥에 worked 흔적 적용될 때 시각 피드백 (사용자 요청 2026-04-27, 전체 적용)
function playDnaInsertionEffect() {
  const main = document.createElement('div');
  main.className = 'dna-insert-fx';
  main.textContent = '🧬';
  document.body.appendChild(main);
  // 주변 입자 (소라 + 진주)
  const particles = ['🐚','✨','⭐','💫','🪐','🌟'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    p.className = 'dna-insert-particle';
    p.textContent = particles[i % particles.length];
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    const angle = (i / 8) * Math.PI * 2;
    const dist = 120 + Math.random() * 40;
    const ex = Math.cos(angle) * dist;
    const ey = Math.sin(angle) * dist;
    p.style.setProperty('--end-transform', `translate(${ex}px, ${ey}px)`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }
  setTimeout(() => main.remove(), 1700);
}

// 양생방 DNA 카드에서 결과 체크 버튼 → 같은 흐름 호출
// 사용자 명세 2026-04-28: 결과 체크 대상 = 미션 'completed' + attemptStatus 없음
// 사용자 보고 2026-04-28: 가끔 다른 전략 표시 — 가장 최근 completedAt mission 우선 (defensive)
