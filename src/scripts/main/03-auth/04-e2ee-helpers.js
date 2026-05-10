// 사용자도 / 회사도 평문 못 보게. WebCrypto AES-256-GCM + PBKDF2 1M iterations.
// 마스터 키: sessionStorage 저장 (탭 종료 시 자동 cleanup, XSS 노출 ↓).
// 사용자 지정 password (12자 이상) → PBKDF2로 마스터 키 암호화.
// 사용자 password 분실 시 cloud 복호화 X (회사도 복구 X — Phase 2 escrow 도입 전까지).
// ═══════════════════════════════════════════════════════════════

let _e2eeEnabled = false;
let _e2eeMasterKey = null;  // CryptoKey object (메모리만)
const _E2EE_LOCAL_KEY = 'soragodong_v4_e2ee_mk';
const _E2EE_VERSION = '1';

// === 핵심 헬퍼 ===

// 256-bit random 마스터 키 생성 (CryptoKey)
async function _e2eeGenerateMasterKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,  // extractable (password로 암호화 / device 이전 위해)
    ['encrypt', 'decrypt']
  );
}

// CryptoKey → base64 raw bytes
async function _e2eeExportKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return _b64encode(new Uint8Array(raw));
}

// base64 → CryptoKey
async function _e2eeImportKey(b64) {
  const raw = _b64decode(b64);
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// 사용자 지정 password → 256-bit key (PBKDF2 1M iterations — brute-force 매우 어려움)
// 12자 이상 password + PBKDF2 1M = 보안 강도 충분 (업계 password manager 표준).
async function _e2eePassphraseToKey(passphrase, saltB64) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: _b64decode(saltB64),
      iterations: 1000000,  // 1M (사용자 요청 2026-04-30 단순화 — 사용자 지정 password 보안 강화)
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// password 강도 검증 (12자 이상, 단순 brute-force 회피)
// 사용자 명시 2026-05-11 ultrathink: 테스트 계정 (soragodongapp@gmail.com) 한정 8자 허용 — 개발자 테스트 편의 (이미 8자로 설정된 케이스 호환). 그 외 12자 유지.
function _e2eeValidatePassword(pw) {
  if (!pw || typeof pw !== 'string') return { ok: false, reason: '비밀번호를 입력해주세요' };
  const _isTestAcct = (typeof session !== 'undefined') && session && session.user && session.user.email === 'soragodongapp@gmail.com';
  const _minLen = _isTestAcct ? 8 : 12;
  if (pw.length < _minLen) return { ok: false, reason: _minLen + '자 이상 필요해요 (현재 ' + pw.length + '자)' };
  if (/^\d+$/.test(pw)) return { ok: false, reason: '숫자만으로는 약해요. 단어 + 숫자 섞어주세요' };
  return { ok: true };
}

// 평문 → 암호문 (객체 형태: {iv, data})
async function _e2eeEncrypt(plaintext, key) {
  if (plaintext == null) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const data = enc.encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    _e2ee: _E2EE_VERSION,
    iv: _b64encode(iv),
    data: _b64encode(new Uint8Array(cipher))
  };
}

// 암호문 → 평문 (string)
async function _e2eeDecrypt(cipher, key) {
  if (!cipher || typeof cipher !== 'object' || !cipher._e2ee) return cipher;
  try {
    const iv = _b64decode(cipher.iv);
    const data = _b64decode(cipher.data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const dec = new TextDecoder();
    return dec.decode(plain);
  } catch (e) {
    console.warn('[e2ee] decrypt 실패:', e);
    return null;
  }
}

// base64 인코딩/디코딩 헬퍼
function _b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function _b64decode(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// 마스터 키 init — localStorage 우선 (PWA standalone 호환). sessionStorage 잔여도 체크 (옛 Phase 0 마이그레이션).
// 사용자 보고 2026-05-02 ultrathink: iOS Safari PWA standalone 의 sessionStorage 가 매 진입 자동 cleanup (OS 동작) → 매번 비밀번호 모달.
// fix: Phase 0 (sessionStorage) → localStorage 후퇴. XSS raw 노출은 둘 다 동일 (JS 접근 가능) — 차이 = lifetime 만. UX 우선.
