// V4-1p: strategy 카드 렌더 함수 추출 (grid/timeline 공용)
function _renderStrategyCardHtml(s) {
  const dateStr = new Date(s.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  const hasStructured = s.problemContext || s.psychConcept || s.actionStrategy;
  let bodyHtml;
  if (hasStructured) {
    bodyHtml = `
      ${s.problemContext ? `<div class="strategy-section-row"><div class="strategy-section-icon">🎯</div><div><div class="strategy-section-label">문제 상황</div><div class="strategy-section-text">${escapeHtml(s.problemContext)}</div></div></div>` : ''}
      ${s.psychConcept ? `<div class="strategy-section-row"><div class="strategy-section-icon">🔍</div><div><div class="strategy-section-label">심리학 개념</div><div class="strategy-section-text">${escapeHtml(s.psychConcept)}</div></div></div>` : ''}
      ${s.actionStrategy ? `<div class="strategy-section-row"><div class="strategy-section-icon">💡</div><div><div class="strategy-section-label">전략적 행동</div><div class="strategy-section-text strategy-section-action">${escapeHtml(s.actionStrategy)}</div></div></div>` : ''}
    `;
  } else if (s.summary) {
    bodyHtml = `<div class="strategy-card-legacy-summary">${escapeHtml(s.summary)}</div>`;
  } else {
    bodyHtml = '';
  }
  // 사용자 명시 2026-05-01 (agent audit P9): archived dead state 제거.
  // V4 (v8 묶음 19-H) 2026-05-03: 신규 상태 'evolved' + 4 어휘 시퀀스 (양생/성장/진화/체화) 코드 매핑 일치
  // V4 (v8 사용자 명시 2026-05-03 ultrathink): mutated 🪦 → 🍂 (낙엽 — 옛 가지 떨어진 자연 톤. evolved 🌿✨ 와 시각 분리)
  const _statusEmoji = { seedling:'🌱', trying:'🌿', working:'🌳', evolved:'🌿✨', embodied:'🍃', mutated:'🍂' };
  const _statusName  = { seedling:'시작', trying:'양생', working:'성장 중', evolved:'진화', embodied:'체화됨 ✨', archived:'마무리', mutated:'진화 중' };
  const _status = s.embodimentStatus || (Array.isArray(s.generations) ? 'seedling' : null);
  const _worked = _status ? countWorkedAttempts(s) : 0;
  const _total  = _status ? countTotalAttempts(s) : 0;
  const _gens   = Array.isArray(s.generations) ? s.generations.length : 0;
  const _isEmbodied = _status === 'embodied';
  // 사용자 요청 2026-04-28: 결과 체크 버튼 조건 수정 — '소라의 부름' 해냈어가 되어야 (즉 status === 'completed' && !attemptStatus). pending 상태에선 안 뜸. result check 끝나면 attemptStatus 적용돼서 사라짐
  // 사용자 명시 2026-05-11 ultrathink (근본): strategyId falsy 단락 — standalone 미션 (strategyId=null) 이 우연히 빈 카드 id 와 매칭되는 위험 차단.
  const _hasUnchecked = (state.missions || []).some(m =>
    m.strategyId &&
    m.strategyId === s.id &&
    m.status === 'completed' &&
    !m.attemptStatus
  );
  // 사용자 요청 2026-04-28: '작동' → '성공' 표기 통일, 결과 체크 대기 시 hint
  const metaLine = _status
    ? (_total > 0
        ? `${_statusEmoji[_status]||'🌱'} ${_statusName[_status]||''} · 성공 ${_worked}/${_total}${_gens > 1 ? ` · ${_gens}세대` : ''}${_hasUnchecked ? ' · 🔍 결과 체크 대기' : ''}`
        : `${_statusEmoji[_status]||'🌱'} 미시도${_hasUnchecked ? ' · 🔍 결과 체크 대기' : ''}`)
    : '';
  const tryBtnHtml = (_status && !_isEmbodied)
    ? (_hasUnchecked
        ? `<button class="strategy-try-btn" style="background:#7d6fa8;" onclick="triggerAttemptResultFromCard('${s.id}')">🔍 결과 체크</button>`
        : `<button class="strategy-try-btn" onclick="callTryStrategy('${s.id}')">✦ 해볼게</button>`)
    : '';
  const metaHtml = metaLine ? `<div class="strategy-card-meta${_isEmbodied ? ' embodied' : ''}">${metaLine}</div>` : '';
  // V4-1n + 사용자 fix: 진화 트리 — 1세대 (체화된 one-shot 포함) 도 표시
  let genTreeHtml = '';
  if (Array.isArray(s.generations) && s.generations.length >= 1) {
    const _layerEmoji = { L1:'🧠', L2:'🎯', L3:'🌍', L4:'👥', L5:'🪞' };
    const _layerName  = { L1:'인지', L2:'행동', L3:'환경', L4:'사회', L5:'메타' };
    // V4-fix v3 (사용자 보고): 진화 트리 dot — 그 미션의 shell tier 색으로 채움 (anchor 23)
    const tierColors = {
      light:  '#a89dc8',  // 가벼움 — 보라
      daily:  '#7ec8e3',  // 일상 — 파랑
      main:   '#ffb86b',  // 메인 — 주황
      golden: '#ffd700',  // 황금
      call:   '#ff8da1',  // 부름 — 핑크
      legend: '#ffd93d'   // 특별 — 노랑
    };
    const rows = s.generations.map((g, gi) => {
      const isLast = gi === s.generations.length - 1;
      const isMutated = g.status === 'mutated';
      const dots = (g.attempts || []).map(a => {
        // shellId / missionId 로 shell 찾기
        // 사용자 보고 2026-04-29: 'didnt' attempt도 missionId fallback으로 shell 끌어와 DNA 트리에 적용되던 버그.
        // worked/meh 만 shell 매핑. didnt는 missionId 있어도 shell X.
        let shell = null;
        if (a.shellId) shell = (state.shellCollection || []).find(sc => sc._id === a.shellId);
        if (!shell && a.missionId && (a.status === 'worked' || a.status === 'meh')) {
          shell = (state.shellCollection || []).find(sc => sc.missionId === a.missionId);
        }
        let bgColor;
        let extraStyle = '';
        let titleStr = a.status;
        if (shell) {
          // 그 미션 shell 색
          bgColor = tierColors[shell.tier] || '#a89dc8';
          if (shell.tier === 'legend' || shell.tier === 'call') {
            extraStyle = ` box-shadow: 0 0 6px ${bgColor};`;
          }
          titleStr = `${a.status} · ${shell.label || shell.tier} ${shell.type || ''}`;
        } else {
          // shell 없는 attempt — 기존 status 색 (worked/meh/didnt/skipped 회색)
          bgColor = a.status === 'worked' ? '#8fc88f'
                  : a.status === 'meh'    ? '#d4a76a'
                  : a.status === 'didnt'  ? '#888a90'
                                          : '#666';
        }
        // 사용자 요청 2026-04-27: shell 있으면 그 아이콘 작게 (점 대체), 없으면 기존 색 dot
        if (shell && shell.type) {
          const glow = (shell.tier === 'legend' || shell.tier === 'call') ? 'filter:drop-shadow(0 0 3px ' + bgColor + ');' : '';
          return `<span class="gen-shell-mini" style="${glow}" title="${titleStr}">${shell.type}</span>`;
        }
        return `<span class="gen-dot" style="background:${bgColor};${extraStyle}" title="${titleStr}"></span>`;
      }).join('');
      const prefix = gi === 0 ? '' : '└─ ';
      const layer = `${_layerEmoji[g.layer] || '✦'} ${_layerName[g.layer] || g.layer}`;
      const action = escapeHtml((g.action || '').slice(0, 50));
      const mark = isMutated ? '🪦' : (isLast && _isEmbodied ? '🍃' : '');
      return `<div class="strategy-gen-row${isLast ? ' current' : ''}" style="padding-left:${gi * 14}px;">
        <span class="gen-prefix">${prefix}</span>
        <span class="gen-layer">${layer}</span>
        <span class="gen-action">${action}${mark ? ` <span class="gen-mark">${mark}</span>` : ''}</span>
        <span class="gen-dots">${dots}</span>
      </div>`;
    }).join('');
    genTreeHtml = `<div class="strategy-gens-tree">
      <div class="gens-tree-label">🧬 진화 트리 · ${s.generations.length}세대</div>
      ${rows}
    </div>`;
  }
  // V4-fix #13: 카드 클릭 시 진화 트리 펼침 (default 접힘 — 시각 정리)
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._strategyTreeOpen) state.preferences._strategyTreeOpen = {};
  const treeOpen = !!state.preferences._strategyTreeOpen[s.id];
  const hasTree = !!genTreeHtml;
  const treeToggle = hasTree
    ? `<button class="strategy-tree-toggle" onclick="toggleStrategyTree('${s.id}')">${treeOpen ? '▴ DNA 트리 접기' : '▾ DNA 트리 보기'}</button>`
    : '';
  // V4-fix (사용자 보고): 카드 제목 클릭 = 트리 토글 (체화된 카드 포함)
  const titleClickAttr = hasTree ? `onclick="toggleStrategyTree('${s.id}')" style="cursor:pointer;"` : '';
  // V4 (v8 묶음 19-I): 진화된 카드 시각 효과 — .just-evolved 클래스 (state._justEvolvedCardId 일치 시)
  const _justEvolvedClass = (state._justEvolvedCardId === s.id) ? ' just-evolved' : '';
  return `
    <div class="strategy-card strategy-card-v2${_justEvolvedClass}" data-strategy-id="${s.id}">
      <div class="strategy-card-title" data-strategy-id="${s.id}" ${titleClickAttr}>🧬 ${escapeHtml(s.title)}${hasTree ? ' <span style="font-size:11px; color:var(--text-dim); font-weight:normal;">' + (treeOpen ? '▴' : '▾') + '</span>' : ''}</div>
      ${bodyHtml}
      ${metaHtml}
      ${hasTree && treeOpen ? genTreeHtml : ''}
      <div class="strategy-card-source">${dateStr}${s.source === 'manual' ? ' · 직접 추가' : s.source === 'deeper' ? ' · 더 알아보기' : ' · 대화 챕터'}</div>
      <div class="strategy-card-actions">
        ${tryBtnHtml}
        <button onclick="deleteTopicCard('${s.id}')">🗑 삭제</button>
      </div>
    </div>
  `;
}

// V4-fix #13: 양생 카드 진화 트리 collapse 토글
function toggleStrategyTree(strategyId) {
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._strategyTreeOpen) state.preferences._strategyTreeOpen = {};
  state.preferences._strategyTreeOpen[strategyId] = !state.preferences._strategyTreeOpen[strategyId];
  saveState();
  renderArchive();
}

// V4-fix: 직접 추가 → 임시 채팅창 (인셋, 메인 챗과 분리). 4단으로 같이 만들고 DNA 카드로 저장.
