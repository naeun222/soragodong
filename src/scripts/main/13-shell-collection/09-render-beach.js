function renderBeach() {
  const sub = document.getElementById('shellSubtext');
  const countEl = document.getElementById('beachCount');
  const tierRow = document.getElementById('beachTierRow');
  const grid = document.getElementById('beachGrid');
  const spotlight = document.getElementById('beachSpotlight');
  const weekly = document.getElementById('beachWeekly');
  if (!grid) return;

  // 사용자 요청 2026-04-29: 튜토리얼 click_new_shell 단계엔 '방금 받은 소라'에 marker 클래스 부착
  // → tutorial-target 셀렉터로 정확히 spotlight 가능 (DNA / seed 아닌 가장 최근 shell)
  let _tutorialTargetShellId = null;
  if (window._onbTutorialMode && typeof _onbStep === 'number' && Array.isArray(ONBOARDING_STEPS)) {
    const _curStep = ONBOARDING_STEPS[_onbStep];
    if (_curStep && _curStep.id === 'click_new_shell') {
      const newest = (state.shellCollection || []).slice().reverse().find(s =>
        s && s._id && !s._id.startsWith('shell_seed') && !_isDnaShell(s)
      );
      _tutorialTargetShellId = newest ? newest._id : null;
    }
  }

  const all = state.shellCollection || [];
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const thisYear = all.filter(s => new Date(s.date).getTime() >= yearStart);
  
  if (sub) sub.textContent = all.length === 0 ? '아직 비어있어. 첫 소라 모아보자.' : '';
  if (countEl) countEl.textContent = thisYear.length;
  
  // Tier counts (visual hierarchy: 가벼움 → 특별)
  if (tierRow) {
    const counts = {};
    thisYear.forEach(s => { counts[s.tier || 'unknown'] = (counts[s.tier] || 0) + 1; });
    const tiers = [
      { tier: 'light', emoji: '🐚', label: '가벼움' },
      { tier: 'daily', emoji: '🌀', label: '일상' },
      { tier: 'main', emoji: '🐢', label: '메인' },
      { tier: 'golden', emoji: '🦞', label: '황금' },
      { tier: 'call', emoji: '⭐', label: '부름' },
      { tier: 'legend', emoji: '✨', label: '특별' }
    ];
    tierRow.innerHTML = tiers
      .filter(t => counts[t.tier] > 0)
      .map(t => `<div class="beach-tier tier-${t.tier}" title="${t.label}"><span class="emoji">${t.emoji}</span> <span>${counts[t.tier]}</span></div>`)
      .join('');
  }
  
  // Weekly summary — 일요일 또는 데이터 충분할 때
  if (weekly) {
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = all.filter(s => new Date(s.date).getTime() > weekAgo);
    if (thisWeek.length >= 3) {
      const tierBreakdown = {};
      thisWeek.forEach(s => { tierBreakdown[s.tier] = (tierBreakdown[s.tier] || 0) + 1; });
      const breakdownStr = Object.entries(tierBreakdown)
        .map(([t, c]) => {
          const emoji = ({ light:'🐚', daily:'🌀', main:'🐢', golden:'🦞', call:'⭐', legend:'✨' })[t] || '·';
          return `${emoji}${c}`;
        }).join(' · ');
      weekly.innerHTML = `
        <div class="beach-weekly">
          <div class="beach-weekly-label">— 이번 주 —</div>
          <div class="beach-weekly-count">${thisWeek.length}개</div>
          <div class="beach-weekly-breakdown">${breakdownStr}</div>
        </div>
      `;
    } else {
      weekly.innerHTML = '';
    }
  }
  
  // Spotlight — 가장 빛나는 최근 소라
  if (spotlight) {
    const weekAgo = Date.now() - 7 * 86400000;
    const TIER_RANK = { light: 1, daily: 2, main: 3, golden: 4, call: 5, legend: 6 };
    const recentRare = all
      .filter(s => new Date(s.date).getTime() > weekAgo)
      .sort((a, b) => (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0))[0];
    if (recentRare && ['main', 'golden', 'call', 'legend'].includes(recentRare.tier)) {
      const dateStr = new Date(recentRare.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
      spotlight.innerHTML = `
        <div class="beach-spotlight tier-${recentRare.tier}">
          <div class="beach-spotlight-label">✦ 이번 주 가장 빛나는</div>
          <div class="beach-spotlight-emoji">${recentRare.type}</div>
          <div class="beach-spotlight-story">${escapeHtml(recentRare.story || '')}<br>
            <span style="color:var(--text-dim); font-size:10px;">${dateStr}</span>
          </div>
        </div>
      `;
    } else {
      spotlight.innerHTML = '';
    }
  }
  
  // Filter by tab
  let filtered = all;
  if (_beachTab === 'card') {
    filtered = all.filter(s => ['light', 'daily', 'main', 'golden'].includes(s.tier));
  } else if (_beachTab === 'call') {
    filtered = all.filter(s => ['call', 'legend'].includes(s.tier));
  }
  // 'tier' 탭과 'all' 탭은 모든 항목 포함

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="beach-empty" style="grid-column: 1 / -1;">
        <div class="icon">🏖</div>
        ${_beachTab === 'call' ? '아직 소라의 부름 클리어한 적 없어' :
          _beachTab === 'card' ? '아직 오늘의 카드 클리어한 적 없어' :
          '아직 비어있어. 첫 소라 모아보자.'}
      </div>
    `;
    return;
  }

  // V4-1f: DNA 진주 — 모래사장 최상위 티어 (V4 비전 11)
  // state.pearls에 type='dna_pearl'로 저장됨. shellCollection엔 없음.
  // 'tier' 탭 + 'all' 탭에서 최상단 섹션으로 표시. 'card'/'call' 탭에선 X.
  const dnaPearls = (state.pearls || []).filter(p => p.type === 'dna_pearl');
  const showDnaSection = (_beachTab === 'tier' || _beachTab === 'all') && dnaPearls.length > 0;
  // 사용자 요청 2026-04-28: DNA 조각 검출 강화 — strategy generations.shells / attempts.shellId 모두 체크
  // 사용자 보고 2026-05-04 (B14/B15): _dnaShellIdSet 빌드 시 attempt 의 worked/meh 만 인정 — stale 'didnt' shellId / g.shells 잔재 차단.
  const _dnaShellIdSet = new Set();
  (state.topicCards || []).forEach(c => {
    if (c.category !== 'strategy' || !Array.isArray(c.generations)) return;
    c.generations.forEach(g => {
      const _workedShellIds = new Set();
      (g.attempts || []).forEach(a => {
        if (a.shellId && (a.status === 'worked' || a.status === 'meh')) {
          _workedShellIds.add(a.shellId);
          _dnaShellIdSet.add(a.shellId);
        }
      });
      // g.shells fallback — 단 같은 generation 의 worked/meh attempt 와 매칭되어야 인정
      if (Array.isArray(g.shells)) {
        g.shells.forEach(sid => { if (_workedShellIds.has(sid)) _dnaShellIdSet.add(sid); });
      }
    });
  });
  function _isDnaShell(s) {
    if (!s) return false;
    // 사용자 요청 2026-04-28: DNA 조각은 '소라의 부름' tier (call/legend)만 — 일반 오늘카드 소라는 제외
    if (s.tier !== 'call' && s.tier !== 'legend') return false;
    // 사용자 보고 2026-05-04 (B14/B15): missionId 추적 → mission 의 attemptStatus 가 worked/meh 일 때만 DNA. 'didnt'/'skipped'/미해결 (없음) → DNA X.
    if (s.missionId) {
      const _m = (state.missions || []).find(mm => mm.id === s.missionId);
      if (_m && _m.attemptStatus !== 'worked' && _m.attemptStatus !== 'meh') return false;
    }
    if (s._id && _dnaShellIdSet.has(s._id)) return true;
    // 사용자 보고 2026-04-29: legacy fallback이 attemptStatus 체크 없어 결과 체크 안 한 소라도 DNA로 판정. attemptStatus === 'worked' 인 미션만 DNA 인정.
    if (s.missionId && (state.missions || []).some(m => m.id === s.missionId && m.strategyId && m.attemptStatus === 'worked')) return true;
    return false;
  }
  // pearl_design_spec_2026-05-03 §3·§9: 모래사장 미니 진주도 v20 톤 (path별 sphere/halo/rim)
  const dnaSectionHtml = showDnaSection ? `
    <div class="beach-tier-section beach-dna-section">
      <div class="beach-tier-header">🧬 DNA 진주 — 체화 완료 · ${dnaPearls.length}</div>
      <div class="beach-tier-grid">
        ${dnaPearls.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((p) => _renderDnaPearlMiniV20(p)).join('')}
      </div>
    </div>
  ` : '';

  // V3.13.x: '등급별로' 탭만 티어 그룹화 (높은 등급 먼저). 그 외 탭은 시간순 평면.
  if (_beachTab === 'tier') {
    const TIER_ORDER = [
      { tier: 'legend',  label: '✨ 특별 — 가장 빛나는 등급' },
      { tier: 'call',    label: '⭐ 소라의 부름 — 탑티어' },
      { tier: 'golden',  label: '🦞 황금 — 집중 메인' },
      { tier: 'main',    label: '🐢 메인' },
      { tier: 'daily',   label: '🌀 일상' },
      { tier: 'light',   label: '🐚 가벼움' }
    ];
    const grouped = {};
    filtered.forEach(s => {
      const t = s.tier || 'unknown';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(s);
    });
    Object.keys(grouped).forEach(k => {
      grouped[k].sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    let html = dnaSectionHtml;
    TIER_ORDER.forEach(({ tier, label }) => {
      if (!grouped[tier] || grouped[tier].length === 0) return;
      html += `<div class="beach-tier-section">
        <div class="beach-tier-header">${label} · ${grouped[tier].length}</div>
        <div class="beach-tier-grid">`;
      grouped[tier].forEach(s => {
        const isDnaPiece = _isDnaShell(s);
        const isTutorialTarget = _tutorialTargetShellId && s._id === _tutorialTargetShellId;
        html += `<div class="beach-shell tier-${tier}${isDnaPiece ? ' dna-shell' : ''}${isTutorialTarget ? ' tutorial-target' : ''}" onclick="openShellStory(${state.shellCollection.indexOf(s)})" title="${isDnaPiece ? '🧬 가닥 DNA 조각' : ''}">${s.type}</div>`;
      });
      html += `</div></div>`;
    });
    grid.innerHTML = html;
  } else {
    // 시간순 평면 (최신 위)
    const sorted = filtered.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    // V4-fix v3 (사용자 보고 — 안 겹치게): 'all' 탭 → 격자 칸 + 칸 안 jitter (overlap 최소화)
    const isAllTab = _beachTab === 'all';
    // shell 개수에 따라 cols 결정 (모바일 ~360px 기준 7 cols, n개 row 자동)
    const cols = 7;
    const cellW = 100 / cols;
    const sortedShellsCnt = filtered.length;
    const rows = Math.max(8, Math.ceil(sortedShellsCnt / cols) + 1);
    // 컨테이너 height: rows * 50 + jitter
    const containerH = Math.max(380, rows * 50);
    const scatterStyle = (s, idx) => {
      if (!isAllTab) return '';
      const seed = (s._id ? s._id.split('').reduce((a,c) => a + c.charCodeAt(0), 0) : idx) * 9301 + 49297;
      // 격자 칸 위치
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      // 칸 중심
      const baseLeft = col * cellW + cellW / 2;
      const baseTop = (row * 100) / rows + (100 / rows) / 2;
      // 칸 내 jitter (작게 — 칸 크기 70%만)
      const jitterX = (((seed * 7) % 11) - 5) * 0.5;       // ±2.5%
      const jitterY = (((seed * 13) % 11) - 5) * 0.5;      // ±2.5%
      const rot = (((seed * 19) % 17) - 8);                // -8deg ~ +8deg
      // shell width 46px → translate -50% 적용해 중심 정렬
      return ` style="left:calc(${(baseLeft + jitterX).toFixed(1)}% - 23px); top:calc(${(baseTop + jitterY).toFixed(1)}% - 23px); transform:rotate(${rot}deg);"`;
    };
    // scatter 컨테이너 height 동적
    if (isAllTab) {
      grid.dataset.scatterRows = rows;
    }
    grid.innerHTML = dnaSectionHtml +
      `<div class="beach-tier-grid${isAllTab ? ' scatter' : ''}">` +
      sorted.map((s, i) => {
        const isDnaPiece = _isDnaShell(s);
        const isTutorialTarget = _tutorialTargetShellId && s._id === _tutorialTargetShellId;
        return `<div class="beach-shell tier-${s.tier || 'unknown'}${isDnaPiece ? ' dna-shell' : ''}${isTutorialTarget ? ' tutorial-target' : ''}"${scatterStyle(s, i)} onclick="openShellStory(${state.shellCollection.indexOf(s)})" title="${isDnaPiece ? '🧬 가닥 DNA 조각' : ''}">${s.type}</div>`;
      }).join('') +
      `</div>`;
  }

  // V3.13.x: 지난 부름 (만료) 섹션 — 다시 받기 가능
  const lostSec = document.getElementById('lostCallsSection');
  if (lostSec) {
    const expired = (state.missions || []).filter(m => m.status === 'expired');
    if (expired.length === 0) {
      lostSec.innerHTML = '';
    } else {
      expired.sort((a, b) => {
        const ta = new Date(a.expiredAt || a.scheduledFor || 0).getTime();
        const tb = new Date(b.expiredAt || b.scheduledFor || 0).getTime();
        return tb - ta;
      });
      lostSec.innerHTML = `
        <div class="lost-calls-section">
          <div class="lost-calls-label">📜 받았지만 못 한 부름 — 다시 받을 수 있어</div>
          <div class="lost-calls-list">
            ${expired.map(m => {
              const dateStr = m.scheduledFor || (m.createdAt ? m.createdAt.slice(0, 10) : '');
              return `
                <div class="lost-call-card">
                  <div class="lost-call-card-info">
                    <div class="lost-call-title">${escapeHtml(m.title || '')}</div>
                    <div class="lost-call-meta">${escapeHtml(dateStr)} 받음</div>
                  </div>
                  <button class="lost-call-resume" onclick="resumeMission('${m.id}')">다시 받기</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
  }
}

// V4-1f: DNA 진주 클릭 → 일반 story 모달 (결정화 의식보다 가벼운 톤).
// 5.7: "결정화 의식 모달 = 1회만. 이후 모래사장 컬렉션 아이템 (일반 소라 story 모달 톤)"
