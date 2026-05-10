// =============================================================================
// 고동의 일기 모달 — HANDOFF.md prototype/components/VariantC.jsx (훔쳐보기) vanilla 변환.
// 사용자 명시 2026-05-10: 회전 카드 source 3 → 모달 페이지화. 28s 카운트다운 + 토스트 자동 종료.
// =============================================================================

// Module-local state. 모달 열려있을 때만 객체. 닫힐 때 null.
let _gdiaryState = null;
// 사용자 명시 2026-05-11: 다시 만들기 버튼용 force flag — 한 번만 적용.
let _gdiaryForceRegenerate = false;

// ─────────────────────────────────────────────────────────────────────────────
// 정형문 fallback — substrate 빈약 / tone verify 실패 시 random pick.
// 사용자 보고 2026-05-11: 옛 fallback 의 specific 사건 (회사/한강/김치/엄마/회의실) 이 그대로 출력돼서
//   사용자가 회사 안 갔는데도 "회사 가기 싫다고" 일기 떴던 버그 → 중립 톤으로만 교체.
//   호칭도 무인칭 (사용자 이름 의존 X) 으로.
// ─────────────────────────────────────────────────────────────────────────────
const _GDIARY_FALLBACK_POOL = [
  '오늘은 별 말 없는 날이었다.\n별 말 없어도 좋다.\n(이런 거 적어도 되나)',
  '조용한 하루였다.\n특별한 일 없어도, 옆에 있었다는 건 적어둔다.',
  '오늘은 그냥 옆에 있고 싶은 날이었다.\n할 말 없어도. ㅎㅎ',
  '오늘은 좀 보고 싶었던 것 같다.\n... 적어두고 잊자.',
  '오늘은 적을 게 없네 ㅎㅎ.\n근데 옆에 있는 건 좋다.',
];

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 이름 추출 — 사용자 보고 2026-05-11: metadata 자동 hit 시 모달 trigger 안 되는 버그.
//   사용자 명시 = "내가 알려준 이름" 만 사용. metadata 자동 추출 폐기.
//   state.userName 만 신뢰. 비어있으면 무조건 모달 prompt.
//   metadata 는 모달의 default value (hint) 로만 활용.
// ─────────────────────────────────────────────────────────────────────────────
function _gdiaryGetUserName() {
  if (typeof state !== 'undefined' && state.userName && typeof state.userName === 'string') {
    const v = state.userName.trim();
    if (v.length > 0) return v.slice(0, 20);
  }
  return null;
}

// metadata 에서 hint 추출 — 모달 default value 용. 한글 포함만.
function _gdiaryExtractMetadataNameHint() {
  if (typeof session === 'undefined' || !session || !session.user) return '';
  const m = session.user.user_metadata || {};
  const candidates = [m.name, m.full_name, m.preferred_username, m.nickname, m.given_name, m.user_name];
  for (const c of candidates) {
    if (c && typeof c === 'string') {
      const v = c.trim();
      if (v.length >= 2 && v.length <= 20 && /[가-힣]/.test(v)) return v;
    }
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 이름 입력 모달 — userName 비어있을 때 prompt. metadata hint 를 default 로.
// ─────────────────────────────────────────────────────────────────────────────
async function _gdiaryAskUserName() {
  if (typeof showInputModal !== 'function') {
    console.warn('[godong-diary] showInputModal 미정의 — 모달 prompt fail');
    return null;
  }
  const _hint = _gdiaryExtractMetadataNameHint();
  const v = await showInputModal({
    title: '고동이가 너를 뭐라고 부를까?',
    message: '일기에서 사용할 이름이야. 본명이나 별명 — 짧게 입력해.',
    placeholder: '예: 지우, 민지, 보라...',
    defaultValue: _hint || '',
    multiline: false,
    okLabel: '저장'
  });
  if (v === null) return null;
  const trimmed = (v || '').trim().slice(0, 20);
  if (trimmed.length < 1) return null;
  state.userName = trimmed;
  // 사용자 명시 2026-05-11: 프로필 비어있을 때만 이름 자동 prepend.
  if (!state.profile || !state.profile.trim()) {
    state.profile = `이름: ${trimmed}`;
  }
  // 사용자 보고 2026-05-11: 옛 fallback (영문 이름 또는 자동 추출 결과) 로 작성된 entries 청소
  //   + cooldown reset → 다음 호출에서 새 이름으로 재생성.
  state.godongDiary = (state.godongDiary || []).filter(e => !(e && e.fallback));
  if (state.rotatingCardState) {
    state.rotatingCardState.lastGodongDiaryAt = null;
    state.rotatingCardState.godongDiaryContentId = null;
  }
  if (typeof saveState === 'function') saveState(true);
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public — 회전 카드 탭 시 진입.
// ─────────────────────────────────────────────────────────────────────────────
async function openGodongDiaryModal() {
  console.log('[godong-diary] openGodongDiaryModal called');
  // 사용자 보고 2026-05-11: 회전 카드 클릭 반응 X 버그 — 옛 모달 stuck 가능성. early return 대신 제거.
  const _existingOverlay = document.getElementById('gdiaryOverlay');
  if (_existingOverlay) {
    console.warn('[godong-diary] 옛 modal stuck — 제거 후 재진입');
    _existingOverlay.remove();
    _gdiaryState = null;
  }

  try {

  const r = (typeof _ensureRotatingCardState === 'function') ? _ensureRotatingCardState() : (state.rotatingCardState = state.rotatingCardState || {});
  if (!Array.isArray(state.godongDiary)) state.godongDiary = [];

  // 사용자 명시 2026-05-11: userName 필수 — placeholder '지우' fallback 폐기.
  //   state.userName / supabase metadata 에서 추출. 못 찾으면 1회 prompt 모달.
  let _userName = _gdiaryGetUserName();
  if (!_userName) {
    _userName = await _gdiaryAskUserName();
    if (!_userName) {
      // 사용자가 입력 거절 — 일기 생성 X. 모달 그대로 닫음.
      if (typeof showToast === 'function') showToast('이름을 알려줘야 일기를 적을 수 있어');
      return;
    }
  }

  // 사용자 명시 2026-05-11: 4AM cutoff 기준 dayKey 3개 (3일 전 / 2일 전 / 어제). 오늘 X.
  const _gdkOff = (off) => {
    if (typeof getDayKey === 'function') return getDayKey(Date.now() - off * 86400000);
    const d = new Date(Date.now() - off * 86400000 - 4 * 3600000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const _3daysK = _gdkOff(3);
  const _2daysK = _gdkOff(2);
  const _yesterdayK = _gdkOff(1);
  const _targetDayKs = [_3daysK, _2daysK, _yesterdayK];
  const _targetSet = new Set(_targetDayKs);
  const _entryDayK = (e) => {
    if (!e || !e.iso) return null;
    if (typeof getDayKey === 'function') return getDayKey(e.iso);
    const d = new Date(e.iso);
    if (isNaN(d.getTime())) return null;
    const adj = new Date(d.getTime() - 4 * 3600000);
    return `${adj.getFullYear()}-${String(adj.getMonth()+1).padStart(2,'0')}-${String(adj.getDate()).padStart(2,'0')}`;
  };

  // 사용자 명시 2026-05-11: cooldown 룰 단순화 — lastGodongDiaryAt 기반 3일 cooldown 폐기.
  //   회전 카드 클릭 시 3/2/1일 전 일기가 *모두 있으면* 그대로 띄움. 하나라도 없으면 새로 생성.
  //   '다시 적어줘' 버튼은 force regenerate (있어도 재호출).
  const _existingMatchedDayKs = new Set(
    (state.godongDiary || [])
      .filter(e => e && _targetSet.has(_entryDayK(e)))
      .map(e => _entryDayK(e))
  );
  const _hasAllThreeDays = _targetDayKs.every(dayK => _existingMatchedDayKs.has(dayK));
  const _force = _gdiaryForceRegenerate;
  _gdiaryForceRegenerate = false;
  const needsGenerate = !_hasAllThreeDays || _force;

  // 셸 먼저 (loading) — 사용자가 빈 화면 안 보게.
  _gdiaryRenderShell({ loading: true });

  // Haiku 호출 — 사용자 명시 2026-05-11: 정확히 3개 entry (3일전/2일전/어제). 데이터 없는 날도 fallback 톤으로 1편.
  if (needsGenerate) {
    // regenerate 시 같은 날 중복 방지 — 3개 dayK 와 매칭되는 옛 entry 모두 splice.
    state.godongDiary = (state.godongDiary || []).filter(e => !_targetSet.has(_entryDayK(e)));

    let newEntries = [];
    let _generateOk = false;
    try {
      const arr = await _callGodongDiaryHaiku();
      if (Array.isArray(arr) && arr.length > 0) {
        newEntries = arr.map(p => _gdiaryEntryFromHaiku(p)).filter(Boolean);
        if (newEntries.length > 0) _generateOk = true;
      }
    } catch (err) {
      console.warn('[godong-diary] generate fail, fallback', err && err.message);
      // fallback — 3개 모두 fallback 톤 (3일전/2일전/어제 각 1편).
      _targetDayKs.forEach((dayK) => {
        const text = _GDIARY_FALLBACK_POOL[Math.floor(Math.random() * _GDIARY_FALLBACK_POOL.length)];
        const d = new Date(dayK + 'T20:00:00');
        newEntries.push({
          id: 'gd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          date: `${d.getMonth()+1}월 ${d.getDate()}일`,
          weekday: ['일','월','화','수','목','금','토'][d.getDay()],
          note: null,
          body: text,
          iso: d.toISOString(),
          substrateRefs: [],
          fallback: true,
        });
      });
    }
    if (newEntries.length > 0) {
      newEntries.forEach(e => state.godongDiary.push(e));
      // 사용자 명시 2026-05-11: lastGodongDiaryAt 기반 cooldown 폐기 — state.godongDiary 안 dayK 매칭 entries 존재 = 진입 가능.
      //   단 godongDiaryContentId 는 마지막 entry pointer (legacy 호환) 로 keep.
      r.godongDiaryContentId = newEntries[newEntries.length - 1].id;
      if (typeof saveState === 'function') saveState(true);
    }
  }

  // 사용자 명시 2026-05-11: 회전 카드 모달 = 정확히 3 dayK (3일전/2일전/어제) 매칭 entry 만.
  let visibleEntries = (state.godongDiary || []).filter(e => _targetSet.has(_entryDayK(e)));
  // 시간순 오름차순 정렬 (3일 전 → 어제).
  visibleEntries.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  // 만약 dayK 매칭 entry 가 부족하면 fallback 채워 정확히 3개.
  if (visibleEntries.length < 3) {
    const _existingDayKs = new Set(visibleEntries.map(_entryDayK));
    _targetDayKs.forEach((dayK) => {
      if (_existingDayKs.has(dayK)) return;
      const text = _GDIARY_FALLBACK_POOL[Math.floor(Math.random() * _GDIARY_FALLBACK_POOL.length)];
      const d = new Date(dayK + 'T20:00:00');
      const fb = {
        id: 'gd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        date: `${d.getMonth()+1}월 ${d.getDate()}일`,
        weekday: ['일','월','화','수','목','금','토'][d.getDay()],
        note: null,
        body: text,
        iso: d.toISOString(),
        substrateRefs: [],
        fallback: true,
      };
      state.godongDiary.push(fb);
      visibleEntries.push(fb);
    });
    visibleEntries.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
    if (typeof saveState === 'function') saveState();
  }

  _gdiaryState = {
    entries: visibleEntries,
    idx: visibleEntries.length - 1,  // 마지막 (최신) 페이지부터.
    secs: 28,
    caught: false,
    returned: false,
    drag: { x: 0, active: false, startX: 0 },
    intervalId: null,
    toastTimeoutId: null,
    readonly: false,
  };
  _gdiaryRenderShell({ loading: false });
  _gdiaryStartCountdown();
  if (typeof _rcSessionMarkConfirmed === 'function') _rcSessionMarkConfirmed('godongDiary');

  } catch (err) {
    // 사용자 보고 2026-05-11: 회전 카드 클릭 반응 X 버그 디버그용 — silent throw 가시화.
    console.error('[godong-diary] openGodongDiaryModal error:', err);
    if (typeof showToast === 'function') showToast('일기 열기 실패: ' + (err && err.message ? err.message : err));
    // 부분 렌더된 overlay 정리
    const _ov = document.getElementById('gdiaryOverlay');
    if (_ov) _ov.remove();
    _gdiaryState = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive 에서 단일 entry 진입 (readonly).
// ─────────────────────────────────────────────────────────────────────────────
function openSavedGodongDiary(id) {
  const e = (typeof _rcFindGodongDiaryById === 'function')
    ? _rcFindGodongDiaryById(id)
    : ((state.godongDiary || []).find(x => x && x.id === id) || null);
  if (!e) return;
  if (document.getElementById('gdiaryOverlay')) return;
  _gdiaryState = {
    entries: [e],
    idx: 0,
    secs: 28,
    caught: false,
    returned: false,
    drag: { x: 0, active: false, startX: 0 },
    intervalId: null,
    toastTimeoutId: null,
    readonly: true,
  };
  _gdiaryRenderShell({ loading: false });
  _gdiaryStartCountdown();
}

// Legacy — 옛 미니 리뷰 row 클릭. 단일 entry 형으로 변환해서 같은 모달 노출.
function openSavedMiniReview(id) {
  const mr = (state.miniReviews || []).find(m => m && m.id === id);
  if (!mr || !mr.content) return;
  if (document.getElementById('gdiaryOverlay')) return;
  const d = mr.generatedAt ? new Date(mr.generatedAt) : new Date();
  const fakeEntry = {
    id: mr.id,
    date: `${d.getMonth() + 1}월 ${d.getDate()}일`,
    weekday: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()],
    body: mr.content,
    iso: mr.generatedAt || d.toISOString(),
    legacy: true,
  };
  _gdiaryState = {
    entries: [fakeEntry],
    idx: 0,
    secs: 28,
    caught: false,
    returned: false,
    drag: { x: 0, active: false, startX: 0 },
    intervalId: null,
    toastTimeoutId: null,
    readonly: true,
    legacyLabel: true,
  };
  _gdiaryRenderShell({ loading: false });
  _gdiaryStartCountdown();
}

// ─────────────────────────────────────────────────────────────────────────────
// 닫기 — caught 애니 (rotate 0 + translateY -4px) → 0.65s 후 DOM 제거.
// ─────────────────────────────────────────────────────────────────────────────
function closeGodongDiaryModal() {
  if (!_gdiaryState) {
    const overlay = document.getElementById('gdiaryOverlay');
    if (overlay) overlay.remove();
    return;
  }
  if (_gdiaryState.intervalId) clearInterval(_gdiaryState.intervalId);
  if (_gdiaryState.toastTimeoutId) clearTimeout(_gdiaryState.toastTimeoutId);

  // 토스트 (returned=true) 상태에서는 즉시 close.
  if (_gdiaryState.returned) {
    const overlay = document.getElementById('gdiaryOverlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 220);
    }
    _gdiaryState = null;
    if (typeof renderRotatingCard === 'function') setTimeout(() => renderRotatingCard(), 240);
    return;
  }

  _gdiaryState.caught = true;
  _gdiaryUpdatePaper();
  setTimeout(() => {
    const overlay = document.getElementById('gdiaryOverlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 220);
    }
    _gdiaryState = null;
    if (typeof renderRotatingCard === 'function') setTimeout(() => renderRotatingCard(), 240);
  }, 650);
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 명시 2026-05-11: 다시 적어줘 — 모달 안 ↻ 버튼. cooldown 무시 + Haiku 재호출.
// ─────────────────────────────────────────────────────────────────────────────
function regenerateGodongDiary() {
  if (!_gdiaryState) return;
  if (_gdiaryState.readonly) return;
  if (_gdiaryState.intervalId) { clearInterval(_gdiaryState.intervalId); _gdiaryState.intervalId = null; }
  if (_gdiaryState.toastTimeoutId) { clearTimeout(_gdiaryState.toastTimeoutId); _gdiaryState.toastTimeoutId = null; }
  _gdiaryForceRegenerate = true;
  // 모달 즉시 제거 + 재진입 (loading → Haiku → 새 entry).
  const overlay = document.getElementById('gdiaryOverlay');
  if (overlay) overlay.remove();
  _gdiaryState = null;
  setTimeout(() => { try { openGodongDiaryModal(); } catch (e) { console.warn('[gdiary regenerate]', e); } }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// 페이지 nav.
// ─────────────────────────────────────────────────────────────────────────────
function _gdiaryNext() {
  if (!_gdiaryState) return;
  const max = _gdiaryState.entries.length - 1;
  if (_gdiaryState.idx >= max) return;
  _gdiaryState.idx += 1;
  _gdiaryRenderShell({ loading: false });
}
function _gdiaryPrev() {
  if (!_gdiaryState) return;
  if (_gdiaryState.idx <= 0) return;
  _gdiaryState.idx -= 1;
  _gdiaryRenderShell({ loading: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// 카운트다운 + 토스트.
// ─────────────────────────────────────────────────────────────────────────────
function _gdiaryStartCountdown() {
  if (!_gdiaryState) return;
  if (_gdiaryState.intervalId) clearInterval(_gdiaryState.intervalId);
  _gdiaryState.intervalId = setInterval(() => {
    if (!_gdiaryState) return;
    _gdiaryState.secs -= 1;
    if (_gdiaryState.secs <= 0) {
      _gdiaryState.secs = 0;
      _gdiaryUpdateTimer();
      clearInterval(_gdiaryState.intervalId);
      _gdiaryState.intervalId = null;
      _gdiaryReturnPop();
      return;
    }
    _gdiaryUpdateTimer();
  }, 1000);
}

function _gdiaryUpdateTimer() {
  const el = document.getElementById('gdiaryTimer');
  if (!el || !_gdiaryState) return;
  el.textContent = `곧 돌아옴 · ${_gdiaryState.secs}s`;
  if (_gdiaryState.secs <= 10) el.classList.add('is-danger');
  else el.classList.remove('is-danger');
}

function _gdiaryReturnPop() {
  if (!_gdiaryState) return;
  _gdiaryState.returned = true;
  _gdiaryRenderShell({ loading: false });
  _gdiaryState.toastTimeoutId = setTimeout(() => {
    closeGodongDiaryModal();
  }, 1800);
}

// ─────────────────────────────────────────────────────────────────────────────
// Swipe — pointer events. ±50px 임계 = 페이지 전환.
// ─────────────────────────────────────────────────────────────────────────────
function _gdiaryPointerStart(e) {
  if (!_gdiaryState) return;
  if (_gdiaryState.returned || _gdiaryState.caught) return;
  _gdiaryState.drag.startX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  _gdiaryState.drag.x = 0;
  _gdiaryState.drag.active = true;
}
function _gdiaryPointerMove(e) {
  if (!_gdiaryState || !_gdiaryState.drag.active) return;
  const x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  _gdiaryState.drag.x = x - _gdiaryState.drag.startX;
  _gdiaryUpdatePaper();
}
function _gdiaryPointerUp(e) {
  if (!_gdiaryState || !_gdiaryState.drag.active) return;
  const dx = _gdiaryState.drag.x;
  _gdiaryState.drag.x = 0;
  _gdiaryState.drag.active = false;
  if (dx < -50) {
    _gdiaryNext();
  } else if (dx > 50) {
    _gdiaryPrev();
  } else {
    _gdiaryUpdatePaper();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render.
// ─────────────────────────────────────────────────────────────────────────────
function _gdiaryRenderShell(opts) {
  const loading = !!(opts && opts.loading);
  let overlay = document.getElementById('gdiaryOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gdiaryOverlay';
    overlay.className = 'gdiary-overlay';
    overlay.addEventListener('click', function(ev) {
      // overlay 자체 클릭 시 닫기 (returned 상태 X).
      if (ev.target !== overlay) return;
      if (_gdiaryState && _gdiaryState.returned) return;
      closeGodongDiaryModal();
    });
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 30);
  }

  if (loading) {
    overlay.innerHTML = `
      <div class="gdiary-loading-wrap">
        <div class="gdiary-loading">정리 중... ✦</div>
      </div>
    `;
    return;
  }

  const s = _gdiaryState;
  if (!s || !s.entries || !s.entries.length) {
    overlay.innerHTML = `
      <div class="gdiary-loading-wrap">
        <div class="gdiary-loading">노트가 없네...</div>
        <button class="gdiary-close" type="button" onclick="closeGodongDiaryModal()">닫기</button>
      </div>
    `;
    return;
  }

  const cur = s.entries[s.idx];
  const noteSuffix = cur.note ? ` · ${escapeHtml(cur.note)}` : '';
  const dateLine = `${escapeHtml(cur.date)} · ${escapeHtml(cur.weekday)}${noteSuffix}`;
  const labelRight = s.legacyLabel ? '고동의 옛 메모' : '고동의 일기';
  const dotsHtml = s.entries.map((e, i) =>
    `<span class="gdiary-dot${i === s.idx ? ' is-active' : ''}"></span>`
  ).join('');
  const prevDisabled = s.idx === 0 ? ' disabled' : '';
  const nextDisabled = s.idx === s.entries.length - 1 ? ' disabled' : '';
  const showNav = s.entries.length > 1;
  const timerClass = s.secs <= 10 ? ' is-danger' : '';
  const paperTransform = s.caught
    ? 'rotate(0deg) translateY(-4px)'
    : `rotate(-1.6deg) translateX(${s.drag.x}px)`;
  const paperOpacity = s.drag.active ? Math.max(0.5, 1 - Math.abs(s.drag.x) / 400) : 1;

  // 사용자 명시 2026-05-10: 토스트 SVG = godong-storming.svg (들킨 직후 폭풍 같은 마음).
  const shyGodongSvg = `<img class="gdiary-shy-svg godong-mood-storming" src="/character/godong-storming.svg" alt="" aria-hidden="true">`;

  const toastHtml = s.returned ? `
    <div class="gdiary-toast-overlay">
      <div class="gdiary-toast-card">
        ${shyGodongSvg}
        <div class="gdiary-toast-title">고동이가 돌아왔다!</div>
        <div class="gdiary-toast-sub">... 못 본 척 하자.</div>
      </div>
    </div>
  ` : '';

  overlay.innerHTML = `
    <div class="gdiary-modal" onclick="event.stopPropagation()">
      <div class="gdiary-meta">
        <span class="gdiary-meta-left">🤫 고동이 자리 비움</span>
        <span class="gdiary-timer${timerClass}" id="gdiaryTimer">곧 돌아옴 · ${s.secs}s</span>
      </div>

      <div class="gdiary-paper-wrap"
           onpointerdown="_gdiaryPointerStart(event)"
           onpointermove="_gdiaryPointerMove(event)"
           onpointerup="_gdiaryPointerUp(event)"
           onpointercancel="_gdiaryPointerUp(event)">
        <div class="diary-paper" id="gdiaryPaper" style="transform: ${paperTransform}; opacity: ${paperOpacity};">
          <div class="date-stamp">
            <span>${dateLine}</span>
            <span style="opacity:0.6">${escapeHtml(labelRight)}</span>
          </div>
          <div class="entry">${escapeHtml(cur.body)}</div>
          <div class="signature">— 고동</div>
        </div>
      </div>

      ${showNav ? `
      <div class="gdiary-nav">
        <button class="gdiary-nav-btn" type="button" onclick="_gdiaryPrev()"${prevDisabled}>‹</button>
        <div class="gdiary-dots">${dotsHtml}</div>
        <button class="gdiary-nav-btn" type="button" onclick="_gdiaryNext()"${nextDisabled}>›</button>
      </div>
      ` : ''}

      <div class="gdiary-action-row">
        ${s.readonly ? '' : `<button class="gdiary-regenerate" type="button" onclick="regenerateGodongDiary()" title="고동이한테 다시 적게 하기">↻ 다시 적어줘</button>`}
        <button class="gdiary-close" type="button" onclick="closeGodongDiaryModal()">못 본 척 하기</button>
      </div>

      ${toastHtml}
    </div>
  `;
}

function _gdiaryUpdatePaper() {
  const el = document.getElementById('gdiaryPaper');
  if (!el || !_gdiaryState) return;
  const s = _gdiaryState;
  if (s.caught) {
    el.style.transform = 'rotate(0deg) translateY(-4px)';
    el.style.opacity = '1';
    return;
  }
  el.style.transform = `rotate(-1.6deg) translateX(${s.drag.x}px)`;
  if (s.drag.active) {
    el.style.opacity = String(Math.max(0.5, 1 - Math.abs(s.drag.x) / 400));
  } else {
    el.style.opacity = '1';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry helpers.
// ─────────────────────────────────────────────────────────────────────────────
function _gdiaryEntryFromText(text, opts) {
  const fallback = !!(opts && opts.fallback);
  const now = new Date();
  const id = 'gd_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 6);
  return {
    id: id,
    date: `${now.getMonth() + 1}월 ${now.getDate()}일`,
    weekday: ['일', '월', '화', '수', '목', '금', '토'][now.getDay()],
    note: null,
    body: text,
    iso: now.toISOString(),
    substrateRefs: [],
    fallback: fallback,
  };
}

// 사용자 명시 2026-05-11: Haiku JSON 배열 entry → state.godongDiary entry 변환.
//   parsed = { iso, date, weekday, body }. iso 가 미래거나 너무 옛날이면 안전하게 보정.
function _gdiaryEntryFromHaiku(parsed) {
  if (!parsed || typeof parsed.body !== 'string') return null;
  const id = 'gd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const now = new Date();
  const fallbackIso = now.toISOString();
  let iso = fallbackIso;
  let dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일`;
  let weekday = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  // iso 검증: 미래는 today 로 잡음 + 너무 옛날 (4일 이전) 도 today 로.
  if (parsed.iso) {
    const t = new Date(parsed.iso).getTime();
    const _3daysAgo = now.getTime() - 3 * 86400000;
    const _1hourAhead = now.getTime() + 3600000;
    if (!isNaN(t) && t >= _3daysAgo && t <= _1hourAhead) {
      iso = new Date(t).toISOString();
      const d = new Date(t);
      dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`;
      weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    }
  }
  // LLM 이 직접 적은 date / weekday 우선.
  if (typeof parsed.date === 'string' && parsed.date.trim()) dateLabel = parsed.date.trim().slice(0, 12);
  if (typeof parsed.weekday === 'string' && parsed.weekday.trim()) weekday = parsed.weekday.trim().slice(0, 3);
  return {
    id: id,
    date: dateLabel,
    weekday: weekday,
    note: null,
    body: parsed.body,
    iso: iso,
    substrateRefs: [],
    fallback: false,
  };
}
