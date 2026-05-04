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

