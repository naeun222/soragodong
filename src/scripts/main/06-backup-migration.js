// ═══════════════════════════════════════════════════════════════
// V6 BACKUP & MIGRATION
// ═══════════════════════════════════════════════════════════════

async function createV3Backup() {
  // Create a separate row in Supabase as backup before V6 migration
  if (!authUserId) return;
  try {
    // Check if backup already exists
    const { rows: existing } = await _backupRowFetch('backup_v5_pre_v6', 'id');
    if (existing.length > 0) {
      console.log('V3 backup already exists');
      return;
    }

    // Create backup
    // 사용자 명시 2026-05-01 (agent audit): _serializeReplacer 적용 — typing/_seed/_dnaMatched 등 transient 키 strip.
    const backup = JSON.parse(JSON.stringify(state, _serializeReplacer));
    await _backupRowUpsert('backup_v5_pre_v6', { ...backup, _backup_meta: { type: 'v5_pre_v6', createdAt: new Date().toISOString() } }, null);
    console.log('✅ V5 backup created before V6 migration');
  } catch (e) {
    console.error('Backup error:', e);
    // Don't block migration if backup fails — but log it
  }
}

async function migrateToV6() {
  // V5 → V6 migration: convert archive entries into new pearls/insights structure
  // and prepare for unified entries view
  console.log('🔄 Migrating V5 → V6...');
  
  // 1. Old archive entries are kept as-is (used by Three Lens display)
  //    No data destruction — display layer will unify
  
  // 2. shellCollection items get story metadata if missing
  if (state.shellCollection) {
    state.shellCollection = state.shellCollection.map(s => {
      if (typeof s === 'string') {
        return { type: s, date: null, story: null, rarity: 'common' };
      }
      return {
        ...s,
        rarity: s.rarity || 'common',
        story: s.story || s.note || null
      };
    });
  }
  
  // 3. Active mode dates initialized
  Object.keys(state.modes || {}).forEach(mode => {
    if (state.modes[mode] && !state.modeActiveSince[mode]) {
      state.modeActiveSince[mode] = todayKey();
    }
  });
  
  console.log('✅ Migration to V6 complete');
}

// V3.13.x: rollbackToV5 제거됨 (이제 너무 멀리 와서 의미 없음)

// V3.13.x SECURITY: tryMigrateLegacyData 함수 제거됨.
// 이전엔 신규 가입자가 cloud의 user_id='me' 단일 row를 가져와 다른 사용자 데이터가
// 무차별 할당되는 프라이버시 버그가 있었음. 더 이상 호출되지 않음.

// ═══════════════════════════════════════════════════════════════
// V4: V6 → V7 마이그레이션 + V6 백업
// ───────────────────────────────────────────────────────────────
// 호출 시점: loadFromCloud에서 state.version < 7 감지 시 1회.
// 빈 V7 state로 시작하는 신규 V4 사용자는 호출 안 됨 (DEFAULT_STATE.version=7).
// V3 데이터 import (V4-1b) 시 V6 형식이 들어오면 호출됨.
// ═══════════════════════════════════════════════════════════════
async function createV6Backup(dataToBackup) {
  // dataToBackup 인자 우선 사용 (V3 import 흐름에서 V3 raw 백업용).
  // 인자 없으면 전역 state 사용 (loadFromCloud 자동 마이그레이션 흐름).
  if (!authUserId) return;
  try {
    const { rows: existing } = await _backupRowFetch(V4_BACKUP_USER_ID, 'id');
    if (existing.length > 0) {
      console.log('V6 backup already exists');
      return;
    }
    const source = dataToBackup || state;
    const backup = JSON.parse(JSON.stringify(source));
    await _backupRowUpsert(V4_BACKUP_USER_ID, { ...backup, _backup_meta: { type: 'v6_pre_v7', createdAt: new Date().toISOString() } }, null);
    console.log('✅ V6 backup created before V7 migration');
  } catch (e) {
    console.error('V6 backup error:', e);
    // Don't block migration if backup fails — but log it
  }
}

function migrateToV7() {
  // V6 → V7: V4 신규 필드 보강. 기존 V6 데이터는 보존 (파괴 X).
  // - caseFormulation: goals/growth + unverified 8차원
  // - reflectionQuestions, todaySchedule
  // - preferences: tutorialVersion, tutorialCompleted, miniTutorialsSeen, progressiveUnlockLevel
  // V4-1c 깊은 변환:
  // - strategy topicCards → generations[0] + embodimentStatus + embodimentPath + evolutionChats
  // - missions → strategyId / generationIdx (null default)
  // - chatMessages chapterStart → chapterMeta {category, summary, strategyId}
  // - pearls → type:'pearl' default
  // - archive → type:'scrap' default + tags:[]
  console.log('🔄 Migrating V6 → V7...');

  if (!state.caseFormulation) {
    state.caseFormulation = JSON.parse(JSON.stringify(DEFAULT_STATE.caseFormulation));
  }
  if (!Array.isArray(state.caseFormulation.goals)) state.caseFormulation.goals = [];
  if (!Array.isArray(state.caseFormulation.growth)) state.caseFormulation.growth = [];
  if (!state.caseFormulation.unverified) state.caseFormulation.unverified = {};
  ['problems', 'mechanisms', 'strengths', 'goals', 'growth'].forEach(k => {
    if (!Array.isArray(state.caseFormulation.unverified[k])) state.caseFormulation.unverified[k] = [];
  });

  if (!Array.isArray(state.reflectionQuestions)) state.reflectionQuestions = [];
  if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
  if (!Array.isArray(state.diagnoses)) state.diagnoses = [];
  if (!Array.isArray(state.quarterlyReviews)) state.quarterlyReviews = [];

  if (!state.preferences) state.preferences = JSON.parse(JSON.stringify(DEFAULT_STATE.preferences));
  if (state.preferences.tutorialVersion === undefined) state.preferences.tutorialVersion = null;
  if (state.preferences.tutorialCompleted === undefined) state.preferences.tutorialCompleted = false;
  if (!Array.isArray(state.preferences.miniTutorialsSeen)) state.preferences.miniTutorialsSeen = [];
  if (state.preferences.progressiveUnlockLevel === undefined) state.preferences.progressiveUnlockLevel = null;

  // V4-1c: 깊은 데이터 모델 변환
  // strategy topicCards에 generations / embodiment 필드 보강
  if (Array.isArray(state.topicCards)) {
    state.topicCards.forEach(card => {
      if (card.category !== 'strategy') return;
      if (!Array.isArray(card.generations)) {
        card.generations = [{
          gen: 1,
          layer: 'L2',
          action: card.actionStrategy || card.summary || card.title || '',
          missions: [],
          shells: [],
          attempts: [],
          status: 'working'
        }];
      }
      if (card.embodimentStatus === undefined) card.embodimentStatus = 'seedling';
      if (card.embodimentPath === undefined) card.embodimentPath = null;
      if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
    });
  }

  // missions에 strategyId / generationIdx 보강
  if (Array.isArray(state.missions)) {
    state.missions.forEach(m => {
      if (!('strategyId' in m)) m.strategyId = null;
      if (!('generationIdx' in m)) m.generationIdx = null;
    });
  }

  // chatMessages chapterStart에 chapterMeta 보강
  // 사용자 요청 2026-04-28 V3 audit: V3의 chapterCategory/chapterSummary 값을 chapterMeta로 옮김 (이전엔 빈 wrapper만 만들어 데이터 잃음)
  if (Array.isArray(state.chatMessages)) {
    state.chatMessages.forEach(msg => {
      if (msg.chapterStart === true && !msg.chapterMeta) {
        msg.chapterMeta = {
          category: msg.chapterCategory || null,
          summary: msg.chapterSummary || null,
          strategyId: msg.chapterStrategyId || null
        };
      } else if (msg.chapterMeta && (msg.chapterCategory || msg.chapterSummary)) {
        // chapterMeta는 있는데 빈 값이고 V3 top-level 필드에 데이터 있으면 채움
        if (!msg.chapterMeta.category && msg.chapterCategory) msg.chapterMeta.category = msg.chapterCategory;
        if (!msg.chapterMeta.summary && msg.chapterSummary) msg.chapterMeta.summary = msg.chapterSummary;
      }
    });
  }

  // pearls에 type:'pearl' default
  if (Array.isArray(state.pearls)) {
    state.pearls.forEach(p => {
      if (!p.type) p.type = 'pearl';
    });
  }

  // archive에 type:'scrap' + tags:[] default
  // V4-fix v3 (사용자 요청 — 깨달음 가공): revisitCount + starred 마이그레이션
  if (Array.isArray(state.archive)) {
    state.archive.forEach(a => {
      if (!a.type) a.type = 'scrap';
      if (!Array.isArray(a.tags)) a.tags = [];
      if (typeof a.revisitCount !== 'number') a.revisitCount = 0;
      if (typeof a.starred !== 'boolean') a.starred = false;
    });
  }

  console.log('✅ Migration to V7 complete');
}

async function saveToCloudNow() {
  if (!authUserId) return;
  // 사용자 보고 2026-04-28: testerMode ON이면 cloud 저장 자체 차단.
  if (state.preferences && state.preferences.testerMode) {
    console.log('[saveToCloudNow] testerMode ON — cloud 저장 차단');
    return;
  }
  // 사용자 보고 2026-04-30 데이터 손실 fix: pending E2EE 복원 중이면 cloud 저장 차단.
  // 이거 없으면 빈 default state가 cloud의 _encryptedBody를 평문으로 덮어쓰기.
  if (window._e2eePendingRecovery) {
    console.warn('[saveToCloudNow] E2EE 복원 대기 중 — cloud 저장 차단 (데이터 보호)');
    return;
  }
  state.lastSync = new Date().toISOString();

  // 사용자 요청 2026-04-30 (Stage 2 E2EE): 마스터 키 있으면 state body 암호화.
  // 메타 (preferences 일부) 평문 유지 — 다음 device 진입 시 동기화 위해.
  let dataPayload;
  if (_e2eeEnabled && _e2eeMasterKey) {
    try {
      // sensitive body — 사용자 데이터 전부 암호화
      // 사용자 명시 2026-05-01 (agent audit): 누락된 11 키 추가 — E2EE save 시 cloud 영구 손실 fix.
      const sensitiveKeys = ['entries','chatMessages','chatArchive','traits','values','patterns','caseFormulation','archive','topicCards','pearls','decisions','reflectionQuestions','missions','memoryVault','tasks','projects','starts','insights','diagnoses','quarterlyReviews','monthlyReviews','weeklyReviews','annualReviews','shellCollection','dayPlan','profile','userDeepProfile','questionHistory','questionPreferences','intakeWorry','todaysShell','todaySchedule','hasSeenWelcomeTutorial','hasSeenV3Tour','predictionFollowups','areas','chatPairsCount','newUserExtractTriggers','chapterCompletedCount'];
      const sensitiveBody = {};
      for (const k of sensitiveKeys) sensitiveBody[k] = state[k];
      const encryptedBody = await _e2eeEncrypt(JSON.stringify(sensitiveBody, _serializeReplacer), _e2eeMasterKey);
      // 사용자 보고 2026-04-30 데이터 손실 fix (새 device 복원): encryptedMasterKey + salt도 cloud에 저장.
      // password로 이미 암호화된 상태라 cloud에 두어도 안전 (회사도 password 모르면 못 풀음).
      // 없으면 새 device에서 복원 불가능.
      let recoveryInfo = null;
      try {
        const localRecovery = localStorage.getItem('soragodong_v4_e2ee_recovery');
        if (localRecovery) recoveryInfo = JSON.parse(localRecovery);
      } catch {}
      // 사용자 보고 2026-04-30 review (agent P0-1): localStorage recovery 비어있으면 cloud 의 옛 _e2eeRecovery 보존.
      // 안 그러면 cloud null 덮어쓰기 → 모든 device 영구 lock-out (Safari ITP / iOS PWA / 시크릿 / 청소 트리거).
      if (!recoveryInfo) {
        try {
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}&select=data&limit=1`,
            { headers: authHeaders() }
          );
          if (r.ok) {
            const rows = await r.json();
            const cloudRec = rows[0] && rows[0].data && rows[0].data._e2eeRecovery;
            if (cloudRec && cloudRec.salt && cloudRec.encryptedMasterKey) {
              recoveryInfo = cloudRec;
              try { localStorage.setItem('soragodong_v4_e2ee_recovery', JSON.stringify(cloudRec)); } catch {}
              console.log('[saveToCloudNow] localStorage recovery 비어있어서 cloud 의 _e2eeRecovery 보존 + localStorage 복원');
            }
          }
        } catch (e) { console.warn('[saveToCloudNow] cloud recovery preserve fetch 실패:', e); }
      }
      // 평문 메타 (consent / billing / version / preferences 일부)
      const metaBody = {
        version: state.version,
        lastSync: state.lastSync,
        preferences: state.preferences,
        unlocked: state.unlocked,
        modes: state.modes,
        modeActiveSince: state.modeActiveSince,
        periodStart: state.periodStart,
        dailyChatCount: state.dailyChatCount,
        lastForceAnalyzeAt: state.lastForceAnalyzeAt,
        lastDailyChapterExtractAt: state.lastDailyChapterExtractAt,
        lastWeeklyAnalyzeAt: state.lastWeeklyAnalyzeAt,
        lastMonthlyAnalyzeAt: state.lastMonthlyAnalyzeAt,
        lastQuarterlyAnalyzeAt: state.lastQuarterlyAnalyzeAt,
        lastYearlyAnalyzeAt: state.lastYearlyAnalyzeAt,
        _e2eeEnabled: true,
        _e2eeVersion: _E2EE_VERSION,
        _e2eeRecovery: recoveryInfo  // password로 암호화된 master key + salt
      };
      dataPayload = { ...metaBody, _encryptedBody: encryptedBody };
    } catch (e) {
      console.warn('[saveToCloudNow] E2EE 암호화 실패 — 평문 fallback 차단:', e);
      throw e;  // 암호화 실패 시 cloud 저장 X (사용자 데이터 보호)
    }
  } else {
    // E2EE 비활성 — 평문 흐름 + gzip 압축 (사용자 명시 2026-05-01, 100+ 효율).
    // 옛 plain 호환: loadFromCloud 가 wrapper 감지 자동.
    dataPayload = await _packStateForCloud(state);
  }

  // V4: V4 row만 PATCH/POST. V3 row(`me`)는 영원히 안 건드림.
  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}&select=id&limit=1`,
    { headers: authHeaders() }
  );
  const existing = await checkResp.json();
  if (existing.length > 0) {
    const body = JSON.stringify({ data: dataPayload, updated_at: state.lastSync }, _serializeReplacer);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}`,
      {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body
      }
    );
    _handleCloudSyncResponse(r);
  } else {
    const body = JSON.stringify({ auth_user_id: authUserId, user_id: V4_USER_ID, data: dataPayload }, _serializeReplacer);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/soragodong_data`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body
    });
    _handleCloudSyncResponse(r);
  }
}

// 사용자 요청 2026-04-28: cloud sync 응답 status별 사용자 알림 (한 세션 1회)
function _handleCloudSyncResponse(r) {
  if (!r || r.ok) {
    window._cloudSyncWarned = false;  // 회복되면 reset
    return;
  }
  if (window._cloudSyncWarned) return;
  window._cloudSyncWarned = true;
  if (r.status === 401 || r.status === 403) {
    if (typeof showToast === 'function') showToast('☁ 클라우드 인증 만료 — 새로고침 후 다시 로그인 필요');
  } else if (r.status >= 500) {
    if (typeof showToast === 'function') showToast('☁ 클라우드 서버 일시 불안정 — 자동 재시도');
  } else {
    if (typeof showToast === 'function') showToast(`☁ 클라우드 저장 실패 (${r.status}) — 로컬엔 보관됨`);
  }
}

// ═══════════════════════════════════════════════════════════════
// V4-1b: V3 데이터 가져오기 (사용자 명시적 액션, 1회)
// ───────────────────────────────────────────────────────────────
// 같은 auth_user_id의 V3 row(`me` 또는 email user_id)를 fetch → V6 백업 row에 보존
// → state 교체 → migrateToV7 → me_v4 row에 저장 → reload.
// V3 prod row는 read만, 변경 X. V4가 빈 상태일 때만 가능 (덮어쓰기 방지).
// ═══════════════════════════════════════════════════════════════
async function importV3Data() {
  // Guard: V4에 데이터 있으면 차단
  const hasV4Data = ((state.entries && state.entries.length) ||
                     (state.chatMessages && state.chatMessages.length) ||
                     (state.tasks && state.tasks.length) ||
                     (state.pearls && state.pearls.length) ||
                     (state.shellCollection && state.shellCollection.length) ||
                     (state.missions && state.missions.length)) > 0;
  if (hasV4Data) {
    await showConfirmModal({
      title: 'V4에 이미 데이터 있음',
      message: 'V3 import는 V4가 빈 상태일 때만 가능.\n먼저 "모든 데이터 초기화" 후 다시 시도.',
      okLabel: '알았어',
      cancelLabel: ''
    });
    return;
  }

  const ok = await showConfirmModal({
    title: 'V3 데이터를 V4로 복사',
    message: '평소 쓰는 V3 데이터(체크인·대화·미션·진주·프로젝트 등 전부)를 V4 미리보기로 복사. V3 prod는 그대로 안전. 진행?',
    okLabel: '복사',
    cancelLabel: '취소'
  });
  if (!ok) return;

  setSyncStatus('syncing');
  showToast('V3 데이터 가져오는 중...');

  try {
    // 같은 auth_user_id의 모든 row fetch (보통 5개 미만)
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&order=updated_at.desc`,
      { headers: authHeaders() }
    );
    if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
    const allRows = await resp.json();

    // V3 row = me_v4도 backup_*도 아닌 row. user_id가 'me'(옛날) 또는 email(최근) 둘 다 cover.
    const v3Row = allRows.find(r =>
      r.user_id !== V4_USER_ID &&
      !(r.user_id || '').startsWith('backup_')
    );
    if (!v3Row || !v3Row.data) {
      showToast('V3 데이터 못 찾았어. 빈 상태 유지.');
      setSyncStatus('online');
      return;
    }
    const v3Data = v3Row.data;
    console.log(`[V4 import] V3 row 발견 (user_id=${v3Row.user_id}, version=${v3Data.version || '?'})`);

    // V3 raw → backup_v6_pre_v7 row 보존 (혹시 import 망쳐도 복구용)
    await createV6Backup(v3Data);

    // state 교체 + V7 보강
    state = JSON.parse(JSON.stringify(v3Data));
    migrateToV7();
    state.version = 7;

    // me_v4 row에 저장
    await saveToCloudNow();
    setSyncStatus('online');

    showToast('✅ V3 데이터 가져옴. 새로고침...');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error('V3 import error:', e);
    setSyncStatus('error');
    // 안티-시코판시: "실패" 단어 회피
    showToast('가져오지 못했어: ' + (e.message || e));
  }
}

function saveToCloud() {
  if (!authUserId) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    setSyncStatus('syncing');
    try { await saveToCloudNow(); setSyncStatus('online'); }
    catch (e) { setSyncStatus('error'); }
  }, 1000);
}

async function manualSync() {
  setSyncStatus('syncing');
  try { await saveToCloudNow(); setSyncStatus('online'); showToast('동기화 완료 ✦'); }
  catch (e) { setSyncStatus('error'); showToast('동기화 실패'); }
}

function setSyncStatus(status) {
  syncStatus = status;
  const dot = document.getElementById('syncDot');
  if (dot) dot.className = 'sync-dot ' + status;
  // V4 (v8 묶음 18): 동기화 빨강 (offline / error) 첫 발생 inline tip
  if ((status === 'offline' || status === 'error') && typeof _showInlineTip === 'function') {
    _showInlineTip('syncDotRed');
  }
}

// V3.13.x: 헤더 날짜 자동 갱신 (자정 넘어도 실제 날짜 보이게)
function refreshHeaderDate() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const gSub = document.getElementById('greetingSub');
  if (gSub && gSub.textContent !== dateStr) gSub.textContent = dateStr;
  const dpEl = document.getElementById('datePill');
  if (dpEl && dpEl.textContent !== dateStr) dpEl.textContent = dateStr;
}

