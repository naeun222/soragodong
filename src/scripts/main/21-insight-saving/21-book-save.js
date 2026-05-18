// V4 (사용자 명시 2026-05-14 ultrathink): 진주 '책' 카테고리 저장 flow.
//   책 form 모달 (제목·저자·한 줄 감상평·표지·완독 날짜·별점) → push state.pearls.
//   content 필드 = 한 줄 감상평 (그리드/타임라인 표시), review 필드 = 풀 독후감 (후일 풀스크린 작성).

async function saveBookPearl(opts) {
  opts = opts || {};

  // 책 제목 (필수)
  const bookTitle = await showInputModal({
    title: '📚 어떤 책?',
    message: '책 제목 — 한 줄로.',
    placeholder: '예: 데미안',
    okLabel: '다음 →'
  });
  if (!bookTitle || !bookTitle.trim()) return null;

  // 저자 (선택)
  const bookAuthor = await showInputModal({
    title: '✍️ 저자 (선택)',
    message: '비우고 OK 가능.',
    placeholder: '예: 헤르만 헤세',
    okLabel: '다음 →'
  });
  if (bookAuthor === null) return null;

  // 한 줄 감상평 (필수 — content 필드, 그리드/타임라인 표시용)
  const oneLine = await showInputModal({
    title: `📚 ${bookTitle.trim()} — 한 줄 감상평`,
    message: '한 줄로 — 이 책이 너에게 뭐였는지.',
    defaultValue: (opts.content || '').slice(0, 120),
    placeholder: '예: 새는 알을 깨고 나온다 — 결국 나의 ㅁㅁ을 깬다는 것',
    okLabel: '다음 →'
  });
  if (!oneLine || !oneLine.trim()) return null;

  // 완독 날짜 (필수 — 캘린더 dot 기준)
  const today = todayKey();
  const finishedAt = await showInputModal({
    title: '📅 완독 (또는 읽은) 날짜',
    message: 'YYYY-MM-DD 형식 (오늘 = 그대로 OK).',
    placeholder: today,
    defaultValue: today,
    okLabel: '다음 →'
  });
  if (finishedAt === null) return null;
  let _finishedAt = (finishedAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(_finishedAt)) _finishedAt = today;

  // 책 표지 사진 (선택)
  let photo = null;
  const wantCover = await showConfirmModal({
    title: '📷 책 표지도 같이?',
    message: '표지 사진 (책장 그림이 돼).',
    okLabel: '응 표지 추가',
    cancelLabel: '아니 글만'
  });
  if (wantCover) {
    try {
      const file = await pickPhotoFile();
      if (file) {
        showFullscreenLoader('표지 처리 중... 📸');
        photo = await fileToResizedDataUrl(file, 1024);
        hideFullscreenLoader();
      }
    } catch (e) {
      hideFullscreenLoader();
      console.warn('[book cover]', e);
      showToast('표지 처리 실패 — 글만 저장');
    }
  }

  const pearl = {
    id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    category: '책',
    bookTitle: bookTitle.trim().slice(0, 100),
    content: oneLine.trim().slice(0, 300),
    eventDate: _finishedAt,
    finishedAt: _finishedAt,
    createdAt: new Date().toISOString(),
    type: 'pearl'
  };
  if ((bookAuthor || '').trim()) pearl.bookAuthor = bookAuthor.trim().slice(0, 60);
  if (typeof opts.sourceMsgIdx === 'number') pearl.sourceMsgIdx = opts.sourceMsgIdx;
  // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1C — 표지 Storage 직접 업로드. 실패 시 진주 안 만듦.
  if (photo) {
    try {
      if (typeof showFullscreenLoader === 'function') showFullscreenLoader('표지 업로드 중... 📚');
      await _attachPearlPhoto(pearl, photo);
      if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    } catch (e) {
      if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
      console.warn('[saveBookPearl] photo attach fail:', e);
      showToast('표지 업로드 실패 — 다시 시도');
      return null;
    }
  }

  state.pearls = state.pearls || [];
  state.pearls.push(pearl);
  saveState();
  if (typeof renderLensPearls === 'function') renderLensPearls();
  if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
  // V4 fix (사용자 보고 2026-05-17): renderLibraryHero → renderRotatingCard (oneul source 가 '오늘의 너' 책임).
  if (typeof renderRotatingCard === 'function') renderRotatingCard();
  showToast('📚 책 저장됨 — 카드 누르면 독후감 쓸 수 있어');
  return pearl;
}
