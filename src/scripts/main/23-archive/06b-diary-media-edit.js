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
// V4 (사용자 명시 2026-05-20 ultrathink): Phase 1E Step 6 — null-safe slot.
//   _diarySetPhotos 가 옛엔 filter(Boolean) 으로 null 제거 → entry.photoStorageKeys 와
//   slot 정렬이 깨짐. 이제 null 보존 (storageKeys 와 같은 idx 유지).
function _diarySetPhotos(entry, arr) {
  if (!entry) return;
  const limited = (arr || []).slice(0, DIARY_PHOTOS_MAX);
  const anyReal = limited.some(p => typeof p === 'string' && p);
  if (limited.length > 0 && anyReal) {
    entry.photos = limited;
    const first = limited.find(p => typeof p === 'string' && p);
    if (first) entry.photo = first;
    else delete entry.photo;
  } else {
    delete entry.photos;
    delete entry.photo;
  }
}

// V4 (Phase 1E Step 6): 사진 slot 개수 = storageKeys / photos / legacy single 중 max.
//   마이그로 entry.photos 가 사라진 뒤에도 storageKeys 만으로 정확한 count 반환.
function _diaryPhotoCount(entry) {
  if (!entry) return 0;
  return Math.min(DIARY_PHOTOS_MAX, Math.max(
    Array.isArray(entry.photoStorageKeys) ? entry.photoStorageKeys.length : 0,
    Array.isArray(entry.photos) ? entry.photos.length : 0,
    entry.photo ? 1 : 0
  ));
}

// V4 (사용자 명시 2026-05-20 ultrathink): Phase 1E Step 2 — Storage 사진 path forward write.
//   per-entry monotonic seq → '<authUid>/diary_<dateK>_<seq>_photo.bin'.
//   reorder / delete 후에도 seq 충돌 X (영영 증가).
function _diaryNextPhotoSeq(entry) {
  if (!entry) return 0;
  if (typeof entry.photoStorageSeq !== 'number' || !isFinite(entry.photoStorageSeq)) {
    entry.photoStorageSeq = 0;
  }
  const seq = entry.photoStorageSeq;
  entry.photoStorageSeq = seq + 1;
  return seq;
}

// 사진 idx 슬롯 dual write — Storage upload + entry.photos dataURL (back-compat).
//   Storage 가용 (`_canUseDiaryStorage`) 면 upload 후 entry.photoStorageKeys[idx] = path.
//   가용 X 또는 upload 실패 면 path null (reader 가 entry.photos dataURL fallback).
//   교체 시 옛 path 가 있으면 fire&forget 으로 Storage DELETE + blob cache revoke.
async function _diaryWritePhotoAt(entry, idx, dataUrl) {
  if (!entry || idx < 0 || idx >= DIARY_PHOTOS_MAX) return;
  if (!Array.isArray(entry.photos)) entry.photos = [];
  // V4 (Phase 1E Step 6): null pad — 마이그된 idx 뒤에 새로 add 할 때 sparse hole 회피.
  while (entry.photos.length <= idx) entry.photos.push(null);

  const oldPath = Array.isArray(entry.photoStorageKeys) ? entry.photoStorageKeys[idx] : null;

  // Storage upload 시도.
  let newPath = null;
  if (typeof _canUseDiaryStorage === 'function' && _canUseDiaryStorage()) {
    const conv = (typeof _dataUrlToBytes === 'function') ? _dataUrlToBytes(dataUrl) : null;
    if (conv && conv.bytes) {
      try {
        const seq = _diaryNextPhotoSeq(entry);
        const result = await _uploadDiaryPhoto(entry.date, seq, conv.bytes, _e2eeMasterKey);
        newPath = result.path;
      } catch (e) {
        console.warn('[diary photo storage upload fail]', e && e.message);
      }
    }
  }

  // storageKeys 배열 동기 — entry.photos 와 같은 length 까지 pad.
  if (newPath || oldPath || (Array.isArray(entry.photoStorageKeys) && entry.photoStorageKeys.length > 0)) {
    if (!Array.isArray(entry.photoStorageKeys)) entry.photoStorageKeys = [];
    while (entry.photoStorageKeys.length <= idx) entry.photoStorageKeys.push(null);
    entry.photoStorageKeys[idx] = newPath;  // null = fallback to dataURL.
    if (entry.photoStorageKeys.length > DIARY_PHOTOS_MAX) entry.photoStorageKeys.length = DIARY_PHOTOS_MAX;
  }

  // V4 fix (사용자 보고 2026-05-20 ultrathink Phase 1E Step 7 조기): Storage 분리 성공 시 dataURL 안 박음 — localStorage 폭증 차단.
  //   newPath !== null = Storage upload OK → entry.photos[idx] = null (slot 정렬 유지 — _diaryPhotoCount / reader 가 storageKeys 우선).
  //   newPath === null = Storage 실패 / 가용 X → 옛 fallback (dataURL).
  if (newPath) {
    entry.photos[idx] = null;
    if (idx === 0) delete entry.photo;
  } else {
    entry.photos[idx] = dataUrl;
    if (idx === 0) entry.photo = dataUrl;
  }

  // 옛 path orphan cleanup (path 변경 시).
  if (oldPath && oldPath !== newPath) {
    if (typeof _revokeDiaryMediaCache === 'function') _revokeDiaryMediaCache(entry.date, idx);
    if (typeof _deleteDiaryPhoto === 'function') _deleteDiaryPhoto(oldPath).catch(()=>{});
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
  // V4 (Phase 1E Step 3+6): photoCount = _diaryPhotoCount helper (slot count).
  const _photoCount = _diaryPhotoCount(entry);
  const hasMusic = !!(entry.music && entry.music.title);

  let html = '';
  // 사진 섹션
  html += `<div class="diary-edit-section">
    <div class="diary-edit-section-label">📷 사진 (${_photoCount}/${DIARY_PHOTOS_MAX})</div>`;
  if (_photoCount === 0) {
    html += `<button class="diary-edit-photo-add" onclick="_diaryAddPhoto('${dateStr}')" aria-label="사진 추가">＋</button>`;
  } else {
    html += `<div class="diary-edit-photos-strip" id="diaryEditPhotosStrip">`;
    for (let i = 0; i < _photoCount; i++) {
      if (typeof diaryEntryHasPhoto === 'function' && !diaryEntryHasPhoto(entry, i)) continue;
      const _imgHtml = (typeof diaryImgHtml === 'function')
        ? diaryImgHtml(entry, i, { cls: '' })
        : `<img src="${escapeHtml((entry.photos && entry.photos[i]) || (i === 0 ? entry.photo : ''))}" alt="">`;
      html += `
        <div class="diary-edit-photo-tile" data-diary-photo-idx="${i}" draggable="false">
          ${_imgHtml}
          <div class="diary-edit-photo-actions">
            <button onclick="_diaryReplacePhoto('${dateStr}', ${i})" aria-label="교체">✎</button>
            <button onclick="_diaryDeletePhoto('${dateStr}', ${i})" aria-label="삭제">✕</button>
          </div>
        </div>
      `;
    }
    if (_photoCount < DIARY_PHOTOS_MAX) {
      html += `<button class="diary-edit-photo-add" onclick="_diaryAddPhoto('${dateStr}')" aria-label="사진 추가">＋</button>`;
    }
    html += `</div>`;
    if (_photoCount >= 2) {
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
  if (typeof hydrateDiaryPhotos === 'function') hydrateDiaryPhotos(body);

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
    const resized = await fileToResizedDataUrl(file, 1024, 0.85);
    const square = await makeSquareThumb(resized, 600);
    if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    const entry = _diaryGetEntry(dateStr);
    if (!entry) return;
    // V4 (Phase 1E Step 6): slot count 기준 — 마이그 후 entry.photos 가 사라져도 storageKeys 로 validation.
    if (idx < 0 || idx >= _diaryPhotoCount(entry)) return;
    await _diaryWritePhotoAt(entry, idx, square);
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
  const count = _diaryPhotoCount(entry);
  if (idx < 0 || idx >= count) return;
  // V4 (Phase 1E Step 6): removed dataURL — entry.photos[idx] 우선, idx===0 면 entry.photo 도.
  const removedDataUrl = (Array.isArray(entry.photos) && typeof entry.photos[idx] === 'string')
    ? entry.photos[idx]
    : (idx === 0 && typeof entry.photo === 'string' ? entry.photo : null);
  const removedPath = Array.isArray(entry.photoStorageKeys) ? entry.photoStorageKeys[idx] : null;

  // entry.photos splice — 있으면.
  if (Array.isArray(entry.photos)) {
    entry.photos.splice(idx, 1);
    const anyReal = entry.photos.some(p => typeof p === 'string' && p);
    if (!anyReal) {
      delete entry.photos;
      delete entry.photo;
    } else {
      entry.photo = entry.photos.find(p => typeof p === 'string' && p) || entry.photo;
      if (!entry.photo) delete entry.photo;
    }
  } else if (idx === 0 && entry.photo) {
    delete entry.photo;
  }

  // photoStorageKeys splice — null 보존 (trailing 도 keep 해서 entry.photos 와 길이 정렬).
  if (Array.isArray(entry.photoStorageKeys)) {
    entry.photoStorageKeys.splice(idx, 1);
    const anyPath = entry.photoStorageKeys.some(Boolean);
    if (!anyPath) delete entry.photoStorageKeys;
  }

  // Storage 파일 삭제 + blob cache revoke (fire & forget).
  if (removedPath) {
    if (typeof _revokeDiaryMediaCache === 'function') _revokeDiaryMediaCache(dateStr, idx);
    if (typeof _deleteDiaryPhoto === 'function') _deleteDiaryPhoto(removedPath).catch(()=>{});
  }
  _diaryPersistAndRerender(dateStr);
  if (typeof showUndoToast === 'function' && removedDataUrl) {
    showUndoToast('사진 삭제됨', () => {
      // Undo — dataURL 만 복원. Storage path 손실 (다음 edit/마이그 가 채움).
      const e2 = _diaryGetEntry(dateStr);
      if (!e2) return;
      if (!Array.isArray(e2.photos)) e2.photos = [];
      e2.photos.splice(idx, 0, removedDataUrl);
      _diarySetPhotos(e2, e2.photos);
      if (Array.isArray(e2.photoStorageKeys)) {
        e2.photoStorageKeys.splice(idx, 0, null);
      }
      _diaryPersistAndRerender(dateStr);
    });
  }
}

async function _diaryAddPhoto(dateStr) {
  try {
    const entry = _diaryGetEntry(dateStr);
    if (!entry) return;
    // V4 (Phase 1E Step 6): slot count 기준 — 마이그된 entry 도 정확한 cur 잡힘.
    const cur = _diaryPhotoCount(entry);
    if (cur >= DIARY_PHOTOS_MAX) {
      if (typeof showToast === 'function') showToast(`사진은 ${DIARY_PHOTOS_MAX}장까지`);
      return;
    }
    if (typeof pickPhotoFile !== 'function') return;
    const file = await pickPhotoFile();
    if (!file) return;
    if (typeof showFullscreenLoader === 'function') showFullscreenLoader('사진 처리 중... 📸');
    const resized = await fileToResizedDataUrl(file, 1024, 0.85);
    const square = await makeSquareThumb(resized, 600);
    if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    await _diaryWritePhotoAt(entry, cur, square);
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
        // V4 (Phase 1E Step 6): slot count 기준 — entry.photos / photoStorageKeys 둘 다 정렬 보존.
        const count = _diaryPhotoCount(entry);
        if (originIdx < 0 || originIdx >= count || lastOverIdx < 0 || lastOverIdx >= count) return;
        if (Array.isArray(entry.photos)) {
          // pad to count.
          while (entry.photos.length < count) entry.photos.push(null);
          const [moved] = entry.photos.splice(originIdx, 1);
          entry.photos.splice(lastOverIdx, 0, moved);
          _diarySetPhotos(entry, entry.photos);
        }
        if (Array.isArray(entry.photoStorageKeys)) {
          while (entry.photoStorageKeys.length < count) entry.photoStorageKeys.push(null);
          const [movedKey] = entry.photoStorageKeys.splice(originIdx, 1);
          entry.photoStorageKeys.splice(lastOverIdx, 0, movedKey);
        }
        _diaryPersistAndRerender(dateStr);
      }
    };
    tile.addEventListener('pointerdown', onDown);
    tile.addEventListener('pointermove', onMove, { passive: false });
    tile.addEventListener('pointerup', onUp);
    tile.addEventListener('pointercancel', onUp);
  });
}
