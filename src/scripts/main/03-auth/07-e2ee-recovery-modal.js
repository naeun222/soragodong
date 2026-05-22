// V4 (사용자 명시 2026-05-21 ultrathink): E2EE 강제 활성 가드 — 다른 사용자도 같은 케이스 자동 처리.
//   B-1: 평문 사용자 (E2EE 한 번도 활성 안 함) → setup 모달 강제.
//   B-2: setup 도중 fail → localStorage 잔재 정리 + setup 모달 강제.
//   B-3/B-4: cloud _encryptedBody 박힘 + master key 없음 → recovery 모달 강제 ([나중에] 옵션 제거됨).
//   skip: 게스트 / testerMode / onboarding tutorial / _e2eeOptedOut (테스트 계정 명시 평문).
//   호출처: 07-init/01-init-fn.js — loadFromCloud 끝 1.5초 후.
async function maybeShowE2EESetupOrRecovery() {
  if (!authUserId) return;
  if (typeof state === 'undefined' || !state) return;
  if (state.isGuest) return;
  if (state.preferences && state.preferences.testerMode) return;
  if (typeof window !== 'undefined' && window._onbTutorialMode) return;
  if (state.preferences && state.preferences._e2eeOptedOut) return;  // 테스트 계정 명시 평문

  // V4 (사용자 보고 2026-05-22 ultrathink): reload 후 master key 메모리 미복원 → 옛 wrap 분기 무한 loop fix.
  //   _e2eeInitMasterKey (localStorage _E2EE_LOCAL_KEY → 메모리 복원) 호출 site 는 코드 베이스 전체에서 단 1 곳: 05-supabase.js:161 (_encryptedBody 분기 안).
  //   평문 복구 사용자는 loadFromCloud 의 평문 path (line 203 else) 를 타기 때문에 _e2eeInitMasterKey 호출 안 됨 → reload 후 _e2eeMasterKey null 유지.
  //   submitE2EERecovery 의 _autoGuardPlaceholder 분기는 master key 를 localStorage 에 정상 저장하지만 (10-unified-consent-modal.js:317), 그게 메모리로 안 올라오므로 line 41+ 의 옛 wrap 분기 가 다시 placeholder pending → 모달 무한.
  //   fix: guard 진입 시 메모리 _e2eeMasterKey null 이면 localStorage 에서 끌어올림. _e2eeInitMasterKey 는 이미 메모리 있으면 즉시 return (05-e2ee-master-flow.js:2) 이라 정상 활성 사용자엔 무영향.
  if (!_e2eeMasterKey && typeof _e2eeInitMasterKey === 'function') {
    try { await _e2eeInitMasterKey(); } catch (e) { console.warn('[E2EE setup guard] _e2eeInitMasterKey 예외:', e); }
  }

  // B-3 / B-4: cloud _encryptedBody 박힘 + master key 없음 → recovery 강제
  if (window._e2eePendingRecovery) {
    return maybeShowE2EERecoveryModal();
  }

  // master key 있고 E2EE 활성 정상 = skip
  if (_e2eeMasterKey && _e2eeEnabled) return;

  // B-1 / B-2: master key 없음. 두 분기:
  //   - 옛 wrap localStorage 살아 있음 = 옛 사용자 (평문 복구 흐름 거친 케이스 포함) → recovery path 자동 redirect (옛 master key 살림).
  //   - 옛 wrap 없음 = 진짜 신규 / 평문 only → setup 강제.
  if (!_e2eeMasterKey) {
    // V4 (사용자 보고 2026-05-22 ultrathink — 진짜 fix): 옛 wrap localStorage 살아 있으면 자동 recovery path.
    //   audit-auth 발견 — 옛 코드는 옛 wrap 무조건 삭제 후 setup 강제. 주석 "옛 비밀번호 unwrap 해도 데이터 X. 잔재 무용" 의 가정이 Phase 1C 마이그 이후 깨짐.
    //   Storage 진주 미디어 (사진/영상) 가 옛 master key 로 봉인됨 → 새 setup 시 옛 master key 폐기 → 영구 lock.
    //   직전 fix (commit 9523f99) 의 confirm + archive 는 안내일 뿐 — 옛 master key 못 복구. 진짜 fix = recovery path 으로 redirect 해서 옛 master key 살림.
    //   submitE2EERecovery (line 121+) 가 multi-source unwrap (_e2eeRestoreFromPassphrase) 후 pending._encryptedBody 없으면 (= 평문 복구 케이스) state 복원 skip + master key 만 메모리 + cloud 저장 + reload. 정확히 우리가 원하는 동작.
    //   비밀번호 잊었으면 recovery modal 안 [🔓 비밀번호 잊음] 버튼이 e2eeForgotPasswordReset path (옛 데이터 포기 의식적 선택).
    let _hasLocalWrap = false;
    try { _hasLocalWrap = !!localStorage.getItem('soragodong_v4_e2ee_recovery'); } catch (e) {}
    if (_hasLocalWrap) {
      console.log('[E2EE setup guard] 옛 wrap localStorage 발견 → recovery path 자동 redirect (setup X)');
      // placeholder pending — maybeShowE2EERecoveryModal 의 line 76 가드 통과용. submitE2EERecovery 의 pending._encryptedBody 체크 (line 157) 는 falsy 라 state 복원 skip + master key 만 메모리.
      window._e2eePendingRecovery = { _autoGuardPlaceholder: true };
      return maybeShowE2EERecoveryModal();
    }
    // 옛 wrap 없음 = 진짜 신규 / 평문 only → setup 강제 (기존 동작).
    try {
      if (typeof _E2EE_LOCAL_KEY !== 'undefined' && localStorage.getItem(_E2EE_LOCAL_KEY)) {
        localStorage.removeItem(_E2EE_LOCAL_KEY);
      }
    } catch {}
    if (typeof showE2EEPasswordSetupModal === 'function') {
      showE2EEPasswordSetupModal({ allowCancel: false, fromAutoGuard: true });
    } else {
      console.warn('[E2EE setup guard] showE2EEPasswordSetupModal 미로드');
    }
  }
}

async function maybeShowE2EERecoveryModal() {
  if (!window._e2eePendingRecovery) return;
  // 사용자 명시 2026-05-10: 테스트 계정 (preferences._e2eeOptedOut) — E2EE recovery modal 도 skip.
  if (state.preferences && state.preferences._e2eeOptedOut) {
    window._e2eePendingRecovery = null;
    return;
  }
  // 사용자 보고 2026-04-30 (paranoid): master key 이미 활성이면 modal 띄우지 X.
  // 정상 흐름에선 pending 적용될 때 master key는 null인데, 어떤 race로 둘 다 set되면 modal 잘못 뜸.
  if (_e2eeMasterKey && _e2eeEnabled) {
    console.warn('[E2EE] pending recovery flag stale — clearing (master key already active)');
    window._e2eePendingRecovery = null;
    return;
  }
  if (document.getElementById('e2eeRecoveryOverlay')) return;
  // 사용자 명시 2026-05-11 ultrathink: 테스트 계정 한정 8자 — placeholder 도 _e2eeValidatePassword / submitE2EERecovery 와 통일.
  const _isTestAcct = (typeof session !== 'undefined') && session && session.user && session.user.email === 'soragodongapp@gmail.com';
  const _minLen = _isTestAcct ? 8 : 12;
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
        <input type="password" id="e2eePassphraseInput" placeholder="비밀번호 (${_minLen}자 이상)" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%; font-size:14px; padding:10px 40px 10px 10px;">
        <button type="button" onclick="_togglePwView('e2eePassphraseInput', this)" title="보기 / 숨기기" aria-label="비밀번호 보기 토글" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; padding:6px 8px; color:var(--text-soft); font-size:16px;">👁</button>
      </div>
      <div id="e2eeRecoveryStatus" style="font-size:11px; color:var(--text-soft); margin-top:8px; min-height:14px;"></div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">
        <button class="btn-primary" onclick="submitE2EERecovery()" style="width:100%;">복호화하고 시작</button>
        <button class="btn-secondary" onclick="e2eeForgotPasswordReset()" style="width:100%; font-size:12px; opacity:0.85;">🔓 비밀번호 잊음 — 자동 백업에서 복원</button>
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
  // 사용자 명시 2026-05-11 ultrathink: 테스트 계정 한정 8자 허용 — _e2eeValidatePassword 와 통일.
  const _isTestAcct = (typeof session !== 'undefined') && session && session.user && session.user.email === 'soragodongapp@gmail.com';
  const _minLen = _isTestAcct ? 8 : 12;
  if (!password || password.length < _minLen) {
    status.textContent = `비밀번호 ${_minLen}자 이상 (현재 ${password.length}자)`;
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
    // 사용자 명시 2026-05-08 ultrathink (audit WARN #15): cloud 저장 실패 시 *사용자에게 명시적 알림* + reload 보류.
    // 옛: silent log 후 reload → 다음 진입 시 다시 recovery 모달 (루프).
    // 신: 실패 알림 → 사용자 결정 (재시도 / 그래도 진행).
    let _saveOk = false;
    try {
      saveState({ force: true });
      await saveToCloudNow();
      _saveOk = true;
      console.log('[E2EE recovery] cloud 저장 완료. reload.');
    } catch (e) {
      console.warn('[E2EE recovery] cloud 저장 실패:', e);
    }
    if (!_saveOk) {
      const _retry = confirm('🔐 복호화는 성공했어. 그런데 클라우드 저장이 실패해서 — 다른 기기에서 다시 시도해야 할 수 있어.\n\n[확인] = 그래도 진행 (이 기기에서만 사용)\n[취소] = 잠시 후 재시도');
      if (!_retry) return;  // status 알림 유지, 사용자 직접 재시도
    }
    const overlay = document.getElementById('e2eeRecoveryOverlay');
    if (overlay) overlay.remove();
    showToast(_saveOk ? '🔐 복호화 완료 ✦' : '🔐 복호화 완료 (클라우드 동기화는 다음에)');
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
  // V4 (사용자 명시 2026-05-20 ultrathink): _e2eePendingRecovery clear — 누락 시 모든 saveState/saveToCloudNow 영구 차단.
  //   사용자가 '나중에' 의도 = recovery 보류, 그러나 그 세션 입력은 그대로 보존돼야 함.
  //   reload 시 loadFromCloud 가 다시 _e2eePendingRecovery 재set (cloud 가 여전히 encrypted 면) — 정상 흐름.
  try { window._e2eePendingRecovery = null; } catch {}
  if (typeof showToast === 'function') {
    try { showToast('🔐 비밀번호 보류 — 새로고침 시 다시 시도'); } catch {}
  }
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
