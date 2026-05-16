// V4 (사용자 명시 2026-05-17 ultrathink): 카드 (a) 리뷰 미리보기.
//   가장 최근 weekly/monthly/quarterly review 1개 picker. 한 줄 캡션.
//   클릭 → 도서관 마법·리뷰 chip 진입.
//   review 없으면 null return (카드 숨김).

function _reviewPreviewPickLatest() {
  // monthly / quarterly / weekly 중 가장 최근 1개 (completedAt 기준)
  const all = [];
  (state.weeklyReviews    || []).forEach(r => r && r.completedAt && all.push({ ...r, _kind: 'weekly',    _ts: new Date(r.completedAt).getTime() }));
  (state.monthlyReviews   || []).forEach(r => r && r.completedAt && all.push({ ...r, _kind: 'monthly',   _ts: new Date(r.completedAt).getTime() }));
  (state.quarterlyReviews || []).forEach(r => r && r.completedAt && all.push({ ...r, _kind: 'quarterly', _ts: new Date(r.completedAt).getTime() }));
  if (all.length === 0) return null;
  all.sort((a, b) => b._ts - a._ts);
  return all[0];
}

function renderReviewPreview() {
  const container = document.getElementById('homeReviewPreviewContainer');
  if (!container) return;

  // testerMode 면 시드 리뷰만 잡힘 — 그래도 표시 OK (디버그 가치)
  // cold start (≤7일) 면 리뷰 substrate 부재 → 숨김
  if (typeof _isColdStart === 'function' && _isColdStart()) {
    container.innerHTML = '';
    return;
  }

  const r = _reviewPreviewPickLatest();
  if (!r) {
    container.innerHTML = '';
    return;
  }

  const labelMap = {
    weekly:    '🌙 이번 주 너',
    monthly:   '🌙 지난 달 너',
    quarterly: '🌙 지난 분기 너'
  };
  const label = labelMap[r._kind] || '🌙 최근 리뷰';

  // summary 50자 fallback — sections.flow / pattern 사용
  let caption = (r.summary || '').trim();
  if (!caption && r.sections && typeof r.sections === 'object') {
    caption = (r.sections.flow || r.sections.pattern || r.sections.good_moments || '').trim();
  }
  if (!caption) caption = '리뷰 보러 가기';
  caption = caption.slice(0, 60);

  const kindAttr = r._kind;
  container.innerHTML = `
    <div class="home-review-preview" onclick="_openReviewPreviewLink('${kindAttr}')">
      <div class="hrp-label">${label}</div>
      <div class="hrp-caption">${escapeHtml(caption)}</div>
    </div>
  `;
}

function _openReviewPreviewLink(kind) {
  // 도서관 → 마법·리뷰 chip 진입.
  if (typeof showScreen === 'function') showScreen('archive');
  setTimeout(() => {
    if (typeof switchLibraryCat === 'function') switchLibraryCat('galpi');
  }, 100);
}
