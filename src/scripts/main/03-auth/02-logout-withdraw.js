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
  // V4 (사용자 명시 2026-05-16 cowork 디버그): testerMode defensive cleanup.
  //   원인: 로그아웃 직전에 testerMode 가 ON 이었으면 메모리 state 에 잔존. localStorage 는 위에서 지웠지만,
  //   reload 후 cloud row 에 testerMode=true 가 박혀있으면 새로 들어온 사용자가 seed 데이터를 자기 데이터로 오인할 위험.
  //   fix: reload 전에 메모리에서도 명시 정리. 다음 init 의 cloud sync 가 false 로 덮어쓰기.
  try {
    if (state && state.preferences) {
      state.preferences.testerMode = false;
    }
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
      // 사용자 명시 2026-05-08 ultrathink (audit WARN #27): backend 실패 시 PIPA §36 즉시 이행 의무 취약 경로.
      // "그래도 진행" 옵션은 *마지막 수단*. 사용자에게 명확히 책임/사후 처리 안내 + 본인 이메일 으로 backup 권고.
      const proceed = confirm(
        '⚠ 백엔드 탈퇴 실패: ' + backendErr +
        '\n\nSupabase 인증 row + 결제·사용량 데이터가 남아있을 수 있어. PIPA §36 즉시 삭제 의무에 따라 회사가 7일 안 사후 정리할게 (단 즉시 정리 X).' +
        '\n\n[확인] = 로컬 정리 + 로그아웃 진행 (cloud 데이터 일부 잔존, 사후 정리). soragodongapp@gmail.com 으로 자동 알림 발송.' +
        '\n[취소] = 잠시 후 재시도 권장.'
      );
      if (!proceed) return;
      console.warn('[withdraw] backend 실패 후 사용자 동의로 진행:', backendErr);
      // 사용자 명시 2026-05-08 ultrathink: 사후 정리 trigger 용 error-report 발송.
      try {
        if (typeof BACKEND_BASE !== 'undefined' && BACKEND_BASE) {
          fetch(`${BACKEND_BASE}/api/error-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signature: '[withdraw-backend-failed] PIPA §36 manual cleanup needed',
              detail: 'user_id=' + (authUserId || 'unknown') + ' / err=' + backendErr,
              userId: authUserId || 'unknown',
              appVersion: (typeof APP_VERSION === 'string' ? APP_VERSION : 'v4'),
              userAgent: navigator.userAgent,
              url: location.href,
              time: new Date().toISOString()
            })
          }).catch(() => {});
        }
      } catch {}
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

