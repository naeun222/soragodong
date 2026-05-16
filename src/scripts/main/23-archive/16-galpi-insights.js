function renderLensGalpi() {
  const container = document.getElementById('libGalpi');
  if (!container) return;
  // 사용자 요청 2026-04-29: 공용 _libView 사용
  const view = _libView === 'timeline' ? 'list' : 'feed';
  // 사용자 보고 2026-04-29: 검색 적용 (목록 모드 inline 리스트에)
  const _qGalpi = _archiveSearchQuery;
  const matchesQ = (r, ...fields) => !_qGalpi || fields.filter(Boolean).join(' ').toLowerCase().includes(_qGalpi);
  let decisions = state.decisions || [];
  let weekly = (state.weeklyReviews || []).map(r => ({...r, _type: 'weekly'}));
  let monthly = (state.monthlyReviews || []).map(r => ({...r, _type: 'monthly'}));
  let quarterly = (state.quarterlyReviews || []).map(r => ({...r, _type: 'quarterly'}));
  if (_qGalpi) {
    decisions = decisions.filter(d => matchesQ(d, d.title, d.topic));
    weekly = weekly.filter(r => matchesQ(r, r.summary, r.weekKey));
    monthly = monthly.filter(r => matchesQ(r, r.summary, r.monthKey));
    quarterly = quarterly.filter(r => matchesQ(r, r.summary, r.quarterKey, ...(r.sections || []).map(s => s.body)));
  }
  const allReviews = [...weekly, ...monthly, ...quarterly].sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  // 사용자 요청 2026-04-29: 공용 toggle 사용 (자체 토글 X)
  const toggleHtml = '';

  let body = '';
  if (view === 'feed') {
    // 피드: 기존 archive-quick-row 두 버튼 (마법고동 / 리뷰 모음)
    // 사용자 명시 2026-05-09: 리뷰 모음 밑에 '🌊 숙고의 방' 카드 추가.
    // 사용자 보고 2026-05-09 ultrathink: 활성 0 일 때 '1건' 표시 버그 — 옛 resolved/paused 도 reflectionAll 에 카운트되던 거.
    // 결론 낸 옛 질문은 깨달음 archive 에 별도 surface — 숙고의 방 카드는 '지금 활성' 만 의미.
    const reflectionActive = (state.reflectionQuestions || []).filter(q => q.status === 'active').length;
    body = `
      <div class="archive-quick-row" style="grid-template-columns:1fr 1fr;">
        <button class="archive-quick-btn" onclick="showArchiveDecisions()">
          <span class="aq-icon"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"></span>
          <span class="aq-label">마법고동</span>
          <span class="aq-count">${decisions.length}건</span>
        </button>
        <button class="archive-quick-btn" onclick="showArchiveReviews()">
          <span class="aq-icon">🌙</span>
          <span class="aq-label">리뷰 모음</span>
          <span class="aq-count">${allReviews.length}건</span>
        </button>
      </div>
      <div class="archive-quick-row" style="grid-template-columns:1fr; margin-top:8px;">
        <button class="archive-quick-btn" onclick="_enterReflectionRoom()">
          <span class="aq-icon">🌊</span>
          <span class="aq-label">숙고의 방</span>
          <span class="aq-count">${reflectionActive > 0 ? reflectionActive + '개 안고 있어' : '풀어볼래'}</span>
        </button>
      </div>
      <div style="margin-top:14px; font-size:12px; color:var(--text-dim); text-align:center; line-height:1.6;">
        큰 결정은 <img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"> 마법고동에서 14일 숙성.<br>
        주간·월간 회고는 🌙 리뷰 모음에서 다시 보기.<br>
        풀고 싶은 질문은 🌊 숙고의 방.
      </div>
    `;
  } else {
    // 사용자 요청 2026-04-29: timeline = 큰 카드 펼침/접힘 accordion (5 카테고리, 데이터 없는 것도 살림)
    const cf = _galpiCatFilter;
    const annual = (state.annualStories || []).map(r => ({...r, _type: 'annual'})); // V4 비전 7.10 (있을 시)
    const annualCount = annual.length;

    const _decisionCard = (d) => `
      <div onclick="openDecision('${d.id}')" style="cursor:pointer; background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:11px 13px; margin-bottom:7px;">
        <div style="font-size:14px; color:white; margin-bottom:4px;">${escapeHtml(d.title || d.topic || '')}</div>
        <div style="font-size:11px; color:var(--text-soft);">${d.status === 'active' ? '숙성 중' : d.status === 'decided' ? '✓ 결정됨' : '중단됨'} · ${new Date(d.startedAt || d.createdAt || 0).toLocaleDateString('ko-KR')}</div>
      </div>`;
    const _reviewCard = (r, type) => {
      const dt = new Date(r.completedAt || 0).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
      const seasonLabel = type === 'quarterly' && r.quarterKey && typeof seasonLabelOf === 'function'
        ? seasonLabelOf(r.quarterKey, { withEmoji: true }) : '';
      const periodLabel = seasonLabel || r.weekKey || r.monthKey || r.yearKey || '';
      const onclickAttr = (type === 'quarterly' || type === 'annual')
        ? `onclick="openQuarterlyStories('${r.id}')"` : '';
      return `
        <div ${onclickAttr} style="${(type === 'quarterly' || type === 'annual') ? 'cursor:pointer;' : ''} background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:11px 13px; margin-bottom:7px;">
          <div style="font-size:13px; color:white; margin-bottom:4px;">${escapeHtml(periodLabel)} 리뷰</div>
          <div style="font-size:12px; color:var(--text-soft); margin-bottom:6px; line-height:1.55;">${escapeHtml((r.summary || '').slice(0, 100))}</div>
          <div style="font-size:10px; color:var(--text-dim);">${dt}${(type === 'quarterly' || type === 'annual') ? ' · ▶ Stories로 보기' : ''}</div>
        </div>`;
    };

    const CATS = [
      { key: 'decision',  icon: '🐚', label: '마법고동', items: decisions, count: decisions.length, emptyMsg: '아직 시작한 결정 없어. 큰 결정 있을 때 14일 숙성에 넣어.' },
      { key: 'weekly',    icon: '🌙', label: '주간 리뷰',       items: weekly,    count: weekly.length,    emptyMsg: '아직 주간 리뷰 없어. 일주일 데이터 쌓이면 자동 생성.' },
      { key: 'monthly',   icon: '📅', label: '월간 리뷰',       items: monthly,   count: monthly.length,   emptyMsg: '아직 월간 리뷰 없어. 한 달 데이터 쌓이면 자동.' },
      { key: 'quarterly', icon: '🌸', label: '계절 리뷰',       items: quarterly, count: quarterly.length, emptyMsg: '아직 계절 리뷰 없어. 분기 끝날 때 자동.' },
      { key: 'annual',    icon: '🌟', label: '연간 리뷰',       items: annual,    count: annualCount,      emptyMsg: '아직 연간 리뷰 없어. 한 해 마무리하면 Stories로.' }
    ];
    body = `<div class="lib-cat-accordion">
      ${CATS.map(c => {
        const expanded = cf === c.key;
        let inner;
        if (c.count === 0) {
          inner = `<div class="lcaa-empty">${c.emptyMsg}</div>`;
        } else if (c.key === 'decision') {
          inner = c.items.map(_decisionCard).join('');
        } else {
          inner = c.items.map(it => _reviewCard(it, c.key)).join('');
        }
        return `
          <div class="lib-cat-accordion-item${expanded ? ' expanded' : ''}">
            <div class="lib-cat-accordion-header" onclick="setGalpiCatFilter('${c.key}')">
              <span class="lcaa-icon">${c.icon}</span>
              <span class="lcaa-label">${c.label}</span>
              <span class="lcaa-count${c.count === 0 ? ' empty' : ''}">${c.count}</span>
              <span class="lcaa-chevron">▾</span>
            </div>
            <div class="lib-cat-accordion-body">${inner}</div>
          </div>`;
      }).join('')}
    </div>`;
  }

  container.innerHTML = toggleHtml + body;
}

function renderLensInsights() {
  const container = document.getElementById('lensInsights');
  if (!container) return;

  // 사용자 보고 2026-04-29: 검색 미적용 버그 fix
  const q = _archiveSearchQuery;
  let insights = (state.insights || []).filter(i => !i.dismissed)
    .sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
  if (q) {
    insights = insights.filter(i =>
      [i.content, i.evidence, i.type].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }
  // 사용자 요청 2026-04-29: timeline 모드에선 AI 인사이트는 위 accordion이 처리 — 여기선 빈 상태
  if (_libView === 'timeline') {
    container.innerHTML = '';
    return;
  }
  // 깨달음 목록 모드에서 type이 ai 아니면 AI 인사이트 섹션 숨김 (legacy)
  if (_insightsView === 'list' && _insightsCatFilter && _insightsCatFilter !== 'ai') {
    container.innerHTML = '';
    return;
  }
  
  // 사용자 요청 2026-04-30: '🔮 새 인사이트 찾기' 버튼 제거 — 일주일 자동 forceAnalyze에 통합.
  // discoverInsights 함수 자체는 dead code로 남김 (개발자 도구 등에서 수동 호출 가능).
  let html = '';
  
  if (insights.length === 0) {
    html += `<div class="insights-empty">
      <div class="icon">🔮</div>
      <div style="font-size:14px; color:var(--text); margin-bottom:8px;">아직 모이는 중 ✦</div>
      체크인이 7일쯤 쌓이면<br>자동으로 인사이트 찾아줄게.
    </div>`;
  } else {
    html += insights.map(insight => {
      // V4-fix v3 (사용자 요청): 친절한 type 라벨
      const typeLabel = insight.type === 'causal'
        ? '🔗 어떤 X 다음 Y가 따라와'
        : '🔄 자주 보이는 패턴';
      const confPct = Math.round((insight.confidence || 0.5) * 100);
      const isConfirmed = insight.user_verified === true;
      return `
        <div class="insight-card${isConfirmed ? ' confirmed' : ''}" data-id="${insight.id}">
          <div class="insight-card-header">
            <span class="insight-card-type">${typeLabel}</span>
            <span class="insight-card-conf">
              <span class="insight-card-conf-bar"><span class="insight-card-conf-bar-fill" style="width:${confPct}%;"></span></span>
              ${confPct}%
            </span>
          </div>
          <div class="insight-card-text">${escapeHtml(insight.content)}</div>
          ${insight.evidence ? `<div class="insight-card-evidence"><span class="insight-card-evidence-label">📊 근거</span>${escapeHtml(insight.evidence)}</div>` : ''}
          ${isConfirmed
            ? `<div style="font-size:11px; color:#8fc88f; padding:4px 0;">✓ 확인됨 — 네 안의 살아있는 패턴</div>`
            : `<div class="insight-card-actions">
                <button class="insight-card-btn confirm" onclick="confirmInsight('${insight.id}')">맞아 ✓</button>
                <button class="insight-card-btn reject" onclick="dismissInsight('${insight.id}')">아니야</button>
              </div>`
          }
        </div>
      `;
    }).join('');
  }
  
  container.innerHTML = html;
}

// 사용자 요청 2026-04-30: discoverInsights 함수 제거 — 일주일 자동 forceAnalyze에 통합. dead code 정리.

function confirmInsight(id) {
  const ins = state.insights.find(i => i.id === id);
  if (!ins) return;
  ins.confirmed = true;
  ins.user_verified = true;  // V4-fix v3: insight 카드에서 ✓ 시각 분기 위해
  ins.confidence = Math.min(1.0, (ins.confidence || 0.5) + 0.2);
  saveState();
  renderLensInsights();
  showToast('확인됨 ✓');
}

function dismissInsight(id) {
  const ins = state.insights.find(i => i.id === id);
  if (!ins) return;
  ins.dismissed = true;
  saveState();
  renderLensInsights();
}

// === ARCHIVE-REVIEWS / ARCHIVE-DECISIONS ===

