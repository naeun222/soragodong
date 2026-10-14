// ═══════════════════════════════════════════════════════════════
// 규칙 패널 (2026-10-15) — 홈과 나 탭의 첫 화면
// ═══════════════════════════════════════════════════════════════
// 배경: 2026-10-15 회의. 다섯 달 동안 실제로 행동으로 이어진 건 리뷰의 pattern 한 칸에서 나온
//   "이럴 때 이렇다" 형태의 규칙뿐이었다. 특성·가치 카드 스무 장은 읽히고 끝났다.
//   그래서 홈과 나 탭의 맨 위에는 규칙만 둔다. 나머지는 '더 보기' 밑으로.
//
// 데이터 출처 (우선순위):
//   1) 월간 리뷰의 rules[] (2026-10-15 이후 프롬프트가 만드는 새 필드)
//   2) 없으면 월간 리뷰의 pattern (headline / evidence / condition) 을 규칙 하나로 변환
//   최신 리뷰부터 모아서 최대 3개.

function _rulesFromReview(r) {
  if (!r) return [];
  const out = [];
  if (Array.isArray(r.rules)) {
    for (const x of r.rules) {
      if (!x || typeof x.rule !== 'string' || !x.rule.trim()) continue;
      out.push({
        rule: x.rule.trim(),
        evidence: Array.isArray(x.evidence) ? x.evidence.filter(e => e && (e.quote || e.text)).slice(0, 3) : [],
        counter: typeof x.counter === 'string' ? x.counter.trim() : '',
        monthKey: r.monthKey || ''
      });
    }
  }
  if (out.length === 0 && r.pattern && typeof r.pattern.headline === 'string' && r.pattern.headline.trim()) {
    out.push({
      rule: r.pattern.headline.trim(),
      evidence: r.pattern.evidence ? [{ date: '', quote: String(r.pattern.evidence) }] : [],
      counter: '',
      monthKey: r.monthKey || ''
    });
  }
  return out;
}

function _collectMonthlyRules(limit) {
  const max = limit || 3;
  const arr = Array.isArray(state.monthlyReviews) ? state.monthlyReviews.slice() : [];
  arr.sort((a, b) => String(b.monthKey || '').localeCompare(String(a.monthKey || '')));
  const rules = [];
  for (const r of arr) {
    for (const x of _rulesFromReview(r)) {
      rules.push(x);
      if (rules.length >= max) return rules;
    }
  }
  return rules;
}

function _monthKeyLabel(mk) {
  const m = /^(\d{4})-(\d{2})$/.exec(mk || '');
  if (!m) return '';
  return `${parseInt(m[2], 10)}월`;
}

function renderRulesPanelHtml() {
  const rules = _collectMonthlyRules(3);
  const latestMonthly = (Array.isArray(state.monthlyReviews) && state.monthlyReviews.length > 0);
  if (rules.length === 0) {
    const sub = latestMonthly
      ? '지난 리뷰에는 규칙으로 부를 만한 게 없었다.'
      : '체크인이 한 달쯤 이어지면 여기에 생긴다.';
    return `
      <div class="rules-panel" id="rulesPanel">
        <div class="rules-panel-title">지금까지 보인 것</div>
        <div class="rules-empty">${escapeHtml(sub)}</div>
      </div>`;
  }
  const items = rules.map((x, i) => {
    const ev = x.evidence.map(e => {
      const d = e.date ? `<span class="rules-date">${escapeHtml(String(e.date).slice(5).replace('-', '/'))}</span> ` : '';
      return `<div class="rules-evidence">${d}${escapeHtml(String(e.quote || e.text || ''))}</div>`;
    }).join('');
    const counter = x.counter ? `<div class="rules-counter">반대: ${escapeHtml(x.counter)}</div>` : '';
    const mk = _monthKeyLabel(x.monthKey);
    return `
      <div class="rules-item">
        <div class="rules-rule">${escapeHtml(x.rule)}${mk ? `<span class="rules-month">${mk}</span>` : ''}</div>
        <details class="rules-details">
          <summary>근거</summary>
          ${ev || '<div class="rules-evidence">근거가 기록돼 있지 않다.</div>'}
          ${counter}
        </details>
      </div>`;
  }).join('');
  return `
    <div class="rules-panel" id="rulesPanel">
      <div class="rules-panel-title">지금까지 보인 것</div>
      ${items}
      <button class="rules-open-review" onclick="showScreen('archive-reviews')">리뷰 전체 보기</button>
    </div>`;
}

function renderHomeRules() {
  const el = document.getElementById('homeRulesContainer');
  if (!el) return;
  el.innerHTML = renderRulesPanelHtml();
}

function renderModelRulesTop() {
  const el = document.getElementById('modelRulesTop');
  if (!el) return;
  el.innerHTML = renderRulesPanelHtml();
}

// 홈 '더 보기' — 숨겨둔 모듈 (미션·숙고·칩 4개·진주) 펼치기. 기기 로컬 기억.
const _HOME_MORE_LS_KEY = 'sora_home_more_open';
function _homeMoreIsOpen() {
  try { return localStorage.getItem(_HOME_MORE_LS_KEY) === '1'; } catch { return false; }
}
function applyHomeMoreState() {
  const open = _homeMoreIsOpen();
  const extras = document.getElementById('homeExtras');
  const chips = document.getElementById('libMoreChips');
  const btn = document.getElementById('libMoreChip');
  if (extras) extras.style.display = open ? '' : 'none';
  if (chips) chips.style.display = open ? 'contents' : 'none';
  if (btn) btn.querySelector('.cat-label').textContent = open ? '접기' : '더 보기';
  // 접을 때 다른 칩에 가 있었으면 일기·대화로 복귀
  if (!open && typeof _currentLens !== 'undefined' && _currentLens !== 'diary' && typeof switchLibraryCat === 'function') {
    try { switchLibraryCat('diary'); } catch {}
  }
}
function toggleHomeMore() {
  const next = !_homeMoreIsOpen();
  try { localStorage.setItem(_HOME_MORE_LS_KEY, next ? '1' : '0'); } catch {}
  applyHomeMoreState();
}
