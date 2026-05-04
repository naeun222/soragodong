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

