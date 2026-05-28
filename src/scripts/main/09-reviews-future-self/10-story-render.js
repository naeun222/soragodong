// V4 (사용자 요청 2026-05-28): 주간 리뷰 옵션 2 — Story mode (3 페이지 풀스크린 sequence).
//   옵션 1 (classic, 기본) 와 토글로 swap. monthly/quarterly/annual = 적용 X.
//   목적: 회고 = 카드 stack scan 의 surface 아니라 *몰입의 surface*. 한 페이지 한 호흡.
//   schema 변경 X — 같은 reviewData 다른 위계로 render. 컨텐츠 결정은 prompt 그대로.
//
//   Page 1 Hero: one_word_weekly + momentum_line + mood arc (라벨 X, 곡선 only)
//   Page 2 Scenes: scenes 3개 carousel (좌우 swipe / dot)
//   Page 3 Reflection: flow + cycles 1-2개 + soft_notice + 이 주의 진주 1 + 챕터 수 + 행동 버튼
//
//   인터랙션: 좌우 swipe / tap 좌우 edge / 위 swipe = 다음. dot tap = 직접 jump.
//   토글: 우상단 ↺ Classic — 즉시 옵션 1 로 복귀 (state.preferences.weeklyReviewLayout).

let _storyPageIdx = 0;
let _storySceneIdx = 0;

function renderWeeklyStoryReview(reviewData, opts) {
  opts = opts || {};
  const readonly = !!opts.readonly;
  const screen = document.getElementById('screen-review');
  if (!screen) return;

  const oneWord = String(reviewData.one_word_weekly || '').trim();
  const momentum = String(reviewData.momentum_line || '').trim();
  const flow = String(reviewData.flow || '').trim();
  const softNotice = String(reviewData.soft_notice || '').trim();
  const weekKey = reviewData.weekKey || (typeof getCurrentWeekKey === 'function' ? getCurrentWeekKey() : '');

  // scenes — string / object 양쪽 schema 호환 (06-render-screen.js 와 동일 normalize)
  const scenes = (Array.isArray(reviewData.scenes) ? reviewData.scenes : [])
    .map(sc => (typeof sc === 'string' ? { what: sc } : sc))
    .filter(s => s && (s.what || s.when))
    .slice(0, 3);

  // cycles — 3분류 다 비어있을 수 있음. 자동 1-2개만 선택.
  const cyclesRaw = (reviewData.cycles && typeof reviewData.cycles === 'object') ? reviewData.cycles : {};
  const cycleEntries = ['sleep', 'mode', 'other']
    .map(k => ({ k, v: String(cyclesRaw[k] || '').trim() }))
    .filter(x => x.v.length > 0)
    .slice(0, 2);

  // 주간 range — 진주 / 챕터 필터용
  let _cutoff, _cutoffEnd;
  if (typeof _weeklyChartRangeFromKey === 'function' && weekKey) {
    const r = _weeklyChartRangeFromKey(weekKey);
    if (r) { _cutoff = r.start; _cutoffEnd = r.end; }
  }
  if (!_cutoff || !_cutoffEnd) {
    // fallback — completedAt 기준 -7일
    const _t = new Date(reviewData.completedAt || Date.now());
    _cutoff = new Date(_t.getTime() - 7 * 86400000);
    _cutoffEnd = _t;
  }

  // mood arc — entries 의 mood 곡선 (라벨 / 숫자 X)
  const entriesForArc = (state.entries || [])
    .filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date + 'T12:00:00');
      return d >= _cutoff && d < _cutoffEnd;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const moodArcSvg = _buildStoryMoodArc(entriesForArc);

  // 이 주의 진주 1개 — 본인이 ✦한 것 중 가장 최근
  const pearlsThisWeek = (state.pearls || [])
    .filter(p => {
      if (p._deleted || !p.createdAt) return false;
      const d = new Date(p.createdAt);
      return d >= _cutoff && d < _cutoffEnd;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 1);

  // 챕터 수 — 작게 (1줄 표시만)
  const chaptersCount = (state.chatArchive || [])
    .filter(c => {
      if (c._deleted || c.isSimulation) return false;
      const dt = c.generatedAt || c.createdAt || (c.date ? c.date + 'T12:00:00' : null);
      if (!dt) return false;
      const d = new Date(dt);
      return d >= _cutoff && d < _cutoffEnd;
    }).length;

  const cycleLabel = (k) => k === 'sleep' ? '잠' : k === 'mode' ? '모드' : '·';

  const html = `
    <div class="rstory-container" id="rstoryContainer">
      <div class="rstory-progress" role="progressbar" aria-label="페이지 진행도">
        <div class="rstory-progress-bar" data-step="0"></div>
        <div class="rstory-progress-bar" data-step="1"></div>
        <div class="rstory-progress-bar" data-step="2"></div>
      </div>
      <button class="rstory-toggle" type="button" onclick="toggleWeeklyReviewLayout()" aria-label="Classic 으로 돌아가기">↺ Classic</button>
      <button class="rstory-close" type="button" onclick="closeWeeklyStoryReview()" aria-label="닫기">✕</button>

      <div class="rstory-page rstory-page-hero active" data-page="0" role="region" aria-label="이번 주 한 단어">
        <div class="rstory-meta">${escapeHtml(weekKey || '이번 주')} · 너의 한 주</div>
        ${oneWord ? `<div class="rstory-oneword" aria-label="이번 주 한 단어 ${escapeHtml(oneWord)}">${escapeHtml(oneWord)}</div>` : '<div class="rstory-empty">이번 주는 한 단어가 흐릿했어</div>'}
        ${momentum ? `<div class="rstory-momentum">${escapeHtml(momentum)}</div>` : ''}
        ${moodArcSvg ? `<div class="rstory-moodarc">${moodArcSvg}</div>` : ''}
        <div class="rstory-hint">↓ 살짝 위로</div>
      </div>

      <div class="rstory-page rstory-page-scenes" data-page="1" role="region" aria-label="이번 주 장면">
        <div class="rstory-meta">${escapeHtml(weekKey || '')} · 이번 주 장면</div>
        ${scenes.length === 0 ? `
          <div class="rstory-empty">이 주는 장면이 흐릿했어</div>
        ` : `
          <div class="rstory-scenes-carousel">
            ${scenes.map((s, i) => `
              <div class="rstory-scene ${i === 0 ? 'active' : ''}" data-scene="${i}">
                ${s.when ? `<div class="rstory-scene-when">${escapeHtml(s.when)}</div>` : ''}
                ${s.what ? `<div class="rstory-scene-what">${escapeHtml(s.what)}</div>` : ''}
                ${s.feeling ? `<div class="rstory-scene-feeling">— ${escapeHtml(s.feeling)}</div>` : ''}
              </div>
            `).join('')}
          </div>
          ${scenes.length > 1 ? `
            <div class="rstory-scene-dots" role="tablist" aria-label="장면 선택">
              ${scenes.map((_, i) => `<button type="button" class="rstory-scene-dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="장면 ${i + 1}"></button>`).join('')}
            </div>
          ` : ''}
        `}
      </div>

      <div class="rstory-page rstory-page-reflect" data-page="2" role="region" aria-label="이번 주 흐름과 한 마디">
        <div class="rstory-meta">${escapeHtml(weekKey || '')} · 흐름</div>
        ${flow ? `<div class="rstory-flow">${escapeHtml(flow)}</div>` : ''}
        ${cycleEntries.length > 0 ? `
          <div class="rstory-cycles">
            ${cycleEntries.map(c => `<div class="rstory-cycle"><span class="rstory-cycle-k">${cycleLabel(c.k)}</span><span class="rstory-cycle-v">${escapeHtml(c.v)}</span></div>`).join('')}
          </div>
        ` : ''}
        ${softNotice ? `<div class="rstory-notice">✦ ${escapeHtml(softNotice)}</div>` : ''}
        ${pearlsThisWeek.length > 0 ? `
          <div class="rstory-pearl">
            <div class="rstory-pearl-label">이 주의 진주</div>
            <div class="rstory-pearl-content">${escapeHtml(String(pearlsThisWeek[0].content || pearlsThisWeek[0].note || '').slice(0, 120))}</div>
          </div>
        ` : ''}
        ${chaptersCount > 0 ? `<div class="rstory-chapters-label">이 주의 챕터 ${chaptersCount}개</div>` : ''}
        <div class="rstory-actions">
          <button class="rstory-action-secondary" type="button" onclick="showScreen('archive-reviews')">← 모음으로</button>
        </div>
      </div>
    </div>
  `;

  screen.innerHTML = html;
  // dataset 은 진입부에서 이미 박힘 — 토글/save 가 그걸 읽음.
  _initStoryReviewInteractions();
}

function _buildStoryMoodArc(entries) {
  if (!entries || entries.length < 2) return '';
  const moods = entries
    .map(e => Number(e.mood))
    .filter(v => Number.isFinite(v) && v >= 1 && v <= 5);
  if (moods.length < 2) return '';
  const W = 240, H = 50, pad = 8;
  const points = moods.map((m, i) => {
    const x = pad + (i / Math.max(1, moods.length - 1)) * (W - 2 * pad);
    const y = pad + (1 - (m - 1) / 4) * (H - 2 * pad);
    return [x, y];
  });
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${d}" fill="none" stroke="#7ec8e3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/></svg>`;
}

function _initStoryReviewInteractions() {
  _storyPageIdx = 0;
  _storySceneIdx = 0;
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  _updateStoryProgress();

  // dot tap → scene 직접 jump
  container.querySelectorAll('.rstory-scene-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = parseInt(dot.getAttribute('data-i') || '0', 10);
      if (Number.isFinite(i)) { _storySceneIdx = i; _updateStoryScene(); }
    });
  });

  // touch swipe
  let startX = 0, startY = 0, startT = 0;
  container.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches[0]) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = Date.now();
  }, { passive: true });
  container.addEventListener('touchend', (e) => {
    if (!startT) return;
    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if (!t) { startT = 0; return; }
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startT;
    startT = 0;
    if (dt > 700) return;
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      _storySwipeHorizontal(dx);
    } else {
      if (dy < -50) _storyGotoPage(_storyPageIdx + 1);
      else if (dy > 50) _storyGotoPage(_storyPageIdx - 1);
    }
  }, { passive: true });

  // mouse / pointer click on left/right edge (desktop fallback)
  container.addEventListener('click', (e) => {
    if (e.target.closest('.rstory-toggle, .rstory-close, .rstory-action-secondary, .rstory-scene-dot, button')) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) _storySwipeHorizontal(50);   // 좌 영역 = 이전
    else if (x > rect.width * 0.7) _storySwipeHorizontal(-50); // 우 영역 = 다음
  });

  // keyboard
  container.tabIndex = 0;
  container.focus({ preventScroll: true });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); _storySwipeHorizontal(-50); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); _storySwipeHorizontal(50); }
    else if (e.key === 'Escape') { e.preventDefault(); closeWeeklyStoryReview(); }
  });
}

// dx < 0 = 다음 (왼쪽으로 swipe). dx > 0 = 이전.
function _storySwipeHorizontal(dx) {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  if (_storyPageIdx === 1) {
    const scenes = container.querySelectorAll('.rstory-scene');
    if (dx < 0) {
      if (_storySceneIdx < scenes.length - 1) { _storySceneIdx++; _updateStoryScene(); }
      else _storyGotoPage(_storyPageIdx + 1);
    } else {
      if (_storySceneIdx > 0) { _storySceneIdx--; _updateStoryScene(); }
      else _storyGotoPage(_storyPageIdx - 1);
    }
  } else {
    if (dx < 0) _storyGotoPage(_storyPageIdx + 1);
    else _storyGotoPage(_storyPageIdx - 1);
  }
}

function _storyGotoPage(next) {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  const pages = container.querySelectorAll('.rstory-page');
  if (next < 0 || next >= pages.length) return;
  if (pages[_storyPageIdx]) pages[_storyPageIdx].classList.remove('active');
  _storyPageIdx = next;
  if (pages[_storyPageIdx]) pages[_storyPageIdx].classList.add('active');
  if (_storyPageIdx === 1) {
    _storySceneIdx = 0;
    _updateStoryScene();
  }
  _updateStoryProgress();
}

function _updateStoryScene() {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  const scenes = container.querySelectorAll('.rstory-scene');
  scenes.forEach((s, i) => s.classList.toggle('active', i === _storySceneIdx));
  const dots = container.querySelectorAll('.rstory-scene-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === _storySceneIdx));
}

function _updateStoryProgress() {
  const container = document.getElementById('rstoryContainer');
  if (!container) return;
  const bars = container.querySelectorAll('.rstory-progress-bar');
  bars.forEach((b, i) => {
    b.classList.remove('done', 'current');
    if (i < _storyPageIdx) b.classList.add('done');
    else if (i === _storyPageIdx) b.classList.add('current');
  });
}

function closeWeeklyStoryReview() {
  if (typeof showScreen === 'function') showScreen('archive-reviews');
}

// 토글 — Story ↔ Classic 즉시 swap. 같은 review 다시 렌더.
function toggleWeeklyReviewLayout() {
  if (!state.preferences) state.preferences = {};
  const cur = state.preferences.weeklyReviewLayout || 'classic';
  state.preferences.weeklyReviewLayout = (cur === 'story') ? 'classic' : 'story';
  try { if (typeof saveState === 'function') saveState(); } catch {}
  const screen = document.getElementById('screen-review');
  if (!screen) return;
  let reviewData = {};
  try { reviewData = JSON.parse(screen.dataset.reviewData || '{}'); } catch {}
  const type = screen.dataset.reviewType || 'weekly';
  const readonly = screen.dataset.reviewReadonly === '1';
  if (typeof renderReviewScreen === 'function') {
    renderReviewScreen(type, reviewData, { readonly });
  }
}
