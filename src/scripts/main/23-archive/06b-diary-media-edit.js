// V4 (사용자 명시 2026-05-20 ultrathink): 일기 미디어 (사진 + 음악) 수정 sheet.
//   trigger: 캘린더 day modal ⋯ / 타임라인 ⋮ 메뉴.
//   허용: 사진 교체 / 추가 / 삭제 / 순서 변경 + 음악 교체 / 삭제.
//   금지 (분석 추출 입력이라 immutable): 체크인 질문 / 활력 / 에너지 / 수면 시간.
//   sync: entry 변경 시 같은 날 shellCollection 의 'shell_ci_<dateStr>' 동기 (사진 여러장 = 첫 번째 만 photoThumb).

const DIARY_PHOTOS_MAX = 3;

function _diaryGetEntry(dateStr) {
  return (state.entries || []).find(e => e.date === dateStr) || null;
}
function _diaryGetPhotos(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.photos)) return entry.photos.slice(0, DIARY_PHOTOS_MAX);
  if (entry.photo) return [entry.photo];
  return [];
}
function _diarySetPhotos(entry, arr) {
  if (!entry) return;
  const clean = (arr || []).filter(Boolean).slice(0, DIARY_PHOTOS_MAX);
  if (clean.length > 0) {
    entry.photos = clean;
    entry.photo = clean[0];  // legacy mirror — single-reader 호환
  } else {
    delete entry.photos;
    delete entry.photo;
  }
}

// V4 (사용자 명시 2026-05-20 ultrathink): 일기 사진/음악 변경 시 그날 소라 (shell_ci_<dateStr>) 동기.
//   addOrUpdateCheckinShell 이 tier 재계산 + photo/music 갱신. 사진 여러장이면 photoThumb=photos[0] 만 (addOrUpdateCheckinShell 내부에서 entry.photo mirror 사용).
function _diarySyncShell(entry) {
  if (!entry) return;
  if (typeof addOrUpdateCheckinShell !== 'function') return;
  try { addOrUpdateCheckinShell(entry); } catch (e) { console.warn('[diary edit sync shell]', e); }
}

function _diaryPersistAndRerender(dateStr) {
  const entry = _diaryGetEntry(dateStr);
  if (!entry) return;
  _diarySyncShell(entry);
  if (typeof saveState === 'function') saveState();
  // sheet 안 photos / music 영역 즉시 다시 그림.
  _diaryRenderEditSheetBody(dateStr);
  // 옛 day modal / 타임라인 도 갱신 (열려 있으면).
  if (document.getElementById('dayModal') && typeof switchDayModalTab === 'function') {
    try { switchDayModalTab(_dayModalActiveTab || 'diary'); } catch {}
  }
  if (typeof renderLensTimeline === 'function') { try { renderLensTimeline(); } catch {} }
  if (typeof renderBeach === 'function') { try { renderBeach(); } catch {} }
}

async function openDiaryMediaEditSheet(dateStr) {
  const entry = _diaryGetEntry(dateStr);
  if (!entry) { if (typeof showToast === 'function') showToast('해당 날 일기 없음'); return; }
  // 옛 sheet 잔존 정리
  const existing = document.getElementById('diaryEditSheet');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'diaryEditSheet';
  overlay.className = 'diary-edit-sheet-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  overlay.innerHTML = `
    <div class="diary-edit-sheet" onclick="event.stopPropagation()">
      <div class="diary-edit-sheet-title">
        <span>✎ ${escapeHtml(dateLabel)} 일기 수정</span>
        <button class="diary-edit-sheet-close" onclick="document.getElementById('diaryEditSheet')?.remove()">✕</button>
      </div>
      <div id="diaryEditSheetBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  _diaryRenderEditSheetBody(dateStr);
}

function _diaryRenderEditSheetBody(dateStr) {
  const body = document.getElementById('diaryEditSheetBody');
  if (!body) return;
  const entry = _diaryGetEntry(dateStr);
  if (!entry) return;
  const photos = _diaryGetPhotos(entry);
  const hasMusic = !!(entry.music && entry.music.title);

  let html = '';
  // 사진 섹션
  html += `<div class="diary-edit-section">
    <div class="diary-edit-section-label">📷 사진 (${photos.length}/${DIARY_PHOTOS_MAX})</div>`;
  if (photos.length === 0) {
    html += `<button class="diary-edit-photo-add" onclick="_diaryAddPhoto('${dateStr}')" aria-label="사진 추가">＋</button>`;
  } else {
    html += `<div class="diary-edit-photos-strip" id="diaryEditPhotosStrip">`;
    photos.forEach((p, i) => {
      html += `
        <div class="diary-edit-photo-tile" data-diary-photo-idx="${i}" draggable="false">
          <img src="${escapeHtml(p)}" alt="">
          <div class="diary-edit-photo-actions">
            <button onclick="_diaryReplacePhoto('${dateStr}', ${i})" aria-label="교체">✎</button>
            <button onclick="_diaryDeletePhoto('${dateStr}', ${i})" aria-label="삭제">✕</button>
          </div>
        </div>
      `;
    });
    if (photos.length < DIARY_PHOTOS_MAX) {
      html += `<button class="diary-edit-photo-add" onclick="_diaryAddPhoto('${dateStr}')" aria-label="사진 추가">＋</button>`;
    }
    html += `</div>`;
    if (photos.length >= 2) {
      html += `<div style="font-size:10px; color:var(--text-soft); margin-top:6px;">길게 누른 후 드래그 = 순서 변경</div>`;
    }
  }
  html += `</div>`;

  // 음악 섹션
  html += `<div class="diary-edit-section">
    <div class="diary-edit-section-label">🎵 음악</div>`;
  if (hasMusic && typeof renderMusicCardHTML === 'function') {
    html += renderMusicCardHTML(entry.music);
    html += `<div class="diary-edit-music-actions">
      <button onclick="_diaryReplaceMusic('${dateStr}')">✎ 교체</button>
      <button onclick="_diaryDeleteMusic('${dateStr}')">✕ 삭제</button>
    </div>`;
  } else {
    html += `<div class="diary-edit-empty">음악 없음</div>
      <div class="diary-edit-music-actions">
        <button onclick="_diaryReplaceMusic('${dateStr}')">＋ 음악 추가</button>
      </div>`;
  }
  html += `</div>`;

  body.innerHTML = html;

  // 사진 reorder drag binding (체크인과 동일 패턴).
  const strip = document.getElementById('diaryEditPhotosStrip');
  if (strip) _diaryBindPhotoReorder(strip, dateStr);
}

async function _diaryReplacePhoto(dateStr, idx) {
  try {
    if (typeof pickPhotoFile !== 'function') return;
    const file = await pickPhotoFile();
    if (!file) return;
    if (typeof showFullscreenLoader === 'function') showFullscreenLoader('사진 처리 중... 📸');
    const resized = await fileToResizedDataUrl(file, 800);
    const square = await makeSquareThumb(resized, 600);
    if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    const entry = _diaryGetEntry(dateStr);
    if (!entry) return;
    const photos = _diaryGetPhotos(entry);
    if (idx < 0 || idx >= photos.length) return;
    photos[idx] = square;
    _diarySetPhotos(entry, photos);
    _diaryPersistAndRerender(dateStr);
  } catch (e) {
    if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    console.warn('[diary replace photo]', e);
    if (typeof showToast === 'function') showToast('사진 처리 실패');
  }
}

function _diaryDeletePhoto(dateStr, idx) {
  const entry = _diaryGetEntry(dateStr);
  if (!entry) return;
  const photos = _diaryGetPhotos(entry);
  if (idx < 0 || idx >= photos.length) return;
  const removed = photos[idx];
  photos.splice(idx, 1);
  _diarySetPhotos(entry, photos);
  _diaryPersistAndRerender(dateStr);
  if (typeof showUndoToast === 'function' && removed) {
    showUndoToast('사진 삭제됨', () => {
      const back = _diaryGetPhotos(_diaryGetEntry(dateStr));
      back.splice(idx, 0, removed);
      _diarySetPhotos(_diaryGetEntry(dateStr), back);
      _diaryPersistAndRerender(dateStr);
    });
  }
}

async function _diaryAddPhoto(dateStr) {
  try {
    const entry = _diaryGetEntry(dateStr);
    if (!entry) return;
    const cur = _diaryGetPhotos(entry);
    if (cur.length >= DIARY_PHOTOS_MAX) {
      if (typeof showToast === 'function') showToast(`사진은 ${DIARY_PHOTOS_MAX}장까지`);
      return;
    }
    if (typeof pickPhotoFile !== 'function') return;
    const file = await pickPhotoFile();
    if (!file) return;
    if (typeof showFullscreenLoader === 'function') showFullscreenLoader('사진 처리 중... 📸');
    const resized = await fileToResizedDataUrl(file, 800);
    const square = await makeSquareThumb(resized, 600);
    if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    cur.push(square);
    _diarySetPhotos(entry, cur);
    _diaryPersistAndRerender(dateStr);
  } catch (e) {
    if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    console.warn('[diary add photo]', e);
    if (typeof showToast === 'function') showToast('사진 처리 실패');
  }
}

async function _diaryReplaceMusic(dateStr) {
  if (typeof showMusicSearchModal !== 'function') {
    if (typeof showToast === 'function') showToast('음악 검색 사용 불가');
    return;
  }
  showMusicSearchModal((track) => {
    if (!track) return;
    const entry = _diaryGetEntry(dateStr);
    if (!entry) return;
    entry.music = track;
    _diaryPersistAndRerender(dateStr);
  });
}

function _diaryDeleteMusic(dateStr) {
  const entry = _diaryGetEntry(dateStr);
  if (!entry || !entry.music) return;
  const removed = entry.music;
  delete entry.music;
  _diaryPersistAndRerender(dateStr);
  if (typeof showUndoToast === 'function') {
    showUndoToast('음악 삭제됨', () => {
      const e = _diaryGetEntry(dateStr);
      if (!e) return;
      e.music = removed;
      _diaryPersistAndRerender(dateStr);
    });
  }
}

// 사진 reorder — pointer events long-press (280ms) → drag → drop swap. 체크인 사진 strip 동일 패턴.
function _diaryBindPhotoReorder(strip, dateStr) {
  const tiles = strip.querySelectorAll('.diary-edit-photo-tile');
  if (tiles.length < 2) return;
  tiles.forEach((tile) => {
    let pressTimer = null;
    let dragging = false;
    let originIdx = -1;
    let lastOverIdx = -1;
    const onDown = (e) => {
      if (e.target && e.target.closest('.diary-edit-photo-actions')) return;
      originIdx = parseInt(tile.getAttribute('data-diary-photo-idx'), 10);
      pressTimer = setTimeout(() => {
        dragging = true;
        tile.classList.add('is-dragging');
        try { tile.setPointerCapture(e.pointerId); } catch {}
      }, 280);
    };
    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overTile = el && el.closest && el.closest('.diary-edit-photo-tile');
      strip.querySelectorAll('.diary-edit-photo-tile.is-drop-target').forEach(t => t.classList.remove('is-drop-target'));
      if (overTile && overTile !== tile) {
        overTile.classList.add('is-drop-target');
        lastOverIdx = parseInt(overTile.getAttribute('data-diary-photo-idx'), 10);
      } else {
        lastOverIdx = -1;
      }
    };
    const onUp = (e) => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (!dragging) return;
      dragging = false;
      tile.classList.remove('is-dragging');
      strip.querySelectorAll('.diary-edit-photo-tile.is-drop-target').forEach(t => t.classList.remove('is-drop-target'));
      try { tile.releasePointerCapture(e.pointerId); } catch {}
      if (lastOverIdx >= 0 && lastOverIdx !== originIdx) {
        const entry = _diaryGetEntry(dateStr);
        if (!entry) return;
        const arr = _diaryGetPhotos(entry);
        const [moved] = arr.splice(originIdx, 1);
        arr.splice(lastOverIdx, 0, moved);
        _diarySetPhotos(entry, arr);
        _diaryPersistAndRerender(dateStr);
      }
    };
    tile.addEventListener('pointerdown', onDown);
    tile.addEventListener('pointermove', onMove, { passive: false });
    tile.addEventListener('pointerup', onUp);
    tile.addEventListener('pointercancel', onUp);
  });
}
