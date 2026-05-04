// 사용자 요청 2026-04-28: 실수 초기화 복구 — V3→V4 마이그레이션 백업 (V4_BACKUP_USER_ID 'backup_v6_pre_v7') 또는 localStorage에서
async function recoverFromBackup() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 백업 검색 중...');
  // 1. Supabase backup row 시도
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_BACKUP_USER_ID}&select=data,updated_at&limit=1`,
      { headers: authHeaders() }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (rows.length > 0 && rows[0].data) {
        const meta = rows[0].data._backup_meta || {};
        const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString('ko-KR') : '시점 X';
        const yes = await showConfirmModal({
          title: '🔄 cloud 백업 발견',
          message: `백업 시점: ${when}\n타입: ${meta.type || 'V6'}\n\n현재 데이터를 이 백업으로 덮어쓸까?\n(현재 데이터는 사라져)`,
          okLabel: '복구',
          cancelLabel: '취소'
        });
        if (yes) {
          const backupData = JSON.parse(JSON.stringify(rows[0].data));
          delete backupData._backup_meta;
          state = { ...DEFAULT_STATE, ...backupData };
          await saveToCloudNow();
          showToast('✦ 복구됨 — 새로고침 중...');
          setTimeout(() => location.reload(), 800);
          return;
        }
      } else {
        // cloud backup 없음 → localStorage 시도
        const local = localStorage.getItem(V4_LOCAL_STORAGE_KEY);
        if (local) {
          const yes = await showConfirmModal({
            title: '🔄 localStorage 백업 발견',
            message: `이 기기에 저장된 옛 데이터가 있어.\n복구할까?\n(현재 cloud 데이터는 사라짐)`,
            okLabel: '복구',
            cancelLabel: '취소'
          });
          if (yes) {
            state = { ...DEFAULT_STATE, ...JSON.parse(local) };
            await saveToCloudNow();
            showToast('✦ 복구됨 — 새로고침 중...');
            setTimeout(() => location.reload(), 800);
            return;
          }
        } else {
          showToast('⚠️ 복구 가능한 백업 없음');
        }
      }
    }
  } catch (e) {
    console.error('recovery error:', e);
    showToast('복구 실패: ' + (e.message || e));
  }
}

async function resetAll() {
  // V4: V4 row만 삭제. V3 prod 데이터(`me`)는 영원히 안 건드림.
  if (!confirm('V4 미리보기 데이터만 삭제돼 (V3 prod는 안전). API 키는 유지. 정말?')) return;
  if (!confirm('한 번 더. 진짜?')) return;
  // 사용자 요청 2026-04-28: API 키 보존 (별도 localStorage에 임시 저장 → 새 state 만들 때 복원)
  const preservedApiKey = state.apiKey || '';
  if (preservedApiKey) {
    try { localStorage.setItem('soragodong_v4_apikey_preserve', preservedApiKey); } catch (e) {}
  }
  // 사용자 보고 2026-04-28: 시드 데이터 남는 버그 — 메모리 + storage + cloud 모두 강제 정리
  // 1. 메모리에서 testerMode + 튜토리얼 mode flag 강제 OFF (잔여 backup 무력화)
  if (state.preferences) state.preferences.testerMode = false;
  window._onbTutorialMode = false;
  window._testerModeBackupState = null;
  if (typeof _testerModeBackupState !== 'undefined') _testerModeBackupState = null;
  // 2. localStorage 모든 V4 키 정리 (다른 키도 cleanup) — API 키 preserve 키는 제외
  try {
    localStorage.removeItem(V4_LOCAL_STORAGE_KEY);
    localStorage.removeItem(V4_LAST_USER_KEY);
    Object.keys(localStorage).forEach(k => {
      if ((k.startsWith('soragodong_v4') || k.startsWith('me_v4')) && k !== 'soragodong_v4_apikey_preserve') {
        localStorage.removeItem(k);
      }
    });
  } catch (e) { console.error('localStorage clear:', e); }
  // 3. cloud DELETE — retry 포함 + verify
  let cloudDeleted = false;
  if (authUserId) {
    for (let attempt = 0; attempt < 3 && !cloudDeleted; attempt++) {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}`,
          { method: 'DELETE', headers: authHeaders() }
        );
        if (resp.ok || resp.status === 204 || resp.status === 200) {
          cloudDeleted = true;
        } else {
          console.warn(`cloud delete attempt ${attempt + 1} failed: ${resp.status}`);
        }
      } catch (e) {
        console.error(`cloud delete attempt ${attempt + 1}:`, e);
      }
    }
    // verify — 정말 삭제됐는지 확인
    try {
      const verifyResp = await fetch(
        `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}&select=id&limit=1`,
        { headers: authHeaders() }
      );
      if (verifyResp.ok) {
        const rows = await verifyResp.json();
        if (rows.length > 0) {
          alert('⚠ cloud row가 여전히 존재함. 네트워크 오류 가능성 — 다시 시도해줘.');
          return;  // reload 안 함 — 사용자 재시도 가능
        }
      }
    } catch (e) { console.error('verify:', e); }
  }
  // 4. state 메모리 즉시 비움 (reload 전이라도 안전)
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  alert('✦ 데이터 삭제 완료. 새로고침합니다.');
  location.reload();
}

