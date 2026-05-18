// V4 (사용자 명시 2026-05-18 ultrathink): Phase 1A — Pearl 미디어 Storage helper.
//
// 배경: 옛 path 는 진주 video/photo 가 dataURL 로 state.pearls 안 박힘 → main row JSONB 가 4MB+ → cascade.
// 신 path: 미디어 = Supabase Storage bucket 'pearls' 안 E2EE 암호화 blob. state 엔 storage key 만.
//
// 보안 모델:
//   - 파일 = client 에서 master key 로 AES-GCM 암호화 → bucket 에 raw bytes 저장.
//   - 회사 / DB / Storage 운영자도 평문 볼 수 X (E2EE spec 유지).
//   - Storage RLS = auth_user_id 매칭 폴더만 (migration 0032 의 policy).
//
// 경로 패턴: '<auth_user_id>/<pearl_id>_<kind>.bin'
//   kind = 'video' | 'photo' | 'video_thumbnail'
//
// 사용 흐름 (Phase 1C 후):
//   1) 새 진주 capture → file bytes 받음 → _uploadPearlMedia(pearlId, 'video', bytes, masterKey) → storageKey 반환
//   2) state.pearls 에 { videoStorageKey: '<auth>/<pid>_video.bin', videoStorageIv: '<b64>' } 저장
//   3) main row PATCH 시 storageKey 만 같이 saved (dataURL X — main row 가벼움)
//   4) render 시 _downloadPearlMedia(storageKey, iv, masterKey) → blob URL → <img src> / <video src>
//
// Phase 1A = 이 파일 (helper 만). Phase 1B = 마이그 tool. Phase 1C = capture flow. Phase 1D = render flow.

const _PEARL_STORAGE_BUCKET = 'pearls';

// ─────────────────────────────────────────────────────────────────────────────
// E2EE 바이너리 헬퍼 — 04-e2ee-helpers.js 의 _e2eeEncrypt/_e2eeDecrypt 는 base64 wrapper 객체.
// Storage 는 raw bytes 가 효율 좋아 별도 helper.
// 포맷: [iv 12바이트] [ciphertext + tag] — 단일 Uint8Array. 복호화 시 첫 12B = iv.
// ─────────────────────────────────────────────────────────────────────────────

async function _e2eeEncryptBytes(bytes, key) {
  if (!bytes || !(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) {
    throw new Error('encryptBytes: bytes must be Uint8Array or ArrayBuffer');
  }
  const input = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, input);
  const cipherBytes = new Uint8Array(cipher);
  // 결과 = iv + cipherBytes — 단일 blob.
  const out = new Uint8Array(iv.length + cipherBytes.length);
  out.set(iv, 0);
  out.set(cipherBytes, iv.length);
  return out;
}

async function _e2eeDecryptBytes(bytes, key) {
  if (!bytes || (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer))) {
    throw new Error('decryptBytes: bytes must be Uint8Array or ArrayBuffer');
  }
  const input = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (input.length < 13) throw new Error('decryptBytes: input too short (need at least iv + 1 byte)');
  const iv = input.slice(0, 12);
  const cipherBytes = input.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return new Uint8Array(plain);
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage REST API helpers — auth: Bearer access_token. RLS 가 auth.uid() 매칭 강제.
// ─────────────────────────────────────────────────────────────────────────────

function _pearlStoragePath(authUserId, pearlId, kind) {
  if (!authUserId || !pearlId || !kind) throw new Error('storagePath: 인자 누락');
  return `${authUserId}/${pearlId}_${kind}.bin`;
}

function _pearlStorageUrl(path) {
  if (typeof SUPABASE_URL !== 'string') throw new Error('SUPABASE_URL 미설정');
  return `${SUPABASE_URL}/storage/v1/object/${_PEARL_STORAGE_BUCKET}/${path}`;
}

// 미디어 업로드 — bytes (Uint8Array / ArrayBuffer) + masterKey 받아서 암호화 → Storage POST.
// 성공 시 { ok: true, path } 반환. 실패 시 throw.
// kind = 'video' | 'photo' | 'video_thumbnail'
async function _uploadPearlMedia(pearlId, kind, bytes, masterKey) {
  if (!authUserId) throw new Error('uploadPearlMedia: 비인증 (authUserId 없음)');
  if (!masterKey) throw new Error('uploadPearlMedia: master key 없음 (E2EE 미활성)');
  if (!session || !session.access_token) throw new Error('uploadPearlMedia: session.access_token 없음');
  const encrypted = await _e2eeEncryptBytes(bytes, masterKey);
  const path = _pearlStoragePath(authUserId, pearlId, kind);
  const url = _pearlStorageUrl(path);
  // x-upsert: true — 같은 경로 덮어쓰기 허용 (재시도 / 같은 진주 다시 업로드).
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
    throw new Error(`uploadPearlMedia ${resp.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true, path };
}

// 미디어 다운로드 — path (storage key) + masterKey 받아서 GET + 복호화 → Uint8Array.
// 성공 시 bytes 반환. 실패 시 throw.
async function _downloadPearlMedia(path, masterKey) {
  if (!path) throw new Error('downloadPearlMedia: path 없음');
  if (!masterKey) throw new Error('downloadPearlMedia: master key 없음');
  if (!session || !session.access_token) throw new Error('downloadPearlMedia: session.access_token 없음');
  const url = _pearlStorageUrl(path);
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`downloadPearlMedia ${resp.status}: ${text.slice(0, 200)}`);
  }
  const buf = await resp.arrayBuffer();
  return await _e2eeDecryptBytes(new Uint8Array(buf), masterKey);
}

// 미디어 삭제 — Storage 에서 영구 제거. 진주 자체 삭제 / 미디어 교체 시 호출.
async function _deletePearlMedia(path) {
  if (!path) return { ok: false, reason: 'no-path' };
  if (!session || !session.access_token) return { ok: false, reason: 'no-auth' };
  const url = _pearlStorageUrl(path);
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

// dataURL → Uint8Array helper (옛 진주 마이그 + 신규 진주 캡처 둘 다 사용).
//   "data:video/mp4;base64,AAAA..." 같은 string 받아서 mime + bytes 반환.
function _dataUrlToBytes(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!m) return null;
  const mime = m[1];
  const isBase64 = m[2] === ';base64';
  const payload = m[3];
  let bytes;
  if (isBase64) {
    const bin = atob(payload);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    const dec = decodeURIComponent(payload);
    bytes = new TextEncoder().encode(dec);
  }
  return { mime, bytes };
}

// bytes + mime → blob URL (render 시 <img src> / <video src> 에 직접 박을 수 있음).
//   호출자가 URL.revokeObjectURL(url) 로 메모리 해제 책임. cache pattern 권장.
function _bytesToBlobUrl(bytes, mime) {
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}
