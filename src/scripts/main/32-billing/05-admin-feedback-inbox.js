// 사용자 요청 2026-04-30: admin 피드백 답변 inbox — ADMIN_USER_ID env 적용된 사용자만 동작 (jade6679@naver.com).
async function refreshAdminFeedbackButton() {
  const btn = document.getElementById('adminFeedbackBtn');
  if (!btn) return;
  try {
    const resp = await _authedFetch('/api/admin/feedback-list?status=open', {
      headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
    });
    if (resp.status === 403) { btn.style.display = 'none'; return; }
    if (!resp.ok) { btn.style.display = 'none'; return; }
    const data = await resp.json();
    const openCount = (data.feedback || []).length;
    btn.style.display = 'block';
    btn.innerHTML = `🛠 관리자 — 피드백 답변${openCount > 0 ? ` <span style="margin-left:6px; background:#e89090; color:#fff; padding:1px 6px; border-radius:8px; font-size:10px; font-weight:700;">${openCount}</span>` : ''}`;
  } catch { btn.style.display = 'none'; }
}

async function openAdminFeedbackInbox() {
  if (document.getElementById('adminFeedbackOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'adminFeedbackOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:560px; max-height:88vh; overflow-y:auto; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">🛠 관리자 — 피드백 답변</div>
      <div style="margin-bottom:12px; display:flex; gap:6px;">
        <button class="btn-secondary" onclick="adminFeedbackLoad('open')" style="flex:1; font-size:11px; padding:6px 8px;">미답변</button>
        <button class="btn-secondary" onclick="adminFeedbackLoad('replied')" style="flex:1; font-size:11px; padding:6px 8px;">답변 완료</button>
        <button class="btn-secondary" onclick="adminFeedbackLoad('all')" style="flex:1; font-size:11px; padding:6px 8px;">전체</button>
      </div>
      <div id="adminFeedbackBody" style="font-size:12px; color:var(--text-dim); line-height:1.7;">불러오는 중...</div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn-secondary" onclick="closeAdminFeedbackInbox()" style="flex:1;">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  await adminFeedbackLoad('open');
}

function closeAdminFeedbackInbox() {
  const overlay = document.getElementById('adminFeedbackOverlay');
  if (overlay) overlay.remove();
}

async function adminFeedbackLoad(filter) {
  const body = document.getElementById('adminFeedbackBody');
  if (!body) return;
  body.innerHTML = '<span style="color:var(--text-soft);">불러오는 중...</span>';
  try {
    const resp = await _authedFetch('/api/admin/feedback-list?status=' + encodeURIComponent(filter), {
      headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
    });
    if (!resp.ok) {
      // 사용자 보고 2026-04-30 ultrathink-2: 'table 없음' 패턴이면 친화적 셋업 카드 + 복사 가능 SQL.
      let errData = null;
      try { errData = await resp.json(); } catch {}
      const hintTxt = (errData && errData.hint) || '';
      const upBody  = (errData && errData.upstream_body) || '';
      const tableMissing = /0003_feedback\.sql|PGRST205|relation .* does not exist|Could not find the table/i.test(hintTxt + '\n' + upBody);
      if (tableMissing) {
        body.innerHTML = `
          <div style="padding:16px; background:rgba(212,167,106,0.08); border:1px solid rgba(212,167,106,0.40); border-radius:10px;">
            <div style="font-size:14px; font-weight:600; color:var(--accent); margin-bottom:8px;">🛠 셋업 미완 — soragodong_feedback table 없음</div>
            <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:12px;">
              피드백 답변 기능을 쓰려면 Supabase에서 <b>0003_feedback.sql</b>을 실행해야 해.<br>
              <span style="color:var(--text-soft);">(앱 사용자 입장에선 이 기능 안 보임 — admin 전용)</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); line-height:1.85; margin-bottom:12px;">
              <b>📋 단계</b>:<br>
              1. Supabase Dashboard 열기 (<a href="https://supabase.com/dashboard" target="_blank" style="color:var(--accent);">supabase.com/dashboard</a>) → 프로젝트 선택<br>
              2. 좌측 <b>SQL Editor</b> → <b>+ New query</b><br>
              3. 아래 SQL 복사해서 붙여넣기 → <b>Run</b><br>
              4. 새로고침 후 다시 진입
            </div>
            <textarea id="adminFeedbackSqlBox" readonly style="width:100%; height:160px; font-family:monospace; font-size:10px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text); white-space:pre; overflow:auto;">CREATE TABLE IF NOT EXISTS soragodong_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON soragodong_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON soragodong_feedback(user_id, created_at DESC);
ALTER TABLE soragodong_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own feedback" ON soragodong_feedback;
CREATE POLICY "users read own feedback"
  ON soragodong_feedback FOR SELECT
  USING (auth.uid() = user_id);</textarea>
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button class="btn-primary" onclick="(function(){var t=document.getElementById('adminFeedbackSqlBox');t.select();navigator.clipboard.writeText(t.value).then(()=>showToast('📋 SQL 복사됨 — Supabase Dashboard에 붙여넣어'));})()" style="flex:1; font-size:11px;">📋 SQL 복사</button>
              <button class="btn-secondary" onclick="adminFeedbackLoad('open')" style="flex:1; font-size:11px;">↻ 다시 시도</button>
            </div>
          </div>`;
        return;
      }
      // 그 외 에러는 server diagnostic 그대로 노출 (a35d8cd 흐름 유지)
      let serverMsg = '';
      if (errData) {
        serverMsg = errData.error || '';
        if (errData.upstream_status) serverMsg += ` (upstream ${errData.upstream_status})`;
        if (errData.hint) serverMsg += ` — ${errData.hint}`;
        if (errData.upstream_body) serverMsg += `\n${(errData.upstream_body || '').slice(0, 200)}`;
      }
      body.innerHTML = `<div style="color:#e89090; white-space:pre-wrap; font-size:11px; padding:10px; background:rgba(220,80,80,0.05); border:1px solid rgba(220,80,80,0.30); border-radius:8px;">실패 (${resp.status})${serverMsg ? '\n\n' + escapeHtml(serverMsg) : ''}</div>`;
      return;
    }
    const data = await resp.json();
    const list = data.feedback || [];
    if (list.length === 0) {
      body.innerHTML = '<span style="color:var(--text-soft);">표시할 피드백 X</span>';
      return;
    }
    body.innerHTML = list.map(f => {
      const dt = new Date(f.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      // 사용자 명시 2026-05-02: '[🐛 자동 오류 보고]' prefix 자동 식별 → 빨간 border 강조 + 🐛 라벨.
      const isErrorReport = (f.message || '').startsWith('[🐛 자동 오류 보고]');
      const replyHtml = f.admin_reply
        ? `<div style="margin-top:8px; padding:8px 10px; background:rgba(143,200,143,0.08); border-left:3px solid rgba(143,200,143,0.40); border-radius:6px;">
             <div style="font-size:10px; color:#9ed4a0; font-weight:600; margin-bottom:4px;">답변됨 · ${f.replied_at ? new Date(f.replied_at).toLocaleString('ko-KR') : ''}</div>
             <div style="white-space:pre-wrap; color:var(--text);">${escapeHtml(f.admin_reply)}</div>
           </div>`
        : `<div style="margin-top:8px;">
             <textarea id="adminReplyInput_${f.id}" rows="3" placeholder="답변 작성..." style="width:100%; font-size:12px; padding:8px;"></textarea>
             <button class="btn-primary" onclick="adminFeedbackSubmitReply(${f.id})" style="margin-top:6px; font-size:11px; padding:6px 12px;">답변 보내기</button>
           </div>`;
      const containerStyle = isErrorReport
        ? 'margin-bottom:14px; padding:12px; background:rgba(220,80,80,0.05); border:1px solid rgba(232,163,163,0.40); border-left:3px solid #e8a3a3; border-radius:8px;'
        : 'margin-bottom:14px; padding:12px; background:var(--surface); border-radius:8px;';
      const errorTag = isErrorReport
        ? `<span style="display:inline-block; padding:1px 7px; background:rgba(232,163,163,0.15); color:#e8a3a3; border-radius:6px; font-size:9.5px; font-weight:700; letter-spacing:0.04em; margin-right:6px;">🐛 자동 오류</span>`
        : '';
      return `
        <div style="${containerStyle}">
          <div style="font-size:10px; color:var(--text-soft); margin-bottom:4px;">
            ${errorTag}${dt} · ${escapeHtml(f.user_email || '익명')} · #${f.id}
          </div>
          <div style="white-space:pre-wrap; color:var(--text); margin-bottom:6px; ${isErrorReport ? 'font-family:monospace; font-size:11.5px; max-height:240px; overflow-y:auto;' : ''}">${escapeHtml(f.message)}</div>
          ${replyHtml}
        </div>
      `;
    }).join('');
  } catch (e) {
    body.innerHTML = '<span style="color:#e89090;">예외: ' + (e.message || e) + '</span>';
  }
}

async function adminFeedbackSubmitReply(feedbackId) {
  const ta = document.getElementById('adminReplyInput_' + feedbackId);
  if (!ta) return;
  const reply = ta.value.trim();
  if (!reply) { showToast('답변 내용 없음'); return; }
  try {
    const resp = await _authedFetch('/api/admin/feedback-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ feedback_id: feedbackId, reply })
    });
    if (resp.ok) {
      showToast('✓ 답변 완료');
      adminFeedbackLoad('open');
      refreshAdminFeedbackButton();
    } else {
      const t = await resp.text();
      alert('실패: ' + t.slice(0, 200));
    }
  } catch (e) {
    alert('예외: ' + (e.message || e));
  }
}

