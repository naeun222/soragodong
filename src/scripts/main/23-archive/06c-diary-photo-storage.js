// V4 (사용자 명시 2026-05-20 ultrathink): Phase 1E Step 1 — 일기 사진 Storage helper (호출 X).
//
// 배경: 일기/체크인 사진이 entry.photos[] = dataURL 로 main JSONB row 안 박힘.
//   매 saveToCloud 마다 row 전체 PATCH → cap 8MB / bandwidth 폭증 (PHASE-1E-HANDOFF §1).
// 신 path: 사진 = Supabase Storage 'pearls' bucket 안 E2EE 암호화 blob.
//   state.entries[i].photoStorageKeys[] = path 만 저장. dataURL 0.
//
// Phase 1D pearl-storage 패턴 그대로 복제:
//   _e2eeEncryptBytes / _e2eeDecryptBytes / _bytesToBlobUrl / _dataUrlToBytes 재사용
//     (03-auth/15-pearl-storage.js).
//   bucket = 'pearls' 재사용 — RLS policy 가 (storage.foldername(name))[1] = auth.uid()::text
//     매칭만 강제하므로 첫 segment 가 authUid 면 어떤 파일명이든 OK (0032_pearl_storage.sql).
//
// 경로 패턴: '<auth_user_id>/diary_<dateK>_<idx>_photo.bin'
//   dateK = entry.date (YYYY-MM-DD).
//   idx = entry.photoStorageKeys 안 위치 (0..N-1, DIARY_PHOTOS_MAX=3 한도).
//   진주 path 와 충돌 X (진주 = '<authUid>/<pearlId>_{photo|video|videoThumbnail}.bin', uuid prefix).
//
// Step 1 = 이 파일 (helper 생성만, 호출 X).
// Step 2 (다음) = forward path: 일기 edit sheet 가 upload + entry.photoStorageKeys 저장.
// Step 3 = reader sweep (day modal / timeline / shell). Step 4 = 체크인 path.
// Step 5 = q=0.85 / 1024px. Step 6 = 마이그. Step 7 = legacy 제거.

const _DIARY_STORAGE_BUCKET = 'pearls';

// 가용성 가드 — pearl 과 동일 (master key + 인증 + non-tester + non-guest).
//   pearl 가드 fn 정의 순서가 13-shell-collection/01-pearl-media-capture.js (이후 load) 이라
//   여기서 직접 동일 로직 inline. 차후 정책 분기 가능성도 고려.
function _canUseDiaryStorage() {
  if (typeof _e2eeMasterKey === 'undefined' || !_e2eeMasterKey) return false;
  if (typeof state === 'undefined' || !state) return false;
  if (state.preferences && state.preferences.testerMode) return false;
  if (state.isGuest) return false;
  if (typeof authUserId === 'undefined' || !authUserId) return false;
  return true;
}

function _diaryStoragePath(authUid, dateK, idx) {
  if (!authUid || !dateK || typeof idx !== 'number' || idx < 0) {
    throw new Error('diaryStoragePath: 인자 누락/잘못됨');
  }
  return `${authUid}/diary_${dateK}_${idx}_photo.bin`;
}

function _diaryStorageUrl(path) {
  if (typeof SUPABASE_URL !== 'string') throw new Error('SUPABASE_URL 미설정');
  return `${SUPABASE_URL}/storage/v1/object/${_DIARY_STORAGE_BUCKET}/${path}`;
}

// 일기 사진 업로드 — bytes (Uint8Array/ArrayBuffer) + masterKey → 암호화 → Storage POST.
//   성공 시 { ok: true, path } 반환. 실패 시 throw.
//   x-upsert: true — 같은 (dateK, idx) 덮어쓰기 허용 (교체 / 재시도).
async function _uploadDiaryPhoto(dateK, idx, bytes, masterKey) {
  if (!authUserId) throw new Error('uploadDiaryPhoto: 비인증 (authUserId 없음)');
  if (!masterKey) throw new Error('uploadDiaryPhoto: master key 없음 (E2EE 미활성)');
  if (!session || !session.access_token) throw new Error('uploadDiaryPhoto: session.access_token 없음');
  const encrypted = await _e2eeEncryptBytes(bytes, masterKey);
  const path = _diaryStoragePath(authUserId, dateK, idx);
  const url = _diaryStorageUrl(path);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: encrypted
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`uploadDiaryPhoto ${resp.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true, path };
}

// 일기 사진 다운로드 — storage path + masterKey → bytes 반환.
async function _downloadDiaryPhoto(path, masterKey) {
  if (!path) throw new Error('downloadDiaryPhoto: path 없음');
  if (!masterKey) throw new Error('downloadDiaryPhoto: master key 없음');
  if (!session || !session.access_token) throw new Error('downloadDiaryPhoto: session.access_token 없음');
  const url = _diaryStorageUrl(path);
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`downloadDiaryPhoto ${resp.status}: ${text.slice(0, 200)}`);
  }
  const buf = await resp.arrayBuffer();
  return await _e2eeDecryptBytes(new Uint8Array(buf), masterKey);
}

// 일기 사진 영구 삭제 — entry 사진 제거 / 일기 삭제 시.
//   실패해도 throw 대신 { ok: false, reason } 반환 (orphan 허용 — 사용자 데이터 손실 회피).
async function _deleteDiaryPhoto(path) {
  if (!path) return { ok: false, reason: 'no-path' };
  if (!session || !session.access_token) return { ok: false, reason: 'no-auth' };
  const url = _diaryStorageUrl(path);
  try {
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!resp.ok && resp.status !== 404) {
      const text = await resp.text().catch(() => '');
      return { ok: false, reason: `delete ${resp.status}: ${text.slice(0, 100)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'throw: ' + (e && e.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render helpers — Step 3 (reader sweep) 가 이 위로 build. 옛/신 path 자동 분기.
// ─────────────────────────────────────────────────────────────────────────────

const _diaryMediaBlobCache = new Map();  // 'dateK:idx' → blobUrl
const _diaryMediaLoading = new Map();    // 'dateK:idx' → Promise<blobUrl>

function _diaryMediaCacheKey(dateK, idx) {
  return dateK + ':' + idx;
}

// entry 가 i 번째 사진 가졌는지 (옛 dataURL or 신 storageKey).
function diaryEntryHasPhoto(entry, idx) {
  if (!entry || typeof idx !== 'number' || idx < 0) return false;
  if (Array.isArray(entry.photoStorageKeys) && entry.photoStorageKeys[idx]) return true;
  if (Array.isArray(entry.photos) && typeof entry.photos[idx] === 'string' && entry.photos[idx]) return true;
  if (idx === 0 && typeof entry.photo === 'string' && entry.photo) return true;
  return false;
}

// <img> HTML 생성 — 신 path (storageKey) 우선 → 옛 path (dataURL) fallback.
//   opts.cls / opts.alt / opts.extra. 사진 없으면 '' 반환.
//   신 path 면 data-diary-photo + data-diary-photo-idx 만, hydrateDiaryPhotos 가 src 채움.
function diaryImgHtml(entry, idx, opts) {
  opts = opts || {};
  const cls = opts.cls || '';
  const alt = opts.alt || '';
  const extra = opts.extra || '';
  if (!entry) return '';
  if (Array.isArray(entry.photoStorageKeys) && entry.photoStorageKeys[idx]) {
    const dateK = entry.date || '';
    return `<img data-diary-photo="${escapeHtml(dateK)}" data-diary-photo-idx="${idx}" alt="${escapeHtml(alt)}" class="${cls} diary-loading" loading="lazy" decoding="async" ${extra}>`;
  }
  let dataUrl = null;
  if (Array.isArray(entry.photos) && entry.photos[idx]) dataUrl = entry.photos[idx];
  else if (idx === 0 && entry.photo) dataUrl = entry.photo;
  if (dataUrl) {
    return `<img src="${dataUrl}" alt="${escapeHtml(alt)}" class="${cls}" loading="lazy" decoding="async" ${extra}>`;
  }
  return '';
}

// 단일 사진 download + decrypt + blob URL. cache hit / in-flight dedup.
async function _hydrateDiaryPhotoOne(entry, idx) {
  if (!entry || !entry.date) throw new Error('hydrateDiaryPhotoOne: entry.date 없음');
  const dateK = entry.date;
  const cacheKey = _diaryMediaCacheKey(dateK, idx);
  const cached = _diaryMediaBlobCache.get(cacheKey);
  if (cached) return cached;
  const inflight = _diaryMediaLoading.get(cacheKey);
  if (inflight) return inflight;
  if (!_e2eeMasterKey) throw new Error('master key 없음 — E2EE 미설정 또는 복원 필요');
  const storagePath = entry.photoStorageKeys && entry.photoStorageKeys[idx];
  if (!storagePath) throw new Error(`photoStorageKeys[${idx}] 없음`);
  if (typeof state !== 'undefined' && state && state.preferences && state.preferences.testerMode) {
    throw new Error('testerMode — Storage 차단');
  }
  const p = (async () => {
    try {
      const bytes = await _downloadDiaryPhoto(storagePath, _e2eeMasterKey);
      const url = _bytesToBlobUrl(bytes, 'image/jpeg');
      _diaryMediaBlobCache.set(cacheKey, url);
      return url;
    } finally {
      _diaryMediaLoading.delete(cacheKey);
    }
  })();
  _diaryMediaLoading.set(cacheKey, p);
  return p;
}

// 화면 안 img[data-diary-photo] 모두 hydrate. 이미 hydrate / pending 은 skip.
//   testerMode 면 skip (옛 dataURL 만 작동). master key 없으면 fail UI.
function hydrateDiaryPhotos(rootEl) {
  if (typeof state === 'undefined' || !state) return;
  if (state.preferences && state.preferences.testerMode) return;
  const hasKey = !!_e2eeMasterKey;
  const root = rootEl || document;
  const _setFail = (el) => {
    el.classList.remove('diary-loading');
    el.classList.add('diary-load-fail');
    if (el.tagName === 'IMG') el.alt = '사진 못 불러옴';
    el.dataset.diaryHydrated = 'fail';
  };
  root.querySelectorAll && root.querySelectorAll('img[data-diary-photo]').forEach(img => {
    if (img.dataset.diaryHydrated === '1') return;
    if (img.dataset.diaryHydrated === 'pending') return;
    const dateK = img.dataset.diaryPhoto;
    const idx = parseInt(img.dataset.diaryPhotoIdx, 10);
    if (!dateK || isNaN(idx) || idx < 0) return;
    const entry = (state.entries || []).find(e => e.date === dateK);
    if (!entry || !Array.isArray(entry.photoStorageKeys) || !entry.photoStorageKeys[idx]) return;
    if (!hasKey) { _setFail(img); return; }
    img.dataset.diaryHydrated = 'pending';
    _hydrateDiaryPhotoOne(entry, idx).then(url => {
      img.src = url;
      img.classList.remove('diary-loading');
      img.dataset.diaryHydrated = '1';
    }).catch(e => {
      console.warn('[diary img hydrate fail]', dateK, idx, e && e.message);
      _setFail(img);
    });
  });
}

// 일기 사진 변경 / 삭제 시 blob cache 해제. idx 생략 시 해당 date 전체.
function _revokeDiaryMediaCache(dateK, idx) {
  if (!dateK) return;
  if (typeof idx === 'number') {
    const cacheKey = _diaryMediaCacheKey(dateK, idx);
    const url = _diaryMediaBlobCache.get(cacheKey);
    if (url) {
      try { URL.revokeObjectURL(url); } catch(_) {}
      _diaryMediaBlobCache.delete(cacheKey);
    }
    return;
  }
  for (const [key, url] of _diaryMediaBlobCache.entries()) {
    if (key.startsWith(dateK + ':')) {
      try { URL.revokeObjectURL(url); } catch(_) {}
      _diaryMediaBlobCache.delete(key);
    }
  }
}
