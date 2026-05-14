// V4 (사용자 명시 2026-05-14 ultrathink): 진주 탭 안 '티켓' / '책' 카드 렌더 헬퍼.
//   renderLensPearls 가 호출. 사진 dominant + sub-type emoji overlay + 제목 + 날짜.
//   책: 표지 dominant + 제목 + 한 줄 감상평. 클릭 → openBookReviewFullscreen.

function _renderTicketCardHTML(pearl, opts) {
  opts = opts || {};
  const sub = (typeof _findTicketSubType === 'function') ? _findTicketSubType(pearl.subType) : null;
  const emoji = sub?.emoji || '🎫';
  const label = sub?.label || '티켓';
  const title = pearl.content || pearl.bookTitle || label;
  const dateStr = pearl.eventDate
    ? new Date(pearl.eventDate + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    : (pearl.createdAt ? new Date(pearl.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '');
  const sizeClass = opts.large ? ' tile-large' : '';
  if (pearl.photo) {
    return `
      <div class="ticket-card${sizeClass}" onclick="openPearl('${pearl.id}')" style="background-image:url('${pearl.photo}');">
        <div class="tc-subtype">${emoji} ${escapeHtml(label)}</div>
        <div class="tc-title">${escapeHtml(title)}<div class="tc-date">${dateStr}</div></div>
      </div>
    `;
  }
  return `
    <div class="ticket-card ticket-card-empty${sizeClass}" onclick="openPearl('${pearl.id}')">
      <div class="tc-emoji-big">${emoji}</div>
      <div class="tc-subtype">${escapeHtml(label)}</div>
      <div class="tc-title">${escapeHtml(title)}<div class="tc-date">${dateStr}</div></div>
    </div>
  `;
}

function _renderBookCardHTML(pearl, opts) {
  opts = opts || {};
  const title = pearl.bookTitle || pearl.content || '책';
  const oneLiner = pearl.content || '';
  const sizeClass = opts.large ? ' tile-large' : '';
  if (pearl.photo) {
    return `
      <div class="book-card${sizeClass}" onclick="openBookReviewFullscreen('${pearl.id}')" style="background-image:url('${pearl.photo}');">
        <div class="bc-overlay">
          <div class="bc-title">${escapeHtml(title)}</div>
          ${oneLiner ? `<div class="bc-one-liner">${escapeHtml(oneLiner)}</div>` : ''}
        </div>
      </div>
    `;
  }
  return `
    <div class="book-card book-card-empty${sizeClass}" onclick="openBookReviewFullscreen('${pearl.id}')">
      <div class="bc-emoji-big">📚</div>
      <div class="bc-overlay">
        <div class="bc-title">${escapeHtml(title)}</div>
        ${oneLiner ? `<div class="bc-one-liner">${escapeHtml(oneLiner)}</div>` : ''}
      </div>
    </div>
  `;
}

// V4 (사용자 명시 2026-05-14 ultrathink): 진주 탭 카테고리 chip 분기 — 7개 (음악/음식/장소/순간/사람/티켓/책).
//   '티켓' 선택 시 sub-filter chip row (enabled ticketSubTypes) 노출.
let _ticketSubFilter = null;
function setTicketSubFilter(id) {
  _ticketSubFilter = (_ticketSubFilter === id) ? null : id;
  if (typeof renderLensPearls === 'function') renderLensPearls();
}

function _renderTicketSubFilterRow() {
  if (typeof _pearlCatFilter !== 'undefined' && _pearlCatFilter !== '티켓') return '';
  if (typeof _getTicketSubTypes !== 'function') return '';
  const subs = _getTicketSubTypes().filter(s => s.enabled);
  let html = `<div class="subtype-filter-row">`;
  html += `<div class="stf-chip${!_ticketSubFilter ? ' active' : ''}" onclick="setTicketSubFilter(null)">전체</div>`;
  subs.forEach(s => {
    const active = _ticketSubFilter === s.id ? ' active' : '';
    html += `<div class="stf-chip${active}" onclick="setTicketSubFilter('${s.id}')">${s.emoji} ${escapeHtml(s.label)}</div>`;
  });
  html += `<div class="stf-chip stf-manage" onclick="openTicketSubTypeManager()" title="티켓 종류 관리">⚙️</div>`;
  html += `</div>`;
  return html;
}

// V4 (사용자 명시 2026-05-14 ultrathink): 티켓 sub-type 관리 modal — ON/OFF 토글 + 신규 추가.
function openTicketSubTypeManager() {
  if (document.getElementById('ticketSubTypeManager')) return;
  // 사용자 데이터 ticketSubTypes 가 없으면 default 6개 강제 초기화.
  if (!Array.isArray(state.preferences.ticketSubTypes) || state.preferences.ticketSubTypes.length === 0) {
    state.preferences.ticketSubTypes = _TICKET_DEFAULT_SUB_TYPES.slice();
    saveState();
  }
  _renderTicketSubTypeManager();
}

function _renderTicketSubTypeManager() {
  const existing = document.getElementById('ticketSubTypeManager');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'ticketSubTypeManager';
  overlay.className = 'tsm-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeTicketSubTypeManager(); };

  const subs = state.preferences.ticketSubTypes;
  let listHtml = '';
  subs.forEach((s, i) => {
    listHtml += `
      <div class="tsm-row">
        <span class="tsm-emoji">${s.emoji}</span>
        <span class="tsm-label">${escapeHtml(s.label)}</span>
        <label class="tsm-toggle">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="_toggleTicketSubType(${i})">
          <span class="tsm-toggle-track"></span>
        </label>
        <button class="tsm-del" onclick="_deleteTicketSubType(${i})" aria-label="삭제">🗑</button>
      </div>
    `;
  });

  overlay.innerHTML = `
    <div class="tsm-modal" onclick="event.stopPropagation()">
      <div class="tsm-header">
        <div class="tsm-title">🎫 티켓 종류 관리</div>
        <button class="tsm-close" onclick="closeTicketSubTypeManager()">×</button>
      </div>
      <div class="tsm-list">${listHtml}</div>
      <div class="tsm-add-row">
        <input type="text" id="tsmAddEmoji" maxlength="3" placeholder="🎯" class="tsm-add-emoji">
        <input type="text" id="tsmAddLabel" maxlength="20" placeholder="예: PT 경기" class="tsm-add-label">
        <button class="tsm-add-btn" onclick="_addTicketSubType()">+ 추가</button>
      </div>
      <div class="tsm-hint">OFF 한 종류 — 새 저장 모달에서 안 보임. 기존 진주는 그대로 남음.</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeTicketSubTypeManager() {
  const el = document.getElementById('ticketSubTypeManager');
  if (el) el.remove();
}

function _toggleTicketSubType(idx) {
  const arr = state.preferences.ticketSubTypes;
  if (!arr || !arr[idx]) return;
  arr[idx].enabled = !arr[idx].enabled;
  saveState();
  if (typeof renderLensPearls === 'function') renderLensPearls();
}

function _deleteTicketSubType(idx) {
  const arr = state.preferences.ticketSubTypes;
  if (!arr || !arr[idx]) return;
  // 사용 중인 sub-type 인지 검사 — 데이터 보호 (필터에서만 빠짐, 진주는 그대로).
  const id = arr[idx].id;
  arr.splice(idx, 1);
  saveState();
  _renderTicketSubTypeManager();
  if (typeof renderLensPearls === 'function') renderLensPearls();
  showToast('종류 삭제됨 (기존 티켓은 그대로 남아 있어)');
}

function _addTicketSubType() {
  const emojiEl = document.getElementById('tsmAddEmoji');
  const labelEl = document.getElementById('tsmAddLabel');
  const emoji = (emojiEl?.value || '').trim() || '🎯';
  const label = (labelEl?.value || '').trim();
  if (!label) { showToast('이름을 적어줘'); return; }
  if (label.length > 20) { showToast('이름이 너무 길어'); return; }
  const id = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
  state.preferences.ticketSubTypes = state.preferences.ticketSubTypes || [];
  state.preferences.ticketSubTypes.push({ id, label, emoji, enabled: true });
  saveState();
  _renderTicketSubTypeManager();
  if (typeof renderLensPearls === 'function') renderLensPearls();
}

