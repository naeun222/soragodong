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
  // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — pearlBgPhotoStyle 이 옛 dataURL / 신 storageKey 자동 분기.
  const coverAttr = pearlBgPhotoStyle(pearl);
  const hasCover = pearlHasMedia(pearl, 'photo');
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
      <button class="brf-more-btn" onclick="_bookViewMore('${pearl.id}')" aria-label="더보기">⋮</button>
    </div>
    <div class="brf-cover" ${coverAttr}>${hasCover ? '' : '<div class="brf-cover-placeholder">📚</div>'}</div>
    <div class="brf-title">${escapeHtml(title)}</div>
    ${author ? `<div class="brf-author">${escapeHtml(author)}</div>` : ''}
    ${finishedAt ? `<div class="brf-finished">${escapeHtml(finishedAt)} 완독</div>` : ''}
    ${oneLiner ? `<div class="brf-oneliner">"${escapeHtml(oneLiner)}"</div>` : ''}
    <div class="brf-body">${bodyHtml}</div>
  `;
  document.body.appendChild(overlay);
  // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1D — 신 path 표지 (storageKey.photo) 가 있으면 hydrate.
  if (typeof hydratePearlMedia === 'function') hydratePearlMedia(overlay);
  if (editMode) {
    const ta = document.getElementById('brfReviewTextarea');
    if (ta) {
      ta.value = pearl.review || '';
      setTimeout(() => ta.focus(), 30);
    }
  }
}

// V4 (사용자 명시 2026-05-14): 책 진주 ⋮ 더보기 — 다른 진주 패턴 일관 (수정/표지/날짜/삭제).
async function _bookViewMore(pearlId) {
  const pearl = state.pearls.find(p => p.id === pearlId);
  if (!pearl) return;
  const action = await showOptionsModal({
    title: `📚 ${pearl.bookTitle || pearl.content || '책'}`,
    message: '뭐 바꿀까?',
    options: [
      { label: '✏️ 책 정보 수정 (제목·저자·한 줄)', value: 'edit_info' },
      { label: '📷 표지 바꾸기', value: 'change_cover' },
      { label: '📅 완독 날짜 수정',          value: 'edit_date' },
      { label: '🗑 삭제',                  value: 'delete' }
    ]
  });
  if (!action) return;

  if (action === 'edit_info') {
    const newTitle = await showInputModal({
      title: '📚 책 제목 수정',
      defaultValue: pearl.bookTitle || '',
      placeholder: '예: 데미안',
      okLabel: '다음 →'
    });
    if (newTitle === null) return;
    if (newTitle.trim()) pearl.bookTitle = newTitle.trim().slice(0, 100);
    const newAuthor = await showInputModal({
      title: '✍️ 저자 수정 (선택)',
      defaultValue: pearl.bookAuthor || '',
      placeholder: '비우면 저자 X',
      okLabel: '다음 →'
    });
    if (newAuthor !== null) {
      pearl.bookAuthor = newAuthor.trim().slice(0, 60) || null;
    }
    const newOneLine = await showInputModal({
      title: '📚 한 줄 감상평 수정',
      defaultValue: pearl.content || '',
      placeholder: '예: 새는 알을 깨고 나온다 ...',
      multiline: true,
      maxLength: 300,
      okLabel: '저장'
    });
    if (newOneLine !== null && newOneLine.trim()) pearl.content = newOneLine.trim().slice(0, 300);
    saveState();
    _renderBookReviewFullscreen(pearl, false);
    if (typeof renderLensPearls === 'function') renderLensPearls();
    showToast('수정됨 ✦');
    return;
  }

  if (action === 'change_cover') {
    try {
      const file = await pickPhotoFile();
      if (file) {
        showFullscreenLoader('표지 처리 중... 📸');
        const newPhoto = await fileToResizedDataUrl(file, 1024);
        hideFullscreenLoader();
        pearl.photo = newPhoto;
        saveState();
        _renderBookReviewFullscreen(pearl, false);
        if (typeof renderLensPearls === 'function') renderLensPearls();
        if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
        showToast('표지 바뀜 📷');
      }
    } catch (e) {
      hideFullscreenLoader();
      console.warn('[book cover change]', e);
      showToast('표지 처리 실패');
    }
    return;
  }

  if (action === 'edit_date') {
    const today = todayKey();
    const current = pearl.finishedAt || pearl.eventDate || today;
    const newDate = await showInputModal({
      title: '📅 완독 날짜 수정',
      message: 'YYYY-MM-DD 형식.',
      defaultValue: current,
      placeholder: today,
      okLabel: '저장'
    });
    if (newDate === null) return;
    const trimmed = (newDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      showToast('날짜 형식 — YYYY-MM-DD');
      return;
    }
    pearl.eventDate = trimmed;
    pearl.finishedAt = trimmed;
    saveState();
    _renderBookReviewFullscreen(pearl, false);
    if (typeof renderLensPearls === 'function') renderLensPearls();
    if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
    showToast('날짜 바뀜 📅');
    return;
  }

  if (action === 'delete') {
    await _deleteBookPearl(pearlId);
    return;
  }
}

// V4 (사용자 명시 2026-05-14): 책 진주 삭제 — _bookViewMore 의 'delete' 분기로 위임 (직접 호출도 호환).
async function _deleteBookPearl(pearlId) {
  const idx = (state.pearls || []).findIndex(p => p.id === pearlId);
  if (idx < 0) return;
  const pearl = state.pearls[idx];
  const title = pearl.bookTitle || pearl.content || '책';
  const ok = await showConfirmModal({
    title: '📚 이 책 진주 삭제할래?',
    message: `"${title}"\n\n독후감까지 같이 사라져 — 되돌릴 수 X.`,
    okLabel: '삭제',
    cancelLabel: '취소',
    danger: true
  });
  if (!ok) return;
  state.pearls.splice(idx, 1);
  saveState();
  closeBookReviewFullscreen();
  if (typeof renderLensPearls === 'function') renderLensPearls();
  if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
  // V4 fix (사용자 보고 2026-05-17): renderLibraryHero → renderRotatingCard.
  if (typeof renderRotatingCard === 'function') renderRotatingCard();
  showToast('책 진주 삭제됨');
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
