// V4 사용자 명시 (V203): showUpdateChooserModal / _chooseUpdateOption 폐기.
// 신규 사용자 = maybeShowFirstTimeIntro 가 자동 startCoreTutorial('core1') 진입.
// 기존 사용자 = 배너 큐만 (chooser 모달 X).
// 설정 → 투어 다시 보기 = startCoreTutorial 직접 호출.
// 설정 → 풀 튜토리얼 = startInteractiveOnboarding 직접 호출.
// 사용자 요청 2026-04-30: 헤더 배너 '고동MOM에게 한 마디' — 인앱 피드백 직진.
// dismiss 시 v4 기간 동안 안 뜸 (V5 시 다시 등장).
function renderFeedbackBanner() {
  const banner = document.getElementById('feedbackBanner');
  if (!banner) return;
  if (typeof authUserId === 'undefined' || !authUserId) { banner.style.display = 'none'; return; }
  if (typeof session === 'undefined' || !session || !session.access_token) { banner.style.display = 'none'; return; }
  if (window._onbTutorialMode) { banner.style.display = 'none'; return; }
  if (state && state.preferences && state.preferences.testerMode) { banner.style.display = 'none'; return; }
  const major = _currentMajor();
  const dismissed = state && state.preferences && state.preferences.dismissedFeedbackBannerMajor;
  if (dismissed === major) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  banner.innerHTML = `
    <div class="update-banner-text">💌 고동MOM에게 한 마디:</div>
    <div class="update-banner-actions">
      <button class="update-banner-btn-go" onclick="openFeedbackInApp(); dismissFeedbackBanner();">메시지 보내기</button>
      <button class="update-banner-btn-dismiss" onclick="dismissFeedbackBanner()" aria-label="닫기">×</button>
    </div>
  `;
}

function dismissFeedbackBanner() {
  if (!state) return;
  state.preferences = state.preferences || {};
  state.preferences.dismissedFeedbackBannerMajor = _currentMajor();
  saveState();
  const banner = document.getElementById('feedbackBanner');
  if (banner) banner.style.display = 'none';
  // 사용자 보고 2026-05-02: 고동MOM dismiss 후 다음 배너 큐 (legacy / syncTip) 자동 trigger.
  if (typeof _renderNextBanner === 'function') _renderNextBanner();
}
// V3.13.x: iOS PWA 슬라이드 종료 후 재진입 (또는 탭 복귀) 시 새 버전 체크
// (visibility hidden → visible. iOS에선 cold start 안 해도 발생.)
let _lastAutoTourCheck = 0;
async function checkServerVersionAndReload() {
  try {
    const resp = await fetch('/version.txt?_=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) return false;
    const serverVersion = (await resp.text()).trim();
    if (serverVersion && serverVersion !== APP_VERSION) {
      // 새 버전 — 강제 reload (메모리 state 폐기, cloud에서 다시 로드 → 새 HTML 받음)
      console.log(`[version] new version ${serverVersion} (current ${APP_VERSION}) — reloading`);
      // 사용자 보고 2026-04-30: reload 전 cloud 저장 강제 — 미저장 변경 손실 방지.
      // (saveState 는 debounced 1초 → 강제 reload 시 cloud 저장 안 끝남)
      try {
        if (typeof saveState === 'function' && typeof authUserId !== 'undefined' && authUserId) {
          saveState({ force: true });
        }
        if (typeof saveToCloudNow === 'function' && typeof authUserId !== 'undefined' && authUserId) {
          // 3초 timeout — 네트워크 느려도 reload는 진행
          await Promise.race([
            saveToCloudNow(),
            new Promise(resolve => setTimeout(resolve, 3000))
          ]);
        }
      } catch (e) { console.warn('[version reload] cloud save:', e); }
      location.reload();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - _lastAutoTourCheck < 5000) return;  // 5초 가드 (탭 전환 빈번 방지)
  _lastAutoTourCheck = now;
  // 1. 서버 버전 체크 — 새 버전이면 reload (그 후 init에서 autoTourOnUpdate 호출됨)
  const reloaded = await checkServerVersionAndReload();
  if (reloaded) return;
  // 2. 같은 버전이면 그냥 autoTourOnUpdate (혹시 이전 진입에서 lastSeen 미적용된 케이스 대비)
  if (state && state.preferences) autoTourOnUpdate();
});
// V3.13.x: 첫 load 시 서버 버전 즉시 체크 — 옛 캐시면 빠르게 reload
window.addEventListener('load', () => {
  // 즉시 호출 (이전엔 3초 setTimeout — 사용자 체감 지연)
  checkServerVersionAndReload();
});

// V3.13.x: 테스터 모드 토글 — ON 시 메모리 snapshot 백업, OFF 시 그 snapshot으로 복원
// (이전: ON/OFF 모두 saveState(true) → 메모리 누적 변경 사항이 cloud에 저장되버림)
let _testerModeBackupState = null;
async function toggleTesterMode() {
  state.preferences = state.preferences || {};
  if (!state.preferences.testerMode) {
    // ON: 현재 state 백업 — 메모리 + cloud row 둘 다 (사용자 요청 2026-04-28: reload 후에도 복원 가능)
    _testerModeBackupState = JSON.parse(JSON.stringify(state));
    try {
      await _saveTesterBackupToCloud(_testerModeBackupState);
    } catch (e) { console.warn('tester backup cloud save:', e); }
    state.preferences.testerMode = true;
    // 사용자 보고 2026-04-28: 튜토리얼 직전 예약된 saveToCloud setTimeout 즉시 취소
    // (debounce로 1초 후 fire 예정 → 그때 state엔 시드 적용돼 있어 cloud로 새던 버그)
    if (typeof syncTimeout !== 'undefined' && syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
    refreshTesterModeUI();
    showToast('🧪 테스터 모드 ON — 변경 저장 X. OFF 또는 새로고침 후 OFF 시 ON 직전 상태로 복원.');
    return;
  }
  // OFF: 메모리 backup 우선, 없으면 cloud backup row에서 복원
  if (_testerModeBackupState) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, _testerModeBackupState);
    _testerModeBackupState = null;
    saveState(true);
    await _deleteTesterBackupFromCloud();
    refreshTesterModeUI();
    showToast('✦ 테스터 모드 OFF — ON 직전 상태로 복원됨. 새로고침...');
    // 사용자 명시 2026-05-01 (agent audit): 600ms reload race fix — saveToCloudNow 1초 debounce 보다 짧아 cloud 저장 안 끝나고 reload 되던 자리. await 로 보장.
    try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); } catch {}
    location.reload();
    return;
  }
  // 메모리 backup 없음 — cloud backup row 시도
  showToast('🔄 cloud 백업 검색 중...');
  const cloudBackup = await _loadTesterBackupFromCloud();
  if (cloudBackup) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, cloudBackup);
    state.preferences = state.preferences || {};
    state.preferences.testerMode = false;
    saveState(true);
    await _deleteTesterBackupFromCloud();
    refreshTesterModeUI();
    showToast('✦ cloud 백업에서 복원됨. 새로고침...');
    // 사용자 명시 2026-05-01 (agent audit): 600ms reload race fix.
    try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); } catch {}
    location.reload();
    return;
  }
  // cloud 백업도 없음 — flag만 끄기
  state.preferences.testerMode = false;
  saveState(true);
  refreshTesterModeUI();
  showToast('✦ 테스터 모드 OFF (백업 X — flag 만 지움)');
  try { if (typeof saveToCloudNow === 'function') await saveToCloudNow(); } catch {}
  location.reload();
}

// 사용자 요청 2026-04-28: testerMode backup cloud 저장/복원/삭제 헬퍼
async function _saveTesterBackupToCloud(stateData) {
  if (!authUserId) return;
  // testerMode flag 자체는 backup에서 false로 저장 (복원 후 자동 OFF 상태)
  const sanitized = JSON.parse(JSON.stringify(stateData));
  if (sanitized.preferences) sanitized.preferences.testerMode = false;
  // 기존 backup row 있는지 체크
  const { rows: existing } = await _backupRowFetch(V4_TESTER_BACKUP_USER_ID, 'id');
  const dataPayload = { ...sanitized, _backup_meta: { type: 'tester_mode', createdAt: new Date().toISOString() } };
  await _backupRowUpsert(V4_TESTER_BACKUP_USER_ID, dataPayload, existing[0]?.id || null);
}
async function _loadTesterBackupFromCloud() {
  if (!authUserId) return null;
  try {
    const { ok, rows } = await _backupRowFetch(V4_TESTER_BACKUP_USER_ID, 'data');
    if (!ok) return null;
    if (rows.length === 0) return null;
    const data = rows[0].data;
    if (data && data._backup_meta) delete data._backup_meta;
    return data;
  } catch (e) { console.warn('load tester backup:', e); return null; }
}
async function _deleteTesterBackupFromCloud() {
  if (!authUserId) return;
  try {
    await _backupRowDelete(V4_TESTER_BACKUP_USER_ID);
  } catch (e) { console.warn('delete tester backup:', e); }
}
// 알림 기능 미적용됨 — 진짜 백그라운드 푸시는 Phase C (백엔드 + Service Worker) 적용된 후 활성.

function refreshTesterModeUI() {
  const btn = document.getElementById('testerModeToggleBtn');
  if (!btn) return;
  const on = state.preferences && state.preferences.testerMode;
  btn.textContent = on ? '🧪 테스터 모드: ON (변경 저장 X)' : '🧪 테스터 모드: OFF';
  btn.style.background = on ? 'rgba(232,163,163,0.15)' : '';
  btn.style.color = on ? '#f0c0c0' : '';
  btn.style.borderColor = on ? 'rgba(232,163,163,0.4)' : '';
  // 헤더에 시각 배지
  let badge = document.getElementById('testerModeBadge');
  if (on) {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'testerModeBadge';
      badge.style.cssText = 'position:fixed; top:8px; left:50%; transform:translateX(-50%); background:#e8a3a3; color:#000; padding:4px 12px; border-radius:12px; font-size:10px; font-weight:600; z-index:9999; letter-spacing:0.5px;';
      badge.textContent = '🧪 TESTER MODE';
      document.body.appendChild(badge);
    }
  } else {
    if (badge) badge.remove();
  }
}

