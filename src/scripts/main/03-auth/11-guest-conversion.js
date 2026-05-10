// ═══════════════════════════════════════════════════════════════
// GUEST CONVERSION (Phase 1c) — 사용자 명시 2026-05-06: 카카오 linkIdentity 만 (이메일 OTP 폐기)
// ═══════════════════════════════════════════════════════════════
// trigger: chat 402 + code='GUEST_LIMIT' (한도 도달) OR 사용자 직접 (설정 / '나' 탭 배너).
// 흐름:
//   1. PIPA 동의 4종 + 비밀번호 설정 = 카카오 callback 후 E2EE setup 모달 (showE2EEPasswordSetupModal) 안에서 일괄.
//   2. 모달 = 단일 step "카카오로 시작" 버튼 + 안내문.
//   3. 클릭 → linkIdentity (POST /auth/v1/user/identities/authorize) 로 Kakao OAuth 진입 → redirect.
//   4. callback 후 같은 uid 유지 (is_anonymous=false). state.isGuest=false 자동.
//   5. init() 의 maybeShowE2EESetupForNewUser → E2EE 비밀번호 + 동의 모달 (state.isGuest=false 라 통과).
//   6. _e2eeSetupNewUser 가 pending_e2ee_setup 플래그 정리 → 첫 cloud 업로드 (암호화).

function showGuestConversionModal(opts) {
  const reason = (opts && opts.reason) || 'limit';
  _renderGuestConvModal({ reason });
}

function _renderGuestConvModal(ctx) {
  // 기존 모달 제거
  const existing = document.getElementById('guestConvModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'guestConvModal';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface); border-radius:16px; max-width:420px; width:100%; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.5);';
  overlay.appendChild(card);

  const reasonText = (ctx && ctx.reason === 'limit')
    ? `<div style="background:rgba(212,167,106,0.08); border-left:3px solid var(--accent); padding:12px 14px; border-radius:0 8px 8px 0; margin-bottom:18px; font-size:13px; color:var(--text); line-height:1.7;">잠깐 — 게스트 한도 다 썼어. 여기까지 한 대화는 이 기기에만 있어.</div>`
    : '';

  card.innerHTML = `
    <div style="font-family:'Gowun Batang',serif; font-size:20px; color:var(--accent); margin-bottom:6px;">🔒 안전하게 이어가자</div>
    <div style="font-size:13px; color:var(--text); margin-bottom:18px; line-height:1.75;">너의 데이터, <b>너만 풀 수 있게</b> 종단간 암호화로 보관할게. 잃어버릴 일도 없고, 나도 못 봐.</div>
    ${reasonText}

    <button type="button" class="sns-login-btn kakao" onclick="_guestConvBackToLogin()" style="margin-bottom:14px;">
      <svg class="sns-login-icon" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><path d="M9 1.5C4.86 1.5 1.5 4.18 1.5 7.5c0 2.13 1.42 4 3.55 5.06l-.7 2.61c-.07.27.23.49.46.34l3.06-2.04c.38.04.76.07 1.13.07 4.14 0 7.5-2.68 7.5-6S13.14 1.5 9 1.5z"/></svg>
      <span>카카오로 시작하기</span>
    </button>

    <button onclick="_closeGuestConvModal()" style="width:100%; padding:10px; background:transparent; border:1px solid var(--border-strong); color:var(--text-dim); border-radius:10px; cursor:pointer; font-size:13px;">나중에</button>
  `;

  document.body.appendChild(overlay);
}

function _closeGuestConvModal() {
  const m = document.getElementById('guestConvModal');
  if (m) m.remove();
}

// 사용자 명시 2026-05-06 ultrathink: 게스트 → '카카오로 시작' 클릭 = 로그인 창 으로 돌아가기 (linkIdentity 폐기).
// 사용자 명시 2026-05-06: 게스트 데이터 자동 이주 — snapshot localStorage 저장 후 로그인 화면.
// 새 uid 로 로그인 후 loadFromCloud 끝에서 _maybeMigrateGuestSnapshot 가 자동 머지.
function _guestConvBackToLogin() {
  try {
    if (typeof state !== 'undefined' && state && state.isGuest) {
      // ephemeral / volatile 필드 정리 (chat render cache 등) — 이주 후 자동 reset 됨.
      const _stateClean = JSON.parse(JSON.stringify(state));
      // saveState 와 호환 위해 isGuest 는 보존 (머지 헬퍼가 false 강제).
      const snapshot = {
        v: 1,
        savedAt: new Date().toISOString(),
        fromGuestUid: (typeof authUserId !== 'undefined') ? authUserId : null,
        state: _stateClean
      };
      localStorage.setItem(V4_GUEST_MIGRATE_KEY, JSON.stringify(snapshot));
      console.log('[guest migrate] snapshot 저장됨 — 다음 로그인 시 자동 이주');
    }
  } catch (e) {
    console.warn('[guest migrate] snapshot 저장 실패:', e);
  }
  _closeGuestConvModal();
  if (typeof showLoginScreen === 'function') showLoginScreen();
}

// ═══════════════════════════════════════════════════════════════
// GUEST → LOGIN 자동 이주 (사용자 명시 2026-05-06)
// ───────────────────────────────────────────────────────────────
// 호출: loadFromCloud 끝 (state 완성 후 / 1회 saveToCloudNow 직전).
// 정책:
//   - 신규 사용자 (cloud row X / state 비어있음) = snapshot 통째 적용.
//   - 기존 사용자 = 진행 chatMessages → chatArchive 마무리 push, 게스트 chat → 새 진행.
//     entries = 본 계정 우선 (date dedupe). archive/missions/pearls/insights/... = id dedupe 합치기.
//     traits/values/patterns = similarText dedupe 합치기. caseFormulation = mergeStrings.
//   - safety = 머지 직전 cloud 'me_v4_pre_guest_merge' row 1회 push (롤백용).
// 반환: true (머지 발생) → caller 가 saveToCloudNow 한 번 호출.
// ═══════════════════════════════════════════════════════════════
async function _maybeMigrateGuestSnapshot() {
  if (typeof state === 'undefined' || !state) return false;
  if (state.isGuest) return false;  // 아직 게스트 모드 — 이주 X
  // E2EE 복원/셋업 대기 중 = state 비어있어 신규처럼 보임. 잘못 머지하면 cloud 데이터 덮어씀. snapshot 보존 후 retry.
  if (typeof window !== 'undefined' && window._e2eePendingRecovery) {
    console.log('[guest migrate] E2EE 복원 대기 중 — snapshot 보존, 다음 진입 재시도');
    return false;
  }
  try {
    if (localStorage.getItem('soragodong_v4_pending_e2ee_setup') === '1'
        && (typeof _e2eeMasterKey === 'undefined' || !_e2eeMasterKey)) {
      console.log('[guest migrate] E2EE 셋업 대기 중 — snapshot 보존, 다음 진입 재시도');
      return false;
    }
  } catch {}
  let raw;
  try { raw = localStorage.getItem(V4_GUEST_MIGRATE_KEY); } catch { return false; }
  if (!raw) return false;
  let snap;
  try { snap = JSON.parse(raw); } catch { snap = null; }
  if (!snap || !snap.state) {
    try { localStorage.removeItem(V4_GUEST_MIGRATE_KEY); } catch {}
    return false;
  }
  // TTL — 30일 지난 snapshot 폐기
  const savedMs = snap.savedAt ? new Date(snap.savedAt).getTime() : 0;
  if (!savedMs || Date.now() - savedMs > V4_GUEST_MIGRATE_TTL_MS) {
    console.log('[guest migrate] snapshot TTL 초과 — 폐기');
    try { localStorage.removeItem(V4_GUEST_MIGRATE_KEY); } catch {}
    return false;
  }

  const guest = snap.state;
  // 기존 사용자 판정 — 의미있는 데이터가 있나
  const existingHasData =
    (Array.isArray(state.entries) && state.entries.length > 0) ||
    (Array.isArray(state.chatMessages) && state.chatMessages.length > 0) ||
    (Array.isArray(state.chatArchive) && state.chatArchive.length > 0) ||
    (Array.isArray(state.archive) && state.archive.length > 0) ||
    (Array.isArray(state.missions) && state.missions.length > 0) ||
    (Array.isArray(state.pearls) && state.pearls.length > 0);

  // 게스트 데이터 판정 — 빈 snapshot 이면 그냥 폐기
  const guestHasData =
    (Array.isArray(guest.entries) && guest.entries.length > 0) ||
    (Array.isArray(guest.chatMessages) && guest.chatMessages.length > 0) ||
    (Array.isArray(guest.archive) && guest.archive.length > 0) ||
    (Array.isArray(guest.missions) && guest.missions.length > 0) ||
    (Array.isArray(guest.pearls) && guest.pearls.length > 0);
  if (!guestHasData) {
    console.log('[guest migrate] 게스트 snapshot 비어있음 — 폐기');
    try { localStorage.removeItem(V4_GUEST_MIGRATE_KEY); } catch {}
    return false;
  }

  try {
    if (existingHasData && typeof _backupRowUpsert === 'function') {
      // safety backup — 머지 직전 cloud row 1회 push (사용자 요청 시 롤백 가능).
      try {
        const backup = JSON.parse(JSON.stringify(state));
        await _backupRowUpsert(V4_GUEST_MIGRATE_BACKUP_USER_ID, {
          ...backup,
          _backup_meta: { type: 'pre_guest_merge', createdAt: new Date().toISOString(), guestUid: snap.fromGuestUid || null }
        }, null);
        console.log('[guest migrate] safety backup → me_v4_pre_guest_merge');
      } catch (e) {
        console.warn('[guest migrate] safety backup 실패 (계속 진행):', e);
      }
    }

    if (!existingHasData) {
      // 신규 사용자 — snapshot 통째로 (DEFAULT_STATE merge, isGuest false 강제)
      const _wasMigrated = state._wasGuestPromoted;  // 보존
      state = { ...DEFAULT_STATE, ...guest, isGuest: false };
      if (_wasMigrated) state._wasGuestPromoted = _wasMigrated;
      console.log('[guest migrate] 신규 사용자 — snapshot 통째 이주');
    } else {
      // 기존 사용자 — 머지
      _mergeGuestSnapshotIntoExisting(guest);
      console.log('[guest migrate] 기존 사용자 — snapshot 머지 완료');
    }

    state._guestMigratedAt = new Date().toISOString();
    state.isGuest = false;
    try { localStorage.removeItem(V4_GUEST_MIGRATE_KEY); } catch {}
    if (typeof saveState === 'function') saveState();
    // 토스트 — 사용자 가시화
    setTimeout(() => {
      if (typeof showToast === 'function') showToast('🌱 게스트 때 데이터 가져왔어');
    }, 1200);
    return true;
  } catch (e) {
    console.error('[guest migrate] 머지 실패 — snapshot 보존 (다음 진입 재시도):', e);
    return false;
  }
}

// 기존 사용자 머지 — chat 마무리 / entries dedupe / 그 외 합치기.
function _mergeGuestSnapshotIntoExisting(guest) {
  // 1. 진행 chatMessages 마무리 → chatArchive 로 push (게스트 chat = 새 진행)
  const _existingChat = (Array.isArray(state.chatMessages) ? state.chatMessages : []).filter(m => m && !m.typing && !m.error);
  if (_existingChat.length >= 3) {
    if (!Array.isArray(state.chatArchive)) state.chatArchive = [];
    const _firstTs = _existingChat[0] && _existingChat[0].timestamp;
    const _dateKey = _firstTs && typeof getDayKey === 'function'
      ? getDayKey(_firstTs)
      : (typeof todayKey === 'function' ? todayKey() : (typeof getDayKey === 'function' ? getDayKey() : new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10)));
    state.chatArchive.unshift({
      id: 'arch_premerge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: _dateKey,
      messageCount: _existingChat.length,
      messages: _existingChat,
      generatedAt: new Date().toISOString(),
      endedManually: false,
      _pendingExtract: true,
      _premergeArchive: true
    });
  }
  // 게스트 chatMessages → 새 진행. 첫 메시지에 chapterStart 마커 보강.
  const _guestChat = Array.isArray(guest.chatMessages) ? guest.chatMessages.slice() : [];
  if (_guestChat.length > 0) {
    const _firstUserIdx = _guestChat.findIndex(m => m && m.role === 'user');
    if (_firstUserIdx >= 0 && !_guestChat[_firstUserIdx].chapterStart) {
      _guestChat[_firstUserIdx] = { ..._guestChat[_firstUserIdx], chapterStart: true };
    }
  }
  state.chatMessages = _guestChat;

  // 2. entries — 기존 우선. 게스트 only date 만 push.
  if (Array.isArray(guest.entries) && guest.entries.length > 0) {
    if (!Array.isArray(state.entries)) state.entries = [];
    const _existingDates = new Set(state.entries.map(e => e && e.date).filter(Boolean));
    guest.entries.forEach(ge => {
      if (!ge || !ge.date) return;
      if (_existingDates.has(ge.date)) return;
      state.entries.push(ge);
      _existingDates.add(ge.date);
    });
    // 날짜순 정렬
    state.entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  // 3. id dedupe 합치기 — array of objects with .id
  const _mergeById = (existing, incoming) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return existing;
    if (!Array.isArray(existing)) existing = [];
    const _ids = new Set(existing.map(it => it && it.id).filter(Boolean));
    incoming.forEach(it => {
      if (!it || !it.id) {
        // id 없으면 그냥 push (timestamp 차이로 충돌 X)
        existing.push(it);
        return;
      }
      if (!_ids.has(it.id)) {
        existing.push(it);
        _ids.add(it.id);
      }
    });
    return existing;
  };
  state.archive = _mergeById(state.archive, guest.archive);
  state.chatArchive = _mergeById(state.chatArchive, guest.chatArchive);
  state.missions = _mergeById(state.missions, guest.missions);
  state.pearls = _mergeById(state.pearls, guest.pearls);
  state.insights = _mergeById(state.insights, guest.insights);
  state.topicCards = _mergeById(state.topicCards, guest.topicCards);
  state.decisions = _mergeById(state.decisions, guest.decisions);
  state.tasks = _mergeById(state.tasks, guest.tasks);
  state.projects = _mergeById(state.projects, guest.projects);
  state.areas = _mergeById(state.areas, guest.areas);
  state.memoryVault = _mergeById(state.memoryVault, guest.memoryVault);
  state.dayPlan = _mergeById(state.dayPlan, guest.dayPlan);
  state.starts = _mergeById(state.starts, guest.starts);
  state.diagnoses = _mergeById(state.diagnoses, guest.diagnoses);
  state.reflectionQuestions = _mergeById(state.reflectionQuestions, guest.reflectionQuestions);
  state.weeklyReviews = _mergeById(state.weeklyReviews, guest.weeklyReviews);
  state.monthlyReviews = _mergeById(state.monthlyReviews, guest.monthlyReviews);
  state.quarterlyReviews = _mergeById(state.quarterlyReviews, guest.quarterlyReviews);
  state.annualReviews = _mergeById(state.annualReviews, guest.annualReviews);
  state.predictionFollowups = _mergeById(state.predictionFollowups, guest.predictionFollowups);
  state.questionHistory = _mergeById(state.questionHistory, guest.questionHistory);

  // shellCollection — _id 기반 dedupe
  if (Array.isArray(guest.shellCollection) && guest.shellCollection.length > 0) {
    if (!Array.isArray(state.shellCollection)) state.shellCollection = [];
    const _shellIds = new Set(state.shellCollection.map(s => s && s._id).filter(Boolean));
    guest.shellCollection.forEach(s => {
      if (!s) return;
      if (s._id && _shellIds.has(s._id)) return;
      state.shellCollection.push(s);
      if (s._id) _shellIds.add(s._id);
    });
  }

  // 4. traits/values/patterns — similarText dedupe (mergeModelItem 패턴)
  const _mergeModelArr = (existingArr, incomingArr) => {
    if (!Array.isArray(incomingArr) || incomingArr.length === 0) return existingArr;
    if (!Array.isArray(existingArr)) existingArr = [];
    incomingArr.forEach(inc => {
      if (!inc || !inc.name) return;
      const exist = existingArr.find(e => e && typeof similarText === 'function' && similarText(e.name, inc.name));
      if (exist) {
        exist.evidence_count = (exist.evidence_count || 1) + 1;
        if ((inc.confidence || 0) > (exist.confidence || 0)) exist.confidence = inc.confidence;
        if (inc.description && (!exist.description || inc.description.length > exist.description.length)) {
          exist.description = inc.description;
        }
      } else {
        existingArr.push(inc);
      }
    });
    return existingArr;
  };
  state.traits = _mergeModelArr(state.traits, guest.traits);
  state.values = _mergeModelArr(state.values, guest.values);
  state.patterns = _mergeModelArr(state.patterns, guest.patterns);

  // 5. caseFormulation — string array mergeStrings (similarText dedupe)
  if (guest.caseFormulation) {
    if (!state.caseFormulation) state.caseFormulation = JSON.parse(JSON.stringify(DEFAULT_STATE.caseFormulation));
    const cf = state.caseFormulation;
    const gcf = guest.caseFormulation;
    const _mergeStrArr = (a, b) => {
      const out = Array.isArray(a) ? a.slice() : [];
      (Array.isArray(b) ? b : []).forEach(item => {
        if (!item || typeof item !== 'string') return;
        if (typeof similarText !== 'function' || !out.some(e => similarText(e, item))) out.push(item);
      });
      return out;
    };
    cf.problems = _mergeStrArr(cf.problems, gcf.problems);
    cf.mechanisms = _mergeStrArr(cf.mechanisms, gcf.mechanisms);
    cf.strengths = _mergeStrArr(cf.strengths, gcf.strengths);
    cf.goals = _mergeStrArr(cf.goals, gcf.goals);
    cf.growth = _mergeStrArr(cf.growth, gcf.growth);
    if (typeof gcf.version === 'number') cf.version = Math.max(cf.version || 0, gcf.version);
    cf.lastUpdated = new Date().toISOString();
  }

  // 6. unlocked / tutorialShown — OR (둘 중 하나라도 true 면 true)
  if (guest.unlocked && typeof guest.unlocked === 'object') {
    if (!state.unlocked) state.unlocked = {};
    Object.keys(guest.unlocked).forEach(k => {
      if (guest.unlocked[k]) state.unlocked[k] = true;
    });
  }
  if (guest.tutorialShown && typeof guest.tutorialShown === 'object') {
    if (!state.tutorialShown) state.tutorialShown = {};
    Object.keys(guest.tutorialShown).forEach(k => {
      if (guest.tutorialShown[k]) state.tutorialShown[k] = true;
    });
  }

  // 7. modes — OR. modeActiveSince — 더 오래된 (먼저 활성) timestamp 채택.
  if (guest.modes && typeof guest.modes === 'object') {
    if (!state.modes) state.modes = {};
    Object.keys(guest.modes).forEach(k => {
      if (guest.modes[k]) state.modes[k] = true;
    });
  }
  if (guest.modeActiveSince && typeof guest.modeActiveSince === 'object') {
    if (!state.modeActiveSince) state.modeActiveSince = {};
    Object.keys(guest.modeActiveSince).forEach(k => {
      const _g = guest.modeActiveSince[k];
      const _s = state.modeActiveSince[k];
      if (!_g) return;
      if (!_s || new Date(_g) < new Date(_s)) state.modeActiveSince[k] = _g;
    });
  }

  // 8. counters — Math.max
  if (typeof guest.chapterCompletedCount === 'number') {
    state.chapterCompletedCount = Math.max(state.chapterCompletedCount || 0, guest.chapterCompletedCount);
  }
}

// V4 (사용자 명시 2026-05-06 ultrathink): linkIdentity 흐름 폐기. 함수 보존 — 호출처 X 라 dead.
async function _guestConvKakaoLink() {
  if (!session?.access_token) {
    alert('세션 끊김 — 페이지 새로고침');
    return;
  }

  // 카카오 callback 후 E2EE setup 모달 뜨기 전 saveToCloudNow 평문 업로드 차단 (06-backup-migration.js 의 가드 호환).
  try { localStorage.setItem('soragodong_v4_pending_e2ee_setup', '1'); } catch {}
  // loginMethod marker — E2EE setup 모달이 동의 stash 식별용.
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email: '',
      loginMethod: 'kakao_link',
      at: new Date().toISOString()
    }));
  } catch {}

  try {
    const _fetch = window._anthropicOrigFetch || fetch;
    const params = new URLSearchParams({
      provider: 'kakao',
      redirect_to: window.location.origin,
      scopes: 'account_email'
    });
    const url = `${SUPABASE_URL}/auth/v1/user/identities/authorize?${params.toString()}`;

    const resp = await _fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token
      }
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('[guest conv kakao] fail:', resp.status, err);
      try { localStorage.removeItem('soragodong_v4_pending_e2ee_setup'); } catch {}
      alert('카카오 연결 실패 (' + resp.status + ') — 잠시 후 다시');
      return;
    }
    const data = await resp.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      console.error('[guest conv kakao] no url in response:', data);
      try { localStorage.removeItem('soragodong_v4_pending_e2ee_setup'); } catch {}
      alert('카카오 연결 응답 형식 오류');
    }
  } catch (e) {
    console.error('[guest conv kakao] throw:', e);
    try { localStorage.removeItem('soragodong_v4_pending_e2ee_setup'); } catch {}
    alert('네트워크 오류 — 잠시 후 다시');
  }
}
