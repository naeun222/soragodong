// V4 (사용자 명시 2026-05-14 ultrathink): 진주 탭 안 '티켓' / '책' 카드 렌더 헬퍼.
//   renderLensPearls 가 호출. 사진 dominant + sub-type emoji overlay + 제목 + 날짜.
//   책: 표지 dominant + 제목 + 한 줄 감상평. 클릭 → openBookReviewFullscreen.

// V4 (사용자 명시 2026-05-14): ticket/book 카드 = .pinterest-tile.tile-photo 패턴 (사진 위 + 메타 아래 분리).
//   기존 진주 UI 일관 — 사진은 위, 글은 사진 밑에. ticket sub-type 만 사진 위 chip overlay.
function _renderTicketCardHTML(pearl, opts) {
  opts = opts || {};
  const sub = (typeof _findTicketSubType === 'function') ? _findTicketSubType(pearl.subType) : null;
  const emoji = sub?.emoji || '🎫';
  const label = sub?.label || '티켓';
  const title = pearl.content || pearl.bookTitle || label;
  const venue = (pearl.venue || '').trim();
  const note = (pearl.note || '').trim();
  const dateStr = pearl.eventDate
    ? new Date(pearl.eventDate + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    : (pearl.createdAt ? new Date(pearl.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '');
  const sizeClass = opts.large ? ' tile-large' : '';
  const subChip = `<div class="tc-subtype">${emoji} ${escapeHtml(label)}</div>`;
  // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — pearlImgHtml 이 옛 dataURL / 신 storageKey 자동 분기.
  const photoImg = pearlImgHtml(pearl, 'photo', { cls: 'tile-photo-art', alt: '' });
  const artBlock = photoImg
    ? `<div class="tile-music-art-wrap ticket-art-wrap">${photoImg}${subChip}</div>`
    : `<div class="tile-music-art-wrap ticket-art-wrap"><div class="tile-photo-art ticket-art-empty">${emoji}</div>${subChip}</div>`;
  return `
    <div class="pinterest-tile tile-photo ticket-tile${sizeClass}" onclick="openPearl('${pearl.id}')">
      ${artBlock}
      <div class="tile-music-meta">
        <div class="tile-music-title">${escapeHtml(title)}</div>
        ${venue ? `<div class="tc-venue">📍 ${escapeHtml(venue)}</div>` : ''}
        ${note ? `<div class="tile-note">${escapeHtml(note.slice(0, 60))}</div>` : ''}
        ${dateStr ? `<div class="tile-date">${dateStr}</div>` : ''}
      </div>
    </div>
  `;
}

function _renderBookCardHTML(pearl, opts) {
  opts = opts || {};
  const title = pearl.bookTitle || pearl.content || '책';
  const author = (pearl.bookAuthor || '').trim();
  const oneLiner = pearl.content || '';
  const sizeClass = opts.large ? ' tile-large' : '';
  // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — pearlImgHtml 이 옛 dataURL / 신 storageKey 자동 분기.
  const photoImg = pearlImgHtml(pearl, 'photo', { cls: 'tile-photo-art book-cover-art', alt: '' });
  const artBlock = photoImg
    ? `<div class="tile-music-art-wrap book-art-wrap">${photoImg}</div>`
    : `<div class="tile-music-art-wrap book-art-wrap"><div class="tile-photo-art book-cover-art book-cover-empty">📚</div></div>`;
  return `
    <div class="pinterest-tile tile-photo book-tile${sizeClass}" onclick="openBookReviewFullscreen('${pearl.id}')">
      ${artBlock}
      <div class="tile-music-meta">
        <div class="tile-music-title">${escapeHtml(title)}</div>
        ${author ? `<div class="bc-author">${escapeHtml(author)}</div>` : ''}
        ${oneLiner ? `<div class="tile-note bc-one-liner">${escapeHtml(oneLiner)}</div>` : ''}
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
  // V4 (사용자 명시 2026-05-14): drag handle (≡) 으로 순서 변경 — pointer events (mouse + touch 통합).
  subs.forEach((s, i) => {
    listHtml += `
      <div class="tsm-row" data-tsm-idx="${i}" draggable="true">
        <span class="tsm-drag" aria-label="끌어서 순서 변경" title="끌어서 순서 변경">≡</span>
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
    </div>
  `;
  document.body.appendChild(overlay);
  // V4 (사용자 명시 2026-05-14): drag-and-drop bind (pointer events — mouse + touch 통합).
  _bindTsmDragHandlers();
}

// drag state — array 직접 swap, 매 hover row 마다 재렌더.
let _tsmDrag = null;
function _bindTsmDragHandlers() {
  const list = document.querySelector('#ticketSubTypeManager .tsm-list');
  if (!list) return;
  list.querySelectorAll('.tsm-drag').forEach(handle => {
    handle.addEventListener('pointerdown', _onTsmPointerDown);
  });
}
function _onTsmPointerDown(e) {
  e.preventDefault();
  const handle = e.currentTarget;
  const row = handle.closest('.tsm-row');
  if (!row) return;
  const idx = +row.dataset.tsmIdx;
  _tsmDrag = { idx };
  row.classList.add('tsm-dragging');
  try { handle.setPointerCapture(e.pointerId); } catch {}
  document.addEventListener('pointermove', _onTsmPointerMove);
  document.addEventListener('pointerup', _onTsmPointerUp, { once: true });
  document.addEventListener('pointercancel', _onTsmPointerUp, { once: true });
}
function _onTsmPointerMove(e) {
  if (!_tsmDrag) return;
  e.preventDefault();
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const overRow = target?.closest?.('.tsm-row');
  if (!overRow) return;
  const overIdx = +overRow.dataset.tsmIdx;
  if (!Number.isFinite(overIdx) || overIdx === _tsmDrag.idx) return;
  const arr = state.preferences.ticketSubTypes;
  if (!Array.isArray(arr) || !arr[_tsmDrag.idx]) return;
  const moved = arr.splice(_tsmDrag.idx, 1)[0];
  arr.splice(overIdx, 0, moved);
  _tsmDrag.idx = overIdx;
  _renderTicketSubTypeManager();
  // 새 row 찾아서 dragging class 유지
  const newRow = document.querySelector(`#ticketSubTypeManager .tsm-row[data-tsm-idx="${overIdx}"]`);
  if (newRow) newRow.classList.add('tsm-dragging');
}
function _onTsmPointerUp() {
  document.removeEventListener('pointermove', _onTsmPointerMove);
  if (_tsmDrag) {
    document.querySelectorAll('#ticketSubTypeManager .tsm-dragging').forEach(r => r.classList.remove('tsm-dragging'));
    _tsmDrag = null;
    saveState();
    if (typeof renderLensPearls === 'function') renderLensPearls();
  }
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

