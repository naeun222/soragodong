// V4 (사용자 명시 2026-05-18 ultrathink): 체크인 완료 = 소라 1개.
// 옛 '오늘의 카드' → '소라' 메커니즘 부활. 실행 탭 폐기로 사라진 보상 구조를
// 매일 체크인에 붙임. Tier 는 입력 양 따라 (점수제 X, 단순 분기).

// Tier 우선순위 (top-down):
//   🦞 황금 = 트래커 success (그날 measurements 1개+) — 성취감 강조
//   🐢 메인 = 사진 or 음악 (소중한 자산)
//   🌀 일상 = 오늘의 질문 답변 / 수면 / 옵션 체크 1개+
//   🐚 가벼움 = vitality + mood 만
function calcCheckinTier(entry, todayHasTrackerSuccess) {
  if (todayHasTrackerSuccess) return { tier: 'golden', type: '🦞' };
  const hasMedia = !!(entry.music || entry.photo);
  if (hasMedia) return { tier: 'main', type: '🐢' };
  const hasSleep = !!(entry.allNighter || (entry.sleepStart && entry.sleepEnd));
  const hasOptional = !!(entry.meals || entry.movement || entry.focus || entry.social || entry.overwhelm);
  const hasQuestion = !!(entry.dailyQuestion && entry.dailyQuestion.answered);
  if (hasSleep || hasOptional || hasQuestion) return { tier: 'daily', type: '🌀' };
  return { tier: 'light', type: '🐚' };
}

// 그날 트래커 데이터 입력 1개+ 검출. numeric = measurements.at 이 today / check = measurements.dayKey 이 today.
function _todayTrackerSuccesses(todayK) {
  return (state.projects || []).filter(p => {
    if (!Array.isArray(p.measurements)) return false;
    return p.measurements.some(m => {
      if (m.dayKey === todayK) return true;
      if (m.at && new Date(m.at).toISOString().slice(0, 10) === todayK) return true;
      return false;
    });
  }).map(p => ({ id: p.id, title: p.title, emoji: p.emoji || '📊', kind: p.kind || 'numeric' }));
}

// 같은 날 = 갱신 (_id = 'shell_ci_<date>'). 다른 날 = 새 shell push.
// 반환: { shell, isFirst, isUpgrade, prevTier, prevType }
function addOrUpdateCheckinShell(entry) {
  const todayK = entry.date;
  const shellId = 'shell_ci_' + todayK;
  if (!state.shellCollection) state.shellCollection = [];
  const idx = state.shellCollection.findIndex(s => s._id === shellId);
  const prev = idx >= 0 ? state.shellCollection[idx] : null;
  const prevTier = prev ? prev.tier : null;
  const prevType = prev ? prev.type : null;

  const trackerSuccesses = _todayTrackerSuccesses(todayK);
  const todayHasTracker = trackerSuccesses.length > 0;
  const { tier, type } = calcCheckinTier(entry, todayHasTracker);

  const tierLabel = ({ light: '가벼움', daily: '일상', main: '메인', golden: '황금' })[tier] || '소라';
  const dateLabel = (function() {
    try {
      const d = new Date(todayK);
      return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    } catch (_) { return todayK; }
  })();

  const shell = {
    _id: shellId,
    source: 'checkin',
    tier,
    type,
    label: `${dateLabel} · ${tierLabel}`,
    date: entry.timestamp || new Date().toISOString(),
    dayKey: todayK,
    story: `에너지 ${entry.vitality}/5 · 기분 ${entry.mood}/5`,
    vitality: entry.vitality,
    mood: entry.mood,
    sleepStart: entry.sleepStart || '',
    sleepEnd: entry.sleepEnd || '',
    allNighter: !!entry.allNighter,
    meals: entry.meals || null,
    movement: entry.movement || null,
    focus: entry.focus || null,
    social: entry.social || null,
    overwhelm: entry.overwhelm || null,
    note: entry.note || '',
    dailyQuestion: entry.dailyQuestion || null,
    music: entry.music || null,
    photoThumb: entry.photo || '',
    trackerSuccesses
  };

  if (idx >= 0) state.shellCollection[idx] = shell;
  else state.shellCollection.push(shell);

  const TIER_RANK = { light: 1, daily: 2, main: 3, golden: 4 };
  const isFirst = !prev;
  const isUpgrade = !!prev && (TIER_RANK[tier] || 0) > (TIER_RANK[prevTier] || 0);
  return { shell, isFirst, isUpgrade, prevTier, prevType };
}

// 화면 중앙 emerge ('소라가 널 부르고 있어' 느낌) + tier toast.
// 모래사장 무관 — 체크인 '기록 완료' 순간만.
function showCheckinShellReward(result) {
  if (!result || !result.shell) return;
  const { shell, isFirst, isUpgrade } = result;
  const tierLabel = ({ light: '가벼움', daily: '일상', main: '메인', golden: '황금' })[shell.tier] || '소라';

  const overlay = document.createElement('div');
  overlay.className = 'checkin-shell-emerge';
  overlay.innerHTML = `
    <div class="checkin-shell-emerge-inner tier-${shell.tier}">
      <div class="checkin-shell-emerge-emoji">${shell.type}</div>
      <div class="checkin-shell-emerge-label">${tierLabel}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  setTimeout(() => overlay.classList.add('fade'), 1600);
  setTimeout(() => { try { overlay.remove(); } catch (_) {} }, 2400);

  setTimeout(() => {
    if (isUpgrade) {
      showToast(`✨ ${tierLabel} 티어로 진화`);
    } else if (isFirst) {
      showToast(`${shell.type} ${tierLabel} 소라 얻었어`);
    } else {
      showToast(`✦ 기록 갱신`);
    }
  }, 1700);
}

// 체크인 소라 클릭 → 사진/음악 메인 + 데이터 chip + 트래커 + 오늘의 질문 layout.
// 기존 mission 소라 모달과 시각 분리 — source 가 자산 중심이라 화면 구성 다름.
function _openCheckinShellStory(shell) {
  const dateStr = new Date(shell.date).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  const timeStr = new Date(shell.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const tierLabel = ({ light: '가벼움', daily: '일상', main: '메인', golden: '황금' })[shell.tier] || '소라';

  const overlay = document.createElement('div');
  overlay.className = 'shell-story-overlay';
  let _shellEscDetach = null;
  const _close = () => {
    if (_shellEscDetach) { _shellEscDetach(); _shellEscDetach = null; }
    overlay.remove();
  };
  overlay.onclick = (e) => { if (e.target === overlay) _close(); };

  const photoHtml = shell.photoThumb
    ? `<img src="${shell.photoThumb}" alt="" class="ci-shell-photo">`
    : '';
  const musicHtml = shell.music && typeof renderMusicCardHTML === 'function'
    ? `<div class="ci-shell-music">${renderMusicCardHTML(shell.music)}</div>`
    : '';
  const mainAssetHtml = (photoHtml || musicHtml)
    ? `<div class="ci-shell-assets">${photoHtml}${musicHtml}</div>`
    : '';

  const chips = [];
  if (shell.vitality) chips.push(`<div class="ci-chip"><span>⚡</span><span>에너지 ${shell.vitality}/5</span></div>`);
  if (shell.mood) chips.push(`<div class="ci-chip"><span>💭</span><span>기분 ${shell.mood}/5</span></div>`);
  if (shell.allNighter) {
    chips.push(`<div class="ci-chip"><span>🌙</span><span>밤샘</span></div>`);
  } else if (shell.sleepStart && shell.sleepEnd) {
    chips.push(`<div class="ci-chip"><span>🌙</span><span>수면 ${escapeHtml(shell.sleepStart)}~${escapeHtml(shell.sleepEnd)}</span></div>`);
  }
  if (shell.meals) chips.push(`<div class="ci-chip"><span>🍚</span><span>${escapeHtml(String(shell.meals))}</span></div>`);
  if (shell.movement) chips.push(`<div class="ci-chip"><span>🏃</span><span>${escapeHtml(String(shell.movement))}</span></div>`);
  if (shell.focus) chips.push(`<div class="ci-chip"><span>🎯</span><span>${escapeHtml(String(shell.focus))}</span></div>`);
  if (shell.social) chips.push(`<div class="ci-chip"><span>🤝</span><span>${escapeHtml(String(shell.social))}</span></div>`);
  if (shell.overwhelm) chips.push(`<div class="ci-chip"><span>🌊</span><span>${escapeHtml(String(shell.overwhelm))}</span></div>`);
  const chipsHtml = chips.length ? `<div class="ci-shell-chips">${chips.join('')}</div>` : '';

  let trackerHtml = '';
  if (Array.isArray(shell.trackerSuccesses) && shell.trackerSuccesses.length > 0) {
    trackerHtml = `
      <div class="ci-shell-section">
        <div class="ci-shell-section-label">🦞 오늘 성공한 트래커</div>
        <div class="ci-shell-trackers">
          ${shell.trackerSuccesses.map(t => `<div class="ci-tracker-row"><span>${escapeHtml(t.emoji || '📊')}</span><span>${escapeHtml(t.title || '')}</span></div>`).join('')}
        </div>
      </div>
    `;
  }

  let questionHtml = '';
  if (shell.dailyQuestion && shell.dailyQuestion.text) {
    questionHtml = `
      <div class="ci-shell-section">
        <div class="ci-shell-section-label">🌀 오늘의 질문</div>
        <div class="ci-shell-question">${escapeHtml(shell.dailyQuestion.text)}</div>
        ${shell.note ? `<div class="ci-shell-answer">${escapeHtml(shell.note)}</div>` : ''}
      </div>
    `;
  } else if (shell.note) {
    questionHtml = `
      <div class="ci-shell-section">
        <div class="ci-shell-section-label">✦ 메모</div>
        <div class="ci-shell-answer">${escapeHtml(shell.note)}</div>
      </div>
    `;
  }

  overlay.innerHTML = `
    <div class="shell-story-card tier-${shell.tier}">
      <div class="shell-story-emoji">${shell.type}</div>
      <div class="shell-story-tier">${tierLabel} 소라</div>
      <div class="shell-story-date">${dateStr} · ${timeStr}</div>
      ${mainAssetHtml}
      ${chipsHtml}
      ${trackerHtml}
      ${questionHtml}
      <button class="btn-secondary" id="shellStoryCloseBtn" style="margin-top:18px; width:100%;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const _btn = overlay.querySelector('#shellStoryCloseBtn');
  if (_btn) _btn.addEventListener('click', _close);
  _shellEscDetach = _registerModalEsc(overlay, _close);
}
