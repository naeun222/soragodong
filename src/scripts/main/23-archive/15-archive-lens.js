function renderLensArchive() {
  const container = document.getElementById('lensArchive');
  if (!container) return;
  // V4 사용자 명시 2026-05-04: chatArchive cascade 로 _deleted 박힌 항목 도서관 비공개 (휴지통은 별도 화면).
  const items = (state.archive || []).filter(a => !a._deleted);
  const q = _archiveSearchQuery;
  let filtered = q
    ? items.filter(a => [a.headline, a.body, a.insight, a.userMemo, a.date, a.source, ...(a.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(q))
    : items;
  // V4-1q: 태그 칩 필터 (grid 모드)
  if (_libView === 'grid' && _archiveTagFilter) {
    filtered = filtered.filter(a => Array.isArray(a.tags) && a.tags.includes(_archiveTagFilter));
  }
  // 사용자 요청 2026-04-29: 공용 _libView 사용 (자체 토글 제거)
  const insightView = _libView === 'timeline' ? 'list' : 'feed';
  const insightCat = _insightsCatFilter;
  if (insightView === 'list' && insightCat && insightCat !== 'ai') {
    filtered = filtered.filter(a => (a.type || 'scrap') === insightCat);
  } else if (insightView === 'list' && insightCat === 'ai') {
    filtered = [];  // AI 인사이트만 보고싶을 때 archive는 숨김
  }

  let html = '<div class="archive-section-wrap">';
  // 사용자 명시 2026-05-01 ultrathink: 5 카테고리 (스크랩/숙고/마법/메모/AI 인사이트)
  if (insightView === 'list') {
    const counts = { scrap: 0, memo: 0, reflection: 0, magic: 0 };
    items.forEach(a => { counts[a.type || 'scrap'] = (counts[a.type || 'scrap'] || 0) + 1; });
    const aiInsights = (state.insights || []).filter(i => !i._deleted && !i.dismissed)
      .sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
    const aiCount = aiInsights.length;

    // 깨달음 카드 렌더 헬퍼 (인라인 — 큰 카드 풍 안 쓰고 간단히)
    // V4 사용자 명시 2026-05-04: realIdx 는 원본 state.archive 인덱스 (deleteArchiveItem/openArchiveItem 가 state.archive[idx] 으로 접근하므로).
    const _archiveCardHtml = (a) => {
      const realIdx = (state.archive || []).indexOf(a);
      const t = a.type || 'scrap';
      const headline = (t !== 'memo' && a.headline)
        ? `<div class="archive-item-headline">${escapeHtml(a.headline)}</div>` : '';
      const bodyText = t === 'memo'
        ? (a.userMemo || a.body || a.insight || '')
        : (a.body || (a.headline ? '' : (a.insight || '')));
      const body = bodyText ? `<div class="archive-item-body">${escapeHtml(bodyText)}</div>` : '';
      const tagsHtml = (Array.isArray(a.tags) && a.tags.length)
        ? `<div class="archive-item-tags">${a.tags.map(tg => `<span class="archive-tag">#${escapeHtml(tg)}</span>`).join('')}</div>` : '';
      const dateStr = a.date || '';
      const sourceStr = a.source ? ` · ${escapeHtml(a.source)}` : '';
      return `
        <div class="archive-item-card archive-type-${t}" onclick="openArchiveItem(${realIdx})">
          <div class="archive-item-meta">${escapeHtml(dateStr)}${sourceStr}</div>
          ${headline}${body}${tagsHtml}
        </div>`;
    };
    // AI 인사이트 카드 렌더 헬퍼
    const _aiCardHtml = (i) => {
      const typeLabel = i.type === 'causal' ? '🔗 어떤 X 다음 Y' : '🔄 자주 보이는 패턴';
      const confPct = Math.round((i.confidence || 0.5) * 100);
      const isConfirmed = i.user_verified === true;
      return `
        <div class="insight-card${isConfirmed ? ' confirmed' : ''}" data-id="${i.id}" style="margin-bottom:8px;">
          <div class="insight-card-header">
            <span class="insight-card-type">${typeLabel}</span>
            <span class="insight-card-conf"><span class="insight-card-conf-bar"><span class="insight-card-conf-bar-fill" style="width:${confPct}%;"></span></span>${confPct}%</span>
          </div>
          <div class="insight-card-text">${escapeHtml(i.content)}</div>
          ${i.evidence ? `<div class="insight-card-evidence"><span class="insight-card-evidence-label">📊 근거</span>${escapeHtml(i.evidence)}</div>` : ''}
        </div>`;
    };

    const CATS = [
      { key: 'scrap',      icon: '📌', label: '스크랩',         items: items.filter(a => (a.type || 'scrap') === 'scrap'), emptyMsg: '아직 스크랩한 깨달음 없어. 대화에서 ✦ 깨달음으로 눌러서 모아.' },
      // V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 돌연변이 깨달음 6번째 sub-category
      { key: 'mutation',   icon: '🧬', label: '돌연변이',       items: items.filter(a => a.type === 'mutation'),           emptyMsg: '아직 돌연변이 깨달음 없어. 돌연변이 대화 끝에 ✓ 누르면 여기로.' },
      { key: 'reflection', icon: '🌊', label: '숙고',           items: items.filter(a => a.type === 'reflection'),         emptyMsg: '아직 숙고 결론 없어. 🌊 숙고 질문에서 결론 적용하면 여기로.' },
      { key: 'magic',      icon: '🌀', label: '마법',           items: items.filter(a => a.type === 'magic'),              emptyMsg: '아직 마법 깨달음 없어. 마법고동 step ✦ / Future Self / 마법 대화 끝내기 시 자리잡아.' },
      { key: 'memo',       icon: '✎',  label: '메모',           items: items.filter(a => a.type === 'memo'),               emptyMsg: '아직 메모 없어. 대화 + 메뉴 → ✎ 메모로 직접 적기.' },
      { key: 'ai',         icon: '🔮', label: '인사이트',       items: aiInsights,                                          emptyMsg: '아직 인사이트 없어. 체크인 7일 이상 쌓이면 자동 발견 가능.' }
    ];
    html += `<div class="lib-cat-accordion">
      ${CATS.map(c => {
        const expanded = insightCat === c.key;
        const count = c.key === 'ai' ? aiCount : (counts[c.key] || 0);
        const bodyInner = count === 0
          ? `<div class="lcaa-empty">${c.emptyMsg}</div>`
          : (c.key === 'ai' ? c.items.map(_aiCardHtml).join('') : c.items.map(_archiveCardHtml).join(''));
        // 사용자 명시 2026-05-01 (agent audit): '🔮 새 인사이트 찾기' button 폐기 — 일주일 자동 forceAnalyze 에 통합 (이미 28650 주석에 명시). UI 잔재 제거.
        const extraBtn = '';
        return `
          <div class="lib-cat-accordion-item${expanded ? ' expanded' : ''}">
            <div class="lib-cat-accordion-header" onclick="setInsightsCatFilter('${c.key}')">
              <span class="lcaa-icon">${c.icon}</span>
              <span class="lcaa-label">${c.label}</span>
              <span class="lcaa-count${count === 0 ? ' empty' : ''}">${count}</span>
              <span class="lcaa-chevron">▾</span>
            </div>
            <div class="lib-cat-accordion-body">${extraBtn}${bodyInner}</div>
          </div>`;
      }).join('')}
    </div></div>`;
    container.innerHTML = html;
    return;  // accordion이 모든 데이터 처리 — 아래 grid 렌더 skip
  }
  html += `<div class="archive-section-label">✦ 저장한 깨달음${items.length ? ` <span class="al-count">${items.length}</span>` : ''}</div>`;

  // V4-1q: grid 뷰에서 자주 쓰는 태그 5-10개 칩
  if (_libView === 'grid') {
    const tagCount = {};
    items.forEach(a => {
      if (Array.isArray(a.tags)) {
        a.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
      }
    });
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (topTags.length > 0) {
      html += `<div class="archive-tag-chips">
        ${_archiveTagFilter ? `<button class="archive-tag-chip clear" onclick="setArchiveTagFilter(null)">✕ 필터 해제</button>` : ''}
        ${topTags.map(([t, c]) => `<button class="archive-tag-chip${_archiveTagFilter === t ? ' active' : ''}" onclick="setArchiveTagFilter('${escapeHtml(t).replace(/'/g, "\\'")}')">#${escapeHtml(t)} <span class="tag-chip-count">${c}</span></button>`).join('')}
      </div>`;
    }
  }

  if (filtered.length === 0) {
    if (q) {
      html += `<div class="archive-empty"><div style="font-size:13px;">"${escapeHtml(q)}" 검색 결과 없음.</div></div>`;
    } else {
      html += `<div class="archive-empty">
        <div class="icon">✦</div>
        <div style="font-size:14px; color:var(--text); margin-bottom:8px;">아직은 저장된 깨달음이 없어요</div>
        대화 응답 아래 <b>"✦ 깨달음으로"</b> 또는 + 메뉴의 <b>✎ 메모</b>로 모을 수 있습니다.
      </div>`;
    }
  } else {
    // V4-1h: type별 배지 + tags 표시
    const typeBadge = {
      'memo':       '<span class="archive-type-badge t-memo" title="메모">✎</span>',
      'reflection': '<span class="archive-type-badge t-reflect" title="숙고 결론">🌊</span>',
      'scrap':      '<span class="archive-type-badge t-scrap" title="대화 깨달음">📌</span>'
    };
    html += filtered.map(a => {
      // V4 사용자 명시 2026-05-04: realIdx 는 원본 state.archive 인덱스.
      const realIdx = (state.archive || []).indexOf(a);
      const t = a.type || 'scrap';
      const badge = typeBadge[t] || typeBadge['scrap'];
      // memo는 userMemo가 본문, headline X
      const headline = (t !== 'memo' && a.headline)
        ? `<div class="archive-item-headline">${escapeHtml(a.headline)}</div>`
        : '';
      const bodyText = t === 'memo'
        ? (a.userMemo || a.body || a.insight || '')
        : (a.body || (a.headline ? '' : (a.insight || '')));
      const body = bodyText ? `<div class="archive-item-body">${escapeHtml(bodyText)}</div>` : '';
      const tagsHtml = (Array.isArray(a.tags) && a.tags.length)
        ? `<div class="archive-item-tags">${a.tags.map(tg => `<span class="archive-tag">#${escapeHtml(tg)}</span>`).join('')}</div>`
        : '';
      const dateStr = a.date || '';
      const sourceStr = a.source ? ` · ${escapeHtml(a.source)}` : '';
      return `
        <div class="archive-item-card archive-type-${t}" onclick="openArchiveItem(${realIdx})">
          <div class="archive-item-meta">${badge} ${escapeHtml(dateStr)}${sourceStr}</div>
          ${headline}
          ${body}
          ${tagsHtml}
          <button class="archive-item-delete" onclick="event.stopPropagation(); deleteArchiveItem(${realIdx})" title="삭제" aria-label="삭제">✕</button>
        </div>
      `;
    }).join('');
  }
  html += '</div>';
  container.innerHTML = html;
}

async function deleteArchiveItem(idx) {
  if (!await confirmDelete('이 깨달음', '홈에서 영구 삭제됩니다.')) return;
  if (!state.archive || idx < 0 || idx >= state.archive.length) return;
  state.archive.splice(idx, 1);
  saveState();
  renderLensArchive();
  showToast('삭제됨');
}

// V3.13.x: 깨달음 카드 클릭 → 원본 + 헤드라인/본문 보여주는 모달
function openArchiveItem(idx) {
  const a = (state.archive || [])[idx];
  if (!a) return;
  const dateStr = a.date || '';
  const sourceStr = a.source ? ` · ${escapeHtml(a.source)}` : '';
  const headline = a.headline ? `<div class="archive-modal-headline">${escapeHtml(a.headline)}</div>` : '';
  const bodyText = a.body || (a.headline ? '' : (a.insight || ''));
  const body = bodyText ? `<div class="archive-modal-body">${escapeHtml(bodyText)}</div>` : '';
  const questionBlock = a.question
    ? `<div class="archive-modal-section-label">네 질문</div>
       <div class="archive-modal-original" style="background:rgba(212,167,106,0.06);">${escapeHtml(a.question)}</div>`
    : '';
  const originalBlock = a.original
    ? `<div class="archive-modal-section-label">${a.question ? 'AI 응답' : '원본 메시지'}</div>
       <div class="archive-modal-original">${escapeHtml(a.original)}</div>`
    : `<div class="archive-modal-no-original">원본이 함께 저장되지 않은 항목 (이전 버전에서 저장)</div>`;
  // 변경 5 (사용자 명시 2026-06-02): '이어보기'로 엮인 과거 조각 — 연결망 표시.
  const linksBlock = (Array.isArray(a.links) && a.links.length)
    ? `<div class="archive-modal-section-label">🔗 이어진 기록</div>
       <div class="archive-modal-original" style="display:flex; flex-direction:column; gap:6px;">${a.links.map(l => `<span style="font-size:12px; color:var(--text-soft);">• ${escapeHtml(l.date || '')}${(l.date && l.title) ? ' · ' : ''}${escapeHtml(l.title || '')}</span>`).join('')}</div>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'archiveModal';
  modal.className = 'topic-modal-overlay';
  modal.innerHTML = `
    <div class="topic-modal" onclick="event.stopPropagation()">
      <div class="topic-modal-header">
        <span class="topic-card-cat" style="background: rgba(201,169,110,0.18); color: var(--accent2);">✦ 깨달음</span>
        <button class="topic-modal-close" onclick="closeArchiveModal()">×</button>
      </div>
      ${headline}
      ${body}
      ${questionBlock}
      ${originalBlock}
      ${linksBlock}
      <div class="topic-modal-meta">${escapeHtml(dateStr)}${sourceStr}</div>
      <div class="topic-modal-actions">
        <button class="topic-modal-btn danger" onclick="closeArchiveModal(); deleteArchiveItem(${idx})">🗑 삭제</button>
      </div>
    </div>
  `;
  modal.onclick = closeArchiveModal;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 30);
}

function closeArchiveModal() {
  const modal = document.getElementById('archiveModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 200);
}

// === LENS 2: INSIGHTS — AI 인과관계 발견 ===
// 사용자 요청 2026-04-29: 마법·리뷰 카테고리 — 피드(분리 sub) / 목록(4 chips) 토글
