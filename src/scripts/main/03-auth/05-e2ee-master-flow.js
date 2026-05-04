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
