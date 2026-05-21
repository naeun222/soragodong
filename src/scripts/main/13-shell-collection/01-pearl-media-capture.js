// V4 (사용자 명시 2026-05-18 ultrathink): Phase 1C — 새 진주 캡처 시 Storage 직접 업로드.
//   capture flow:
//     1) bytes 만들기 (compress 후)
//     2) _canUsePearlStorage() = true → _uploadPearlMedia → 성공 시 pearl.storageKey.X = path. pearl.photo/.video 필드 X.
//     3) false (master key 없음 / testerMode / guest) → 옛 path: pearl.photo / .video = dataURL.
//
//   진주 삭제 시 Storage 에 orphan 안 남게 _deleteAllPearlMedia 호출.
//   mutually exclusive (photo ↔ video) 처리도 같이.

// Storage 사용 가능 여부 — master key + testerMode + guest 가드.
//   false → 옛 dataURL path (cloud sync 차단 사용자거나 E2EE 미설정 사용자 안전망).
function _canUsePearlStorage() {
  if (typeof _e2eeMasterKey === 'undefined' || !_e2eeMasterKey) return false;
  if (typeof state === 'undefined' || !state) return false;
  if (state.preferences && state.preferences.testerMode) return false;
  if (state.isGuest) return false;
  if (typeof authUserId === 'undefined' || !authUserId) return false;
  return true;
}

// 진주에 photo 첨부. Storage path 면 신 path / 아니면 옛 dataURL.
//   성공 시 pearl.storageKey.photo 또는 pearl.photo 세팅.
//   mutually exclusive — 이전 video 있으면 같이 제거 (Storage 도 cleanup).
//   실패 시 throw.
async function _attachPearlPhoto(pearl, dataUrl) {
  if (!pearl || !pearl.id) throw new Error('attachPearlPhoto: pearl 없음');
  if (typeof dataUrl !== 'string' || !dataUrl) throw new Error('attachPearlPhoto: dataURL 없음');
  let _plainBytes = null;          // V4 (사용자 보고 2026-05-22 ultrathink): blob URL cache 즉시 갱신용 plain bytes 보존.
  let _plainMime = 'image/jpeg';
  if (_canUsePearlStorage()) {
    const conv = _dataUrlToBytes(dataUrl);
    if (!conv) throw new Error('dataURL 파싱 실패');
    const result = await _uploadPearlMedia(pearl.id, 'photo', conv.bytes, _e2eeMasterKey);
    pearl.storageKey = pearl.storageKey || {};
    pearl.storageKey.photo = result.path;
    // 옛 dataURL 필드 X (사용자 데이터 mass 회피).
    delete pearl.photo;
    _plainBytes = conv.bytes;
    _plainMime = conv.mime || 'image/jpeg';
  } else {
    // 옛 path fallback — testerMode / guest / master key 없음.
    pearl.photo = dataUrl;
    if (pearl.storageKey) delete pearl.storageKey.photo;
  }
  // mutually exclusive — 이전 video 정리.
  await _removePearlVideo(pearl);
  // V4 (사용자 보고 2026-05-22 ultrathink): 옛 blob URL cache evict + 새 plain bytes 즉시 cache 박음.
  //   bug: _attachPearlPhoto 가 storageKey.photo 갱신만 하고 _pearlMediaBlobCache 의 photo entry 그대로 남김 → 다음 hydrate 시 cache hit (line 84 in 00-pearl-media-hydrate.js) → 옛 사진 표시.
  //   사용자 보고: '사진 변경됨' toast 떴는데 실제로 변경 안 보임. _removePearlPhoto 는 이미 _revokePearlMediaCache 호출하는데 _attachPearlPhoto 가 누락 (대칭 bug).
  //   fix: cache evict + 새 plain bytes 로 blob URL cache 즉시 set → 다음 hydrate cache hit 으로 새 사진 표시. Supabase Storage CDN cache 의 same-path 옛 byte 우회 효과도.
  if (typeof _revokePearlMediaCache === 'function') _revokePearlMediaCache(pearl.id, 'photo');
  if (_plainBytes && typeof _bytesToBlobUrl === 'function' && typeof _pearlMediaBlobCache !== 'undefined' && typeof _pearlMediaCacheKey === 'function') {
    try {
      const newUrl = _bytesToBlobUrl(_plainBytes, _plainMime);
      _pearlMediaBlobCache.set(_pearlMediaCacheKey(pearl.id, 'photo'), newUrl);
    } catch (e) { console.warn('[_attachPearlPhoto] blob cache set fail:', e); }
  }
  // V4 (사용자 명시 2026-05-22 ultrathink Phase D): eager hero thumb cache — 추가/변경 시점에 200px thumb 미리 박음.
  //   기존 lazy (hydrate 후 캐시) 의 한계 = first hero load 시 cache miss 라 hydrate 거쳐야. 신 path 진주는 Storage download + decrypt 까지 가야 표시 → 사용자 체감 "로딩 안 됨".
  //   eager 면 hero 진입 시 cache hit 즉시 표시. evict 직후 호출 (24h refresh check 우회).
  //   _maybeCacheHeroThumb 는 blob URL / dataURL 둘 다 Image.src 박힘.
  if (typeof _revokeHeroThumbCache === 'function') _revokeHeroThumbCache(pearl.id, 'photo');
  if (typeof _maybeCacheHeroThumb === 'function') {
    try { await _maybeCacheHeroThumb(pearl.id, 'photo', dataUrl); } catch(_) {}
  }
}

// 진주에 video 첨부 (썸네일 + has_audio 같이).
//   성공 시 pearl.storageKey.{video,videoThumbnail} 또는 pearl.video / .videoThumbnail 세팅.
//   mutually exclusive — 이전 photo 같이 제거.
async function _attachPearlVideo(pearl, videoDataUrl, thumbnailDataUrl, hasAudio, audioMeta) {
  if (!pearl || !pearl.id) throw new Error('attachPearlVideo: pearl 없음');
  if (typeof videoDataUrl !== 'string' || !videoDataUrl) throw new Error('attachPearlVideo: video dataURL 없음');
  let _videoPlain = null, _videoMime = 'video/mp4';        // V4 (사용자 보고 2026-05-22 ultrathink): blob URL cache 즉시 갱신용.
  let _thumbPlain = null, _thumbMime = 'image/jpeg';
  if (_canUsePearlStorage()) {
    const vconv = _dataUrlToBytes(videoDataUrl);
    if (!vconv) throw new Error('video dataURL 파싱 실패');
    const vResult = await _uploadPearlMedia(pearl.id, 'video', vconv.bytes, _e2eeMasterKey);
    pearl.storageKey = pearl.storageKey || {};
    pearl.storageKey.video = vResult.path;
    delete pearl.video;
    _videoPlain = vconv.bytes;
    _videoMime = vconv.mime || 'video/mp4';
    if (typeof thumbnailDataUrl === 'string' && thumbnailDataUrl) {
      const tconv = _dataUrlToBytes(thumbnailDataUrl);
      if (tconv) {
        try {
          const tResult = await _uploadPearlMedia(pearl.id, 'videoThumbnail', tconv.bytes, _e2eeMasterKey);
          pearl.storageKey.videoThumbnail = tResult.path;
          _thumbPlain = tconv.bytes;
          _thumbMime = tconv.mime || 'image/jpeg';
        } catch (e) {
          // 썸네일 실패는 영상 자체 실패만큼 critical X — 진주는 살림. log + skip.
          console.warn('[attachPearlVideo] thumbnail upload fail:', e && e.message);
        }
      }
    }
    delete pearl.videoThumbnail;
  } else {
    // 옛 path fallback.
    pearl.video = videoDataUrl;
    if (typeof thumbnailDataUrl === 'string' && thumbnailDataUrl) pearl.videoThumbnail = thumbnailDataUrl;
    if (pearl.storageKey) {
      delete pearl.storageKey.video;
      delete pearl.storageKey.videoThumbnail;
    }
  }
  if (typeof hasAudio === 'boolean') pearl.videoHasAudio = !!hasAudio;
  if (audioMeta) pearl.videoAudioMeta = audioMeta;
  // mutually exclusive — 이전 photo 정리.
  await _removePearlPhoto(pearl);
  // V4 (사용자 보고 2026-05-22 ultrathink): _attachPearlPhoto 대칭 fix — 옛 blob URL cache evict + 새 plain bytes 즉시 cache 박음.
  //   사용자 보고: '영상 변경됨' toast 떴는데 실제로 변경 안 보임. _removePearlVideo 는 이미 _revokePearlMediaCache 호출하는데 _attachPearlVideo 가 누락 (대칭 bug).
  if (typeof _revokePearlMediaCache === 'function') {
    _revokePearlMediaCache(pearl.id, 'video');
    _revokePearlMediaCache(pearl.id, 'videoThumbnail');
  }
  if (typeof _bytesToBlobUrl === 'function' && typeof _pearlMediaBlobCache !== 'undefined' && typeof _pearlMediaCacheKey === 'function') {
    try {
      if (_videoPlain) _pearlMediaBlobCache.set(_pearlMediaCacheKey(pearl.id, 'video'), _bytesToBlobUrl(_videoPlain, _videoMime));
      if (_thumbPlain) _pearlMediaBlobCache.set(_pearlMediaCacheKey(pearl.id, 'videoThumbnail'), _bytesToBlobUrl(_thumbPlain, _thumbMime));
    } catch (e) { console.warn('[_attachPearlVideo] blob cache set fail:', e); }
  }
  // V4 (사용자 명시 2026-05-22 ultrathink Phase D): eager hero thumb cache — videoThumbnail 도 추가 시점 캐시.
  if (typeof _revokeHeroThumbCache === 'function') _revokeHeroThumbCache(pearl.id, 'videoThumbnail');
  if (typeof thumbnailDataUrl === 'string' && thumbnailDataUrl && typeof _maybeCacheHeroThumb === 'function') {
    try { await _maybeCacheHeroThumb(pearl.id, 'videoThumbnail', thumbnailDataUrl); } catch(_) {}
  }
}

// 진주의 photo 제거 — Storage 파일 + 옛 dataURL field 둘 다.
//   진주 자체 삭제 아님 (mutually exclusive 시 또는 사용자가 명시적으로 photo 만 제거).
async function _removePearlPhoto(pearl) {
  if (!pearl) return;
  if (pearl.storageKey && pearl.storageKey.photo) {
    try { await _deletePearlMedia(pearl.storageKey.photo); } catch (e) { console.warn('[_removePearlPhoto] storage delete:', e && e.message); }
    delete pearl.storageKey.photo;
  }
  delete pearl.photo;
  if (typeof _revokePearlMediaCache === 'function') _revokePearlMediaCache(pearl.id, 'photo');
  // V4 (사용자 명시 2026-05-20 ultrathink Phase C): hero thumb localStorage cache 도 evict.
  if (typeof _revokeHeroThumbCache === 'function') _revokeHeroThumbCache(pearl.id, 'photo');
}

// 진주의 video 제거 — Storage 파일 (video + videoThumbnail) + 옛 dataURL field + 메타.
async function _removePearlVideo(pearl) {
  if (!pearl) return;
  if (pearl.storageKey && pearl.storageKey.video) {
    try { await _deletePearlMedia(pearl.storageKey.video); } catch (e) { console.warn('[_removePearlVideo] storage delete:', e && e.message); }
    delete pearl.storageKey.video;
  }
  if (pearl.storageKey && pearl.storageKey.videoThumbnail) {
    try { await _deletePearlMedia(pearl.storageKey.videoThumbnail); } catch (e) { console.warn('[_removePearlVideo] thumbnail delete:', e && e.message); }
    delete pearl.storageKey.videoThumbnail;
  }
  delete pearl.video;
  delete pearl.videoThumbnail;
  delete pearl.videoHasAudio;
  delete pearl.videoAudioMeta;
  if (typeof _revokePearlMediaCache === 'function') {
    _revokePearlMediaCache(pearl.id, 'video');
    _revokePearlMediaCache(pearl.id, 'videoThumbnail');
  }
  // V4 (사용자 명시 2026-05-20 ultrathink Phase C): hero thumb localStorage cache 도 evict (videoThumbnail).
  if (typeof _revokeHeroThumbCache === 'function') _revokeHeroThumbCache(pearl.id, 'videoThumbnail');
  // 옛 path 의 video blob cache 도 (12-mission/11-video-capture.js).
  if (typeof _revokePearlVideoCache === 'function') _revokePearlVideoCache(pearl.id);
}

// 진주 자체 삭제 시 — Storage 안 모든 미디어 파일 + 메모리 캐시 cleanup.
//   caller 는 이 다음 state.pearls.splice / filter 로 진주 자체 제거.
async function _deleteAllPearlMedia(pearl) {
  if (!pearl) return;
  await _removePearlPhoto(pearl);
  await _removePearlVideo(pearl);
}
