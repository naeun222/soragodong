// V4-1d-4: DNA 진주 결정화 의식.
// V4 비전 6.4 + 5.7 + 5.8: worked 5회 도달 시 confirm → 결정화 의식 모달 (1회) → DNA 진주 생성.
// 데이터 모델 (14.1): state.pearls에 type:'dna_pearl', strategyId, embodimentPath, shellsUsed.
async function promptCrystallize(card) {
  if (!card || card.embodimentStatus === 'embodied') return;
  // 한 카드 기준 한 번만 prompt (재기 가드)
  if (card._crystallizePromptShown) return;
  card._crystallizePromptShown = true;
  saveState();

  const path = determineEmbodimentPath(card);
  const totalAttempts = countTotalAttempts(card);
  const totalGens = (card.generations || []).length;
  const workedCount = countWorkedAttempts(card);

  const yes = await showConfirmModal({
    title: '🧬 DNA 진주로 결정화할까?',
    message: `"${card.title}" 가닥이 ${workedCount}번 작동했어.\n\n결정화하면 너의 일부 — 진주로 남아.\n한 번뿐인 의식이야.`,
    okLabel: '응 결정화',
    cancelLabel: '아직'
  });
  if (!yes) {
    // 사용자가 거절했으면 다음 worked attempt 시 다시 prompt 가능하도록 flag 해제
    card._crystallizePromptShown = false;
    saveState();
    return;
  }

  card.embodimentStatus = 'embodied';
  card.embodimentPath = path;
  card.crystallizedAt = new Date().toISOString();

  // 이 가닥이 받은 모든 shellId 누적
  const shellsUsed = [];
  (card.generations || []).forEach(g => {
    if (Array.isArray(g.shells)) shellsUsed.push(...g.shells);
  });

  const dnaPearl = {
    id: 'dpearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type: 'dna_pearl',
    content: card.title,
    category: 'DNA',
    strategyId: card.id,
    embodimentPath: path,
    shellsUsed,
    totalAttempts,
    totalGens,
    workedCount,
    createdAt: card.crystallizedAt
  };
  if (!Array.isArray(state.pearls)) state.pearls = [];
  state.pearls.push(dnaPearl);
  saveState();

  // V4 (v8 묶음 19-F): _lastCrystallizedCardTitle stash — Core 4 crystallize_complete step body 동적 주입용
  window._lastCrystallizedCardTitle = card.title;
  showCrystallizeRitualModal(card, dnaPearl);
}

function showCrystallizeRitualModal(card, dnaPearl) {
  const path = dnaPearl.embodimentPath;
  // 5.8 톤 (path별)
  // 사용자 요청 2026-04-28: 3종 라벨 통일 — 빠른 발견 / 성장의 길 / 진화한 길
  const ritualMessages = {
    'one-shot': {
      emoji: '🌱',
      label: '빠른 발견',
      msg: `한 차원에서 바로 통했어. 너 자신을 잘 알아서 빠르게 길 찾은 거야.\n\n이제 너의 일부 — 진주가 그 증거.\n\n너만의 진주.`
    },
    'quick-discovery': {
      emoji: '🌳',
      label: '성장의 길',
      msg: `${dnaPearl.totalAttempts}번 반복 시도로 한 차원에서 끝까지 성장했어.\n\n천천히 도달한 곳, 너만의 진주.`
    },
    'evolved': {
      emoji: '🧬',
      label: '진화한 길',
      msg: `${dnaPearl.totalAttempts}번 시도, ${Math.max(0, dnaPearl.totalGens - 1)}번 진화, 결국 너에게 맞는 모양 됨.\n\n여러 차원 거쳐 도착한 곳, 너만의 진주.`
    }
  };
  const m = ritualMessages[path] || ritualMessages['one-shot'];

  // 결정 다면체 외곽 색 (path별 — 사용자 요청 2026-04-28 색상 다양화)
  const outerColor = {
    'one-shot':        '#8fc88f',  // 빠른 발견 — 새싹 초록
    'quick-discovery': '#ffd93d',  // 성장의 길 — 황금
    'evolved':         'url(#crystallize-rainbow)'  // 진화한 길 — 무지개
  }[path] || '#ffd700';
  const safeOuter = (typeof outerColor === 'string' && outerColor.startsWith('#')) ? outerColor : '#ffd700';

  // V4-fix v2: 결정화 모달 — faceted gem (8 삼각 면 + 다층 glow + sparkle)
  // 8각형 꼭짓점
  const RV = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 360 - 90;
    const r = 88;
    RV.push({ x: 100 + r * Math.cos(a * Math.PI / 180), y: 100 + r * Math.sin(a * Math.PI / 180) });
  }
  // 8 삼각 facet
  const ritualFacets = RV.map((v, i) => {
    const next = RV[(i + 1) % 8];
    return {
      points: `100,100 ${v.x.toFixed(1)},${v.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`,
      gradId: `cryst-facet-${i}-${dnaPearl.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
    };
  });
  const polyRitual = RV.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
  // 사용자 요청 2026-04-28: 점 → 매핑된 소라 아이콘 (gens.shells 또는 shellsUsed)
  const shellList = (state.shellCollection || []);
  // 카드의 모든 generation에서 사용된 shell IDs 모으기 (DNA 적용된 소라들)
  let collectedShellIds = (dnaPearl.shellsUsed || []).slice();
  if (collectedShellIds.length === 0 && card && Array.isArray(card.generations)) {
    card.generations.forEach(g => {
      if (Array.isArray(g.shells)) collectedShellIds.push(...g.shells);
    });
    // attempts에서 shellId도 모음 (record로 적용된 거)
    card.generations.forEach(g => {
      (g.attempts || []).forEach(a => {
        if (a.shellId && !collectedShellIds.includes(a.shellId)) collectedShellIds.push(a.shellId);
      });
    });
  }
  // 시드/튜토리얼 데모 fallback 소라 emoji
  const demoShellEmojis = ['⭐','🌟','✨','💫','🌙','💎','🪐','🦄'];
  const tierColors = { legend: '#ffd93d', call: '#d4a76a', golden: '#e8c170', main: '#7ec8e3', daily: '#a89dc8', light: '#b39ddb' };
  // 8개 슬롯: 매핑된 shell이 있으면 그 emoji, 없으면 demo emoji
  const ritualShells = [];
  for (let i = 0; i < 8; i++) {
    const sid = collectedShellIds[i];
    const matched = sid ? shellList.find(x => x._id === sid) : null;
    if (matched) {
      ritualShells.push({ emoji: matched.type, color: tierColors[matched.tier] || '#a89dc8' });
    } else {
      ritualShells.push({ emoji: demoShellEmojis[i % demoShellEmojis.length], color: '#ffd93d' });
    }
  }
  const dotColors = ritualShells.map(s => s.color);
  // 외곽 헬릭스 — 소라 emoji 텍스트 (각 다른 위치 + pulse glow)
  const outerDotsRitual = ritualShells.map((s, i) => {
    const angle = (i / 8) * 360 - 90;
    const cx = 100 + 76 * Math.cos(angle * Math.PI / 180);
    const cy = 100 + 76 * Math.sin(angle * Math.PI / 180);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="${s.color}" opacity="0.20" filter="url(#cryst-bigglow)"/>
      <text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle" font-size="16" style="filter:drop-shadow(0 0 4px ${s.color});">${s.emoji}
      <animateTransform attributeName="transform" type="scale" values="1;1.2;1" dur="${2 + (i % 3) * 0.5}s" additive="sum" repeatCount="indefinite"/>
      </text>`;
  }).join('');
  // 안쪽 헬릭스 (역회전, 색 다양화)
  const innerColors = [dotColors[0], dotColors[2], dotColors[4], dotColors[6], dotColors[1], dotColors[3]];
  const innerDotsRitual = [0,1,2,3,4,5].map(n => {
    const a = (n / 6) * 360 + 30;
    const x = 100 + 32 * Math.cos(a * Math.PI / 180);
    const y = 100 + 32 * Math.sin(a * Math.PI / 180);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${innerColors[n] || safeOuter}" opacity="0.92"/>`;
  }).join('');
  // V4-fix v3 (사용자 보고): 진짜 DNA 헬릭스 — 결정 안에 이중 나선 (sine 반대) + 다채로운 사다리(rungs)
  const helixYStart = 32;
  const helixYEnd = 168;
  const helixHeight = helixYEnd - helixYStart;
  const helixSteps = 28;
  const helixWaves = 2.2;
  const helixAmp = 16;
  const helixPath1 = [];
  const helixPath2 = [];
  const helixRungs = [];
  for (let s = 0; s <= helixSteps; s++) {
    const t = s / helixSteps;
    const y = helixYStart + t * helixHeight;
    const phase = t * helixWaves * Math.PI * 2;
    const x1 = 100 + Math.sin(phase) * helixAmp;
    const x2 = 100 + Math.sin(phase + Math.PI) * helixAmp;
    helixPath1.push(`${s === 0 ? 'M' : 'L'}${x1.toFixed(1)},${y.toFixed(1)}`);
    helixPath2.push(`${s === 0 ? 'M' : 'L'}${x2.toFixed(1)},${y.toFixed(1)}`);
    if (s % 3 === 0 && s > 0 && s < helixSteps) {
      const rungColor = fallbackPalette[s % fallbackPalette.length];
      helixRungs.push(`<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${rungColor}" stroke-width="1.4" opacity="0.7" stroke-linecap="round"/>`);
    }
  }
  const helixHtml = `
    <g class="cryst-helix-flow" opacity="0.88">
      <path d="${helixPath1.join(' ')}" fill="none" stroke="${safeOuter}" stroke-width="1.6" stroke-opacity="0.85" stroke-linecap="round"/>
      <path d="${helixPath2.join(' ')}" fill="none" stroke="${fallbackPalette[2]}" stroke-width="1.6" stroke-opacity="0.85" stroke-linecap="round"/>
      ${helixRungs.join('')}
    </g>
  `;
  // sparkles ✦
  const sparklesRitual = [
    { x: 28, y: 48, d: 0 }, { x: 172, y: 56, d: 0.5 }, { x: 48, y: 162, d: 1.0 },
    { x: 168, y: 160, d: 1.6 }, { x: 100, y: 22, d: 2.2 }, { x: 18, y: 110, d: 0.3 },
    { x: 182, y: 110, d: 1.2 }, { x: 100, y: 178, d: 1.9 }
  ].map(s => `<text x="${s.x}" y="${s.y}" class="dna-sparkle" style="animation-delay:${s.d}s" text-anchor="middle" font-size="16">✦</text>`).join('');
  // facet gradients
  const facetGradDefsRitual = ritualFacets.map((f, i) => {
    const o1 = (0.6 - (i % 4) * 0.1).toFixed(2);
    const o2 = (0.18 - (i % 4) * 0.04).toFixed(2);
    return `<linearGradient id="${f.gradId}" x1="0%" y1="0%" x2="100%" y2="${100 + (i % 3) * 30}%">
      <stop offset="0%" stop-color="${safeOuter}" stop-opacity="${o1}"/>
      <stop offset="100%" stop-color="${safeOuter}" stop-opacity="${o2}"/>
    </linearGradient>`;
  }).join('');

  const html = `
    <div class="crystallize-ritual-overlay" id="crystallizeRitual">
      <div class="crystallize-ritual-modal">
        <div class="crystallize-emoji">${m.emoji}</div>
        <div class="crystallize-svg-wrap dna-pearl-stage">
          <svg viewBox="0 0 200 200" width="240" height="240" aria-hidden="true">
            <defs>
              <linearGradient id="crystallize-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stop-color="#ff6b6b"/>
                <stop offset="33%"  stop-color="#ffd93d"/>
                <stop offset="66%"  stop-color="#5fcfba"/>
                <stop offset="100%" stop-color="#8b7ec4"/>
              </linearGradient>
              <radialGradient id="cryst-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="${safeOuter}" stop-opacity="0.6"/>
                <stop offset="60%" stop-color="${safeOuter}" stop-opacity="0.18"/>
                <stop offset="100%" stop-color="${safeOuter}" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="cryst-halo" cx="50%" cy="50%" r="50%">
                <stop offset="60%" stop-color="${safeOuter}" stop-opacity="0"/>
                <stop offset="80%" stop-color="${safeOuter}" stop-opacity="0.32"/>
                <stop offset="100%" stop-color="${safeOuter}" stop-opacity="0"/>
              </radialGradient>
              <filter id="cryst-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="cryst-bigglow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="7" result="b"/>
                <feMerge><feMergeNode in="b"/></feMerge>
              </filter>
              ${facetGradDefsRitual}
            </defs>
            <!-- 외곽 halo -->
            <circle cx="100" cy="100" r="98" fill="url(#cryst-halo)"/>
            <!-- 외곽 회전 ring -->
            <g class="dna-pearl-ring">
              <circle cx="100" cy="100" r="92" fill="none" stroke="${safeOuter}" stroke-width="0.9" stroke-opacity="0.6" stroke-dasharray="3 6"/>
              <circle cx="100" cy="100" r="86" fill="none" stroke="${safeOuter}" stroke-width="0.5" stroke-opacity="0.4" stroke-dasharray="1 5"/>
            </g>
            <!-- 내부 core glow -->
            <circle cx="100" cy="100" r="80" fill="url(#cryst-core)"/>
            <!-- 결정 본체 — 8 facet (회전) -->
            <g class="dna-pearl-spin">
              ${ritualFacets.map(f => `<polygon points="${f.points}" fill="url(#${f.gradId})" stroke="${safeOuter}" stroke-width="0.5" stroke-opacity="0.5"/>`).join('')}
              <polygon points="${polyRitual}" fill="none" stroke="${outerColor}" stroke-width="2.5" filter="url(#cryst-glow)"/>
              <polygon points="${polyRitual}" fill="none" stroke="${safeOuter}" stroke-width="0.6" stroke-opacity="0.95"/>
              <polygon points="${RV.map(v => `${(100 + (v.x - 100) * 0.45).toFixed(1)},${(100 + (v.y - 100) * 0.45).toFixed(1)}`).join(' ')}"
                       fill="none" stroke="${safeOuter}" stroke-width="0.5" stroke-opacity="0.55"/>
            </g>
            <!-- V4-fix: 진짜 DNA 헬릭스 (이중 나선 + 다채로운 사다리) — 결정 안 가운데 -->
            ${helixHtml}
            <!-- 안쪽 헬릭스 (역회전) -->
            <g class="dna-pearl-inner-spin">${innerDotsRitual}</g>
            <!-- 외곽 헬릭스 점 (반시계 회전 — 사용자 요청) -->
            <g class="dna-pearl-outer-spin">${outerDotsRitual}</g>
            <!-- 중심 빛 -->
            <circle cx="100" cy="100" r="4.2" fill="${safeOuter}" opacity="1"/>
            <circle cx="100" cy="100" r="7" fill="${safeOuter}" opacity="0.42" filter="url(#cryst-bigglow)"/>
            <!-- sparkles -->
            <g fill="${safeOuter}" opacity="0.9">${sparklesRitual}</g>
          </svg>
        </div>
        <div class="crystallize-label">${m.label}</div>
        <div class="crystallize-title">${escapeHtml(card.title)}</div>
        <div class="crystallize-msg">${escapeHtml(m.msg)}</div>
        <button class="crystallize-accept-btn" onclick="closeCrystallizeRitual()">받아들여 ✦</button>
      </div>
    </div>
  `;

  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  document.body.appendChild(wrap.firstElementChild);
}

function closeCrystallizeRitual() {
  const el = document.getElementById('crystallizeRitual');
  if (el) el.remove();
  if (typeof renderShellBar === 'function') renderShellBar();
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof renderTodayMission === 'function') renderTodayMission();
  // V4 (v8 묶음 19-E): Core 4 첫 결정화 hook — crystallize_complete step 자동 진입 (한 번만)
  if (state.tutorialShown && !state.tutorialShown.core4 && typeof startCore4 === 'function') {
    setTimeout(() => startCore4(), 500);
  }
}

// V4 (v8 묶음 19-E): startCore4 — 첫 결정화 의식 직후 안내 (1 step)
function startCore4() {
  if (state.tutorialShown && state.tutorialShown.core4) return;
  const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'crystallize_complete') : -1;
  if (idx < 0) { console.warn('[startCore4] crystallize_complete step missing'); return; }
  _onbStep = idx;
  _onbTutorialMode = true;
  window._onbTutorialMode = true;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core4_pearl';
  if (typeof onbRenderStep === 'function') onbRenderStep();
}

