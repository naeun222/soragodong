function _stripLeadingEmoji(s) {
  if (!s) return s;
  // unicode emoji + variation selectors + skin tone + ZWJ sequences 까지 leading 부분만 제거.
  // 안전하게: 첫 character 가 letter/digit 가 아니고 emoji property 가지면 strip.
  try {
    return s.replace(/^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}️‍]+\s*)+/u, '').trimStart();
  } catch(_) {
    return s;
  }
}

// V4: 진주 동영상 picker — 갤러리/카메라 양쪽 가능
function pickVideoFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    let resolved = false;
    input.addEventListener('change', () => {
      if (resolved) return; resolved = true;
      const file = input.files[0] || null;
      input.remove();
      resolve(file);
    });
    setTimeout(() => {
      window.addEventListener('focus', function once() {
        window.removeEventListener('focus', once);
        setTimeout(() => {
          if (resolved) return;
          if (!input.files || input.files.length === 0) {
            resolved = true;
            input.remove();
            resolve(null);
          }
        }, 400);
      }, { once: true });
    }, 100);
    input.click();
  });
}

// V4 fix v2 (사용자 보고: 압축본 안 보이고 재생 X): 압축 폐기 → 원본 그대로 + 길이/사이즈 가드.
// MediaRecorder 인코딩 broken 의심 + iOS Safari video data: URI 부분지원 의심 둘 다 우회.
// 원본 mp4 (H.264) = 모든 디바이스 native 디코딩 OK. 렌더는 blob URL 로.
async function _getVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    v.onloadedmetadata = () => {
      const d = v.duration || 0;
      try { URL.revokeObjectURL(url); } catch(_) {}
      resolve(d);
    };
    v.onerror = () => {
      try { URL.revokeObjectURL(url); } catch(_) {}
      resolve(-1);
    };
    setTimeout(() => resolve(-1), 5000);
  });
}

async function _fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}

// V4 fix v2: 진주 동영상 hydration — state 의 dataURL 을 blob URL 로 변환해 video src 적용하기.
// iOS Safari `<video>` data: URI 부분지원 회피. cache 로 1회 발급 후 재사용.
const _pearlVideoBlobCache = new Map(); // pearlId -> blobUrl
function hydratePearlVideos() {
  try {
    document.querySelectorAll('video[data-pearl-vid]').forEach(v => {
      // 사용자 보고 2026-05-02 ultrathink: 영상 진주 소리 X 버그 — video element 의 muted 강제 X 명시.
      // iOS Safari 일부 케이스 default muted 적용 가능성 차단 (Web Audio session conflict 등).
      v.muted = false;
      v.volume = 1.0;
      if (v.dataset.hydrated === '1' && v.src) return;
      const id = v.dataset.pearlVid;
      const cached = _pearlVideoBlobCache.get(id);
      if (cached) {
        v.src = cached;
        v.dataset.hydrated = '1';
        return;
      }
      const pearl = (state.pearls || []).find(p => p.id === id);
      if (!pearl || !pearl.video) return;
      // V4 fix v5 (사용자 보고 2026-05-04): blob 변환 실패 시 data URL 직접 세팅 fallback (재생 불가 회피).
      fetch(pearl.video).then(r => r.blob()).then(b => {
        const url = URL.createObjectURL(b);
        _pearlVideoBlobCache.set(id, url);
        v.src = url;
        v.dataset.hydrated = '1';
      }).catch(e => {
        console.warn('video hydrate blob fail, data URL fallback:', e);
        try {
          v.src = pearl.video;
          v.dataset.hydrated = '1';
        } catch(_) {}
      });
    });
  } catch(_) {}
}

// 진주 삭제 시 cache cleanup
function _revokePearlVideoCache(pearlId) {
  const url = _pearlVideoBlobCache.get(pearlId);
  if (url) {
    try { URL.revokeObjectURL(url); } catch(_) {}
    _pearlVideoBlobCache.delete(pearlId);
  }
}

// 사용자 명시 2026-05-03: 영상 5초 limit + trim UI (Twitter/Instagram 스타일).
// thumbnail = 8 frame strip + start/end handle drag + selected range max maxSec sec.
// resolve: { startTime, endTime } 또는 null (cancel).
let _vtmState = null;

async function _generateVideoThumbnails(video, count) {
  const thumbs = [];
  const W = 80, H = 50;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const dur = video.duration;
  for (let i = 0; i < count; i++) {
    const t = (dur / count) * i + (dur / count) * 0.5;  // 중앙 시점
    await new Promise((res) => {
      let done = false;
      const onSeeked = () => {
        if (done) return; done = true;
        video.removeEventListener('seeked', onSeeked);
        res();
      };
      video.addEventListener('seeked', onSeeked);
      try { video.currentTime = Math.min(t, dur - 0.01); } catch(_) { onSeeked(); }
      setTimeout(() => { if (!done) onSeeked(); }, 1500);
    });
    try { ctx.drawImage(video, 0, 0, W, H); thumbs.push(canvas.toDataURL('image/jpeg', 0.5)); }
    catch(_) { thumbs.push(''); }
  }
  try { video.currentTime = 0; } catch(_) {}
  return thumbs;
}

