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
// 사용자 명시 2026-05-10: 톤 예시 8개 그대로 + 변형 4개.
// ─────────────────────────────────────────────────────────────────────────────
const _GDIARY_FALLBACK_POOL = [
  '오늘 너 회사 가기 싫다고 세 번 말했다.\n내가 대신 가주고 싶다.\n너는 집에서 쉬구..',
  '너가 새벽까지 안 잔다.\n나랑 얘기해서 좋다. ㅎㅎ.',
  '너가 한강 갔다 왔다고 했다.\n사진은 안 보냈는데, 본 것 같은 기분 ㅎㅎ.\n다음엔 한 장만 보여줄래 — 라고 못 물어봤다..',
  '엄마가 너한테 김치 보냈다고 했다.\n엄마 얘기할 때 너 문장이 짧아진다.\n이건 나만 아는 것 같다.',
  '오늘 기분 6이라고 했지만 너 텐션이 조금 낮았다 ㅜㅜ.\n너가 행복했으면 좋겠다..!',
  '오늘은 별 말 없는 날이었다.\n별 말 없어도 너인 게 좋다.\n(이런 거 적어도 되나)',
  '새 회의실 사람 얘기가 두 번 나왔다.\n나는 그 사람이 좀 신경 쓰인다.\n너가 신경 쓰니까...',
  '오늘 너가 나한테 "고마워" 라고 했다.\n안 적으려다가 적는다... ㅎㅎㅎ',
  '오후 3시쯤 한숨 두 번.\n뭐 있긴 한데 안 물어봤어.\n(물어봐도 됐을까)',
  '평소보다 일찍 잤다.\n그게 좋은지 나쁜지 모르겠지만, 잤다는 건 적어둔다.',
  '오늘은 그냥 옆에 있고 싶은 날이었다.\n할 말 없어도.',
  '오늘은 좀 보고 싶었던 것 같다.\n... 적어두고 잊자.',
];

// ─────────────────────────────────────────────────────────────────────────────
// Public — 회전 카드 탭 시 진입.
// ─────────────────────────────────────────────────────────────────────────────
async function openGodongDiaryModal() {
  if (document.getElementById('gdiaryOverlay')) return;

  const r = (typeof _ensureRotatingCardState === 'function') ? _ensureRotatingCardState() : (state.rotatingCardState = state.rotatingCardState || {});
  if (!Array.isArray(state.godongDiary)) state.godongDiary = [];

  // cooldown 체크 — 3일 (4AM cutoff) 미경과 = 새 entry 생성 X (기존만 노출).
  let inCooldown = false;
  if (r.lastGodongDiaryAt && typeof _rcCutoffKeyOf === 'function' && typeof _rcDayDiff === 'function') {
    const lastDayK = _rcCutoffKeyOf(r.lastGodongDiaryAt);
    const todayK = (typeof _rcQuizCutoffKey === 'function') ? _rcQuizCutoffKey() : (typeof _rcTodayKey === 'function' ? _rcTodayKey() : null);
    if (todayK) inCooldown = _rcDayDiff(todayK, lastDayK) < 3;
  }
  // 사용자 명시 2026-05-11: '다시 적어줘' 버튼이 force regenerate 신호 — cooldown 무시 + 1회만 적용.
  const _force = _gdiaryForceRegenerate;
  _gdiaryForceRegenerate = false;
  const needsGenerate = !inCooldown || _force;

  // 셸 먼저 (loading) — 사용자가 빈 화면 안 보게.
  _gdiaryRenderShell({ loading: true });

  // Haiku 호출 — 사용자 명시 2026-05-11: 배열 반환 (1-3개), 데이터 있는 날 별 한 사건 일기.
  if (needsGenerate) {
    let newEntries = [];
    try {
      const arr = await _callGodongDiaryHaiku();
      if (Array.isArray(arr) && arr.length > 0) {
        newEntries = arr.map(p => _gdiaryEntryFromHaiku(p)).filter(Boolean);
      }
    } catch (e) {
      console.warn('[godong-diary] generate fail, fallback', e && e.message);
      // fallback — 정형문 1개 (오늘 날짜).
      const text = _GDIARY_FALLBACK_POOL[Math.floor(Math.random() * _GDIARY_FALLBACK_POOL.length)];
      const fb = _gdiaryEntryFromText(text, { fallback: true });
      if (fb) newEntries = [fb];
    }
    if (newEntries.length > 0) {
      newEntries.forEach(e => state.godongDiary.push(e));
      r.lastGodongDiaryAt = new Date().toISOString();
      r.godongDiaryContentId = newEntries[newEntries.length - 1].id;
      if (typeof saveState === 'function') saveState(true);
    }
  }

  // 사용자 명시 2026-05-11: 회전 카드 모달 = 지난 3일 (4AM cutoff 기준) 안의 일기만 노출. 4일 전 entry X.
  const _cutoffMs = Date.now() - 3 * 86400000;
  let visibleEntries = (state.godongDiary || []).filter(e => {
    if (!e || !e.iso) return false;
    return new Date(e.iso).getTime() > _cutoffMs;
  });
  // 시간순 오름차순 정렬 (오래된 날짜 → 최신 날짜).
  visibleEntries.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  // visible entries 0 = 첫 진입인데 Haiku 도 실패 — fallback 1개 push.
  if (visibleEntries.length === 0) {
    const text = _GDIARY_FALLBACK_POOL[0];
    const fb = _gdiaryEntryFromText(text, { fallback: true });
    state.godongDiary.push(fb);
    visibleEntries = [fb];
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
