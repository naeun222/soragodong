// V4 (사용자 명시 2026-05-14 ultrathink): admin 운영 대시보드 — 14 KPI 카드 풀스크린 modal.
//   진입: settings devToolsSection 의 '🎛 운영 대시보드' 버튼. _isAdmin() 가드.
//   한 fetch /api/admin/dashboard → 5 묶음 batch.
//   SVG 직접 (Chart.js X — concat-build deps 0). DNA pearl helix 패턴 따름.

async function openAdminAnalyticsDashboard() {
  if (!_isAdmin()) { showToast('관리자 전용'); return; }
  if (document.getElementById('adminAnalyticsOverlay')) return;
  // 풀스크린 modal 먼저 띄움 — fetch 중 loading 표시
  const overlay = document.createElement('div');
  overlay.id = 'adminAnalyticsOverlay';
  overlay.className = 'admin-analytics-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeAdminAnalyticsDashboard(); };
  overlay.innerHTML = `
    <div class="admin-analytics-modal" onclick="event.stopPropagation()">
      <div class="admin-analytics-header">
        <div style="font-size:17px; font-weight:700;">🎛 운영 대시보드</div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span id="adminAnalyticsTime" style="font-size:11px; color:var(--text-soft);"></span>
          <button class="admin-close-btn" onclick="closeAdminAnalyticsDashboard()" aria-label="닫기">✕</button>
        </div>
      </div>
      <div id="adminAnalyticsBody" class="admin-analytics-grid">
        <div class="admin-card" style="grid-column:1/-1; text-align:center; padding:40px;">불러오는 중...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  try {
    const resp = await _authedFetch('/api/admin/dashboard', {
      headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
    });
    if (resp.status === 403) {
      _renderAdminAnalyticsError('관리자 권한 X (env ADMIN_USER_ID 확인)');
      return;
    }
    if (!resp.ok) {
      const r = await resp.json().catch(() => ({}));
      _renderAdminAnalyticsError(`실패 (${resp.status}) ${r.error || ''}`);
      return;
    }
    const data = await resp.json();
    if (!data.ok) { _renderAdminAnalyticsError(data.error || '응답 오류'); return; }
    _renderAdminAnalyticsBody(data);
  } catch (e) {
    _renderAdminAnalyticsError('네트워크 실패: ' + (e?.message || e));
  }
}

function closeAdminAnalyticsDashboard() {
  const el = document.getElementById('adminAnalyticsOverlay');
  if (el) el.remove();
}

function _renderAdminAnalyticsError(msg) {
  const body = document.getElementById('adminAnalyticsBody');
  if (body) body.innerHTML = `<div class="admin-card" style="grid-column:1/-1; text-align:center; padding:40px; color:#d97a7a;">${escapeHtml(msg)}</div>`;
}

function _renderAdminAnalyticsBody(data) {
  const body = document.getElementById('adminAnalyticsBody');
  const timeEl = document.getElementById('adminAnalyticsTime');
  if (timeEl) timeEl.textContent = '갱신 ' + new Date(data.generated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (!body) return;
  body.innerHTML = `
    ${_renderAdminCardAcquisition(data.acquisition)}
    ${_renderAdminCardActivity(data.activity)}
    ${_renderAdminCardRevenue(data.revenue)}
    ${_renderAdminCardCost(data.cost)}
    ${_renderAdminCardFeedback(data.feedback)}
  `;
}

// ─── A+J Acquisition + Funnel (4 카드) ───
function _renderAdminCardAcquisition(a) {
  if (!a) return '';
  const nu = a.new_users || {};
  // pie slices
  const totalSrc = (a.by_source || []).reduce((s, x) => s + x.count, 0);
  const pieColors = ['#7ec8e3', '#d4a76a', '#a89dc8', '#6abf69', '#e89090', '#888'];
  const slices = (a.by_source || []).map((s, i) => ({ label: s.source, value: s.count, color: pieColors[i % pieColors.length] }));
  // conversion table
  const convRows = (a.conversion || []).map(c => {
    const total = c.signups || 1;
    return `<tr>
      <td style="padding:3px 6px;">${escapeHtml(c.source)}</td>
      <td style="padding:3px 6px; text-align:right;">${c.signups}</td>
      <td style="padding:3px 6px; text-align:right; color:#7ec8e3;">${c.first_chat}</td>
      <td style="padding:3px 6px; text-align:right; color:#d4a76a;">${c.light + c.plus + c.premium} (${Math.round(((c.light + c.plus + c.premium) / total) * 100)}%)</td>
    </tr>`;
  }).join('');
  // funnel
  const funnelMax = Math.max(1, ...(a.funnel || []).map(f => f.count));
  const funnelHtml = (a.funnel || []).map(f => {
    const pct = Math.round((f.count / funnelMax) * 100);
    return `<div style="margin-bottom:5px;">
      <div style="display:flex; justify-content:space-between; font-size:10.5px; color:var(--text-soft);">
        <span>${escapeHtml(f.stage)}</span><span>${f.count}</span>
      </div>
      <div style="background:var(--card-bg); height:5px; border-radius:3px; overflow:hidden;">
        <div style="background:var(--accent); height:100%; width:${pct}%;"></div>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="admin-card">
      <div class="admin-card-title">🌱 신규 가입</div>
      <div class="admin-card-3num">
        <div><div class="n">${nu.last_24h ?? 0}</div><div class="label">24h</div></div>
        <div><div class="n">${nu.last_7d ?? 0}</div><div class="label">7d</div></div>
        <div><div class="n">${nu.last_30d ?? 0}</div><div class="label">30d</div></div>
      </div>
    </div>
    <div class="admin-card">
      <div class="admin-card-title">🎯 어디서 왔어 (30d)</div>
      ${totalSrc === 0
        ? '<div style="color:var(--text-soft); font-size:11px; padding:8px 0;">데이터 X</div>'
        : `<div style="display:flex; gap:10px; align-items:center;">
            ${_renderSvgPie(slices, 80)}
            <div class="admin-pie-legend">
              ${slices.map(s => `<div><span style="display:inline-block; width:8px; height:8px; background:${s.color}; border-radius:50%; margin-right:4px;"></span>${escapeHtml(s.label)} <span style="color:var(--text-soft);">${s.value}</span></div>`).join('')}
            </div>
          </div>`}
    </div>
    <div class="admin-card">
      <div class="admin-card-title">🔀 source 별 전환</div>
      ${convRows
        ? `<div style="overflow-x:auto;"><table style="width:100%; font-size:10.5px;">
            <thead><tr style="color:var(--text-soft);"><th style="text-align:left; padding:3px 6px;">source</th><th style="text-align:right; padding:3px 6px;">가입</th><th style="text-align:right; padding:3px 6px;">첫 chat</th><th style="text-align:right; padding:3px 6px;">유료</th></tr></thead>
            <tbody>${convRows}</tbody>
          </table></div>`
        : '<div style="color:var(--text-soft); font-size:11px; padding:8px 0;">데이터 X</div>'}
    </div>
    <div class="admin-card">
      <div class="admin-card-title">📊 가입 funnel (30d)</div>
      ${funnelHtml || '<div style="color:var(--text-soft); font-size:11px;">데이터 X</div>'}
    </div>
  `;
}

// ─── B+E Activity + Retention (3 카드) ───
function _renderAdminCardActivity(act) {
  if (!act) return '';
  const dauValues = (act.dau_sparkline || []).map(d => d.value);
  const chatValues = (act.chat_sparkline || []).map(d => d.value);
  const chatTotal = chatValues.reduce((s, v) => s + v, 0);
  const chatAvg = chatValues.length > 0 ? (chatTotal / chatValues.length).toFixed(1) : '0';
  // retention 4x4 grid
  const cohorts = act.retention || [];
  const cohortHtml = cohorts.length > 0
    ? `<div class="admin-cohort-grid">
        <div style="font-weight:600; color:var(--text-soft); font-size:10px; padding:4px 2px;">cohort</div>
        <div style="font-weight:600; color:var(--text-soft); font-size:10px; padding:4px 2px; text-align:center;">D1</div>
        <div style="font-weight:600; color:var(--text-soft); font-size:10px; padding:4px 2px; text-align:center;">D7</div>
        <div style="font-weight:600; color:var(--text-soft); font-size:10px; padding:4px 2px; text-align:center;">D14</div>
        <div style="font-weight:600; color:var(--text-soft); font-size:10px; padding:4px 2px; text-align:center;">D30</div>
        ${cohorts.map(c => `
          <div style="font-size:10px; padding:5px 2px; color:var(--text-soft);">${escapeHtml(c.cohort)}<br><span style="font-size:9px;">(n=${c.size})</span></div>
          ${_retentionCell(c.d1)}${_retentionCell(c.d7)}${_retentionCell(c.d14)}${_retentionCell(c.d30)}
        `).join('')}
      </div>`
    : '<div style="color:var(--text-soft); font-size:11px; padding:8px 0;">cohort 데이터 부족</div>';
  return `
    <div class="admin-card">
      <div class="admin-card-title">🔴 활성 사용자</div>
      <div class="admin-card-3num">
        <div><div class="n">${act.dau ?? 0}</div><div class="label">DAU</div></div>
        <div><div class="n">${act.wau ?? 0}</div><div class="label">WAU</div></div>
        <div><div class="n">${act.mau ?? 0}</div><div class="label">MAU</div></div>
      </div>
      <div class="admin-card-sparkline">${_renderSvgSparkline(dauValues, 240, 36, 'var(--accent)')}</div>
    </div>
    <div class="admin-card" style="grid-column:span 2;">
      <div class="admin-card-title">📈 retention cohort (주별)</div>
      ${cohortHtml}
    </div>
    <div class="admin-card">
      <div class="admin-card-title">🐚 chat 활동 14일</div>
      <div class="admin-card-3num">
        <div><div class="n">${chatTotal}</div><div class="label">총</div></div>
        <div><div class="n">${chatAvg}</div><div class="label">일 평균</div></div>
      </div>
      <div class="admin-card-sparkline">${_renderSvgSparkline(chatValues, 240, 36, '#7ec8e3')}</div>
    </div>
  `;
}
function _retentionCell(v) {
  if (v === null || v === undefined) return `<div class="admin-cohort-cell" style="background:rgba(120,120,120,0.15); color:var(--text-dim);">—</div>`;
  const pct = Math.round(v * 100);
  // 색 gradient: 낮음 (#5a4a72) → 높음 (#d4a76a)
  const hue = Math.min(1, v * 1.5);  // 0~1
  const bg = `rgba(212, 167, 106, ${0.15 + hue * 0.6})`;
  return `<div class="admin-cohort-cell" style="background:${bg}; color:var(--text);">${pct}%</div>`;
}

// ─── C+D+F Revenue (4 카드) ───
function _renderAdminCardRevenue(r) {
  if (!r) return '';
  const planEmojiMap = { early_lifetime: '🐚', light: '🌊', premium: '✨', guest: '👤', free: '🆓' };
  const planLabelMap = { early_lifetime: 'Light', light: 'Plus', premium: 'Premium', guest: 'Guest', free: 'Free' };
  const planColors = { early_lifetime: '#c7b288', light: '#7e8acb', premium: '#d4a76a', guest: '#888', free: '#5a4a72' };
  const planSlices = (r.plan_distribution || []).map(p => ({
    label: `${planEmojiMap[p.plan] || '💎'} ${planLabelMap[p.plan] || p.plan}`,
    value: p.count,
    color: planColors[p.plan] || '#aaa'
  }));
  const totalPlan = planSlices.reduce((s, x) => s + x.value, 0);
  // 일별 매출 sparkline
  const revValues = (r.daily_revenue_sparkline || []).map(d => d.paid - d.refund);
  const revPaidTotal = (r.daily_revenue_sparkline || []).reduce((s, d) => s + d.paid, 0);
  const revRefundTotal = (r.daily_revenue_sparkline || []).reduce((s, d) => s + d.refund, 0);
  const trial = r.trial_conversion || {};
  const trialPct = trial.conversion_rate !== null && trial.conversion_rate !== undefined
    ? Math.round(trial.conversion_rate * 100) + '%'
    : '—';
  const fmtKrw = (n) => (Number(n) || 0).toLocaleString();
  return `
    <div class="admin-card">
      <div class="admin-card-title">💎 plan 분포 (active)</div>
      ${totalPlan === 0
        ? '<div style="color:var(--text-soft); font-size:11px; padding:8px 0;">데이터 X</div>'
        : `<div style="display:flex; gap:10px; align-items:center;">
            ${_renderSvgPie(planSlices, 80)}
            <div class="admin-pie-legend">
              ${planSlices.map(s => `<div><span style="display:inline-block; width:8px; height:8px; background:${s.color}; border-radius:50%; margin-right:4px;"></span>${s.label} <span style="color:var(--text-soft);">${s.value}</span></div>`).join('')}
            </div>
          </div>`}
    </div>
    <div class="admin-card">
      <div class="admin-card-title">💰 매출</div>
      <div class="admin-card-big">${fmtKrw(r.mrr_this_month_krw)}원</div>
      <div class="admin-card-delta">이번 달 (-환불 ${fmtKrw(r.refund_this_month_krw)}원)</div>
      <div style="font-size:11px; color:var(--text-soft); margin-top:8px;">다음 달 예상: <b style="color:var(--accent);">${fmtKrw(r.mrr_next_month_estimate_krw)}원</b></div>
    </div>
    <div class="admin-card">
      <div class="admin-card-title">📉 일별 매출 30d</div>
      <div class="admin-card-3num">
        <div><div class="n" style="font-size:16px;">${fmtKrw(revPaidTotal)}</div><div class="label">paid</div></div>
        <div><div class="n" style="font-size:16px; color:#d97a7a;">${fmtKrw(revRefundTotal)}</div><div class="label">refund</div></div>
        <div><div class="n" style="font-size:16px;">${fmtKrw(revPaidTotal - revRefundTotal)}</div><div class="label">net</div></div>
      </div>
      <div class="admin-card-sparkline">${_renderSvgSparkline(revValues, 240, 36, '#d4a76a')}</div>
    </div>
    <div class="admin-card">
      <div class="admin-card-title">🎁 trial → 정가</div>
      <div class="admin-card-big">${trialPct}</div>
      <div class="admin-card-delta">시작 ${trial.started ?? 0} / 만료 ${trial.expired ?? 0} / 정가 ${trial.converted ?? 0}</div>
    </div>
  `;
}

// ─── G+H+I Cost + Quota + Feedback (3 카드) ───
function _renderAdminCardCost(c) {
  if (!c) return '';
  const fmtUsd = (n) => '$' + (Number(n) || 0).toFixed(2);
  const fmtKrw = (n) => Math.round((Number(n) || 0) * 1400).toLocaleString();
  const deltaPct = c.yesterday_usd > 0
    ? Math.round(((c.today_usd - c.yesterday_usd) / c.yesterday_usd) * 100)
    : null;
  const deltaCls = deltaPct === null ? '' : (deltaPct >= 0 ? 'up' : 'down');
  const deltaText = deltaPct === null ? '어제 0' : `어제 대비 ${deltaPct >= 0 ? '+' : ''}${deltaPct}%`;
  // quota distribution bar
  const qd = c.quota_distribution || {};
  const qOrder = ['0-25%', '25-50%', '50-75%', '75-95%', '95%+'];
  const qTotal = qOrder.reduce((s, k) => s + (qd[k] || 0), 0);
  const qColors = ['#6abf69', '#a89dc8', '#c7b288', '#d4a76a', '#d97a7a'];
  const qBar = qTotal === 0
    ? '<div style="color:var(--text-soft); font-size:11px;">활성 구독자 데이터 X</div>'
    : `<div style="display:flex; height:14px; border-radius:4px; overflow:hidden; background:var(--card-bg);">
        ${qOrder.map((k, i) => {
          const v = qd[k] || 0;
          const pct = qTotal > 0 ? (v / qTotal) * 100 : 0;
          return pct > 0 ? `<div style="background:${qColors[i]}; width:${pct}%;" title="${k}: ${v}명"></div>` : '';
        }).join('')}
      </div>
      <div style="font-size:10px; color:var(--text-soft); margin-top:4px; display:flex; gap:8px; flex-wrap:wrap;">
        ${qOrder.map((k, i) => `<span><span style="display:inline-block; width:7px; height:7px; background:${qColors[i]}; border-radius:50%; margin-right:3px;"></span>${k} ${qd[k] || 0}</span>`).join('')}
      </div>`;
  // 도달 사용자 list (95%+)
  const toppedList = (c.quota_topped_users || []).slice(0, 5);
  // endpoint cost top 5
  const epList = (c.by_endpoint || []).map(e => `<div style="display:flex; justify-content:space-between; font-size:10.5px; padding:2px 0;"><span style="color:var(--text-soft);">${escapeHtml(e.endpoint)}</span><span>${fmtUsd(e.cost)}</span></div>`).join('');
  return `
    <div class="admin-card" style="grid-column:span 2;">
      <div class="admin-card-title">🤖 AI 비용</div>
      <div style="display:flex; gap:16px; align-items:baseline; flex-wrap:wrap;">
        <div>
          <div class="admin-card-big">${fmtUsd(c.today_usd)}</div>
          <div class="admin-card-delta ${deltaCls}">오늘 · ${deltaText}</div>
        </div>
        <div style="border-left:1px solid var(--border); padding-left:16px;">
          <div style="font-size:18px; font-weight:600;">${fmtUsd(c.this_month_usd)}</div>
          <div style="font-size:10.5px; color:var(--text-soft);">이번 달 (≈${fmtKrw(c.this_month_usd)}원)</div>
        </div>
      </div>
      ${epList ? `<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border);">${epList}</div>` : ''}
    </div>
    <div class="admin-card">
      <div class="admin-card-title">⚠ daily quota 도달</div>
      ${qBar}
      ${toppedList.length > 0
        ? `<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border); font-size:10.5px;">
            <div style="color:var(--text-soft); margin-bottom:4px;">95%+ 도달 사용자:</div>
            ${toppedList.map(e => `<div style="color:var(--text);">${escapeHtml(e)}</div>`).join('')}
          </div>`
        : ''}
    </div>
  `;
}

function _renderAdminCardFeedback(f) {
  if (!f) return '';
  const recent = f.recent_open || [];
  return `
    <div class="admin-card">
      <div class="admin-card-title">📬 피드백 (open)</div>
      <div class="admin-card-3num">
        <div><div class="n" style="color:${f.open_count > 0 ? '#d4a76a' : 'var(--text-soft)'};">${f.open_count ?? 0}</div><div class="label">open</div></div>
        <div><div class="n" style="font-size:18px; color:var(--text-soft);">${f.replied_count ?? 0}</div><div class="label">replied</div></div>
      </div>
      ${recent.length > 0
        ? `<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border);">
            ${recent.map(r => `<div class="admin-feedback-row"><div class="user">${escapeHtml(r.user_email || '익명')}</div><div>${escapeHtml(r.message_preview || '')}</div></div>`).join('')}
          </div>`
        : '<div style="color:var(--text-soft); font-size:11px; margin-top:8px;">open 0</div>'}
      <button class="btn-secondary" style="width:100%; margin-top:10px; padding:6px; font-size:11px;" onclick="closeAdminAnalyticsDashboard(); openAdminFeedbackInbox();">전체 보기</button>
    </div>
  `;
}

// ─── SVG 헬퍼 ───
function _renderSvgSparkline(values, w, h, color) {
  if (!values || values.length === 0) return '';
  const max = Math.max(1, ...values);
  const min = 0;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  // area fill 도 추가 (밑에 옅게)
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px; display:block;">
    <polyline points="${areaPoints}" fill="${color}" fill-opacity="0.12" stroke="none"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function _renderSvgPie(slices, size) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return '';
  const r = size / 2;
  const cx = r, cy = r;
  let startAngle = -Math.PI / 2;
  const paths = slices.map(slice => {
    const angle = (slice.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    // 단일 slice (1개) 처리 — 원
    let d;
    if (slices.length === 1) {
      d = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
    } else {
      d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    }
    startAngle = endAngle;
    return `<path d="${d}" fill="${slice.color}" stroke="var(--bg)" stroke-width="1"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px; height:${size}px; flex-shrink:0;">${paths}</svg>`;
}
