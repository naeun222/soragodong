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

// V4 fix (사용자 보고 2026-05-18 ultrathink) — cascade 방어 3겹.
// 진단: 사용자 본인 (4ba0a92e-...) 의 main row JSONB 가 너무 크고 + PWA/Android/PC 동시 PATCH 가 같은 tuple 락 경합 →
//   PostgreSQL statement_timeout (60s) 초과 → 500 → client 재시도 → 무한 cascade → Supabase 의 connection pool 마름 → 다른 endpoint 도 522.
//   로그 증거: 'canceling statement due to statement timeout' (57014) + 'still waiting for ExclusiveLock on tuple' + 'Warp server error: Thread killed'.
// fix:
//   1. inflight 가드 — 같은 시점 PATCH 1개만. 두 번째 saveToCloudNow 는 첫 결과 await + skip (debounce 가 1초인데 PATCH 자체가 60s+ 걸리면 큐 쌓임).
//   2. 연속 실패 backoff — 3회 연속 timeout/500 면 10분 동안 saveToCloudNow no-op (cascade 완전 차단).
//   3. row size hard cap — `_encryptedBody` 길이 8MB 초과 시 PATCH 자체 X + 사용자 알림 (옛 챕터 정리 권장).
let _saveCloudInflight = null;
const _saveCloudFailState = { consecutive: 0, lastFailAt: 0 };
const _SAVE_BACKOFF_THRESHOLD = 3;
const _SAVE_BACKOFF_MS = 10 * 60 * 1000;  // 10분
const _SAVE_HARD_CAP_BYTES = 8 * 1024 * 1024;  // 8MB body. main row 한도 안전 마진.

async function saveToCloudNow() {
  if (!authUserId) return;
  // V4 (사용자 명시 2026-05-20 ultrathink): cloud load 가드.
  //   _cloudLoadInProgress = loadFromCloud 진행 중 — 옛 localStorage 가 신선한 cloud row 덮어쓰는 race 차단.
  //   _cloudReadOnly = cloud load 실패 / divergence 의심 — 사용자 confirm 전엔 cloud PATCH 차단.
  //     manualSync 가 force=true 옵션으로 의도적 강제 가능 (사용자 명시 적용).
  if (_cloudLoadInProgress) {
    console.warn('[saveToCloudNow] cloud load 진행 중 — 끝나야 PATCH (옛 데이터 덮어쓰기 차단)');
    return;
  }
  if (_cloudReadOnly) {
    if (!_cloudReadOnlyToastShown) {
      _cloudReadOnlyToastShown = true;
      if (typeof showToast === 'function') {
        try {
          const _msg = _cloudReadOnlyReason === 'divergence'
            ? '⚠ 동기화 이상 감지 — 설정 → "지금 클라우드 동기화" 로 의도 선택 필요'
            : '⚠ 클라우드 미연결 — 변경 임시 보관 (저장 X)';
          showToast(_msg);
        } catch {}
      }
    }
    console.warn(`[saveToCloudNow] read-only — saveToCloud 차단 (reason=${_cloudReadOnlyReason || 'unknown'})`);
    return;
  }
  // 사용자 명시 2026-05-05 ultrathink (Phase 1): 게스트 = cloud sync X (localStorage 만 — saveState 가 처리).
  // E2EE 미설정이라 평문 저장 X + abandoned 게스트 cloud row 안 만듦. linkIdentity (가입 전환) 시점에 첫 saveToCloudNow.
  if (state && state.isGuest) {
    return;
  }
  // V4 fix (2026-05-18) — backoff: 연속 실패 누적 시 10분 동안 skip. cascade 차단.
  if (_saveCloudFailState.consecutive >= _SAVE_BACKOFF_THRESHOLD) {
    const _since = Date.now() - _saveCloudFailState.lastFailAt;
    if (_since < _SAVE_BACKOFF_MS) {
      console.warn(`[saveToCloudNow] backoff 활성 — ${Math.round((_SAVE_BACKOFF_MS - _since) / 60000)}분 후 재개`);
      return;
    }
    // backoff 만료 — reset 후 시도.
    _saveCloudFailState.consecutive = 0;
  }
  // V4 fix (2026-05-18) — inflight 가드: 같은 시점 PATCH 1개만. 두 번째 호출은 첫 결과 기다리고 skip.
  if (_saveCloudInflight) {
    try { await _saveCloudInflight; } catch {}
    return;  // 두 번째 호출은 첫 결과로 끝. 다음 saveToCloud (debounce 1s) 에서 또 시도.
  }
  _saveCloudInflight = _saveToCloudNowInner();
  try {
    await _saveCloudInflight;
  } finally {
    _saveCloudInflight = null;
  }
}

async function _saveToCloudNowInner() {
  // 사용자 보고 2026-05-05 (Phase 1d): Kakao linkIdentity redirect 후 E2EE 셋업 모달 뜨기 전 saveToCloudNow 트리거되면
  // localStorage 의 게스트 데이터가 평문으로 cloud 업로드됨 → 데이터 노출 위험.
  // _e2eeSetupNewUser 가 끝까지 성공해서 플래그 제거해야 첫 cloud save 가능.
  if (localStorage.getItem('soragodong_v4_pending_e2ee_setup') === '1' && !_e2eeMasterKey) {
    console.log('[saveToCloudNow] E2EE 셋업 대기 중 — cloud 저장 차단 (데이터 보호)');
    return;
  }
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
      // ⚠️ 사용자 명시 2026-05-08 ultrathink (audit WARN #24): whitelist 방식 — 신규 state 필드 추가 시 *반드시* 이 list 에 등록.
      // TODO 베타 후: blocklist 전환 (DEFAULT_STATE 키에서 metaBody 키 제외 — 누락 방지). 단 *비-민감 운영 데이터* 와 분리 필수.
      // 누락 시: 평문 metaBody 로 cloud 에 흘러가 PIPA §29 + privacy.md §6 약속 ("회사조차 평문 X") 위반.
      // 사용자 보고 2026-05-09 ultrathink (root cause): miniReviews + rotatingCardState 누락 → E2EE on 사용자 cloud 저장 X → 재진입 시 reset.
      // 회전 카드 spec final 추가 (2026-05-09): 미니 리뷰 결과 + 회전 카드 sessionState (진주 4시간 / unseenInsights / quizProgress 등) 모두 sensitiveBody 에 포함.
      // 사용자 보고 2026-05-12 ultrathink (root cause 동일 패턴): tutorialShown / tutorialVersion / _core2NotUnlocked / userName / activeStrategies 누락 → 신규 가입자 sim 튜토리얼 (도서관 / 진주 / 깨달음 / 마법 / 리뷰 / 숙고) 마커 reload 마다 손실 → 같은 튜토리얼 반복 fire. 같이 추가.
      // 사용자 보고 2026-05-18 ultrathink (root cause 동일 패턴 재발): _shownInlineTips 누락 → E2EE 사용자의 firstHomeTutorial 마커 ('firstHomeIntro') / inline tip 8개 / simple-tuto modal key 모두 reload 마다 wipe → 홈 진입 시마다 firstHomeTutorial 무한 fire. 같이 추가.
      const sensitiveKeys = ['entries','chatMessages','chatArchive','traits','values','patterns','caseFormulation','archive','topicCards','pearls','decisions','reflectionQuestions','missions','memoryVault','tasks','projects','starts','insights','diagnoses','quarterlyReviews','monthlyReviews','weeklyReviews','annualReviews','shellCollection','dayPlan','profile','userDeepProfile','questionHistory','questionPreferences','intakeWorry','todaysShell','todaySchedule','hasSeenWelcomeTutorial','hasSeenV3Tour','predictionFollowups','areas','chatPairsCount','newUserExtractTriggers','chapterCompletedCount','miniReviews','rotatingCardState','tutorialShown','tutorialVersion','_core2NotUnlocked','userName','activeStrategies','_shownInlineTips'];
      const sensitiveBody = {};
      for (const k of sensitiveKeys) sensitiveBody[k] = state[k];
      // V4 (사용자 명시 2026-05-20 ultrathink): _cloudStateReplacer — _hasMessages 박힌 archive 의 messages 키 strip.
      //   E2EE 사용자도 동일 cascade 회피 — 별도 테이블 (soragodong_chat_messages) 의 encrypted_body 로 분리 저장됨.
      const _sensitiveJson = JSON.stringify(sensitiveBody, _cloudStateReplacer);
      // V4 fix (사용자 보고 2026-05-18) — hard cap: payload 8MB 초과 시 PATCH 자체 X.
      //   원인: 큰 chatArchive (옛 챕터 messages 통째) → JSONB UPDATE 60s+ timeout → cascade.
      //   사용자 액션 필요: 도서관에서 옛 챕터 삭제 (핀 안 박힌 거) / 큰 진주 (영상) 정리.
      if (_sensitiveJson.length > _SAVE_HARD_CAP_BYTES) {
        const _mb = (_sensitiveJson.length / 1024 / 1024).toFixed(1);
        console.warn(`[saveToCloudNow] payload ${_mb}MB > 8MB hard cap — PATCH 차단 (cascade 회피)`);
        if (typeof showToast === 'function' && !window._cloudHardCapWarned) {
          window._cloudHardCapWarned = true;
          showToast(`⚠ 데이터 ${_mb}MB — cloud 저장 보류. 도서관에서 옛 챕터/큰 진주 정리해줘.`);
        }
        return;
      }
      const encryptedBody = await _e2eeEncrypt(_sensitiveJson, _e2eeMasterKey);
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
      // 사용자 보고 2026-05-14 ultrathink (audit-state P1): fetch 실패 시 silent warn → null 그대로 cloud 저장 → lock-out 같은 결과.
      //   fix: fetch 실패 / 비-OK 시 throw → outer catch 가 saveToCloudNow 자체 abort. cloud row 의 옛 _e2eeRecovery 그대로 유지 (PATCH 안 됨).
      //   신규 사용자 (localStorage 에 recovery 정상) 는 이 분기 진입 X — 영향 X.
      if (!recoveryInfo) {
        try {
          // V4 fix (사용자 보고 2026-05-18 ultrathink) — timeout 박힌 wrapper. saveToCloudNow 는 loadFromCloud 안에서 호출 가능 (post-load save) → hang 시 init() 영구 대기.
          const r = await _fetchWithTimeout(
            `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}&select=data&limit=1`,
            { headers: authHeaders() }
          );
          if (!r.ok) {
            throw new Error(`cloud recovery preserve fetch 비-OK: ${r.status}`);
          }
          const rows = await r.json();
          const cloudRec = rows[0] && rows[0].data && rows[0].data._e2eeRecovery;
          if (cloudRec && cloudRec.salt && cloudRec.encryptedMasterKey) {
            recoveryInfo = cloudRec;
            try { localStorage.setItem('soragodong_v4_e2ee_recovery', JSON.stringify(cloudRec)); } catch {}
            console.log('[saveToCloudNow] localStorage recovery 비어있어서 cloud 의 _e2eeRecovery 보존 + localStorage 복원');
          }
          // cloud row 첫 생성 케이스 (rows=[] 또는 cloudRec 없음) 는 recoveryInfo=null 유지 — 신규 사용자 첫 save 라 정상.
        } catch (e) {
          console.warn('[saveToCloudNow] cloud recovery preserve fetch 실패 — cloud sync abort (lock-out 회피):', e);
          throw new Error('cloud recovery preserve fetch 실패 — cloud sync abort');
        }
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
  // 사용자 보고 2026-05-05: Supabase REST 5xx + network throw 1회 자동 재시도 (1.5s).
  // 이전 = 토스트만 "자동 재시도" 라고 띄우고 실제 재시도 X (거짓 메시지) → 진짜 재시도로 회복.
  const checkResp = await _fetchWithRetry5xx(
    `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}&select=id&limit=1`,
    { headers: authHeaders() }
  );
  if (!checkResp.ok) { _handleCloudSyncResponse(checkResp); return; }
  const existing = await checkResp.json();
  if (existing.length > 0) {
    const body = JSON.stringify({ data: dataPayload, updated_at: state.lastSync }, _serializeReplacer);
    // 사용자 보고 2026-05-10 (audit batch 9): main row size 큰 경우 Postgres statement_timeout 위험 (autoBackup 과 동일 root cause).
    //   4MB 이상 시 사용자 알림 + 자동 prune 권장. window flag 로 한 세션 1회만.
    _checkCloudRowOversize(body.length);
    const r = await _fetchWithRetry5xx(
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
    _checkCloudRowOversize(body.length);
    const r = await _fetchWithRetry5xx(`${SUPABASE_URL}/rest/v1/soragodong_data`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body
    });
    _handleCloudSyncResponse(r);
  }
}

// 사용자 보고 2026-05-10 (audit batch 9): main row size 모니터링 — 4MB+ 시 사용자 알림 + 옛 챕터 prune 권장.
//   Postgres statement_timeout 60s 회피. window flag 로 세션당 1회.
function _checkCloudRowOversize(bytes) {
  if (typeof bytes !== 'number' || bytes < 4 * 1024 * 1024) return;
  if (window._cloudOversizeWarned) return;
  window._cloudOversizeWarned = true;
  console.warn('[saveToCloudNow] row size large:', bytes, 'bytes (' + (bytes / 1024 / 1024).toFixed(2) + 'MB)');
  if (typeof showToast === 'function') {
    showToast(`☁ cloud 데이터 크기 ${(bytes / 1024 / 1024).toFixed(1)}MB — 옛 챕터/진주 정리 권장 (홈에서 핀 안 박힌 옛 챕터 삭제)`);
  }
}

// 사용자 요청 2026-04-28: cloud sync 응답 status별 사용자 알림 (한 세션 1회)
// 사용자 보고 2026-05-05: 5xx 는 _fetchWithRetry5xx 가 이미 1회 재시도 후라서 메시지 정확화 — "다음 변경 시 재시도".
// V4 fix (사용자 보고 2026-05-18) — 토스트 매 cold start 마다 fire 했던 spam 완화:
//   1. window._cloudSyncWarned (in-memory) = reload 마다 reset → 첫 실패 시 매번 토스트.
//   2. fix: localStorage 4h TTL 가드 추가 — 마지막 토스트 시점 박아두고 4h 내 같은 status 면 silent.
//   3. 401 자동 refresh 는 _fetchWithRetry5xx 에서 처리 → 여기 도달은 진짜 refresh 도 실패한 stale token 일 때만.
function _handleCloudSyncResponse(r) {
  if (!r || r.ok) {
    window._cloudSyncWarned = false;  // 회복되면 reset
    // V4 fix (2026-05-18) — 성공 시 fail counter reset.
    if (typeof _saveCloudFailState !== 'undefined') {
      _saveCloudFailState.consecutive = 0;
      _saveCloudFailState.lastFailAt = 0;
    }
    return;
  }
  // V4 fix (2026-05-18) — 실패 (5xx / timeout / 4xx 일부) 시 consecutive++, backoff 트리거 직전 마지막 토스트.
  if (typeof _saveCloudFailState !== 'undefined') {
    _saveCloudFailState.consecutive++;
    _saveCloudFailState.lastFailAt = Date.now();
  }
  if (window._cloudSyncWarned) return;
  // localStorage TTL 가드 — 같은 status bucket (401/403, 5xx, 4xx) 의 토스트가 4h 안에 떴으면 silent.
  const _bucket = (r.status === 401 || r.status === 403) ? 'auth' : (r.status >= 500 ? '5xx' : '4xx');
  try {
    const _key = 'soragodong_v4_cloud_toast_last';
    const _lastRaw = localStorage.getItem(_key);
    const _last = _lastRaw ? JSON.parse(_lastRaw) : null;
    if (_last && _last.bucket === _bucket && _last.at) {
      const _ageMs = Date.now() - new Date(_last.at).getTime();
      if (_ageMs < 4 * 3600 * 1000) {
        window._cloudSyncWarned = true;  // 이 세션도 silent 처리.
        return;
      }
    }
    localStorage.setItem(_key, JSON.stringify({ bucket: _bucket, at: new Date().toISOString() }));
  } catch {}
  window._cloudSyncWarned = true;
  if (r.status === 401 || r.status === 403) {
    if (typeof showToast === 'function') showToast('☁ 클라우드 인증 만료 — 새로고침 후 다시 로그인 필요');
  } else if (r.status >= 500) {
    if (typeof showToast === 'function') showToast('☁ 클라우드 일시 오류 — 로컬엔 안전, 다음 변경 시 자동 재시도');
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
  // V4 (사용자 명시 2026-05-20 ultrathink): read-only mode 였으면 사용자 의도 확인 후 force 해제.
  //   사용자가 "지금 클라우드 동기화" = 옛 데이터를 cloud 에 명시 적용 의도. divergence / load-failed 둘 다 동일.
  if (_cloudReadOnly) {
    let _msg;
    if (_cloudReadOnlyReason === 'divergence') {
      _msg = '클라우드와 옛 브라우저 데이터가 다른 상태야.\n\n지금 동기화하면 이 브라우저 데이터로 클라우드를 덮어쓰게 돼.\n\n새벽 4시 자동 백업 (30일치) 또는 체크포인트 백업으로 나중에 되살릴 수 있어.\n\n계속할까?';
    } else {
      _msg = '클라우드 연결이 실패한 상태야 (옛 cloud 가 더 신선할 수 있음).\n\n지금 동기화하면 이 브라우저 데이터를 강제로 클라우드에 PATCH 해.\n\n계속할까?';
    }
    const yes = await (typeof showConfirmModal === 'function'
      ? showConfirmModal({ title: '⚠ 동기화 확인', message: _msg, okLabel: '덮어쓰기', cancelLabel: '취소' })
      : Promise.resolve(confirm(_msg)));
    if (!yes) { showToast('취소됨'); return; }
    _cloudReadOnly = false;
    _cloudReadOnlyReason = '';
    _cloudReadOnlyToastShown = false;
  }
  setSyncStatus('syncing');
  try { await saveToCloudNow(); setSyncStatus('online'); showToast('동기화 완료 ✦'); }
  catch (e) { setSyncStatus('error'); showToast('동기화 실패'); }
}

// V4 (사용자 명시 2026-05-20 ultrathink): cloud lastSync 가 local 보다 옛 = 옛 브라우저 데이터가 더 신선 = 의심 케이스.
//   default = 클라우드 우선 (안전). 사용자가 명시적으로 [💻 옛 브라우저 적용] 선택 시만 강제 cloud PATCH.
async function _promptCloudDivergenceConfirm(localLastSync, cloudLastSync, localSnapshot) {
  const _fmt = (iso) => {
    try { return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return String(iso); }
  };
  const _diffH = Math.round((new Date(localLastSync).getTime() - new Date(cloudLastSync).getTime()) / 3600000);
  const choice = await showOptionsModal({
    title: '⚠ 동기화 이상 감지',
    message: `이 브라우저 옛 데이터 (마지막 활동: ${_fmt(localLastSync)})\n클라우드 데이터 (마지막 활동: ${_fmt(cloudLastSync)})\n\n옛 브라우저 데이터가 ${_diffH}시간 더 신선해 보여. 어느 쪽 살릴래?`,
    options: [
      { label: '☁️ 클라우드 우선 (안전, 추천)', value: 'cloud' },
      { label: '💻 옛 브라우저 데이터 적용', value: 'local' }
    ]
  });
  if (choice === 'local') {
    const yes = await showConfirmModal({
      title: '정말 옛 브라우저 데이터로 덮어쓸까?',
      message: '클라우드의 현재 데이터가 사라지고 옛 브라우저 데이터로 갱신돼.\n\n새벽 4시 자동 백업 (30일치) 또는 체크포인트 백업으로 나중에 되살릴 수 있어.',
      okLabel: '덮어쓰기',
      cancelLabel: '취소'
    });
    if (!yes) {
      _cloudReadOnly = false;
      _cloudReadOnlyReason = '';
      _cloudReadOnlyToastShown = false;
      showToast('✦ 클라우드 데이터 그대로 유지');
      return;
    }
    state = { ...DEFAULT_STATE, ...localSnapshot };
    _cloudReadOnly = false;
    _cloudReadOnlyReason = '';
    _cloudReadOnlyToastShown = false;
    try {
      await saveToCloudNow();
      showToast('✓ 옛 브라우저 데이터로 클라우드 갱신 — 새로고침 중...');
    } catch (e) {
      console.error('[divergence apply local]', e);
      showToast('적용 실패: ' + (e.message || e));
      return;
    }
    setTimeout(() => location.reload(), 800);
  } else {
    // 'cloud' 또는 null (옵션 외 클릭) — cloud 우선. read-only 해제.
    _cloudReadOnly = false;
    _cloudReadOnlyReason = '';
    _cloudReadOnlyToastShown = false;
    showToast('✦ 클라우드 데이터 그대로 유지');
  }
}

function setSyncStatus(status) {
  syncStatus = status;
  const dot = document.getElementById('syncDot');
  if (dot) dot.className = 'sync-dot ' + status;
  // V4 (사용자 명시 2026-05-18 ultrathink): silent 모드 — 정상 (idle/online/syncing) 시 .date-pill 숨김, 문제 (offline/error) 시 표시.
  const pill = dot && dot.closest('.date-pill');
  if (pill) {
    const isProblem = (status === 'offline' || status === 'error');
    pill.classList.toggle('silent', !isProblem);
  }
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

// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-20 ultrathink): Step 5 — chatArchive[].messages → chat_messages 테이블 backfill.
// ───────────────────────────────────────────────────────────────
// 호출: loadFromCloud 끝 fire-and-forget (한 번만 — state._chatMessagesBackfillDone 플래그).
// 안전:
//   1. rollback 백업 row 만들기 (me_v4_pre_chat_messages_backfill) — idempotent (이미 있으면 skip).
//   2. 한 archive 씩 _saveChapterMessages atomic.
//      - row 수 검증 — _saveChapterMessages 의 count 가 valid (typing/error/_seed 제외) message 수 와 일치해야 OK.
//      - 검증 통과 시에만 arch._hasMessages = true 박음.
//   3. in-memory messages 그대로 — read 경로 안전망. cloud main row 는 _cloudStateReplacer 가 strip.
//   4. 한 archive 마다 saveState 호출 X — backfill 도중 N PATCH cascade 회피. 끝나면 한 번.
// SQL 미적용 / 권한 fail 시 _saveChapterMessages 가 ok:false 반환 → _hasMessages 안 박힘 → 다음 trigger 에서 재시도.
// ═══════════════════════════════════════════════════════════════
async function _backfillChatMessagesToTable() {
  if (!authUserId) return false;
  if (state._chatMessagesBackfillDone) return true;
  // 게스트 / E2EE recovery 대기 / testerMode = backfill X.
  if (state && state.isGuest) return false;
  if (typeof window !== 'undefined' && window._e2eePendingRecovery) return false;
  if (state.preferences && state.preferences.testerMode) return false;
  // E2EE 사용자 + 마스터키 미준비 = recovery 후 saveState path 가 다시 trigger. skip.
  if (_e2eeEnabled && !_e2eeMasterKey) return false;
  if (typeof _saveChapterMessages !== 'function') return false;

  if (!Array.isArray(state.chatArchive) || state.chatArchive.length === 0) {
    state._chatMessagesBackfillDone = true;
    return true;
  }
  const targets = state.chatArchive.filter(a => a && !a._hasMessages
    && Array.isArray(a.messages) && a.messages.length > 0
    && a.id);  // id 없는 옛 archive 는 skip (chapter_id 식별 불가).
  if (targets.length === 0) {
    state._chatMessagesBackfillDone = true;
    return true;
  }

  console.log(`[chat_messages backfill] start — ${targets.length} archive`);

  // 안전 1: rollback 백업 row (idempotent).
  try {
    const { rows: existing } = await _backupRowFetch('me_v4_pre_chat_messages_backfill', 'id');
    if (existing.length === 0) {
      const backupPayload = {
        _backup_meta: { type: 'pre_chat_messages_backfill_2026_05_20', createdAt: new Date().toISOString() },
        chatArchive: JSON.parse(JSON.stringify(state.chatArchive))
      };
      await _backupRowUpsert('me_v4_pre_chat_messages_backfill', backupPayload, null);
      console.log('[chat_messages backfill] rollback 백업 row 작성됨');
    } else {
      console.log('[chat_messages backfill] rollback 백업 이미 있음');
    }
  } catch (e) {
    console.warn('[chat_messages backfill] pre-backup fail — abort (rollback 불가능 차단):', e);
    return false;
  }

  // 안전 2: 한 archive 씩 atomic.
  let movedCount = 0;
  let failedCount = 0;
  for (const arch of targets) {
    try {
      const validMsgs = arch.messages.filter(m => m && !m.typing && !m.error && !m._seed);
      if (validMsgs.length === 0) {
        // valid 0 — _hasMessages 박을 필요 X. skip.
        continue;
      }
      const _r = await _saveChapterMessages(arch.id, arch.messages);
      if (_r && _r.ok && _r.count === validMsgs.length) {
        arch._hasMessages = true;
        movedCount++;
      } else {
        console.warn('[chat_messages backfill] save mismatch:', arch.id, _r, 'expected count:', validMsgs.length);
        failedCount++;
      }
    } catch (e) {
      console.warn('[chat_messages backfill] save throw:', arch.id, e);
      failedCount++;
    }
  }

  console.log(`[chat_messages backfill] done — moved=${movedCount}, failed=${failedCount}, total=${targets.length}`);

  if (failedCount === 0) {
    state._chatMessagesBackfillDone = true;
  }
  saveState();  // 한 번 cycle — main row 가 _cloudStateReplacer 통해 strip.
  return failedCount === 0;
}

