// ─── 피드백 / 문의 (오픈채팅 + 인앱 메시지) ───
function openFeedbackKakao_legacy_anchor() { /* anchor — 아래 함수가 곧 시작 */ }
// 사용자 요청 2026-04-30: 피드백·문의 — 카톡 오픈채팅 + 인앱 메시지.
function openFeedbackKakao() {
  if (!KAKAO_OPEN_CHAT || KAKAO_OPEN_CHAT.includes('[TBD')) {
    alert('카톡 오픈채팅 링크가 아직 들어가 있지 않아요. 잠시 후 다시 시도해주세요.');
    return;
  }
  window.open(KAKAO_OPEN_CHAT, '_blank');
}

function openFeedbackInApp() {
  if (document.getElementById('feedbackOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'feedbackOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:380px; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">✉️ 메세지 보내기</div>
      <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        뭐든 편하게 적어줘! 버그·아이디어·잡담 다 OK 🐚<br>
        <span style="color:var(--text-soft);">답변 시 이 앱에서 바로 받아볼 수 있어 (설정 → 받은 답변).</span>
      </div>
      <textarea id="feedbackMessageInput" rows="6" placeholder="자유롭게 적어줘..." maxlength="2000" style="width:100%; font-size:12px; padding:10px; resize:vertical;"></textarea>
      <div style="font-size:10px; color:var(--text-soft); margin-top:6px;">최대 2000자</div>
      <div id="feedbackStatus" style="font-size:11px; margin-top:10px; min-height:14px;"></div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn-primary" onclick="submitFeedback()" style="flex:1;">보내기 ✦</button>
        <button class="btn-secondary" onclick="closeFeedbackModal()" style="flex:1;">나중에</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('feedbackMessageInput')?.focus(), 100);
}

function closeFeedbackModal() {
  const overlay = document.getElementById('feedbackOverlay');
  if (overlay) overlay.remove();
}

async function submitFeedback() {
  const ta = document.getElementById('feedbackMessageInput');
  const status = document.getElementById('feedbackStatus');
  if (!ta || !status) return;
  const msg = ta.value.trim();
  if (msg.length < 5) {
    status.textContent = '5자 이상 적어주세요';
    status.style.color = '#e89090';
    return;
  }
  status.textContent = '보내는 중...';
  status.style.color = 'var(--text-soft)';
  try {
    const resp = await _authedFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ message: msg })
    });
    if (resp.ok) {
      status.textContent = '✓ 잘 받았어! 고마워 🐚';
      status.style.color = '#9ed4a0';
      setTimeout(() => closeFeedbackModal(), 1500);
    } else {
      status.textContent = '오류 났어 😢 카톡으로 보내줄래?';
      status.style.color = '#e89090';
    }
  } catch (e) {
    status.textContent = '오류: ' + (e.message || e);
    status.style.color = '#e89090';
  }
}

// 사용자 요청 2026-04-30: 인앱 피드백 inbox — RLS 직접 SELECT (본인 row만).
async function fetchMyFeedback() {
  if (!authUserId || !session?.access_token) return [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_feedback?user_id=eq.${authUserId}&select=*&order=created_at.desc&limit=100`,
      { headers: authHeaders() }
    );
    if (!resp.ok) return [];
    return await resp.json() || [];
  } catch (e) { console.warn('fetchMyFeedback:', e); return []; }
}

function _getReadFeedbackIds() {
  try {
    const raw = localStorage.getItem('soragodong_v4_feedback_read');
    return new Set(JSON.parse(raw || '[]'));
  } catch { return new Set(); }
}

function _markFeedbackRead(ids) {
  try {
    const set = _getReadFeedbackIds();
    for (const id of ids) set.add(id);
    localStorage.setItem('soragodong_v4_feedback_read', JSON.stringify([...set]));
  } catch {}
}
