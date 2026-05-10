function renderLensTopicCards() {
  const container = document.getElementById('lensTopicCards');
  if (!container) return;
  
  const all = state.topicCards || [];
  // Strategy는 wisdom 렌즈에서 따로 표시. 여기선 strategy 제외.
  let cards = all.filter(c => c.category !== 'strategy');
  
  // 검색 필터
  if (_archiveSearchQuery) {
    cards = cards.filter(c => 
      (c.title || '').toLowerCase().includes(_archiveSearchQuery) ||
      (c.summary || '').toLowerCase().includes(_archiveSearchQuery)
    );
  }
  
  // 최신순
  cards = cards.slice().sort((a, b) => 
    new Date(b.chapterStartedAt || b.createdAt) - new Date(a.chapterStartedAt || a.createdAt)
  );
  
  if (cards.length === 0) {
    container.innerHTML = '';  // 빈 상태는 timeline empty가 처리
    return;
  }
  
  // 최대 15개만 (오래된 건 검색으로)
  const display = cards.slice(0, 15);
  
  let html = `
    <div class="topic-cards-section">
      <div class="topic-cards-header">
        <div class="topic-cards-title">🐚 대화에서 정리됨</div>
        <div class="topic-cards-count">${cards.length}개</div>
      </div>
  `;
  display.forEach(c => {
    const startedAt = c.chapterStartedAt || c.createdAt;
    const dateStr = new Date(startedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    // V3.13.x: 그 날 체크인 신호 칩 (4시 cutoff 적용)
    const dKey = startedAt ? getDayKey(startedAt) : null;
    const dEntry = dKey ? (state.entries || []).find(e => e.date === dKey) : null;
    let metaExtra = '';
    if (dEntry) {
      const bits = [];
      if (dEntry.vitality != null) bits.push(`⚡${dEntry.vitality}`);
      if (dEntry.mood != null) bits.push(`💭${dEntry.mood}`);
      if (dEntry.modes) {
        const ms = Object.keys(dEntry.modes).filter(k => dEntry.modes[k]);
        if (ms.length) bits.push(ms[0]);
      }
      if (bits.length) metaExtra = ` · ${bits.join(' ')}`;
    }
    // 사용자 보고 2026-05-01: 모음 list 에서 '✦ 토픽' 단일 라벨 → 카테고리별 (📔 일기 / 💭 고민 / 📋 할 일 등) 표시.
    const catInfo = TOPIC_CATEGORY_LABELS[c.category] || { label: '토픽', icon: '✦' };
    const catClass = c.category ? `cat-${c.category}` : '';
    html += `
      <div class="topic-card ${catClass}" onclick="openTopicCard('${c.id}')">
        <div class="topic-card-row1">
          <span class="topic-card-cat">${catInfo.icon} ${escapeHtml(catInfo.label)}</span>
          <span class="topic-card-title">${escapeHtml(c.title)}</span>
        </div>
        <div class="topic-card-summary">${escapeHtml(c.summary)}</div>
        <div class="topic-card-meta">${dateStr} · ${c.messageCount || 0}개 메시지${metaExtra}</div>
      </div>
    `;
  });
  if (cards.length > 15) {
    html += `<div style="font-size:11px; color:var(--text-soft); text-align:center; padding:8px;">+ ${cards.length - 15}개 더 (검색으로 찾기)</div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

function openTopicCard(id) {
  const card = (state.topicCards || []).find(c => c.id === id);
  if (!card) return;
  const catInfo = TOPIC_CATEGORY_LABELS[card.category] || { label: '기타', icon: '·' };
  const startedAtISO = card.chapterStartedAt || card.createdAt;
  const dateStr = new Date(startedAtISO).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  // V3.13.x: 그 날 체크인 정보 박스 (4시 cutoff 적용)
  let dayInfoHtml = '';
  const dayKey = startedAtISO ? getDayKey(startedAtISO) : null;
  const dayEntry = dayKey ? (state.entries || []).find(e => e.date === dayKey) : null;
  if (dayEntry) {
    const bits = [];
    if (dayEntry.modes) {
      const ms = Object.keys(dayEntry.modes).filter(k => dayEntry.modes[k]);
      if (ms.length) bits.push(`모드: ${ms.join(', ')}`);
    }
    if (dayEntry.vitality != null) bits.push(`활력 ${dayEntry.vitality}/5`);
    if (dayEntry.mood != null) bits.push(`기분 ${dayEntry.mood}/5`);
    if (dayEntry.sleepStart && dayEntry.sleepEnd) bits.push(`수면 ${dayEntry.sleepStart}~${dayEntry.sleepEnd}`);
    const hasAnything = bits.length || dayEntry.diary || dayEntry.aiSummary;
    if (hasAnything) {
      const diaryBlock = dayEntry.diary
        ? `<div style="margin-top:6px; padding-top:6px; border-top: 1px solid var(--border); white-space:pre-wrap; color:var(--text);">📔 ${escapeHtml(dayEntry.diary)}</div>`
        : (dayEntry.aiSummary ? `<div style="margin-top:6px; padding-top:6px; border-top: 1px solid var(--border); color:var(--text);">🤖 ${escapeHtml(dayEntry.aiSummary)}</div>` : '');
      dayInfoHtml = `<div style="margin-top:10px; padding:10px 12px; background:var(--surface2); border-radius:10px; font-size:12px; color:var(--text-dim); line-height:1.6;"><div style="font-size:10px; opacity:0.7; letter-spacing:0.5px; margin-bottom:4px;">📅 그 날 체크인</div>${bits.join(' · ') || '<span style="opacity:0.6;">체크인 정보 없음</span>'}${diaryBlock}</div>`;
    }
  }
  
  // 액션 버튼 — 카테고리에 따라
  const actions = [];
  if (card.category === 'decision') {
    actions.push(`<button class="topic-modal-btn primary" onclick="topicToDecision('${id}'); closeTopicModal()"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 마법의 소라고동으로</button>`);
  }
  if (card.category === 'task') {
    actions.push(`<button class="topic-modal-btn primary" onclick="topicToVault('${id}'); closeTopicModal()">📥 서랍장에</button>`);
  }
  if (card.category === 'memory' || card.category === 'idea') {
    actions.push(`<button class="topic-modal-btn primary" onclick="topicToPearl('${id}'); closeTopicModal()">💎 진주로 보관</button>`);
  }
  if (card.category !== 'strategy') {
    actions.push(`<button class="topic-modal-btn" onclick="topicToStrategy('${id}'); closeTopicModal()">🧬 전략 카드로</button>`);
  }
  actions.push(`<button class="topic-modal-btn danger" onclick="closeTopicModal(); deleteTopicCard('${id}')">🗑 삭제</button>`);
  
  const modal = document.createElement('div');
  modal.id = 'topicModal';
  modal.className = 'topic-modal-overlay';
  modal.innerHTML = `
    <div class="topic-modal" onclick="event.stopPropagation()">
      <div class="topic-modal-header">
        <span class="topic-card-cat" style="${getTopicCatStyle(card.category)}">${catInfo.icon} ${catInfo.label}</span>
        <button class="topic-modal-close" onclick="closeTopicModal()">×</button>
      </div>
      <div class="topic-modal-title">${escapeHtml(card.title)}</div>
      <div class="topic-modal-summary">${escapeHtml(card.summary)}</div>
      ${dayInfoHtml}
      <div class="topic-modal-meta">${dateStr} · ${card.messageCount || 0}개 메시지</div>
      <div class="topic-modal-actions">
        ${actions.join('')}
      </div>
    </div>
  `;
  modal.onclick = closeTopicModal;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 30);
}

function closeTopicModal() {
  const modal = document.getElementById('topicModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 200);
}

function getTopicCatStyle(category) {
  const colors = {
    decision: 'background: rgba(179,157,219,0.18); color: #c4afe5;',
    task: 'background: rgba(201,169,110,0.18); color: var(--accent2);',
    emotional: 'background: rgba(232,163,163,0.16); color: #f0c0c0;',
    memory: 'background: rgba(136,192,208,0.16); color: #a3d3df;',
    idea: 'background: rgba(255,209,102,0.18); color: #ffe199;',
    strategy: 'background: rgba(143,200,143,0.16); color: #a8d6a8;'
  };
  return colors[category] || '';
}

