// 미읽음 답변 수 — Settings 진입 / 주기 갱신
async function refreshFeedbackUnreadBadge() {
  const badge = document.getElementById('myFeedbackUnreadBadge');
  if (!badge) return;
  try {
    const list = await fetchMyFeedback();
    const read = _getReadFeedbackIds();
    const unread = list.filter(f => f.admin_reply && !read.has(f.id));
    if (unread.length > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = String(unread.length);
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

async function openMyFeedbackInbox() {
  if (document.getElementById('myFeedbackInboxOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'myFeedbackInboxOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:480px; max-height:85vh; overflow-y:auto; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">📬 받은 답변</div>
      <div id="myFeedbackInboxBody" style="font-size:12px; color:var(--text-dim); line-height:1.7;">불러오는 중...</div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn-secondary" onclick="closeMyFeedbackInbox()" style="flex:1;">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const list = await fetchMyFeedback();
  const body = document.getElementById('myFeedbackInboxBody');
  if (!body) return;
  if (list.length === 0) {
    body.innerHTML = '<span style="color:var(--text-soft);">아직 보낸 메시지가 없어 🐚</span>';
    return;
  }
  body.innerHTML = list.map(f => {
    const dt = new Date(f.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const replyHtml = f.admin_reply
      ? `<div style="margin-top:10px; padding:10px 12px; background:rgba(143,200,143,0.08); border-left:3px solid rgba(143,200,143,0.40); border-radius:6px;">
           <div style="font-size:10px; color:#9ed4a0; font-weight:600; margin-bottom:4px;">🐚 소라고동 답변 · ${f.replied_at ? new Date(f.replied_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric' }) : ''}</div>
           <div style="white-space:pre-wrap; color:var(--text);">${escapeHtml(f.admin_reply)}</div>
         </div>`
      : `<div style="margin-top:10px; font-size:10.5px; color:var(--text-soft);">⏳ 아직 답변 안 왔음</div>`;
    return `
      <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:10px; color:var(--text-soft); margin-bottom:4px;">${dt}</div>
        <div style="white-space:pre-wrap; color:var(--text);">${escapeHtml(f.message)}</div>
        ${replyHtml}
      </div>
    `;
  }).join('');
  // mark all replied as read
  const replied = list.filter(f => f.admin_reply).map(f => f.id);
  if (replied.length > 0) {
    _markFeedbackRead(replied);
    refreshFeedbackUnreadBadge();
  }
}

function closeMyFeedbackInbox() {
  const overlay = document.getElementById('myFeedbackInboxOverlay');
  if (overlay) overlay.remove();
}

