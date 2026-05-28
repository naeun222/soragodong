// 사용자 명시 2026-05-10 (큐 새 — batch 11): 5 카드 (어제 기록 / 주간 / 월간 / 계절 / 연간 리뷰) 모두 회전 카드 source 로 흡수.
//   새 소식일 때만 available (맨 앞). 확인하면 사라짐 (next session 재계산 시 unavailable).
//   옛 별도 카드 path (renderYesterdayCard / renderReviewPrompts) 는 container null 자연 no-op (이미 폐기 흐름).

// =============================================================================
// Source 7: 어제 기록 — 새 소식 (어제 entry 있고 미확인)
// =============================================================================
function _rcSource7Yesterday() {
  if (typeof _calendarYesterdayKey !== 'function') return { id: 'yesterday', available: false };
  const yesterdayK = _calendarYesterdayKey();
  if (!yesterdayK) return { id: 'yesterday', available: false };
  // 이미 확인 = unavailable
  if (state.preferences && state.preferences._yesterdayCardSeen === yesterdayK) {
    return { id: 'yesterday', available: false };
  }
  // 4AM batch 처리 중 = hide (옛 yesterdayCard 가드 동일)
  if (state.pendingBatch && state.pendingBatch.batch_id) {
    return { id: 'yesterday', available: false };
  }
  // 어제 entry 또는 chatArchive 있어야 노출 (chat-only 도 인정)
  const yesterdayEntry = (state.entries || []).find(e => e.date === yesterdayK);
  // V4 (사용자 명시 2026-05-13): batch 결과 도착 후만 노출 — archive 의 _pendingExtract=true 거나 entry 의 aiSummary X 면 hide.
  //   batch submit 미진행 케이스 (pendingBatch null but 결과 X) 보호.
  const _yesterdayArchives = (state.chatArchive || []).filter(a =>
    a && !a._deleted && a.date === yesterdayK && Array.isArray(a.messages) && a.messages.length >= 3
  );
  const _anyArchivePending = _yesterdayArchives.some(a => a._pendingExtract);
  const _hasArchiveYesterdayDone = _yesterdayArchives.length > 0 && !_anyArchivePending;
  const _hasAiSummaryYesterday = !!(yesterdayEntry && yesterdayEntry.aiSummary);
  if (!_hasAiSummaryYesterday && !_hasArchiveYesterdayDone) {
    return { id: 'yesterday', available: false };
  }
  // 옛 _hasYesterdayContent 가드 (mood/diary/vitality 등) — entry 있을 때만 추가 검사. archive-only 사용자도 OK.
  if (typeof _hasYesterdayContent === 'function' && !_hasYesterdayContent(yesterdayEntry) && !_hasArchiveYesterdayDone) {
    return { id: 'yesterday', available: false };
  }
  return {
    id: 'yesterday',
    available: true,
    contentHash: 'yesterday_' + yesterdayK,
    bodyHtml: `
      <div class="rc-body-news rc-body-news-yesterday">
        <div class="rc-body-headline">🌙 어제의 기록</div>
        <div class="rc-body-copy">어제 적어둔 거 다시 보기</div>
        <div class="rc-body-mini-cta">탭 → 어제 보기 ✦</div>
      </div>
    `,
    onTapClick: `openYesterdayPage('${yesterdayK}')`,
  };
}

// =============================================================================
// Source 8-11: weekly / monthly / quarterly / annual review — fresh 도착 시 노출
// =============================================================================
function _rcFindFreshReview(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.find(r => r && r.auto && !r.user_viewed) || null;
}

function _rcReviewBodyHtml(emoji, label, summaryLine) {
  return `
    <div class="rc-body-news rc-body-news-review">
      <div class="rc-body-headline">${emoji} ${label} 새로 도착</div>
      <div class="rc-body-copy">${summaryLine}</div>
      <div class="rc-body-mini-cta">탭 → 같이 보자 ✦</div>
    </div>
  `;
}

function _rcSource8WeeklyReview() {
  const fresh = _rcFindFreshReview(state.weeklyReviews);
  if (!fresh) return { id: 'review_weekly', available: false };
  // 사용자 명시 2026-05-10 (큐 7+8): weekly = inline 펼침 redesign — 회전 카드 click 시 도서관 weekly 리뷰 모음 + 그 카드 자동 펼침.
  const _summary = fresh.one_word_weekly || fresh.flow || fresh.summary || '같이 보자';
  return {
    id: 'review_weekly',
    available: true,
    contentHash: 'review_weekly_' + (fresh.id || fresh.weekKey || ''),
    bodyHtml: _rcReviewBodyHtml('🌙', '주간 리뷰', escapeHtml(_summary).slice(0, 80)),
    onTapClick: `_rcOpenFreshReview('weekly', '${escapeHtml(fresh.id || '')}', '${escapeHtml(fresh.weekKey || '')}', '${fresh.completedAt || ''}')`,
  };
}

function _rcSource9MonthlyReview() {
  const fresh = _rcFindFreshReview(state.monthlyReviews);
  if (!fresh) return { id: 'review_monthly', available: false };
  const _summary = fresh.one_word || fresh.summary || (fresh.pattern && fresh.pattern.headline) || '같이 보자';
  return {
    id: 'review_monthly',
    available: true,
    contentHash: 'review_monthly_' + (fresh.id || fresh.monthKey || ''),
    bodyHtml: _rcReviewBodyHtml('📅', '월간 리뷰', escapeHtml(_summary).slice(0, 80)),
    onTapClick: `_rcOpenFreshReview('monthly', '${escapeHtml(fresh.id || '')}', '${escapeHtml(fresh.monthKey || '')}', '${fresh.completedAt || ''}')`,
  };
}

function _rcSource10QuarterlyReview() {
  const fresh = _rcFindFreshReview(state.quarterlyReviews);
  if (!fresh) return { id: 'review_quarterly', available: false };
  const _summary = fresh.one_word || fresh.summary || (fresh.pattern && fresh.pattern.headline) || '같이 보자';
  return {
    id: 'review_quarterly',
    available: true,
    contentHash: 'review_quarterly_' + (fresh.id || fresh.quarterKey || ''),
    bodyHtml: _rcReviewBodyHtml('🌊', '계절 리뷰', escapeHtml(_summary).slice(0, 80)),
    onTapClick: `_rcOpenFreshReview('quarterly', '${escapeHtml(fresh.id || '')}', '${escapeHtml(fresh.quarterKey || '')}', '${fresh.completedAt || ''}')`,
  };
}

function _rcSource11AnnualReview() {
  const fresh = _rcFindFreshReview(state.annualReviews);
  if (!fresh) return { id: 'review_annual', available: false };
  const _summary = fresh.one_word || fresh.summary || '올해 너의 이야기';
  return {
    id: 'review_annual',
    available: true,
    contentHash: 'review_annual_' + (fresh.id || fresh.year || ''),
    bodyHtml: _rcReviewBodyHtml('🌟', '연간 리뷰', escapeHtml(_summary).slice(0, 80)),
    onTapClick: `_rcOpenFreshReview('annual', '${escapeHtml(fresh.id || '')}', '${fresh.year || 'null'}', '${fresh.completedAt || ''}')`,
  };
}

// 사용자 명시 2026-05-10 (큐 새): fresh review click 통합 핸들러 — user_viewed 마킹 + 적절한 화면 이동.
function _rcOpenFreshReview(type, reviewId, key, completedAt) {
  // user_viewed 마킹 (확인 시 사라짐)
  const arrKey = type === 'weekly' ? 'weeklyReviews'
    : type === 'monthly' ? 'monthlyReviews'
    : type === 'quarterly' ? 'quarterlyReviews'
    : 'annualReviews';
  const arr = state[arrKey] || [];
  const target = arr.find(r => r && r.id === reviewId);
  if (target) {
    target.user_viewed = true;
    if (typeof saveState === 'function') saveState();
  }
  // 화면 이동 — type 별 분기
  if (type === 'weekly') {
    // V4 (사용자 명시 2026-05-29): 홈 회전 카드 weekly click = Story 풀스크린 직진.
    //   옛: 모음 + inline 펼침 trigger (2026-05-10 fix) → 폐기.
    //   진입 경로별 위계: 홈 = Story 몰입, 모음 = inline classic.
    if (target && typeof renderReviewScreen === 'function') {
      renderReviewScreen('weekly', target, { readonly: true, story: true });
      if (typeof showScreen === 'function') showScreen('review');
    } else if (typeof showArchiveReviews === 'function') {
      showArchiveReviews();  // fallback (target 못 찾음)
    } else if (typeof showScreen === 'function') {
      showScreen('archive-reviews');
    }
  } else if (type === 'annual') {
    if (typeof openAnnualReview === 'function') {
      const _yr = key && key !== 'null' ? parseInt(key, 10) : (target && target.year);
      openAnnualReview(_yr);
    }
  } else {
    // monthly / quarterly = 옛 화면 전환
    if (typeof openSavedReview === 'function') {
      openSavedReview(type, key, completedAt);
    }
  }
}
