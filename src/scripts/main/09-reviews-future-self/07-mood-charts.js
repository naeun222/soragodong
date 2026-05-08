function _renderReviewMoodChart(entries) {
  if (!Array.isArray(entries) || entries.length < 2) return '';
  // mood: 1-5 / energy: 1-5 둘 다 정규화 후 0-1 비율로 표시
  // 사용자 보고 2026-05-08 ultrathink: state.entries 의 실제 필드는 'vitality' (체크인 흐름) — 'energy' 만 봐서 항상 빈 path → energy 그래프 안 뜸 버그.
  const w = 320, h = 110, pad = 18;
  const xs = (i) => pad + (i / (entries.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((Number(v) - 1) / 4) * (h - pad * 2);  // 1-5 → 0-1 → y
  const _eVal = (e) => e.energy ?? e.vitality;
  const moodValid = entries.filter(e => Number.isFinite(Number(e.mood)) && Number(e.mood) >= 1 && Number(e.mood) <= 5);
  const energyValid = entries.filter(e => { const v = _eVal(e); return Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5; });
  if (moodValid.length < 2 && energyValid.length < 2) return '';
  const buildPath = (vals, getter) => vals.map((e, i) => {
    const idx = entries.indexOf(e);
    return `${i === 0 ? 'M' : 'L'}${xs(idx).toFixed(1)},${ys(getter(e)).toFixed(1)}`;
  }).join(' ');
  const moodPath = moodValid.length >= 2 ? buildPath(moodValid, e => e.mood) : '';
  const energyPath = energyValid.length >= 2 ? buildPath(energyValid, _eVal) : '';
  const dots = (vals, color, getter) => vals.map(e => {
    const idx = entries.indexOf(e);
    return `<circle cx="${xs(idx).toFixed(1)}" cy="${ys(getter(e)).toFixed(1)}" r="3.5" fill="${color}"/>`;
  }).join('');
  // x-axis dates
  const labels = entries.map((e, i) => {
    const x = xs(i);
    const md = (e.date || '').slice(5);  // MM-DD
    return `<text x="${x.toFixed(1)}" y="${h - 4}" fill="rgba(255,255,255,0.40)" font-size="9" text-anchor="middle">${md}</text>`;
  }).join('');
  // grid lines
  const gridY = [1, 2, 3, 4, 5].map(v => `<line x1="${pad}" y1="${ys(v).toFixed(1)}" x2="${w - pad}" y2="${ys(v).toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`).join('');
  return `
    <div class="review-section" style="background:var(--surface); border-radius:14px; padding:14px 16px; margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="font-size:11px; color:var(--accent); letter-spacing:0.15em; text-transform:uppercase;">📊 7일 흐름</div>
        <div style="font-size:10px; color:var(--text-soft);">
          <span style="color:#e8c890;">● mood</span> <span style="color:#7ec8e3; margin-left:8px;">● energy</span>
        </div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
        ${gridY}
        ${moodPath ? `<path d="${moodPath}" stroke="#e8c890" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${energyPath ? `<path d="${energyPath}" stroke="#7ec8e3" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${moodPath ? dots(moodValid, '#e8c890', e => e.mood) : ''}
        ${energyPath ? dots(energyValid, '#7ec8e3', _eVal) : ''}
        ${labels}
      </svg>
    </div>`;
}


// hero block 내부에 inline 적용하는 chart variant — 카드 wrapper X (hero 가 wrapper 역할).
function _renderReviewMoodChartInline(entries) {
  if (!Array.isArray(entries) || entries.length < 2) return '';
  const w = 320, h = 100, pad = 16;
  const xs = (i) => pad + (i / (entries.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((Number(v) - 1) / 4) * (h - pad * 2);
  // 사용자 보고 2026-05-08 ultrathink: e.energy ?? e.vitality fallback (full chart 와 동일 fix).
  const _eVal = (e) => e.energy ?? e.vitality;
  const moodValid = entries.filter(e => Number.isFinite(Number(e.mood)) && Number(e.mood) >= 1 && Number(e.mood) <= 5);
  const energyValid = entries.filter(e => { const v = _eVal(e); return Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5; });
  if (moodValid.length < 2 && energyValid.length < 2) return '';
  const buildPath = (vals, getter) => vals.map((e, i) => {
    const idx = entries.indexOf(e);
    return `${i === 0 ? 'M' : 'L'}${xs(idx).toFixed(1)},${ys(getter(e)).toFixed(1)}`;
  }).join(' ');
  const moodPath = moodValid.length >= 2 ? buildPath(moodValid, e => e.mood) : '';
  const energyPath = energyValid.length >= 2 ? buildPath(energyValid, _eVal) : '';
  const dots = (vals, color, getter) => vals.map(e => {
    const idx = entries.indexOf(e);
    return `<circle cx="${xs(idx).toFixed(1)}" cy="${ys(getter(e)).toFixed(1)}" r="3" fill="${color}"/>`;
  }).join('');
  const labels = entries.map((e, i) => {
    const x = xs(i);
    const md = (e.date || '').slice(5);
    return `<text x="${x.toFixed(1)}" y="${h - 2}" fill="rgba(255,255,255,0.36)" font-size="8.5" text-anchor="middle">${md}</text>`;
  }).join('');
  const gridY = [1, 3, 5].map(v => `<line x1="${pad}" y1="${ys(v).toFixed(1)}" x2="${w - pad}" y2="${ys(v).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`).join('');
  return `
    <div style="margin-top:6px;">
      <div style="display:flex; align-items:center; justify-content:center; gap:14px; font-size:9.5px; color:var(--text-soft); margin-bottom:4px;">
        <span style="color:#e8c890;">● mood</span><span style="color:#7ec8e3;">● energy</span>
      </div>
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;" preserveAspectRatio="xMidYMid meet">
        ${gridY}
        ${moodPath ? `<path d="${moodPath}" stroke="#e8c890" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${energyPath ? `<path d="${energyPath}" stroke="#7ec8e3" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${moodPath ? dots(moodValid, '#e8c890', e => e.mood) : ''}
        ${energyPath ? dots(energyValid, '#7ec8e3', _eVal) : ''}
        ${labels}
      </svg>
    </div>`;
}

// 사용자 명시 2026-04-30 ultrathink + 검색 (Spotify Wrapped 2025 5억 share / 디자인 트렌드 typography-first / Strava signature visual): 공유 카드 PNG export 재설계.
// 1080x1920 (Stories), brand recognition = 🐚 + gold + Gowun Batang serif, hero typography hierarchy 강화 (Wrapped 2025 약점 = 강한 hero 부재).
