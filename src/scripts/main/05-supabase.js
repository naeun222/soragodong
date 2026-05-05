// ═══════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════
async function loadFromCloud() {
  // V4: V4 전용 row만 로드. V3 데이터(`me` row)는 영원히 안 건드림.
  console.log(`[V4] 소라고동 V4 미리보기 — auth_user_id=${authUserId}, user_id=${V4_USER_ID}`);
  // V3.13.x SECURITY: localStorage 사용자 변경 감지 (다른 계정 로그인 시 이전 데이터 방지)
  const lastUserId = localStorage.getItem(V4_LAST_USER_KEY);
  if (lastUserId && lastUserId !== authUserId) {
    localStorage.removeItem(V4_LOCAL_STORAGE_KEY);
    // 사용자 보고 2026-04-30 데이터 손실 P2 fix: E2EE 키도 같이 정리.
    // 안 그러면 새 사용자가 옛 사용자의 master key로 복호화 시도 → P1 트리거.
    try { localStorage.removeItem(_E2EE_LOCAL_KEY); } catch {}
    try { localStorage.removeItem('soragodong_v4_e2ee_recovery'); } catch {}
    try { localStorage.removeItem('soragodong_v4_e2ee_setup_dismissed'); } catch {}
    _e2eeMasterKey = null;
    _e2eeEnabled = false;
    console.log('[V4 security] 다른 사용자 감지 — localStorage + E2EE 키 정리');
  }
  localStorage.setItem(V4_LAST_USER_KEY, authUserId);

  // 사용자 명시 2026-05-05 (perf ultrathink): cloud 응답 기다리는 동안 localStorage state 로 optimistic 화면 그리기.
  // cloud 도착 시 init() 가 자연스럽게 다시 렌더 → 덮어씀. Supabase RTT (모바일 1-2초) 동안 빈 화면 X.
  // 같은 device 재방문 시 perceived load 가장 큰 단축. E2EE 새 device 진입 시엔 localStorage 비어있어 자동 skip.
  if (lastUserId === authUserId) {
    try {
      const _localRaw = localStorage.getItem(V4_LOCAL_STORAGE_KEY);
      if (_localRaw) {
        const _localState = JSON.parse(_localRaw);
        state = { ...DEFAULT_STATE, ..._localState };
        try {
          if (typeof applyNightMode === 'function') applyNightMode();
          if (typeof renderModes === 'function') renderModes();
          if (typeof renderTodayMission === 'function') renderTodayMission();
          if (typeof renderShellBar === 'function') renderShellBar();
          if (typeof renderActiveDecisionsHomeV3 === 'function') renderActiveDecisionsHomeV3();
          if (typeof renderMainAction === 'function') renderMainAction();
          if (typeof renderModel === 'function') renderModel();
          if (typeof renderArchive === 'function') renderArchive();
        } catch (_e) { console.warn('[optimistic paint] render:', _e); }
      }
    } catch (_e) { console.warn('[optimistic paint] parse:', _e); }
  }

  setSyncStatus('syncing');
  // 사용자 보고 2026-05-05 (audit High): loadFromCloud 안에서 saveToCloudNow 가 5곳 (localStorage fallback / apiKey wipe / seedCleaned / V6→V7 / dedupe) 에서 순차 호출되던 race / 중복 저장 fix.
  // 각 위치는 _needsSaveAfterLoad = true 만 set 하고, 끝에서 1회만 호출.
  let _needsSaveAfterLoad = false;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${V4_USER_ID}&order=updated_at.desc&limit=1`,
      { headers: authHeaders() }
    );
    if (!resp.ok) throw new Error('Load failed');
    const data = await resp.json();
    if (data.length > 0) {
      let cloudData = data[0].data;
      // 사용자 명시 2026-05-01: gzip 압축 wrapper 감지 → 자동 unpack (옛 plain row 도 그대로 통과).
      try {
        cloudData = await _unpackStateFromCloud(cloudData);
      } catch (e) {
        // unpack 실패 = 데이터 손상. 옛 백업 row 폴백 또는 빈 state 시작 (빈 state 는 cloud 덮어쓰기 위험 → throw).
        console.error('[loadFromCloud] 압축 cloud 데이터 복원 실패:', e);
        throw e;
      }
      // 사용자 요청 2026-04-30 (Stage 2 E2EE): _encryptedBody 있으면 마스터 키로 복호화.
      if (cloudData && cloudData._encryptedBody && cloudData._encryptedBody._e2ee) {
        // 사용자 보고 2026-04-30 데이터 손실 fix (새 device 복원): cloud에 _e2eeRecovery 있으면
        // localStorage로 복원. 안 그러면 새 device에서 _e2eeRestoreFromPassphrase가 read X = 영원히 복원 불가능.
        if (cloudData._e2eeRecovery && cloudData._e2eeRecovery.salt && cloudData._e2eeRecovery.encryptedMasterKey) {
          try {
            const existing = localStorage.getItem('soragodong_v4_e2ee_recovery');
            if (!existing) {
              localStorage.setItem('soragodong_v4_e2ee_recovery', JSON.stringify(cloudData._e2eeRecovery));
              console.log('[loadFromCloud] cloud의 _e2eeRecovery → localStorage 복원');
            }
          } catch {}
        }
        await _e2eeInitMasterKey();
        if (!_e2eeMasterKey) {
          // 마스터 키 X — 새 device 진입 또는 키 분실. password 입력 모달 표시 (별도 흐름).
          console.warn('[loadFromCloud] E2EE 활성된 cloud row인데 마스터 키 없음. password 복원 필요.');
          window._e2eePendingRecovery = cloudData;
          state = { ...DEFAULT_STATE };
          // 사용자 흐름: 진입 후 maybeShowE2EERecoveryModal 호출
        } else {
          // 사용자 보고 2026-04-30 데이터 손실 P1 fix: decrypt 실패 (잘못된 키 / cross-user) 시
          // _e2eeDecrypt는 null 반환 → 그냥 진행하면 빈 state로 cloud 덮어쓰기. 차단.
          const decryptedJson = await _e2eeDecrypt(cloudData._encryptedBody, _e2eeMasterKey);
          if (decryptedJson === null) {
            console.error('[loadFromCloud] E2EE 복호화 실패 — 마스터 키 불일치. password 복원 흐름으로 전환.');
            window._e2eePendingRecovery = cloudData;
            // 잘못된 키 제거 — 다음 진입 시 password 다시 입력
            try { localStorage.removeItem(_E2EE_LOCAL_KEY); } catch {}
            _e2eeMasterKey = null;
            state = { ...DEFAULT_STATE };
          } else {
            try {
              const decryptedBody = JSON.parse(decryptedJson);
              const { _encryptedBody, ...metaPart } = cloudData;
              state = { ...DEFAULT_STATE, ...metaPart, ...decryptedBody };
              _e2eeEnabled = true;
              console.log('✅ V4 row loaded + decrypted (E2EE)');
            } catch (e) {
              console.error('[loadFromCloud] decrypted JSON parse 실패:', e);
              window._e2eePendingRecovery = cloudData;
              state = { ...DEFAULT_STATE };
            }
          }
        }
      } else {
        // 평문 (E2EE 미적용 사용자) — 기존 흐름
        state = { ...DEFAULT_STATE, ...cloudData };
        console.log('✅ V4 row loaded from cloud (평문)');
      }
    } else {
      // V4 row 없음 = 첫 V4 진입. 빈 V7 state로 시작.
      // V3 데이터 import는 별도 UI 버튼(V4-1b)에서 처리.
      const local = localStorage.getItem(V4_LOCAL_STORAGE_KEY);
      if (local) {
        state = { ...DEFAULT_STATE, ...JSON.parse(local) };
        console.log('[V4] localStorage fallback 사용');
        _needsSaveAfterLoad = true;
      } else {
        console.log('[V4] 빈 V7 state로 시작');
      }
    }
    // Ensure all collections exist
    state.modes = { ...DEFAULT_STATE.modes, ...(state.modes || {}) };
    if (state.modes.drained) state.modes.drained = false;
    if (!state.missions) state.missions = [];
    if (!state.shellCollection) state.shellCollection = [];
    if (!state.decisions) state.decisions = [];
    if (!state.weeklyReviews) state.weeklyReviews = [];
    if (!state.monthlyReviews) state.monthlyReviews = [];
    if (!state.predictionFollowups) state.predictionFollowups = [];
    if (!state.questionHistory) state.questionHistory = [];
    if (!state.questionPreferences) state.questionPreferences = { dismissed: [], favorites: [], customQuestions: [] };
    
    // === V6 fields ===
    if (!state.tasks) state.tasks = [];
    if (!state.projects) state.projects = [];
    if (!state.areas) state.areas = [];
    if (!state.memoryVault) state.memoryVault = [];
    if (!state.dayPlan) state.dayPlan = [];
    if (!state.starts) state.starts = [];
    if (!state.insights) state.insights = [];
    if (!state.pearls) state.pearls = [];
    if (!state.topicCards) state.topicCards = [];  // V3.8: 챕터 토픽 카드
    // V3.9: tasks + memoryVault에 priority 필드 부여
    (state.tasks || []).forEach((t, idx) => {
      if (typeof t.priority !== 'number') t.priority = idx;
    });
    (state.memoryVault || []).forEach((v, idx) => {
      if (typeof v.priority !== 'number') v.priority = (state.tasks?.length || 0) + idx;
    });
    if (!state.todaysShell) state.todaysShell = { date: null, content: null, generatedAt: null };
    if (state.hasSeenV3Tour === undefined) state.hasSeenV3Tour = false;
    if (state.hasSeenWelcomeTutorial === undefined) {
      // 기존 사용자(데이터 있음)는 본 걸로 처리, 신규는 false
      state.hasSeenWelcomeTutorial = (state.entries || []).length > 0 || (state.chatMessages || []).length > 0;
    }
    // V4 코어 튜토리얼 잠금 시스템 마이그레이션 (사용자 요청 2026-04-29)
    // 기존 사용자(어떤 데이터든 있음 OR 풀 튜토리얼 본 적 있음) → 모든 코어 unlocked
    // 신규 사용자 → 모두 false (코어 #1만 업데이트 배너에서 시작 가능)
    if (state.unlocked === undefined || typeof state.unlocked !== 'object') {
      const hasData = (state.entries || []).length > 0 ||
                      (state.chatMessages || []).length > 0 ||
                      (state.shellCollection || []).length > 0 ||
                      (state.topicCards || []).length > 0 ||
                      state.hasSeenWelcomeTutorial === true ||
                      state.hasSeenV3Tour === true;
      state.unlocked = {
        core1: hasData, core2: hasData, core3: hasData,
        core4: hasData, core5: hasData, core6: hasData, core8: hasData
      };
    } else {
      // 누락 키 보강 (이미 unlocked 객체 있는 사용자)
      ['core1','core2','core3','core4','core5','core6','core8'].forEach(k => {
        if (state.unlocked[k] === undefined) state.unlocked[k] = false;
      });
    }
    if (!state.modeActiveSince) state.modeActiveSince = {};
    if (!state.preferences) state.preferences = {
      nightModeManual: null,
      pearlBasketCategories: ['음악', '음식', '장소', '순간', '사람'],
      starRitualSettings: { useShortcut: true, shortcutName: 'SoraRitual' }
    };
    // V3.3 migration
    if (!state.chatArchive) state.chatArchive = [];

    // 사용자 명시 2026-05-01 ultrathink: archive type 5 카테고리 (스크랩/숙고/마법/메모/인사이트) 정리. 1회 마이그레이션.
    // - 'magic_chat' → 'magic' / 'reflection_chat' → 'reflection' / 'pearl' 등 → 'scrap' (fallback)
    if (Array.isArray(state.archive) && !state._archiveTypeMigrationDone) {
      try {
        const _validTypes = new Set(['scrap', 'reflection', 'magic', 'memo']);
        state.archive.forEach(a => {
          if (!a) return;
          if (a.type === 'magic_chat') a.type = 'magic';
          else if (a.type === 'reflection_chat') a.type = 'reflection';
          else if (!_validTypes.has(a.type)) a.type = 'scrap';
          // Future Self 재분류 (옛 type='scrap' source='Future Self' → 'magic')
          if (a.source && /Future Self/i.test(a.source)) a.type = 'magic';
        });
        state._archiveTypeMigrationDone = true;
      } catch (e) { console.warn('[archive type migration] fail:', e); state._archiveTypeMigrationDone = true; }
    }

    // 사용자 명시 2026-05-01 ultrathink: 단일 챕터 chatMessages 디자인 1회 마이그레이션.
    // chapterStart 마커 다중 = 옛 누적 챕터들 → split 후 archive 이송. 마지막 챕터만 chatMessages 에 남김.
    if (Array.isArray(state.chatMessages) && state.chatMessages.length > 0
        && !state._chapterMigrationDone) {
      try {
        const _msgs = state.chatMessages.filter(m => !m.typing && !m.error);
        const startIdxs = [];
        _msgs.forEach((m, i) => { if (i === 0 || m.chapterStart) startIdxs.push(i); });
        if (startIdxs.length > 1) {
          if (!Array.isArray(state.chatArchive)) state.chatArchive = [];
          const lastChapterStart = startIdxs[startIdxs.length - 1];
          for (let i = 0; i < startIdxs.length - 1; i++) {
            const s = startIdxs[i];
            const e = startIdxs[i + 1];
            const _chapMsgs = _msgs.slice(s, e);
            if (_chapMsgs.length < 3) continue;
            const _firstTs = _chapMsgs[0] && _chapMsgs[0].timestamp;
            const _dateKey = _firstTs ? getDayKey(_firstTs) : todayKey();
            state.chatArchive.unshift({
              id: 'arch_mig_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
              date: _dateKey,
              messageCount: _chapMsgs.length,
              messages: _chapMsgs,
              generatedAt: new Date().toISOString(),
              endedManually: false,
              _pendingExtract: true,
              _migrated: true
            });
          }
          state.chatMessages = _msgs.slice(lastChapterStart);
        }
        state._chapterMigrationDone = true;
      } catch (e) { console.warn('[chapter migration] fail:', e); state._chapterMigrationDone = true; }
    }

    // === V7 (V4) collection 보강 ===
    if (!state.reflectionQuestions) state.reflectionQuestions = [];
    if (!state.todaySchedule) state.todaySchedule = [];
    if (!state.diagnoses) state.diagnoses = [];
    if (!state.quarterlyReviews) state.quarterlyReviews = [];
    // 사용자 요청 2026-04-29 (Q2): userDeepProfile 보강 — 점진 입력 schema
    if (!state.userDeepProfile) state.userDeepProfile = JSON.parse(JSON.stringify(DEFAULT_STATE.userDeepProfile));
    if (!state.userDeepProfile.development) state.userDeepProfile.development = { childhood: '', schoolYears: '', adhdDiscovery: '', turningPoints: [] };
    if (!Array.isArray(state.userDeepProfile.development.turningPoints)) state.userDeepProfile.development.turningPoints = [];
    if (!Array.isArray(state.userDeepProfile.relationships)) state.userDeepProfile.relationships = [];
    if (!state.userDeepProfile.selfNarrative) state.userDeepProfile.selfNarrative = { selfStory: '', coreBeliefs: { aboutSelf: [], aboutWorld: [], aboutFuture: [] }, howWantToBeSeen: '', identityKeywords: [] };
    if (!state.userDeepProfile.selfNarrative.coreBeliefs) state.userDeepProfile.selfNarrative.coreBeliefs = { aboutSelf: [], aboutWorld: [], aboutFuture: [] };
    ['aboutSelf', 'aboutWorld', 'aboutFuture'].forEach(k => {
      if (!Array.isArray(state.userDeepProfile.selfNarrative.coreBeliefs[k])) state.userDeepProfile.selfNarrative.coreBeliefs[k] = [];
    });
    if (!Array.isArray(state.userDeepProfile.selfNarrative.identityKeywords)) state.userDeepProfile.selfNarrative.identityKeywords = [];
    // caseFormulation 8 차원
    if (!state.caseFormulation) state.caseFormulation = JSON.parse(JSON.stringify(DEFAULT_STATE.caseFormulation));
    if (!Array.isArray(state.caseFormulation.goals)) state.caseFormulation.goals = [];
    if (!Array.isArray(state.caseFormulation.growth)) state.caseFormulation.growth = [];
    if (!state.caseFormulation.unverified) state.caseFormulation.unverified = {};
    ['problems','mechanisms','strengths','goals','growth'].forEach(k => {
      if (!Array.isArray(state.caseFormulation.unverified[k])) state.caseFormulation.unverified[k] = [];
    });
    // preferences V4 필드
    if (!state.preferences) state.preferences = JSON.parse(JSON.stringify(DEFAULT_STATE.preferences));
    if (state.preferences.tutorialVersion === undefined) state.preferences.tutorialVersion = null;
    if (state.preferences.tutorialCompleted === undefined) state.preferences.tutorialCompleted = false;
    if (!Array.isArray(state.preferences.miniTutorialsSeen)) state.preferences.miniTutorialsSeen = [];
    if (state.preferences.progressiveUnlockLevel === undefined) state.preferences.progressiveUnlockLevel = null;
    // 사용자 요청 2026-04-30: 일일 chat cap default 100. 이미 있으면 그대로 (사용자 설정 보존).
    if (state.preferences.dailyChatCap === undefined) state.preferences.dailyChatCap = 100;
    if (!state.dailyChatCount || typeof state.dailyChatCount !== 'object') state.dailyChatCount = { date: null, count: 0 };
    // 사용자 요청 2026-04-30 (변호사 검수): consentLog 보강 + pending_consent localStorage → state 옮기기.
    if (!Array.isArray(state.preferences.consentLog)) state.preferences.consentLog = [];
    if (state.preferences.autoRenew === undefined) state.preferences.autoRenew = false;
    try {
      const pendingRaw = localStorage.getItem('soragodong_pending_consent');
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw);
        // 사용자 명시 2026-05-01 (agent audit): email 일치 verify — 다른 사용자 동의 잘못 옮기는 자리 차단.
        const currentEmail = (session && session.user && session.user.email) || '';
        const emailMatch = !pending.email || (currentEmail && pending.email.toLowerCase() === currentEmail.toLowerCase());
        if (!emailMatch) {
          // 다른 사용자 pending — 즉시 폐기.
          localStorage.removeItem('soragodong_pending_consent');
          console.log('[consent] pending email mismatch — 폐기');
        } else if (pending && pending.versions && (pending.consentTerms || pending.consentAll)) {
          const at = pending.at || new Date().toISOString();
          // 이미 같은 버전 동의 들어가 있으면 skip (재로그인 케이스)
          const has = (type, version) => state.preferences.consentLog.some(c => c.type === type && c.version === version && c.confirmed);
          // 사용자 명시 2026-05-02 ultrathink: 4 분리 체크박스 (PIPA §22 / §23 / §17 + 만 19세 자기 선언). legacy consentAll fallback 도 호환.
          const cTerms = !!(pending.consentTerms || pending.consentAll);
          const cSensitive = !!(pending.consentSensitive || pending.consentAll);
          const cCrossBorder = !!(pending.consentCrossBorder || pending.consentAll);
          const cAdult = !!(pending.consentAdult || pending.consentAll);
          if (cTerms && !has('terms', pending.versions.terms)) state.preferences.consentLog.push({ type: 'terms', version: pending.versions.terms, confirmed: true, at });
          if (cTerms && !has('privacy', pending.versions.privacy)) state.preferences.consentLog.push({ type: 'privacy', version: pending.versions.privacy, confirmed: true, at });
          // 사용자 명시 2026-05-02: 민감정보 (PIPA §23) 별도 동의 — log 분리 넣음
          if (cSensitive && !has('sensitive', pending.versions.privacy)) state.preferences.consentLog.push({ type: 'sensitive', version: pending.versions.privacy, confirmed: true, at, basis: 'PIPA §23' });
          // 국외이전 (PIPA §17) 별도 동의
          if (cCrossBorder && !has('crossBorder', pending.versions.crossBorder)) state.preferences.consentLog.push({ type: 'crossBorder', version: pending.versions.crossBorder, confirmed: true, at, basis: 'PIPA §17' });
          // 만 19세 자기 선언 (별도 체크박스)
          if (cAdult && !has('age19', '1.1')) state.preferences.consentLog.push({ type: 'age19', version: '1.1', confirmed: true, at, basis: '자기 선언 — 허위 시 사용자 책임' });
          // 결제 시 법정대리인 동의 필요 여부 — 만 19세 동의 시 X
          state.preferences.requiresLegalGuardianForPayment = !cAdult;
          // 사용자 명시 2026-05-02: 로그인 방식 (이메일 OTP / 카카오 / 네이버) 적용하기 (분쟁 시 증거)
          if (pending.loginMethod) {
            state.preferences.loginMethod = pending.loginMethod;
            if (!has('loginMethod', pending.loginMethod)) state.preferences.consentLog.push({ type: 'loginMethod', version: pending.loginMethod, confirmed: true, at });
          }
          localStorage.removeItem('soragodong_pending_consent');
          console.log('[consent] pending → state 동의 옮김 (분리 동의 §22/§23/§17 + 만 19세 + loginMethod=' + (pending.loginMethod || 'email') + ')');
        }
      }
    } catch (e) { console.warn('pending consent migrate:', e); }

    // 사용자 요청 2026-04-28: cloud/localStorage에 stale testerMode 플래그가 있으면 항상 false로 (메모리에서만 토글되어야 하는 flag — 새로고침 시 무조건 OFF)
    if (state.preferences.testerMode) {
      state.preferences.testerMode = false;
      console.log('[testerMode] stale flag 자동 정리됨');
    }

    // 사용자 요청 2026-04-30: 개인 API 키 영구 제거 — Phase C 백엔드 프록시 모델로 전환.
    // state.apiKey + localStorage preserve key + testerMode backup 전부 정리. 한 번 실행 후 플래그.
    if (!state.preferences) state.preferences = {};
    if (!state.preferences._apiKeyWiped_2026_04_30) {
      let wiped = false;
      if (_canAI()) {
        state.apiKey = '';
        wiped = true;
      }
      try {
        if (localStorage.getItem('soragodong_v4_apikey_preserve')) {
          localStorage.removeItem('soragodong_v4_apikey_preserve');
          wiped = true;
        }
      } catch {}
      state.preferences._apiKeyWiped_2026_04_30 = true;
      if (wiped) {
        console.log('[apiKey] 개인 API 키 영구 제거됨 (Phase C 모델 전환).');
        _needsSaveAfterLoad = true;
      }
    }

    // 사용자 요청 2026-04-28: 시드 데이터가 cloud에 들어가 있는 버그 자동 청소
    // (이전 버그로 testerMode 동작 중 force=true / 직접 saveToCloudNow 경로에서 cloud로 새던 시드 정리)
    let seedCleaned = false;
    const stripSeed = (arr, prefix) => {
      if (!Array.isArray(arr)) return arr;
      const before = arr.length;
      const filtered = arr.filter(it => !(it && typeof it.id === 'string' && it.id.startsWith(prefix)));
      if (filtered.length !== before) seedCleaned = true;
      return filtered;
    };
    const stripSeedAlt = (arr, idPrefix, altPrefix) => {
      if (!Array.isArray(arr)) return arr;
      const before = arr.length;
      const filtered = arr.filter(it => {
        if (!it) return false;
        if (typeof it.id === 'string' && (it.id.startsWith(idPrefix) || (altPrefix && it.id.startsWith(altPrefix)))) return false;
        if (typeof it._id === 'string' && it._id.startsWith('shell_seed_')) return false;
        return true;
      });
      if (filtered.length !== before) seedCleaned = true;
      return filtered;
    };
    state.tasks = stripSeed(state.tasks, 'task_seed_');
    state.missions = stripSeed(state.missions, 'mis_seed_');
    state.pearls = stripSeedAlt(state.pearls, 'pearl_seed_', 'dpearl_seed_');
    state.archive = stripSeed(state.archive, 'archive_seed_');
    state.topicCards = stripSeedAlt(state.topicCards, 'strat_seed_', 'tc_seed_');
    state.reflectionQuestions = stripSeed(state.reflectionQuestions, 'rq_seed_');
    // 사용자 요청 2026-04-28: 빠진 시드 prefix 추가 (cloud 누수 방지)
    state.projects = stripSeed(state.projects, 'proj_seed_');
    state.starts = stripSeed(state.starts, 'start_seed_');
    state.quarterlyReviews = stripSeed(state.quarterlyReviews, 'qr_seed_');
    state.decisions = stripSeed(state.decisions, 'dec_seed_');
    state.insights = stripSeed(state.insights, 'ins_seed_');
    state.diagnoses = stripSeed(state.diagnoses, 'diag_seed_');
    state.monthlyReviews = stripSeed(state.monthlyReviews, 'mr_seed_');
    // 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 시드 sweep
    state.annualReviews = stripSeed(state.annualReviews, 'ar_seed_');
    if (Array.isArray(state.shellCollection)) {
      const before = state.shellCollection.length;
      state.shellCollection = state.shellCollection.filter(s => !(s && typeof s._id === 'string' && (s._id.startsWith('shell_seed_'))));
      if (state.shellCollection.length !== before) seedCleaned = true;
    }
    // 사용자 보고 2026-04-30: id-prefix 없이 적용된 시드 (entries / chatMessages / chatArchive / weeklyReviews / memoryVault) — _seed marker 매칭으로 sweep.
    // testSeedV4Data 함수가 _markSeedItems()로 새 적용된 항목에 _seed: timestamp 넣음.
    const stripSeedMarker = (arr) => {
      if (!Array.isArray(arr)) return arr;
      const before = arr.length;
      const filtered = arr.filter(it => !(it && typeof it === 'object' && it._seed));
      if (filtered.length !== before) seedCleaned = true;
      return filtered;
    };
    state.entries = stripSeedMarker(state.entries);
    state.chatMessages = stripSeedMarker(state.chatMessages);
    state.chatArchive = stripSeedMarker(state.chatArchive);
    state.weeklyReviews = stripSeedMarker(state.weeklyReviews);
    state.memoryVault = stripSeedMarker(state.memoryVault);
    // 기존 stripSeed 대상 store들도 _seed marker 추가 매칭 (앞으로 적용될 시드 대비)
    ['tasks','missions','pearls','archive','topicCards','reflectionQuestions','projects','starts','quarterlyReviews','decisions','insights','diagnoses','monthlyReviews','annualReviews'].forEach(k => {
      state[k] = stripSeedMarker(state[k]);
    });
    if (Array.isArray(state.shellCollection)) {
      state.shellCollection = stripSeedMarker(state.shellCollection);
    }
    if (seedCleaned) {
      console.log('[seed cleanup] cloud/localStorage에 들어가 있던 시드 데이터 자동 정리됨');
      _needsSaveAfterLoad = true;
    }

    // === V6 → V7 마이그레이션 (V3 데이터 import 등으로 V6 형식이 들어왔을 때만 발동) ===
    if ((state.version || 0) < 7) {
      await createV6Backup();
      migrateToV7();
      state.version = 7;
      _needsSaveAfterLoad = true;
    }

    // === [나 탭 자동 정리] load 시 완전 일치 항목 제거 (마이그레이션) ===
    if (dedupeAllModelExactDuplicates()) {
      _needsSaveAfterLoad = true;
    }

    // 사용자 보고 2026-05-05 (audit High): load 도중 누적된 변경 사항을 마지막 1회로 cloud sync. 이전엔 5곳 순차 호출 → 누적된 PATCH 가 race risk + Supabase 부하.
    if (_needsSaveAfterLoad) {
      try { await saveToCloudNow(); } catch (e) { console.warn('[loadFromCloud] post-load save 실패:', e); }
    }

    setSyncStatus('online');
    return true;
  } catch (e) {
    console.error('Cloud load error:', e);
    const local = localStorage.getItem(V4_LOCAL_STORAGE_KEY);
    if (local) {
      state = { ...DEFAULT_STATE, ...JSON.parse(local) };
      state.modes = { ...DEFAULT_STATE.modes, ...(state.modes || {}) };
      if (!state.missions) state.missions = [];
      if (!state.shellCollection) state.shellCollection = [];
      if (!state.decisions) state.decisions = [];
      if (!state.weeklyReviews) state.weeklyReviews = [];
      if (!state.monthlyReviews) state.monthlyReviews = [];
      if (!state.predictionFollowups) state.predictionFollowups = [];
      if (!state.questionHistory) state.questionHistory = [];
      if (!state.questionPreferences) state.questionPreferences = { dismissed: [], favorites: [], customQuestions: [] };
      if (!state.tasks) state.tasks = [];
      if (!state.projects) state.projects = [];
      if (!state.areas) state.areas = [];
      if (!state.memoryVault) state.memoryVault = [];
      if (!state.dayPlan) state.dayPlan = [];
      if (!state.starts) state.starts = [];
      if (!state.insights) state.insights = [];
      if (!state.pearls) state.pearls = [];
      if (!state.topicCards) state.topicCards = [];  // V3.8: 챕터 토픽 카드
      // V3.9: priority 필드
      (state.tasks || []).forEach((t, idx) => {
        if (typeof t.priority !== 'number') t.priority = idx;
      });
      (state.memoryVault || []).forEach((v, idx) => {
        if (typeof v.priority !== 'number') v.priority = (state.tasks?.length || 0) + idx;
      });
      if (!state.todaysShell) state.todaysShell = { date: null, content: null, generatedAt: null };
      if (state.hasSeenV3Tour === undefined) state.hasSeenV3Tour = false;
      if (state.hasSeenWelcomeTutorial === undefined) {
        state.hasSeenWelcomeTutorial = (state.entries || []).length > 0 || (state.chatMessages || []).length > 0;
      }
      // V4 코어 튜토리얼 잠금 시스템 마이그레이션 — 같은 룰
      if (state.unlocked === undefined || typeof state.unlocked !== 'object') {
        const _hasData = (state.entries || []).length > 0 ||
                         (state.chatMessages || []).length > 0 ||
                         (state.shellCollection || []).length > 0 ||
                         (state.topicCards || []).length > 0 ||
                         state.hasSeenWelcomeTutorial === true ||
                         state.hasSeenV3Tour === true;
        state.unlocked = {
          core1: _hasData, core2: _hasData, core3: _hasData,
          core4: _hasData, core5: _hasData, core6: _hasData, core8: _hasData
        };
      } else {
        ['core1','core2','core3','core4','core5','core6','core8'].forEach(k => {
          if (state.unlocked[k] === undefined) state.unlocked[k] = false;
        });
      }
      if (!state.modeActiveSince) state.modeActiveSince = {};
      if (!state.preferences) state.preferences = JSON.parse(JSON.stringify(DEFAULT_STATE.preferences));
      // V3.3 migration
      if (!state.chatArchive) state.chatArchive = [];
      // V7 (V4) 신규
      if (!state.reflectionQuestions) state.reflectionQuestions = [];
      if (!state.todaySchedule) state.todaySchedule = [];
      if (!state.diagnoses) state.diagnoses = [];
      if (!state.quarterlyReviews) state.quarterlyReviews = [];
      if (!state.caseFormulation) state.caseFormulation = JSON.parse(JSON.stringify(DEFAULT_STATE.caseFormulation));
      if (!Array.isArray(state.caseFormulation.goals)) state.caseFormulation.goals = [];
      if (!Array.isArray(state.caseFormulation.growth)) state.caseFormulation.growth = [];
      if (!state.caseFormulation.unverified) state.caseFormulation.unverified = {};
      ['problems','mechanisms','strengths','goals','growth'].forEach(k => {
        if (!Array.isArray(state.caseFormulation.unverified[k])) state.caseFormulation.unverified[k] = [];
      });
      if (state.preferences.tutorialVersion === undefined) state.preferences.tutorialVersion = null;
      if (state.preferences.tutorialCompleted === undefined) state.preferences.tutorialCompleted = false;
      if (!Array.isArray(state.preferences.miniTutorialsSeen)) state.preferences.miniTutorialsSeen = [];
      if (state.preferences.progressiveUnlockLevel === undefined) state.preferences.progressiveUnlockLevel = null;
    }
    setSyncStatus('error');
    return false;
  }
}

// 사용자 명시 2026-05-05: backup row HTTP 헬퍼 — auth_user_id + user_id 으로 단일 row 다루는 패턴 통합.
// 06-backup-migration / 13-auto-backup / 14-manual-backup / 15-manual-restore / 16-migration-backup-recovery / 20-update-misc 6 파일 11+ 곳에서 반복되던 fetch URL/header boilerplate 제거.
// saveToCloudNow (06-backup-migration.js 의 메인 cloud sync) 는 의도적으로 안 묶음 — 중심부 흐름 + _handleCloudSyncResponse / _serializeReplacer 등 호출부 nuance 보존.

// GET — 단일 row 조회. selectFields = 'id' | 'data' | 'data,id' | 'data,updated_at' 등.
// 응답 객체와 rows 배열 둘 다 반환 — 호출부가 resp.ok / rows.length 으로 분기 가능.
async function _backupRowFetch(userIdKey, selectFields) {
  const sel = selectFields || 'data,id';
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${userIdKey}&select=${sel}&limit=1`,
    { headers: authHeaders() }
  );
  if (!resp.ok) return { ok: false, rows: [], resp };
  const rows = await resp.json();
  return { ok: true, rows, resp };
}

// PATCH (existingId 있으면) 또는 POST. dataPayload 는 row 의 'data' JSONB 컬럼에 들어갈 값.
// 사용자 보고 2026-05-05 (audit Medium): .ok 확인 추가 — 4xx/5xx silent drop 방지. 호출부 try/catch 가 진짜 에러 잡게 throw.
async function _backupRowUpsert(userIdKey, dataPayload, existingId) {
  const headers = { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
  let resp;
  if (existingId) {
    resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${userIdKey}`,
      { method: 'PATCH', headers, body: JSON.stringify({ data: dataPayload }) }
    );
  } else {
    resp = await fetch(`${SUPABASE_URL}/rest/v1/soragodong_data`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ auth_user_id: authUserId, user_id: userIdKey, data: dataPayload })
    });
  }
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`backup upsert ${resp.status}: ${errBody.slice(0, 200)}`);
  }
  return resp;
}

// DELETE — 단일 row 삭제.
async function _backupRowDelete(userIdKey) {
  return fetch(
    `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&user_id=eq.${userIdKey}`,
    { method: 'DELETE', headers: authHeaders() }
  );
}

