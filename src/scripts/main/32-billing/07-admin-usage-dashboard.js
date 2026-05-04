// ─── admin: 사용량 분석 dashboard (사용자 명시 2026-05-02 ultrathink) ───
// soragodong_usage 테이블 집계 → endpoint / model / 일자 / 사용자 별 비용 분포.
// 절감 우선순위 결정 + Phase 적용 후 효과 검증 도구.
async function openAdminUsageDashboard() {
  if (!_isAdmin()) { showToast('관리자 전용'); return; }
  if (document.getElementById('adminUsageOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'adminUsageOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:680px; max-height:88vh; overflow-y:auto; padding:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div style="font-size:16px; font-weight:700; color:var(--text);">📊 사용량 분석</div>
        <button onclick="closeAdminUsageDashboard()" style="background:transparent; border:none; font-size:20px; color:var(--text-soft); cursor:pointer;">✕</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; align-items:center;">
        <label style="font-size:12px; color:var(--text-soft);">기간:</label>
        <select id="adminUsageDays" onchange="_loadUsageSummary()" style="padding:4px 8px; font-size:12px;">
          <option value="7" selected>최근 7일</option>
          <option value="30">최근 30일</option>
          <option value="90">최근 90일</option>
        </select>
        <label style="font-size:12px; color:var(--text-soft); margin-left:8px;">분류:</label>
        <select id="adminUsageGroupBy" onchange="_loadUsageSummary()" style="padding:4px 8px; font-size:12px;">
          <option value="endpoint" selected>endpoint</option>
          <option value="model">model</option>
          <option value="day">일자</option>
          <option value="user">사용자</option>
        </select>
      </div>
      <div id="adminUsageContent" style="font-size:12px;">불러오는 중...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  _loadUsageSummary();
}
function closeAdminUsageDashboard() {
  const o = document.getElementById('adminUsageOverlay');
  if (o) o.remove();
}
async function _loadUsageSummary() {
  const container = document.getElementById('adminUsageContent');
  if (!container) return;
  const days = parseInt(document.getElementById('adminUsageDays')?.value || '7', 10);
  const groupBy = document.getElementById('adminUsageGroupBy')?.value || 'endpoint';
  container.innerHTML = '<span style="color:var(--text-soft);">불러오는 중...</span>';
  try {
    const resp = await _authedFetch('/api/admin/usage-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ days, group_by: groupBy })
    });
    if (resp.status === 403) {
      container.innerHTML = '<span style="color:var(--text-soft);">관리자 권한 X (env ADMIN_USER_ID)</span>';
      return;
    }
    if (!resp.ok) {
      const r = await resp.json().catch(() => ({}));
      container.innerHTML = `<span style="color:#e89090;">실패 (${resp.status}) ${r.error || ''}</span>`;
      return;
    }
    const data = await resp.json();
    if (!data.ok) {
      container.innerHTML = `<span style="color:#e89090;">${escapeHtml(data.reason || '실패')}</span>`;
      return;
    }
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const total = data.total || {};
    if (rows.length === 0) {
      container.innerHTML = '<span style="color:var(--text-soft);">데이터 X (해당 기간 호출 0)</span>';
      return;
    }
    const fmtKrw = (usd) => Math.round((Number(usd) || 0) * 1400).toLocaleString();
    const fmtTok = (n) => (Number(n) || 0).toLocaleString();
    const cacheRatio = (r) => {
      const inT = Number(r.input_tokens) || 0;
      const cacheT = Number(r.cache_read_tokens) || 0;
      if (inT + cacheT === 0) return '—';
      return Math.round((cacheT / (inT + cacheT)) * 100) + '%';
    };
    let html = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border); text-align:left;">
              <th style="padding:6px 4px;">${groupBy === 'endpoint' ? 'endpoint' : groupBy === 'model' ? 'model' : groupBy === 'day' ? '일자' : '사용자 ID'}</th>
              <th style="padding:6px 4px; text-align:right;">호출</th>
              <th style="padding:6px 4px; text-align:right;">input</th>
              <th style="padding:6px 4px; text-align:right;">output</th>
              <th style="padding:6px 4px; text-align:right;">cache hit</th>
              <th style="padding:6px 4px; text-align:right;">USD</th>
              <th style="padding:6px 4px; text-align:right;">≈KRW</th>
            </tr>
          </thead>
          <tbody>
    `;
    rows.forEach(r => {
      const keyDisplay = groupBy === 'user' ? String(r.key || '').slice(0, 8) + '…' : escapeHtml(String(r.key || ''));
      html += `
        <tr style="border-bottom:1px solid var(--border-soft);">
          <td style="padding:5px 4px;"><code>${keyDisplay}</code></td>
          <td style="padding:5px 4px; text-align:right;">${fmtTok(r.calls)}</td>
          <td style="padding:5px 4px; text-align:right; color:var(--text-soft);">${fmtTok(r.input_tokens)}</td>
          <td style="padding:5px 4px; text-align:right; color:var(--text-soft);">${fmtTok(r.output_tokens)}</td>
          <td style="padding:5px 4px; text-align:right; color:#9ed4a0;">${cacheRatio(r)}</td>
          <td style="padding:5px 4px; text-align:right;">$${(Number(r.cost_usd) || 0).toFixed(4)}</td>
          <td style="padding:5px 4px; text-align:right;"><b>${fmtKrw(r.cost_usd)}</b>원</td>
        </tr>
      `;
    });
    html += `
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border); font-weight:600;">
              <td style="padding:8px 4px;">합계</td>
              <td style="padding:8px 4px; text-align:right;">${fmtTok(total.calls)}</td>
              <td style="padding:8px 4px; text-align:right;">${fmtTok(total.input_tokens)}</td>
              <td style="padding:8px 4px; text-align:right;">${fmtTok(total.output_tokens)}</td>
              <td style="padding:8px 4px; text-align:right; color:#9ed4a0;">${cacheRatio(total)}</td>
              <td style="padding:8px 4px; text-align:right;">$${(Number(total.cost_usd) || 0).toFixed(4)}</td>
              <td style="padding:8px 4px; text-align:right;">${fmtKrw(total.cost_usd)}원</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="margin-top:10px; font-size:10.5px; color:var(--text-soft);">
        cutoff: ${escapeHtml(data.cutoff || '?')} · KRW = USD × 1,400
      </div>
    `;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<span style="color:#e89090;">예외: ${escapeHtml(String(e.message || e))}</span>`;
  }
}

