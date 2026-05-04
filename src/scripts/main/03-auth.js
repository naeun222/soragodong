// ═══════════════════════════════════════════════════════════════
// AUTH (Supabase magic link)
// ═══════════════════════════════════════════════════════════════
async function checkSession() {
  // Check if returning from magic link (URL hash contains tokens)
  if (window.location.hash.includes('access_token')) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token) {
      session = { access_token, refresh_token };
      // Get user info
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${access_token}` }
      });
      if (userResp.ok) {
        const user = await userResp.json();
        session.user = user;
        authUserId = user.id;
        localStorage.setItem('soragodong_session', JSON.stringify(session));
        // Clean URL
        history.replaceState({}, document.title, window.location.pathname);
        return true;
      }
    }
  }
  // Check stored session
  const stored = localStorage.getItem('soragodong_session');
  if (stored) {
    try {
      session = JSON.parse(stored);
      // Verify token still valid
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` }
      });
      if (userResp.ok) {
        const user = await userResp.json();
        session.user = user;
        authUserId = user.id;
        return true;
      } else {
        // Try refresh
        if (session.refresh_token) {
          const refreshResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: session.refresh_token })
          });
          if (refreshResp.ok) {
            const newSession = await refreshResp.json();
            session = { ...session, access_token: newSession.access_token, refresh_token: newSession.refresh_token, user: newSession.user };
            authUserId = newSession.user.id;
            localStorage.setItem('soragodong_session', JSON.stringify(session));
            return true;
          }
        }
        // Refresh failed
        localStorage.removeItem('soragodong_session');
        session = null; authUserId = null;
        return false;
      }
    } catch (e) {
      console.error('Session check error:', e);
      localStorage.removeItem('soragodong_session');
      return false;
    }
  }
  return false;
}

async function sendOTP(email) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      create_user: true,
      // No emailRedirectTo → user gets a code AND a link, we use the code
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.msg || err.error_description || err.message || '코드 전송 실패');
  }
  return true;
}

async function verifyOTP(email, token) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      token,
      type: 'email'
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.msg || err.error_description || err.message || '코드가 틀렸어');
  }
  const data = await resp.json();
  // Returns { access_token, refresh_token, user }
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user
  };
  authUserId = data.user.id;
  localStorage.setItem('soragodong_session', JSON.stringify(session));
  return true;
}

async function logout() {
  const yes = await showConfirmModal({
    title: '로그아웃할까?',
    message: '데이터는 클라우드에 안전히 보관돼.',
    okLabel: '로그아웃',
    cancelLabel: '취소'
  });
  if (!yes) return;
  if (session && session.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` }
      });
    } catch (e) {}
  }
  localStorage.removeItem('soragodong_session');
  localStorage.removeItem('soragodong_v2');  // 혹시 V3 잔존 키 청소
  localStorage.removeItem(V4_LOCAL_STORAGE_KEY);
  localStorage.removeItem(V4_LAST_USER_KEY);
  // 사용자 명시 2026-05-01 (agent audit): logout E2EE 키 정리. 같은 device 다른 사용자 로그인 시 stale 차단.
  // 사용자 명시 2026-05-02 Phase 0: sessionStorage masterKey 도 cleanup.
  try {
    localStorage.removeItem('soragodong_v4_e2ee_mk');
    sessionStorage.removeItem('soragodong_v4_e2ee_mk');
    localStorage.removeItem('soragodong_v4_e2ee_recovery');
    localStorage.removeItem('soragodong_v4_e2ee_setup_dismissed');
  } catch {}
  session = null;
  authUserId = null;
  location.reload();
}

// 사용자 요청 2026-04-30: 회원 탈퇴 — 약관 8조 의무 (즉시 데이터 삭제 + 결제 기록만 5년 보존).
async function withdrawAccount() {
  const yes1 = await showConfirmModal({
    title: '회원 탈퇴할까?',
    message: '⚠️ 모든 자기관찰 데이터가 영구 삭제됩니다.\n\n· 일기 / 체크인 / 대화 / 진주 / 전략 / 모델 — 즉시 삭제\n· 결제 기록 — 5년 보존 (전자상거래법, 익명화)\n· 복구 불가\n\n탈퇴 전 [📁 파일로 백업] 권장.',
    okLabel: '계속',
    cancelLabel: '취소'
  });
  if (!yes1) return;
  const yes2 = await showConfirmModal({
    title: '진짜 탈퇴? (마지막 확인)',
    message: '이대로 진행하면 데이터 복구 X. 정말?',
    okLabel: '탈퇴 진행',
    cancelLabel: '아니, 취소'
  });
  if (!yes2) return;

  showToast('탈퇴 처리 중...');

  // 1. cloud DELETE — 사용자의 모든 V4 row (auth_user_id 기준)
  let cloudDeleted = false;
  if (authUserId) {
    for (let attempt = 0; attempt < 3 && !cloudDeleted; attempt++) {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}`,
          { method: 'DELETE', headers: authHeaders() }
        );
        if (resp.ok || resp.status === 204 || resp.status === 200) {
          cloudDeleted = true;
        }
      } catch (e) { console.error('withdraw cloud delete:', e); }
    }
    if (!cloudDeleted) {
      alert('⚠ cloud 삭제 실패. 네트워크 확인 후 다시 시도해줘.');
      return;
    }
  }

  // 2. Supabase auth.users row + billing/payments/feedback/usage 익명화 / 삭제 — 백엔드 endpoint.
  // 사용자 보고 2026-04-30 review (agent P0-3): 옛 코드는 catch swallow → 결제·사용량 row 잔존인데 "탈퇴 완료" 표시. 응답 검증 + 실패 시 명확 알림 + abort.
  if (typeof BACKEND_BASE !== 'undefined' && BACKEND_BASE) {
    let backendOk = false;
    let backendErr = '';
    try {
      const r = await _authedFetch(`${BACKEND_BASE}/api/account/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
      });
      if (r.ok) {
        backendOk = true;
      } else {
        backendErr = 'HTTP ' + r.status + ' — ' + (await r.text().catch(() => '')).slice(0, 200);
      }
    } catch (e) {
      backendErr = (e && e.message) || String(e);
    }
    if (!backendOk) {
      const proceed = confirm('⚠ 백엔드 탈퇴 실패: ' + backendErr + '\n\nSupabase 인증 row + 결제·사용량 데이터가 남아있을 수 있어. 회사가 사후 일괄 정리할 수 있지만 즉시 정리 X.\n\n그래도 로컬 정리 + 로그아웃은 진행할까?');
      if (!proceed) return;
      console.warn('[withdraw] backend 실패 후 사용자 동의로 진행:', backendErr);
    }
  }

  // 3. localStorage 전부 정리 (API 키 preserve도 X — 탈퇴 = 모든 흔적 제거)
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('soragodong') || k.startsWith('me_v4') || k.startsWith('sb-')) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) { console.error('localStorage clear:', e); }

  // 4. Supabase auth signOut
  if (session && session.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` }
      });
    } catch (e) {}
  }

  // 5. 메모리 비우고 reload
  session = null;
  authUserId = null;
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  alert('탈퇴 완료. 다음 진입 시 재가입 가능해.');
  location.reload();
}

function authHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${session.access_token}`
  };
}

// 사용자 요청 2026-04-28: 서버 시간 동기화 — 디바이스 시계 잘못돼도 정확한 시간 사용
let _serverTimeOffset = 0;  // serverTime - localTime (ms)
async function syncServerTime() {
  try {
    // 사용자 보고 2026-05-01: Supabase /rest/v1/ HEAD 가 401 ('No API key found' 오해 메시지) — apikey 보내도 root endpoint 가 HEAD 거부.
    // → 우리 own origin /version.txt HEAD (Cloudflare 시간, NTP 동기, 인증 X).
    const start = Date.now();
    const resp = await fetch('/version.txt?_t=' + start, { method: 'HEAD', cache: 'no-store' });
    const end = Date.now();
    const dateHeader = resp.headers.get('Date');
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      const networkLag = (end - start) / 2;  // 절반은 응답 받는 시간
      const adjustedLocal = (start + end) / 2;  // request 평균 시점
      _serverTimeOffset = serverMs - adjustedLocal;
      if (Math.abs(_serverTimeOffset) > 60000) {  // 1분 이상 차이
        console.log(`[serverTime] offset: ${Math.round(_serverTimeOffset / 60000)}분 차이 (디바이스 시계 부정확)`);
      }
    }
  } catch (e) { console.warn('serverTime sync failed:', e); }
}
function getServerNow() {
  return new Date(Date.now() + _serverTimeOffset);
}
function getServerNowMs() {
  return Date.now() + _serverTimeOffset;
}

// ═══════════════════════════════════════════════════════════════
// E2EE (Stage 2) — 사용자 요청 2026-04-30 / Phase 0 강화 2026-05-02
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
function _e2eeValidatePassword(pw) {
  if (!pw || typeof pw !== 'string') return { ok: false, reason: '비밀번호를 입력해주세요' };
  if (pw.length < 12) return { ok: false, reason: '12자 이상 필요해요 (현재 ' + pw.length + '자)' };
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
async function _e2eeInitMasterKey() {
  if (_e2eeMasterKey) return _e2eeMasterKey;
  try {
    let raw = localStorage.getItem(_E2EE_LOCAL_KEY);
    if (!raw) {
      // sessionStorage 잔여 (Phase 0 옛 사용자) → localStorage 으로 마이그레이션
      const sessionRaw = sessionStorage.getItem(_E2EE_LOCAL_KEY);
      if (sessionRaw) {
        localStorage.setItem(_E2EE_LOCAL_KEY, sessionRaw);
        sessionStorage.removeItem(_E2EE_LOCAL_KEY);
        raw = sessionRaw;
        console.log('[e2ee] sessionStorage → localStorage 마이그레이션 (PWA UX fix)');
      }
    }
    if (!raw) return null;
    _e2eeMasterKey = await _e2eeImportKey(raw);
    return _e2eeMasterKey;
  } catch (e) {
    console.warn('[e2ee] master key init 실패:', e);
    return null;
  }
}

// 새 마스터 키 + 사용자 지정 password → localStorage 저장 + cloud에 password로 암호화 마스터 키 저장.
async function _e2eeSetupNewUser(userPassword) {
  const validation = _e2eeValidatePassword(userPassword);
  if (!validation.ok) throw new Error(validation.reason);

  const masterKey = await _e2eeGenerateMasterKey();
  const masterKeyB64 = await _e2eeExportKey(masterKey);

  // 사용자 보고 2026-05-02 ultrathink: PWA standalone 의 sessionStorage 매 진입 cleanup → 매번 비밀번호 모달.
  // fix: localStorage 으로 저장 (PWA + 일반 브라우저 둘 다 보존). XSS 노출은 sessionStorage/localStorage 동일.
  try {
    localStorage.setItem(_E2EE_LOCAL_KEY, masterKeyB64);
    sessionStorage.removeItem(_E2EE_LOCAL_KEY);  // Phase 0 잔여 정리
  } catch (e) { console.warn('[e2ee] localStorage 저장 실패:', e); }

  // password로 마스터 키 암호화 (PBKDF2 1M)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = _b64encode(salt);
  const passwordKey = await _e2eePassphraseToKey(userPassword, saltB64);
  const encryptedMasterKey = await _e2eeEncrypt(masterKeyB64, passwordKey);

  _e2eeMasterKey = masterKey;

  try {
    localStorage.setItem('soragodong_v4_e2ee_recovery', JSON.stringify({
      salt: saltB64,
      encryptedMasterKey,
      version: _E2EE_VERSION
    }));
  } catch (e) {}

  return { masterKey, salt: saltB64, encryptedMasterKey };
}

// 사용자 명시 2026-05-02 Phase 1: 비밀번호 변경 — KEK 만 갱신, DEK 자체는 그대로 (데이터 재암호화 X).
// 흐름: 기존 P → KEK_old → unwrap → DEK 추출 → 새 P → KEK_new → wrap(DEK, KEK_new) → round-trip 검증 → cloud 갱신.
async function _e2eeChangePassword(oldPassword, newPassword) {
  const validation = _e2eeValidatePassword(newPassword);
  if (!validation.ok) throw new Error(validation.reason);

  // 1. 기존 recovery 데이터 가져옴 (localStorage)
  let salt, encryptedMasterKey;
  try {
    const local = JSON.parse(localStorage.getItem('soragodong_v4_e2ee_recovery') || 'null');
    if (local && local.salt && local.encryptedMasterKey) {
      salt = local.salt;
      encryptedMasterKey = local.encryptedMasterKey;
    }
  } catch {}
  if (!salt || !encryptedMasterKey) {
    throw new Error('기존 비밀번호 데이터를 찾을 수 없어요. 새로고침 후 다시 시도해주세요.');
  }

  // 2. 기존 password 로 unwrap → DEK 추출
  const oldKEK = await _e2eePassphraseToKey(oldPassword, salt);
  const masterKeyB64 = await _e2eeDecrypt(encryptedMasterKey, oldKEK);
  if (!masterKeyB64) {
    throw new Error('기존 비밀번호가 맞지 않아요.');
  }

  // 3. 새 password 로 wrap (새 salt 도 함께 갱신 — entropy 강화)
  const newSaltBytes = crypto.getRandomValues(new Uint8Array(16));
  const newSaltB64 = _b64encode(newSaltBytes);
  const newKEK = await _e2eePassphraseToKey(newPassword, newSaltB64);
  const newEncryptedMasterKey = await _e2eeEncrypt(masterKeyB64, newKEK);

  // 4. round-trip 검증 — 새 wrap 으로 즉시 unwrap 시 DEK 동일?
  const verifyKEK = await _e2eePassphraseToKey(newPassword, newSaltB64);
  const verifyMasterKeyB64 = await _e2eeDecrypt(newEncryptedMasterKey, verifyKEK);
  if (verifyMasterKeyB64 !== masterKeyB64) {
    throw new Error('round-trip 검증 실패. 다시 시도해주세요.');
  }

  // 5. localStorage 갱신 (cloud 는 saveToCloudNow 가 자동 sync)
  try {
    localStorage.setItem('soragodong_v4_e2ee_recovery', JSON.stringify({
      salt: newSaltB64,
      encryptedMasterKey: newEncryptedMasterKey,
      version: _E2EE_VERSION
    }));
  } catch (e) { console.warn('[e2ee] localStorage 갱신 실패:', e); }

  // 6. 즉시 cloud sync
  if (typeof saveToCloudNow === 'function') {
    saveToCloudNow().catch(e => console.warn('[e2ee] cloud sync 실패:', e));
  }

  console.log('[e2ee] 비밀번호 변경 완료 (DEK 보존, KEK 갱신, round-trip OK)');
  return { salt: newSaltB64, encryptedMasterKey: newEncryptedMasterKey };
}

// 사용자 명시 2026-05-02: 모두 동의 체크박스 — 4개 모두 toggle + 개별 → 모두 동의 sync.
const _SETUP_CONSENT_IDS = ['setupConsentTerms', 'setupConsentSensitive', 'setupConsentCrossBorder', 'setupConsentAdult'];
function _toggleAllSetupConsents(allEl) {
  _SETUP_CONSENT_IDS.forEach(id => {
    const c = document.getElementById(id);
    if (c) c.checked = allEl.checked;
  });
}
function _syncSetupAllConsent() {
  const all = document.getElementById('setupConsentAll');
  if (!all) return;
  all.checked = _SETUP_CONSENT_IDS.every(id => {
    const c = document.getElementById(id);
    return c && c.checked;
  });
}

// 사용자 명시 2026-05-02: 비밀번호 설정 모달 안 동의 항목 자세히 펼침 토글.
// 체크박스 click = stopPropagation 으로 동의 toggle 만 / 텍스트 + ▾ click = 펼침.
function _toggleSetupConsent(btn) {
  const row = btn && btn.closest && btn.closest('.setup-consent-row');
  if (!row) return;
  // detail 자리 찾기 — sibling 으로 있거나 setup-consent-warn 다음에 있음.
  let next = row.nextElementSibling;
  while (next && !next.classList.contains('setup-consent-detail')) {
    next = next.nextElementSibling;
  }
  if (!next) return;
  const caret = btn.querySelector('.setup-consent-caret');
  if (next.hasAttribute('hidden')) {
    next.removeAttribute('hidden');
    if (caret) caret.textContent = '▴';
  } else {
    next.setAttribute('hidden', '');
    if (caret) caret.textContent = '▾';
  }
}

// 사용자 요청 2026-04-30: 비밀번호 input 보기/숨기기 토글 (👁).
function _togglePwView(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === 'password') {
    el.type = 'text';
    if (btn) { btn.textContent = '🙈'; btn.style.color = 'var(--accent)'; }
  } else {
    el.type = 'password';
    if (btn) { btn.textContent = '👁'; btn.style.color = 'var(--text-soft)'; }
  }
}

// 사용자 요청 2026-04-30: 새 device 진입 시 password 복원 모달.
// loadFromCloud에서 _encryptedBody 있는데 마스터 키 X면 window._e2eePendingRecovery 넣음. 진입 후 모달.
async function maybeShowE2EERecoveryModal() {
  if (!window._e2eePendingRecovery) return;
  // 사용자 보고 2026-04-30 (paranoid): master key 이미 활성이면 modal 띄우지 X.
  // 정상 흐름에선 pending 적용될 때 master key는 null인데, 어떤 race로 둘 다 set되면 modal 잘못 뜸.
  if (_e2eeMasterKey && _e2eeEnabled) {
    console.warn('[E2EE] pending recovery flag stale — clearing (master key already active)');
    window._e2eePendingRecovery = null;
    return;
  }
  if (document.getElementById('e2eeRecoveryOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10001';
  overlay.id = 'e2eeRecoveryOverlay';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:420px; padding:24px;">
      <div style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:8px;">🔐 비밀번호 입력</div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        새 기기에서 처음 로그인하셨네요. 활성화 시 설정하신 <strong>비밀번호</strong>를 입력해주세요.<br><br>
        <span style="color:var(--text-soft);">암호화된 데이터를 복호화해서 가져옵니다.</span>
      </div>
      <div style="position:relative;">
        <input type="password" id="e2eePassphraseInput" placeholder="비밀번호 (12자 이상)" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-size:14px; padding:10px 40px 10px 10px;">
        <button type="button" onclick="_togglePwView('e2eePassphraseInput', this)" title="보기 / 숨기기" aria-label="비밀번호 보기 토글" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div id="e2eeRecoveryStatus" style="font-size:11px; color:var(--text-soft); margin-top:8px; min-height:14px;"></div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn-primary" onclick="submitE2EERecovery()" style="flex:1;">복호화하고 시작</button>
        <button class="btn-secondary" onclick="cancelE2EERecovery()" style="flex:1;">나중에</button>
      </div>
      <div style="font-size:10.5px; color:#e8a3a3; margin-top:14px; line-height:1.6; padding:8px 10px; background:rgba(232,163,163,0.06); border-left:3px solid rgba(232,163,163,0.4); border-radius:0 6px 6px 0;">
        ⚠️ 비밀번호 분실 시 데이터 <b>영구 복구 불가</b> (회사도 X). 안전한 곳에 보관해줘.
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function submitE2EERecovery() {
  const input = document.getElementById('e2eePassphraseInput');
  const status = document.getElementById('e2eeRecoveryStatus');
  if (!input || !status) return;
  const password = input.value;
  if (!password || password.length < 12) {
    status.textContent = `비밀번호 12자 이상 (현재 ${password.length}자)`;
    status.style.color = '#e89090';
    return;
  }
  // 사용자 보고 2026-04-30 ultrathink: localStorage 비어있어도 cloud _e2eeRecovery 에서 가져옴 (multi-source fallback).
  // 옛 hasRecoveryLocal check 는 multi-source fallback 적용돼서 더 이상 필요 X — _e2eeRestoreFromPassphrase 가 NO_RECOVERY 던지면 그때 안내.
  status.textContent = '복호화 중... (recovery 후보 다 시도)';
  status.style.color = 'var(--text-soft)';
  try {
    let masterKey;
    try {
      masterKey = await _e2eeRestoreFromPassphrase(password);
    } catch (e) {
      if (e && e.code === 'NO_RECOVERY') {
        status.textContent = '비밀번호 데이터를 찾을 수 없어요. 안전을 위해 데이터 영구 복구 X.';
        status.style.color = '#e89090';
        return;
      }
      throw e;
    }
    if (!masterKey) {
      status.textContent = '비밀번호 일치 X (모든 recovery source 시도). Caps Lock / 한영 / 자판 / 자주 쓰는 변형 확인. 또는 [🔓 비밀번호 잊음].';
      status.style.color = '#e89090';
      return;
    }
    // 복호화 성공 — pending recovery 데이터로 state 복원
    const pending = window._e2eePendingRecovery;
    if (pending && pending._encryptedBody) {
      const decryptedJson = await _e2eeDecrypt(pending._encryptedBody, masterKey);
      if (decryptedJson) {
        const decryptedBody = JSON.parse(decryptedJson);
        const { _encryptedBody, ...metaPart } = pending;
        state = { ...DEFAULT_STATE, ...metaPart, ...decryptedBody };
        _e2eeEnabled = true;
      } else {
        // decrypt 실패 — master key 맞는데 encrypted blob 손상? 사용자에게 alert 후 abort.
        console.error('[E2EE recovery] master key 복원 OK인데 cloud encrypted blob decrypt 실패. blob 손상 가능성.');
        status.textContent = 'cloud 데이터 복호화 실패 (blob 손상 가능). 새로고침 후 [비밀번호 잊음] 버튼으로 백업 복구 시도해줘.';
        status.style.color = '#e89090';
        return;
      }
    }
    window._e2eePendingRecovery = null;
    // 사용자 보고 2026-04-30 (race fix): saveState 단순 debounce + reload 즉시 실행 → cloud 저장 X.
    // 복원된 master key + 정리된 state를 cloud에 즉시 넣어야 다음 진입 시 동일 master key로 정상 decrypt.
    console.log('[E2EE recovery] 복호화 성공. cloud 저장 강제 (reload 전)...');
    try {
      saveState({ force: true });  // local 즉시 flush
      await saveToCloudNow();       // cloud 즉시 저장 (await)
      console.log('[E2EE recovery] cloud 저장 완료. reload.');
    } catch (e) {
      console.warn('[E2EE recovery] cloud 저장 실패 (그래도 reload 진행):', e);
    }
    const overlay = document.getElementById('e2eeRecoveryOverlay');
    if (overlay) overlay.remove();
    showToast('🔐 복호화 완료 ✦');
    location.reload();
  } catch (e) {
    status.textContent = '복호화 실패: ' + (e.message || e);
    status.style.color = '#e89090';
  }
}

function cancelE2EERecovery() {
  const yes = confirm('비밀번호 입력 X면 본인 데이터 접근 불가능 (회사도 못 봅니다). 나중에 입력하시려면 새로고침. 정말 취소?');
  if (!yes) return;
  const overlay = document.getElementById('e2eeRecoveryOverlay');
  if (overlay) overlay.remove();
}

// 사용자 요청 2026-04-30: 비밀번호 잊음 — 자동 백업 (평문) 에서 복원하고 새로 시작.
// E2EE 암호화된 cloud row는 영원히 복구 불가능 (회사도 X) — 단 자동 백업은 평문이라 복구 가능.
async function e2eeForgotPasswordReset() {
  if (!authUserId) { alert('로그인이 필요해요.'); return; }
  // 1. auto-backup 조회
  const status = document.getElementById('e2eeRecoveryStatus');
  if (status) { status.textContent = '백업 검색 중...'; status.style.color = 'var(--text-soft)'; }
  let snapshots = [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_AUTO_BACKUP_USER_ID}&select=data&limit=1`,
      { headers: authHeaders() }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
        snapshots = rows[0].data.snapshots.slice();
      }
    }
    // 수동 백업도 함께 검색
    const resp2 = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_MANUAL_BACKUP_USER_ID}&select=data&limit=1`,
      { headers: authHeaders() }
    );
    if (resp2.ok) {
      const rows2 = await resp2.json();
      if (rows2.length > 0 && rows2[0].data && Array.isArray(rows2[0].data.snapshots)) {
        for (const s of rows2[0].data.snapshots) snapshots.push({ ...s, _manual: true });
      }
    }
  } catch (e) {
    if (status) { status.textContent = '백업 조회 실패: ' + (e.message || e); status.style.color = '#e89090'; }
    return;
  }
  // 평문 (E2EE 적용 전) snapshot만 필터 — _encryptedBody 있으면 암호화됨이라 복원 X
  const validSnaps = snapshots.filter(s => s && s.data && !s.data._encryptedBody);
  if (validSnaps.length === 0) {
    alert(
      '복원 가능한 평문 백업이 없어요.\n\n' +
      '자동/수동 백업이 모두 E2EE 활성 후에 적용된 거라 같은 비밀번호로만 복호화돼요.\n\n' +
      '해결책 (위에서 시도):\n' +
      '· 비밀번호 다시 떠올려보기 (Caps Lock / 자판 / 자주 쓰는 변형)\n' +
      '· 카톡 나에게 보내기 / 폰 메모 앱 / 손글씨 메모 검색\n\n' +
      '정말 비밀번호를 모르신다면 [회원 탈퇴 → 재가입] 으로 빈 상태 시작이 마지막 옵션이에요.'
    );
    return;
  }
  // snapshot 시간순 (최신 먼저)
  validSnaps.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  // 2. 사용자에게 옵션 제시
  const list = validSnaps.map((s, i) => {
    const dt = new Date(s.ts).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const reasonLabel = s._manual ? '수동' : (s.reason || '자동');
    const entriesCount = Object.keys(s.data?.entries || {}).length;
    const noteLabel = s.note ? ` · ${s.note}` : '';
    return `${i + 1}. ${dt} (${reasonLabel}, 일기 ${entriesCount}개)${noteLabel}`;
  }).join('\n');
  const idxStr = prompt(
    '복원 가능한 백업:\n\n' + list + '\n\n' +
    '복원할 번호를 입력해주세요 (1 = 최신).\n' +
    '취소하시려면 빈 칸으로 확인.'
  );
  if (!idxStr) return;
  const idx = parseInt(idxStr, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= validSnaps.length) {
    alert('번호가 잘못됐어요.');
    return;
  }
  const chosen = validSnaps[idx];

  // 3. 마지막 확인
  const confirmMsg =
    `복원: ${new Date(chosen.ts).toLocaleString('ko-KR')}\n` +
    (chosen.note ? `메모: ${chosen.note}\n` : '') +
    `일기 ${Object.keys(chosen.data?.entries || {}).length}개\n\n` +
    `⚠️ 진행 시:\n` +
    `· 현재 E2EE 비밀번호 영구 무효화\n` +
    `· 암호화된 cloud 데이터 영구 손실 (이미 복구 X 이므로 OK)\n` +
    `· 위 백업 시점으로 데이터 복구\n` +
    `· E2EE OFF 상태로 시작 (필요하면 설정에서 새 비밀번호로 재활성화)\n\n` +
    `진행할까요?`;
  if (!confirm(confirmMsg)) return;

  // 4. E2EE 상태 전부 정리
  try {
    localStorage.removeItem('soragodong_v4_e2ee_recovery');
    localStorage.removeItem('soragodong_v4_e2ee_mk');
    localStorage.removeItem('soragodong_v4_e2ee_setup_dismissed');
  } catch {}
  _e2eeMasterKey = null;
  _e2eeEnabled = false;
  window._e2eePendingRecovery = null;  // 중요: saveToCloudNow 차단 풀음

  // 5. state를 snapshot으로 교체
  state = { ...DEFAULT_STATE, ...JSON.parse(JSON.stringify(chosen.data)) };
  // E2EE 메타도 초기화 (혹시 snapshot에 _e2eeEnabled 들어가 있으면 정리)
  delete state._encryptedBody;
  delete state._e2eeRecovery;
  if (state.preferences) {
    delete state.preferences._e2eeEnabled;
    delete state.preferences._e2eeVersion;
  }

  // 6. cloud 평문 저장 (메인 row의 _encryptedBody 영구 덮어쓰기)
  try {
    if (typeof saveToCloudNow === 'function') await saveToCloudNow();
  } catch (e) {
    alert('cloud 저장 실패: ' + (e.message || e) + '\n\n새로고침 후 자동 재시도됩니다.');
  }

  // 7. 사용자 보고 2026-04-30 review (agent P1-4): backup row 들의 _e2eeRecovery 도 strip.
  // 안 그러면 다음 setupE2EE 시 multi-source fallback 의 unwrapOnlySuccess path 가 옛 wrap 기반 reload 사이클 트리거.
  // best-effort — 실패해도 reload 진행.
  try {
    const backupIds = [V4_TESTER_BACKUP_USER_ID, V4_AUTO_BACKUP_USER_ID, V4_MANUAL_BACKUP_USER_ID];
    for (const uid of backupIds) {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${uid}&select=data&limit=1`,
          { headers: authHeaders() }
        );
        if (!r.ok) continue;
        const rows = await r.json();
        if (!rows[0] || !rows[0].data || !rows[0].data._e2eeRecovery) continue;
        const cleaned = { ...rows[0].data };
        delete cleaned._e2eeRecovery;
        await fetch(
          `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${uid}`,
          {
            method: 'PATCH',
            headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ data: cleaned })
          }
        );
        console.log('[forgot-password] backup row ' + uid + ' 의 _e2eeRecovery strip');
      } catch (e) { console.warn('[forgot-password] backup row ' + uid + ' strip 실패:', e); }
    }
  } catch (e) { console.warn('[forgot-password] backup recovery cleanup 실패:', e); }

  // 8. 완료 → reload
  alert('✦ 복원 완료. 새로고침합니다.');
  location.reload();
}

// 사용자 요청 2026-04-30: 가입 시 E2EE password 자동 권유 (신규 사용자 + 미설정).
// 가입 직후 / 로그인 직후 진입 시 마스터 키 X + 미활성 + 진입 모달 안 떠있으면 자동 권유.
// ═══════════════════════════════════════════════════════════════
// FIRST-TOUCH ANALYSIS — 사용자 요청 2026-04-30 ultrathink
// 신규 사용자 진입 즉시 5문항 quiz → AI 첫 관찰 (정체성 + 가설 + 관찰 거리)
// 가설 ✓ → traits/patterns에 unverified 시드. 관찰 거리 → 첫 weekly review의 prevSeeds.
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 카드 시퀀스 prototype (Phase 0 인프라 + 카드 1 표지).
// 시각 우선 / 텍스트 최소 / Spotify Wrapped 풍 8 카드 narrative — 현재 카드 1 만 구현.
// ═══════════════════════════════════════════════════════════════
let _annualReviewState = null;

// 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 시드 데이터 빌더 (시드 페르소나). 시드 + 빈 state 미리보기 fallback 둘 다 사용.
// 사용자 명시 2026-05-02 ultrathink: 시드 narrative universal 통일 (주간 리뷰 시드 톤 일관).
// 옛 김나은 individual stories ("논문" / "도망친 일이 엔진" / "적성 vs 워라밸") → 보편 ADHD 자기관찰 (잠 / 산책 / 카페 / 마감 임박 / 환경).
// 신규 사용자 거리감 ↓. admin 본인 = real 데이터 generated 시 본인 narrative 자동 (sample 손실 0).
function _buildAnnualReviewSeedData(year) {
  const yr = year || (new Date().getFullYear() - 1);
  return {
    id: 'ar_seed_' + yr,
    type: 'annual',
    year: yr,
    completedAt: new Date().toISOString(),
    yearRange: `${yr} → ${yr + 1}`,
    oneWord: '회복',
    persona: '자책에서 관찰로 1년 — 결함이 아닌 작동 방식을 본 사람',
    personaReason: '잘 잔 다음날 4번 중 4번 가벼웠어. 카페 자리잡은 후 글이 술술. 패턴이 보였어.',
    stats: [
      { emoji: '📔', num: 226, label: '일기' },
      { emoji: '💬', num: 142, label: '대화' },
      { emoji: '🎯', num: '67%', label: '성공률' },
      { emoji: '✨', num: 31, label: '깨달음' },
      { emoji: '🧬', num: 4, label: '체화' },
      { emoji: '🐚', num: 1, label: '큰 결정' }
    ],
    finding1: {
      label: '너는 몰랐지만 내가 발견한 것',
      quote: '"오늘 일찍 잤더니 머리 맑아."',
      dataNum: '+한 단계',
      dataText: '평일 11시 전 잔 5일 중 4일.\n다음날 mood 한 단계 가벼움.',
      conclusion: '잘 자는 게 일이 아니라\n<span>너를 살리는 첫 번째 도구</span>였어'
    },
    finding2: {
      label: '또 하나',
      friendLow: '23',
      friendLowLabel: '집에서\n작업한 날',
      friendHigh: '41',
      friendHighLabel: '카페에서\n작업한 날',
      conclusion: '환경이 너를 만들어 — <span>의지보다\n자리</span>가 먼저였어'
    },
    // 사용자 명시 2026-05-02 ultrathink: 보편 ADHD 자기관찰 — 잠 / 환경 / 회복 / 활용 패턴.
    tree: {
      embodied: [
        { name: '잠 11시 전 자기',     emoji: '🌙' },
        { name: '환경 큐잉 (폰 멀리)', emoji: '🏠' },
        { name: '14일 숙성',           emoji: '🐚' },
        { name: '마감 임박 = 활용',    emoji: '⚡' }
      ],
      growing: [
        { name: '아침 산책',           emoji: '🚶' },
        { name: '새벽 4시 컷오프',     emoji: '🌅' },
        { name: '카페 자리잡음',       emoji: '☕' },
        { name: '딱 5분 룰',           emoji: '⏱' }
      ],
      trying: [
        { name: '통화 후 5분 산책',    emoji: '📞' },
        { name: '감정 후 운동',        emoji: '🏃' },
        { name: '회의 30분 전 정리',   emoji: '📋' }
      ],
      caption: '이제 이 정도는 너 혼자서도 해낼 수 있어 🫂'
    },
    beach: {
      diaryCount: 226,
      pearlCount: 31,
      bestPearl: '결함이 아니라 작동 방식'
    },
    // 사용자 명시 2026-05-02 ultrathink: '잊지 못할 순간' = 보편 ADHD 자기관찰 turning points. 사진 X (emoji + bg fallback 자동).
    moments_card: [
      { date: yr + '.04.18', text: '잠 11시 전 자기 시작 — 첫 주', emoji: '🌙', bg: 'linear-gradient(135deg, #5a4a72 0%, #2a2440 100%)' },
      { date: yr + '.07.05', text: '카페 자리잡음 — 환경의 힘 발견',   emoji: '☕', bg: 'linear-gradient(135deg, #8b6f47 0%, #3d3024 100%)' },
      { date: yr + '.10.12', text: '마감 임박 = 자연 진입 인정한 날',   emoji: '⚡', bg: 'linear-gradient(135deg, #c98c5a 0%, #5a3a24 100%)' }
    ],
    // 사용자 명시 2026-05-02 ultrathink: best_pearl = 보편 ADHD self-compassion (결함 아닌 작동 방식).
    best_pearl: {
      title: '결함이 아니라 작동 방식',
      summary: '마감 임박이면 빠르게 진입하는 거 — 고치려 하지 말고 활용해.',
      whyThisYear: '한 해 동안 일기·깨달음에 자꾸 등장한 한 마디야. "왜 미루지?" 자책하던 시절보다, "임박해야 진입 빠른 게 내 작동 방식" 받아들인 다음부터 일·휴식 둘 다 더 안정적이었어. 머리로 정한 "정상 작동" 보다 몸의 진짜 리듬이 더 정확했던 거야.'
    },
    realizations: {
      count: { scrap: 12, memo: 14, reflection: 5 },  // 합 31 = stats 의 깨달음 31 일치
      topTags: ['수면', '환경', '회복', '활용']
    },
    // 사용자 명시 2026-05-02 ultrathink: 깊은 숙고 = 보편 ADHD 자기관찰 — 기본기 vs 추진력.
    deep: {
      question: '"잘 자고 산책하는 게\n진짜 큰 일을 해내는 길일까?"',
      conclusion: '"기본기가 곧 추진력 — 회복 챙기면서 한다"',
      date: yr + '.10.05 → 10.18 · 14일'
    },
    // oneLine = 이미 universal — 보존.
    oneLine: '너 올해 많이 컸어.\n\n자책에서 관찰로,\n회피에서 회복으로.\n\n수고했어 🫂',
    // 사용자 명시 2026-04-30: 시드 진주 음악 카테고리 8곡 그대로 (artworkUrl + previewUrl + trackUrl). 자동 재생.
    // narrative arc 매핑 — 표지 (card1) = 마지막 (card10) = LNGSHOT Vanilla Days (수미상관).
    songs: {
      card1: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      },
      card2: {
        title: 'Pink + White', artist: 'Frank Ocean',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/bb4568f3-68cd-619d-fbcb-4e179916545d/BlondCover-Final.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/45/a8/a2/45a8a2e0-9516-86b2-66ea-e8b2bf71de68/mzaf_10773372944954067241.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/pink-white/1146195596?i=1146195714'
      },
      card3: {
        title: 'Love Hangover', artist: 'JENNIE & Dominic Fike',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/1c/57/15/1c571583-f4bc-3307-6e5e-8b9e68d05913/196872850918.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f6/4c/16/f64c164b-bd28-87fd-5217-7409675e6374/mzaf_10560279388547786839.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/love-hangover/1793379140?i=1793379141'
      },
      card4: {
        title: 'Stephanie', artist: 'Cloonee, Young M.A & InntRaw',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/97/e4/10/97e41086-cff2-f7b5-83b3-3a085b4d2026/cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/d0/1e/40/d01e4015-c383-2c2a-9445-f47edb4ae5e0/mzaf_10847000075002169806.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/stephanie/1779339882?i=1779339883'
      },
      card5: {
        title: "Moonwalkin'", artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/74/94/a2/7494a26e-4756-c082-5709-8526127baee8/cover_KM0023994_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/da/1f/e9/da1fe9e9-f784-b4f2-c181-c8f770aa2ede/mzaf_13144624855104730433.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/moonwalkin/1866762522?i=1866762525'
      },
      card6: {
        title: 'PINKY UP', artist: 'KATSEYE',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/1a/77/46/1a77460d-493c-a795-92ef-84674905409e/26UMGIM25100.rgb.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8a/2d/f8/8a2df8c0-e0d3-d040-5a98-958d4ad25ceb/mzaf_16340910211187354178.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/pinky-up-clean-edit/1891174008?i=1891174353'
      },
      card7: {
        title: "Upper Side Dreamin'", artist: 'ENHYPEN',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/07/f2/86/07f286a5-be02-94dd-4e0e-a781aba6d1d4/192641841651_Cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/49/a6/68/49a66800-4e6c-68e6-1e35-3be2919ac57e/mzaf_6950604213995548513.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/upper-side-dreamin/1587989646?i=1587989649'
      },
      card8: {
        title: 'Club classics', artist: 'Charli xcx',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a5/bb/db/a5bbdb33-3887-5abb-81d5-de75e72c6abc/mzaf_8271755484089764888.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/club-classics/1739079974?i=1739080339'
      },
      card9: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      },
      // 사용자 명시 2026-04-30: 10번째(마지막) 카드도 CD — 표지 card1 과 수미상관 으로 동일 (Vanilla Days).
      card10: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      }
    },
    auto: true
  };
}

// 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 카드 시퀀스 (10 카드).
const _ANNUAL_REVIEW_CARDS = [
  _annualReviewBuildCard1,        // 1. 표지
  _annualReviewBuildCard2,        // 2. 한 해 흐름 (365 dot)
  _annualReviewBuildCard3,        // 3. 발견 #1 (Opus 4.7)
  _annualReviewBuildCard4,        // 4. 발견 #2 (Opus 4.7)
  _annualReviewBuildCard5,        // 5. 무기 DNA tree
  _annualReviewBuildCard6,        // 6. 모래사장 + 진주
  _annualReviewBuildCardMoments,  // 7. 잊지 못할 순간 (사진 grid)
  _annualReviewBuildCardPearl,    // 8. 올해의 깨달음 1 (Stories 톤 — 가장 현명한 한 마디)
  _annualReviewBuildCardDeep,     // 9. 가장 깊은 숙고 — 질문 하나 웅장
  _annualReviewBuildCard9         // 10. 마지막 — 한 단락 한 마디
];

// 사용자 명시 2026-04-30 ultrathink: 미리보기 = 시드 OR 실제 생성된 리뷰 둘 다 (state.annualReviews 우선).
function openAnnualReviewPreview() {
  const fromState = state.annualReviews && state.annualReviews.length > 0;
  const review = fromState ? state.annualReviews[0] : _buildAnnualReviewSeedData();
  console.log('[annual review preview]', fromState
    ? `state.annualReviews[0] 사용 (id=${review.id}, year=${review.year}, count=${state.annualReviews.length})`
    : '시드 fallback 사용 (state 비어 있음 — testSeedV4Data 미실행 또는 sweep 됨)');
  openAnnualReview(review);
}

// 사용자 명시 2026-04-30 ultrathink: 리뷰 객체 / id (string) / 연도 (number) 셋 다 지원.
// year 받으면 state.annualReviews 에서 year 매칭, 없으면 시드 빌더 fallback (NEW 시스템 일관 진입점).
function openAnnualReview(reviewOrIdOrYear) {
  let review = null;
  if (reviewOrIdOrYear && typeof reviewOrIdOrYear === 'object') {
    review = reviewOrIdOrYear;
  } else if (typeof reviewOrIdOrYear === 'string') {
    review = (state.annualReviews || []).find(r => r.id === reviewOrIdOrYear);
  } else if (typeof reviewOrIdOrYear === 'number') {
    review = (state.annualReviews || []).find(r => r.year === reviewOrIdOrYear);
    if (!review) review = _buildAnnualReviewSeedData(reviewOrIdOrYear);  // 시드 fallback
  }
  if (!review) {
    showToast('연간 리뷰 없음 — 시드 데이터 또는 생성 필요');
    return;
  }
  _annualReviewState = {
    data: review,
    cards: _ANNUAL_REVIEW_CARDS,
    currentIdx: 0
  };
  _annualReviewRender();
}

