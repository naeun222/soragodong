// V4 (사용자 명시 2026-05-14 ultrathink): 책 진주 클릭 → 풀스크린 독후감 화면.
//   view mode (표지 + 제목 + 저자 + 한 줄 + 풀 독후감) + 편집 모드 (textarea).
//   pearl.content = 한 줄 감상평, pearl.review = 풀 독후감 본문.

function openBookReviewFullscreen(pearlId) {
  const pearl = state.pearls.find(p => p.id === pearlId);
  if (!pearl) return;
  if (document.getElementById('bookReviewFullscreen')) return;
  _renderBookReviewFullscreen(pearl, false);
}

function closeBookReviewFullscreen() {
  const el = document.getElementById('bookReviewFullscreen');
  if (el) el.remove();
}

function _renderBookReviewFullscreen(pearl, editMode) {
  closeBookReviewFullscreen();
  const overlay = document.createElement('div');
  overlay.id = 'bookReviewFullscreen';
  overlay.className = 'book-review-fullscreen';
  const title = pearl.bookTitle || pearl.content || '책';
  const author = pearl.bookAuthor || '';
  const oneLiner = pearl.content || '';
  const review = pearl.review || '';
  const coverStyle = pearl.photo ? `style="background-image:url('${pearl.photo}');"` : '';
  const finishedAt = pearl.finishedAt || pearl.eventDate
    ? new Date((pearl.finishedAt || pearl.eventDate) + 'T12:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  let bodyHtml;
  if (editMode) {
    bodyHtml = `
      <textarea id="brfReviewTextarea" class="brf-textarea" placeholder="천천히 적어봐 — 이 책이 너에게 뭐였는지, 어떤 장면이 남았는지, 다 읽고 어땠는지."></textarea>
      <div class="brf-actions">
        <button class="brf-btn-cancel" onclick="_renderBookReviewFullscreen(state.pearls.find(p=>p.id==='${pearl.id}'), false)">취소</button>
        <button class="brf-btn-save" onclick="_saveBookReview('${pearl.id}')">저장</button>
      </div>
    `;
  } else {
    const reviewHtml = review
      ? `<div class="brf-review">${escapeHtml(review)}</div>`
      : `<div class="brf-review-empty">독후감 비어 있어 — ✏️ 눌러서 천천히 적어볼래?</div>`;
    bodyHtml = `
      ${reviewHtml}
      <button class="brf-edit-btn" onclick="_renderBookReviewFullscreen(state.pearls.find(p=>p.id==='${pearl.id}'), true)">✏️ 독후감 ${review ? '편집' : '쓰기'}</button>
    `;
  }

  overlay.innerHTML = `
    <div class="brf-back">
      <button class="brf-back-btn" onclick="closeBookReviewFullscreen()">←</button>
    </div>
    <div class="brf-cover" ${coverStyle}>${pearl.photo ? '' : '<div class="brf-cover-placeholder">📚</div>'}</div>
    <div class="brf-title">${escapeHtml(title)}</div>
    ${author ? `<div class="brf-author">${escapeHtml(author)}</div>` : ''}
    ${finishedAt ? `<div class="brf-finished">${escapeHtml(finishedAt)} 완독</div>` : ''}
    ${oneLiner ? `<div class="brf-oneliner">"${escapeHtml(oneLiner)}"</div>` : ''}
    <div class="brf-body">${bodyHtml}</div>
  `;
  document.body.appendChild(overlay);
  if (editMode) {
    const ta = document.getElementById('brfReviewTextarea');
    if (ta) {
      ta.value = pearl.review || '';
      setTimeout(() => ta.focus(), 30);
    }
  }
}

function _saveBookReview(pearlId) {
  const pearl = state.pearls.find(p => p.id === pearlId);
  if (!pearl) return;
  const ta = document.getElementById('brfReviewTextarea');
  if (!ta) return;
  const val = (ta.value || '').trim();
  pearl.review = val.slice(0, 10000);
  saveState();
  _renderBookReviewFullscreen(pearl, false);
  showToast('독후감 저장됨 📚');
  if (typeof renderLensPearls === 'function') renderLensPearls();
}
