// V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — Pearl 미디어 hydrate.
//   옛 path: pearl.photo / pearl.video / pearl.videoThumbnail = dataURL → 그대로 src 박힘.
//   신 path: pearl.storageKey.{photo,video,videoThumbnail} = Storage 경로 → download + decrypt + blob URL.
//
//   render fn 들이 옛/신 path 둘 다 지원하려면:
//     1) HTML 생성 — 옛 dataURL 면 src 박힘 즉시 표시, 신 storageKey 면 data attr 만.
//     2) render 직후 hydratePearlMedia() 호출 → DOM scan → storage 진주만 download.
//   blob URL cache (Map<'pearlId:kind', url>) 로 같은 진주 반복 render 시 재사용.
//
//   master key 없으면 (E2EE 미설정 또는 복원 실패) hydrate skip + fail UI.
//   testerMode 면 Storage 시도 X (옛 dataURL 만 작동).

const _pearlMediaBlobCache = new Map();  // 'pearlId:kind' → blobUrl
const _pearlMediaLoading = new Map();    // 'pearlId:kind' → Promise<blobUrl>

function _pearlMediaCacheKey(pearlId, kind) {
  return pearlId + ':' + kind;
}

// 진주가 미디어 가졌는지 (옛 dataURL or 신 storageKey).
//   kind = 'photo' | 'video' | 'videoThumbnail'
function pearlHasMedia(pearl, kind) {
  if (!pearl) return false;
  if (kind === 'photo' && typeof pearl.photo === 'string' && pearl.photo) return true;
  if (kind === 'video' && typeof pearl.video === 'string' && pearl.video) return true;
  if (kind === 'videoThumbnail' && typeof pearl.videoThumbnail === 'string' && pearl.videoThumbnail) return true;
  return !!(pearl.storageKey && pearl.storageKey[kind]);
}

// photo / videoThumbnail <img> HTML 생성 — 옛/신 path 자동 분기.
//   opts.cls = class string, opts.alt = alt text (escapeHtml 적용), opts.extra = extra attrs string.
//   미디어 없으면 '' 반환.
function pearlImgHtml(pearl, kind, opts) {
  opts = opts || {};
  const cls = opts.cls || '';
  const alt = opts.alt || '';
  const extra = opts.extra || '';
  if (!pearl) return '';
  const dataUrl = (kind === 'photo')
    ? pearl.photo
    : (kind === 'videoThumbnail' ? pearl.videoThumbnail : null);
  if (typeof dataUrl === 'string' && dataUrl) {
    // dataURL = 'data:image/jpeg;base64,...' — '<>"&' 안 들어감. escape 불필요.
    return `<img src="${dataUrl}" alt="${escapeHtml(alt)}" class="${cls}" loading="lazy" decoding="async" ${extra}>`;
  }
  if (pearl.storageKey && pearl.storageKey[kind]) {
    return `<img data-pearl-photo="${pearl.id}" data-pearl-kind="${kind}" alt="${escapeHtml(alt)}" class="${cls} pearl-loading" loading="lazy" decoding="async" ${extra}>`;
  }
  return '';
}

// background-image inline style or data attr — <div> 등에 박는 패턴.
//   옛 dataURL → style="background-image:url(...)" / 신 storageKey → data-pearl-bg-photo.
function pearlBgPhotoStyle(pearl) {
  if (!pearl) return '';
  if (typeof pearl.photo === 'string' && pearl.photo) {
    return `style="background-image:url('${pearl.photo}');"`;
  }
  if (pearl.storageKey && pearl.storageKey.photo) {
    return `data-pearl-bg-photo="${pearl.id}"`;
  }
  return '';
}

// video poster attribute — 옛 dataURL / 신 storageKey 분기.
//   리턴값은 ' poster="..."' 또는 ' data-pearl-poster="pid"' (공백 prefix 포함). render 시 그대로 박음.
function pearlVideoPosterAttr(pearl) {
  if (!pearl) return '';
  if (typeof pearl.videoThumbnail === 'string' && pearl.videoThumbnail) {
    return ` poster="${pearl.videoThumbnail}"`;
  }
  if (pearl.storageKey && pearl.storageKey.videoThumbnail) {
    return ` data-pearl-poster="${pearl.id}"`;
  }
  return '';
}

// 단일 진주 미디어 download + decrypt + blob URL. cache hit / in-flight dedup.
//   실패 시 throw.
async function _hydratePearlMediaOne(pearl, kind) {
  if (!pearl || !pearl.id) throw new Error('hydratePearlMediaOne: pearl id 없음');
  const cacheKey = _pearlMediaCacheKey(pearl.id, kind);
  // cache hit
  const cached = _pearlMediaBlobCache.get(cacheKey);
  if (cached) return cached;
  // in-flight dedup
  const inflight = _pearlMediaLoading.get(cacheKey);
  if (inflight) return inflight;
  // master key
  if (!_e2eeMasterKey) {
    throw new Error('master key 없음 — E2EE 미설정 또는 복원 필요');
  }
  // storage path
  const storagePath = pearl.storageKey && pearl.storageKey[kind];
  if (!storagePath) throw new Error(`storageKey.${kind} 없음`);
  // testerMode 가드
  if (typeof state !== 'undefined' && state && state.preferences && state.preferences.testerMode) {
    throw new Error('testerMode — Storage 차단');
  }
  // mime (caller 가 줄 수도 있지만 단순화 — photo / thumbnail = jpeg, video = mp4).
  const mime = (kind === 'video') ? 'video/mp4' : 'image/jpeg';
  const p = (async () => {
    try {
      const bytes = await _downloadPearlMedia(storagePath, _e2eeMasterKey);
      const url = _bytesToBlobUrl(bytes, mime);
      _pearlMediaBlobCache.set(cacheKey, url);
      return url;
    } finally {
      _pearlMediaLoading.delete(cacheKey);
    }
  })();
  _pearlMediaLoading.set(cacheKey, p);
  return p;
}

// 화면 안 신 path 진주 미디어 모두 hydrate.
//   data-pearl-photo (img) / data-pearl-bg-photo (any el bg) / data-pearl-poster (video) / data-pearl-vid (video src 신 path).
//   이미 hydrate 된 element 는 skip. testerMode / master key 없으면 fallback UI.
function hydratePearlMedia(rootEl) {
  if (typeof state === 'undefined' || !state) return;
  // testerMode 면 storage 시도 X (옛 dataURL 만 작동).
  if (state.preferences && state.preferences.testerMode) return;
  const hasKey = !!_e2eeMasterKey;
  const root = rootEl || document;
  const _setFailImg = (el) => {
    el.classList.remove('pearl-loading');
    el.classList.add('pearl-load-fail');
    if (el.tagName === 'IMG') el.alt = '미디어 못 불러옴';
    el.dataset.pearlHydrated = 'fail';
  };

  // img[data-pearl-photo]
  root.querySelectorAll && root.querySelectorAll('img[data-pearl-photo]').forEach(img => {
    if (img.dataset.pearlHydrated === '1') return;
    if (img.dataset.pearlHydrated === 'pending') return;
    const pid = img.dataset.pearlPhoto;
    const kind = img.dataset.pearlKind || 'photo';
    const pearl = (state.pearls || []).find(p => p.id === pid);
    if (!pearl || !pearl.storageKey || !pearl.storageKey[kind]) return;
    if (!hasKey) { _setFailImg(img); return; }
    img.dataset.pearlHydrated = 'pending';
    _hydratePearlMediaOne(pearl, kind).then(url => {
      img.src = url;
      img.classList.remove('pearl-loading');
      img.dataset.pearlHydrated = '1';
    }).catch(e => {
      console.warn('[pearl img hydrate fail]', pid, kind, e && e.message);
      _setFailImg(img);
    });
  });

  // [data-pearl-bg-photo]
  root.querySelectorAll && root.querySelectorAll('[data-pearl-bg-photo]').forEach(el => {
    if (el.dataset.pearlHydrated === '1') return;
    if (el.dataset.pearlHydrated === 'pending') return;
    const pid = el.dataset.pearlBgPhoto;
    const pearl = (state.pearls || []).find(p => p.id === pid);
    if (!pearl || !pearl.storageKey || !pearl.storageKey.photo) return;
    if (!hasKey) { el.dataset.pearlHydrated = 'fail'; return; }
    el.dataset.pearlHydrated = 'pending';
    _hydratePearlMediaOne(pearl, 'photo').then(url => {
      el.style.backgroundImage = `url('${url}')`;
      el.dataset.pearlHydrated = '1';
    }).catch(e => {
      console.warn('[pearl bg-photo hydrate fail]', pid, e && e.message);
      el.dataset.pearlHydrated = 'fail';
    });
  });

  // video[data-pearl-vid] — 옛 path 는 hydratePearlVideos 가 처리, 신 path (storageKey.video) 만.
  root.querySelectorAll && root.querySelectorAll('video[data-pearl-vid]').forEach(v => {
    if (v.dataset.pearlStorageHydrated === '1') return;
    if (v.dataset.pearlStorageHydrated === 'pending') return;
    const pid = v.dataset.pearlVid;
    const pearl = (state.pearls || []).find(p => p.id === pid);
    if (!pearl) return;
    if (!pearl.storageKey || !pearl.storageKey.video) return;  // 옛 path → hydratePearlVideos 가 처리
    if (!hasKey) { v.dataset.pearlStorageHydrated = 'fail'; return; }
    v.dataset.pearlStorageHydrated = 'pending';
    _hydratePearlMediaOne(pearl, 'video').then(url => {
      v.src = url;
      v.dataset.hydrated = '1';
      v.dataset.pearlStorageHydrated = '1';
    }).catch(e => {
      console.warn('[pearl video hydrate fail]', pid, e && e.message);
      v.dataset.pearlStorageHydrated = 'fail';
    });
  });

  // video[data-pearl-poster] — poster 신 path.
  root.querySelectorAll && root.querySelectorAll('video[data-pearl-poster]').forEach(v => {
    if (v.dataset.pearlPosterHydrated === '1') return;
    if (v.dataset.pearlPosterHydrated === 'pending') return;
    const pid = v.dataset.pearlPoster;
    const pearl = (state.pearls || []).find(p => p.id === pid);
    if (!pearl || !pearl.storageKey || !pearl.storageKey.videoThumbnail) return;
    if (!hasKey) { v.dataset.pearlPosterHydrated = 'fail'; return; }
    v.dataset.pearlPosterHydrated = 'pending';
    _hydratePearlMediaOne(pearl, 'videoThumbnail').then(url => {
      v.poster = url;
      v.dataset.pearlPosterHydrated = '1';
    }).catch(e => {
      console.warn('[pearl poster hydrate fail]', pid, e && e.message);
      v.dataset.pearlPosterHydrated = 'fail';
    });
  });
}

// 진주 삭제 / 미디어 변경 시 blob URL cache 해제.
//   kind 지정 안 하면 photo/video/videoThumbnail 셋 다 제거.
function _revokePearlMediaCache(pearlId, kind) {
  if (!pearlId) return;
  const kinds = kind ? [kind] : ['photo', 'video', 'videoThumbnail'];
  for (const k of kinds) {
    const cacheKey = _pearlMediaCacheKey(pearlId, k);
    const url = _pearlMediaBlobCache.get(cacheKey);
    if (url) {
      try { URL.revokeObjectURL(url); } catch(_) {}
      _pearlMediaBlobCache.delete(cacheKey);
    }
  }
}
