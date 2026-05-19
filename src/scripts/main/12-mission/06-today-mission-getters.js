function getTodayMissions() {
  const today = todayKey();
  const pending = (state.missions || []).filter(m => {
    if (m.status !== 'pending' || !m.scheduledFor) return false;
    if (m._cardHidden) return false;  // V4 (2026-05-20 ultrathink): 카드 치우기 = 순수 시각 hide.
    const diff = daysBetweenKeys(m.scheduledFor, today);
    return diff >= 0 && diff <= 2;
  });
  if (pending.length > 0) {
    pending.sort((a, b) => daysBetweenKeys(a.scheduledFor, today) - daysBetweenKeys(b.scheduledFor, today));
    return pending;
  }
  // 사용자 명시 2026-05-09 (#6): 완료 후 swipe-dismiss → 홈 카드에서 안 보이게.
  // V4 (사용자 명시 2026-05-20 ultrathink): 'dismissed' status 박는 옛 구현 폐기 → _cardHidden 플래그로 분리.
  //   underlying status (completed) 는 그대로 보존되어 결과 체크 / 진주 / 분석 흐름은 계속 진행.
  //   legacy status==='dismissed' 데이터는 그대로 제외 (호환).
  const lastCompleted = (state.missions || []).filter(m =>
    m.completedDate === today && m.status !== 'dismissed' && !m._cardHidden
  ).slice(-1);
  return lastCompleted;
}

// 하위호환 (다른 곳에서 단일 미션 참조용)
function getTodayMission() {
  return getTodayMissions()[0];
}

function hasActivePendingMission() {
  const key = todayKey();
  return (state.missions || []).some(m => m.scheduledFor === key && m.status === 'pending');
}

// 사용자 명시 2026-04-30 ultrathink: 어제 체크인 있을 때 홈 카드 1회 표시. 클릭 → 도서관 캘린더 어제 modal.
// 사용자 보고 2026-05-01: 옛 = getDayKey(now-24h) — 4AM cutoff 적용해서 새벽 시간대 / 캘린더 mental 사용자에게 '그저께' 반환 버그.
// fix = 캘린더 어제 (now 의 calendar 날짜 - 1일). entry.date 는 todayKey() 로 저장되지만 normal 사용자 entries 는 캘린더 어제와 일치.
function _calendarYesterdayKey() {
  // 사용자 명시 2026-05-11: 4AM cutoff 일관. todayKey() 의 전날 = getDayKey(now - 24h).
  // 옛 자정 기준 (getDate() - 1) 은 03~04시 사이 사용자 '오늘' entry 를 어제로 잘못 분류.
  const nowMs = (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now());
  if (typeof getDayKey === 'function') return getDayKey(nowMs - 86400000);
  // fallback (getDayKey 미로드 — dead path)
  const d = new Date(nowMs - 86400000 - 4 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// 사용자 명시 2026-05-02: 어제 entry 가 있어도 hollow (체크인/일기/관찰 모두 비었으면) 카드 X.
// "새로운 데이터" = 의미 있는 field 한 개 이상. 이전엔 entry 자체 존재만으로 카드 표시 → 빈 record 도 카드 노출.
// 사용자 명시 2026-05-02 ultrathink (추가): aiSummary 도 검사 — diary batch path 의 hollow entry 에 summary 들어간 후 카드 표시 보장.
function _hasYesterdayContent(entry) {
  if (!entry) return false;
  return !!(
    (entry.diary && entry.diary.trim()) ||
    (entry.aiSummary && entry.aiSummary.trim()) ||
    (entry.note && entry.note.trim()) ||
    entry.vitality != null ||
    entry.mood != null ||
    entry.sleepStart ||
    entry.music ||
    entry.photo || (Array.isArray(entry.photos) && entry.photos.length > 0) ||
    (entry.dailyQuestionAnswer && entry.dailyQuestionAnswer.trim())
  );
}

function renderYesterdayCard() {
  const container = document.getElementById('yesterdayCardContainer');
  if (!container) return;
  const yesterdayK = _calendarYesterdayKey();
  const yesterdayEntry = (state.entries || []).find(e => e.date === yesterdayK);
  // 사용자 보고 2026-05-10: chat 만 한 날 (entry 없음) 도 어제 카드 노출 — chatArchive 에 어제 항목 있으면 인정.
  const _hasArchiveYesterday = (state.chatArchive || []).some(a =>
    a && !a._deleted && a.date === yesterdayK && Array.isArray(a.messages) && a.messages.length >= 3
  );
  if (!_hasYesterdayContent(yesterdayEntry) && !_hasArchiveYesterday) { container.innerHTML = ''; return; }
  // 사용자 명시 2026-05-02 ultrathink: batch API 도입 — 4AM batch 처리 중 (state.pendingBatch != null) 이면 카드 X.
  // 이유: 카드 click → openDayModal → chapter analysis 자리. batch 결과 미완 시 분석 빈 상태 → 의미 없음.
  // batch 끝 (또는 12h timeout fallback) 시 자동 노출. _resumePendingBatch 가 maybeRunDailyChapterExtract 안에서 처리.
  if (state.pendingBatch && state.pendingBatch.batch_id) { container.innerHTML = ''; return; }
  const seen = state.preferences && state.preferences._yesterdayCardSeen === yesterdayK;
  if (seen) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="yesterday-card" onclick="openYesterdayPage('${yesterdayK}')">
      <div class="yc-icon">🌙</div>
      <div class="yc-content">
        <div class="yc-title">어제의 기록 볼래?</div>
        <div class="yc-sub">어제 적어둔 거 다시 보기 →</div>
      </div>
    </div>
  `;
}

function openYesterdayPage(dateKey) {
  if (!state.preferences) state.preferences = {};
  state.preferences._yesterdayCardSeen = dateKey;
  if (typeof saveState === 'function') saveState();
  const container = document.getElementById('yesterdayCardContainer');
  if (container) container.innerHTML = '';
  if (typeof showScreen === 'function') showScreen('archive');
  setTimeout(() => {
    if (typeof openDayModal === 'function') openDayModal(dateKey);
  }, 350);
}

// 사용자 명시 2026-04-30 ultrathink: 개발자 도구 — 어제 카드 강제 표시 (어제 entry 없어도 표시).
function devForceYesterdayCard() {
  // seen flag reset
  if (state.preferences) delete state.preferences._yesterdayCardSeen;
  if (typeof saveState === 'function') saveState();
  // 홈으로 이동
  if (typeof showScreen === 'function') showScreen('home');
  setTimeout(() => {
    const container = document.getElementById('yesterdayCardContainer');
    if (!container) { showToast('홈 컨테이너 X'); return; }
    const yesterdayK = _calendarYesterdayKey();
    const realEntry = (state.entries || []).find(e => e.date === yesterdayK);
    // 어제 entry 있으면 정상 카드 / 없어도 강제 표시 (개발 테스트용 mock)
    const dateForClick = realEntry ? yesterdayK : yesterdayK;  // 어제 날짜 그대로 사용 — modal 자체는 entry 없으면 토스트
    const noteSuffix = realEntry ? '' : ' (개발: 어제 entry X — 클릭 시 토스트만)';
    container.innerHTML = `
      <div class="yesterday-card" onclick="openYesterdayPage('${dateForClick}')">
        <div class="yc-icon">🌙</div>
        <div class="yc-content">
          <div class="yc-title">어제의 기록 볼래?</div>
          <div class="yc-sub">어제 적어둔 거 다시 보기 →${noteSuffix}</div>
        </div>
      </div>
    `;
    showToast('🌙 어제 카드 강제 표시 — 홈에서 확인');
  }, 200);
}

