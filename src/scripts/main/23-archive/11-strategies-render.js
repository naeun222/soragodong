function renderLensStrategies() {
  const container = document.getElementById('lensStrategies');
  if (!container) return;
  
  // V4-fix (사용자 보고): 관찰 시드 카드 양생방 숨김 (detectDiagnoses는 그대로 작동)
  let strategies = (state.topicCards || []).filter(c => c.category === 'strategy' && !c._isDiagnosticSeed);

  // 검색 필터
  if (_archiveSearchQuery) {
    strategies = strategies.filter(s =>
      (s.title || '').toLowerCase().includes(_archiveSearchQuery) ||
      (s.summary || '').toLowerCase().includes(_archiveSearchQuery)
    );
  }
  
  strategies = strategies.slice().sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  // 사용자 요청 2026-04-29: 공용 _libView 사용 ('grid'=피드, 'timeline'=목록) — 자체 토글 제거
  const _ysView = _libView === 'timeline' ? 'list' : 'feed';
  let html = `
    <div class="strategy-section">
      <div class="strategy-section-header">
        <div class="topic-cards-title">🧬 전략 DNA</div>
        <button class="strategy-add-btn" onclick="addManualStrategy()">+ 같이 만들기</button>
      </div>
  `;

  if (strategies.length === 0) {
    // pearl_design_spec_2026-05-03 §4-1: 빈 자리 카피 + "어떻게 자라" CTA
    html += `
      <div class="ys-empty-card">
        <div class="ys-empty-icon">🌿</div>
        <div class="ys-empty-title">키움 - 아직 비어있어요.</div>
        <div class="ys-empty-body">여기는 전략들이 자라는 곳.</div>
        <button class="ys-empty-cta" onclick="showYangsaengGrowthDiagram()">어떻게 자라는지 궁금해</button>
      </div>
    `;
  } else {
    // 상태 그룹 — 피드/목록 둘 다 사용
    // 사용자 명시 2026-05-01 (agent audit P9): archived dead state 제거. 진입 UI X 라 dead.
    const _groups = { seedling_trying: [], working: [], mutated: [], embodied: [] };
    strategies.forEach(s => {
      const st = s.embodimentStatus || 'seedling';
      const hasMutated = Array.isArray(s.generations) && s.generations.some(g => g.status === 'mutated');
      if (st === 'embodied')        _groups.embodied.push(s);
      else if (st === 'working')    _groups.working.push(s);
      else if (hasMutated)          _groups.mutated.push(s);
      else                          _groups.seedling_trying.push(s);
    });

    if (_ysView === 'list') {
      // 사용자 요청 2026-04-29: 카테고리 = 큰 카드 펼침/접힘 (진주 음악 카드 스타일)
      // 데이터 없는 카테고리도 살림 ("아직 없어")
      const _catFilter = (typeof _yangsaengCatFilter !== 'undefined') ? _yangsaengCatFilter : null;
      const STATUS_CATS = [
        { key: 'seedling_trying', icon: '🌿', label: '양생',  count: _groups.seedling_trying.length, emptyMsg: '아직 시작·시도 중인 전략 없어' },
        { key: 'working',         icon: '🌳', label: '성장',  count: _groups.working.length,         emptyMsg: '아직 작동 누적된 전략 없어' },
        { key: 'mutated',         icon: '🪦', label: '진화',  count: _groups.mutated.length,         emptyMsg: '아직 돌연변이된 전략 없어' },
        { key: 'embodied',        icon: '🍃', label: '체화',  count: _groups.embodied.length,        emptyMsg: '아직 체화된 전략 없어' }
      ];
      html += `<div class="lib-cat-accordion">
        ${STATUS_CATS.map(c => {
          const expanded = _catFilter === c.key;
          const cards = _groups[c.key] || [];
          const bodyInner = cards.length === 0
            ? `<div class="lcaa-empty">${c.emptyMsg}</div>`
            : cards.map(s => _renderStrategyCardHtml(s)).join('');
          return `
            <div class="lib-cat-accordion-item${expanded ? ' expanded' : ''}">
              <div class="lib-cat-accordion-header" onclick="setYangsaengCatFilter('${c.key}')">
                <span class="lcaa-icon">${c.icon}</span>
                <span class="lcaa-label">${c.label}</span>
                <span class="lcaa-count${c.count === 0 ? ' empty' : ''}">${c.count}</span>
                <span class="lcaa-chevron">▾</span>
              </div>
              <div class="lib-cat-accordion-body">${bodyInner}</div>
            </div>
          `;
        }).join('')}
      </div>`;
    } else {
      // 피드: 상태별 그룹 (기존 grid 동작)
      // 사용자 명시 2026-05-01 (agent audit P9 sync): archived dead state 제거 — _groups·STATUS_CATS 와 동기.
      const _groupOrder = [
        { key: 'seedling_trying', label: '🌿 양생 — 시작·시도 중' },
        { key: 'working',         label: '🌳 성장 중 — 작동 누적' },
        { key: 'mutated',         label: '🪦 돌연변이 — 진화 중' },
        { key: 'embodied',        label: '🍃 체화 완료' }
      ];
      _groupOrder.forEach(({ key, label }) => {
        const cards = _groups[key];
        if (!cards.length) return;
        html += `<div class="yangsaeng-status-group">
          <div class="yangsaeng-status-header">${label} · ${cards.length}</div>`;
        cards.forEach(s => { html += _renderStrategyCardHtml(s); });
        html += `</div>`;
      });
    }
  }
  html += `</div>`;
  container.innerHTML = html;
}

// === pearl_design_spec_2026-05-03 §4: 양생방 "어떻게 자라" 다이어그램 모달 ===
// 빈 자리 CTA → 모달 + helix 진주 1회 init.
let _ygPearlInit = false;
let _ygPearlRafId = null;
let _ygEscDetach = null;
function showYangsaengGrowthDiagram() {
  const ov = document.getElementById('yangsaengGrowthOverlay');
  if (!ov) return;
  ov.classList.add('open');
  // 첫 진입 시 helix 한 번만 init
  if (!_ygPearlInit) {
    _ygPearlInit = true;
    _initYgPearl();
  }
  if (typeof _registerModalEsc === 'function') {
    _ygEscDetach = _registerModalEsc(ov, closeYangsaengGrowthDiagram);
  }
}
function closeYangsaengGrowthDiagram() {
  const ov = document.getElementById('yangsaengGrowthOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  if (typeof _ygEscDetach === 'function') { _ygEscDetach(); _ygEscDetach = null; }
}
function _initYgPearl() {
  // diagram_yangsaeng_v6 스크립트와 동일한 helix logic — evolved path (2 strand) 6 emoji
  const PEARL_CX = 110, PEARL_CY = 110;
  const HELIX_RADIUS = 32, HELIX_TOP = -52, HELIX_BOTTOM = 52;
  const SHELLS = ['✨','🌈','🦋','🪩','🎆','🦚'];
  const SPEED = 0.0011;
  const STRANDS = 2;
  const group = document.getElementById('yg-shells-group');
  if (!group) return;
  const ns = 'http://www.w3.org/2000/svg';
  const elements = SHELLS.map((emoji) => {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'yg-helix-shell-text');
    text.textContent = emoji;
    group.appendChild(text);
    return text;
  });
  const n = SHELLS.length;
  function update(timestamp) {
    const t = timestamp * SPEED;
    elements.forEach((el, i) => {
      let phase, yPos;
      if (STRANDS === 1) {
        const yT = (i + 0.5) / n;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        phase = t + yT * Math.PI * 2.5;
      } else {
        const half = Math.ceil(n / 2);
        const isStrand1 = i < half;
        const j = isStrand1 ? i : (i - half);
        const m = isStrand1 ? half : (n - half);
        const yT = (j + 0.5) / m;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        const strandPhase = isStrand1 ? 0 : Math.PI;
        phase = t + strandPhase + yT * Math.PI * 2.5;
      }
      const x = HELIX_RADIUS * Math.cos(phase);
      const z = Math.sin(phase);
      const screenX = PEARL_CX + x;
      const screenY = PEARL_CY + yPos;
      const depthScale = 0.85 + z * 0.22;
      const fontSize = 20 * depthScale;
      const tNorm = (z + 1) * 0.5;
      const depthOpacity = 0.7 + tNorm * 0.3;
      const glowAlpha = 0.5 + Math.max(0, z) * 0.4;
      const glowBlur = 3 + Math.max(0, z) * 2;
      el.setAttribute('x', screenX);
      el.setAttribute('y', screenY);
      el.setAttribute('font-size', fontSize);
      el.setAttribute('opacity', depthOpacity.toFixed(3));
      el.style.filter = `drop-shadow(0 0 ${glowBlur.toFixed(1)}px rgba(255,255,240,${glowAlpha.toFixed(2)}))`;
    });
    _ygPearlRafId = requestAnimationFrame(update);
  }
  _ygPearlRafId = requestAnimationFrame(update);
}

