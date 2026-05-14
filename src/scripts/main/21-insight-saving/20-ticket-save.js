// V4 (사용자 명시 2026-05-14 ultrathink): 진주 '티켓' 카테고리 저장 flow.
//   sub-type 선택 (영화/야구/콘서트/뮤지컬/전시/여행 — 사용자 customizable) → form 모달 → push state.pearls.
//   opts.content (chat 진주 chip 진입 시 한 줄 prefill), opts.sourceMsgIdx (chat msg link), opts.source='tab' (도서관 진주 탭 + 버튼 직접 진입).
//   외부 검색 X (v1 free-text). v2 영화 TMDB / 책 OpenLibrary 신호 보고.

const _TICKET_DEFAULT_SUB_TYPES = [
  { id: 'movie',      label: '영화',   emoji: '🎬', enabled: true },
  { id: 'baseball',   label: '야구',   emoji: '⚾', enabled: true },
  { id: 'concert',    label: '콘서트', emoji: '🎤', enabled: true },
  { id: 'musical',    label: '뮤지컬', emoji: '🎭', enabled: true },
  { id: 'exhibition', label: '전시',   emoji: '🎨', enabled: true },
  { id: 'travel',     label: '여행',   emoji: '✈️', enabled: true }
];

function _getTicketSubTypes() {
  const arr = state.preferences?.ticketSubTypes;
  if (!Array.isArray(arr) || arr.length === 0) return _TICKET_DEFAULT_SUB_TYPES.slice();
  return arr;
}

function _findTicketSubType(id) {
  return _getTicketSubTypes().find(s => s.id === id);
}

// sub-type 별 form placeholder. 공통 form 1개 + placeholder 만 다르게.
function _ticketFormPlaceholders(subTypeId) {
  const map = {
    movie:      { title: '예: 그랜드 부다페스트 호텔',    venue: '예: CGV 용산',         memo: '예: 감독 / 출연 / 같이 본 사람' },
    baseball:   { title: '예: 두산 vs LG',              venue: '예: 잠실구장',          memo: '예: 결과 5:3, 같이 간 사람' },
    concert:    { title: '예: 아이유 콘서트',            venue: '예: 올림픽홀',          memo: '예: 같이 간 사람, 굿즈 산 거' },
    musical:    { title: '예: 레미제라블',              venue: '예: 블루스퀘어',        memo: '예: 같이 간 사람, 캐스팅' },
    exhibition: { title: '예: 모네 빛의 향연',          venue: '예: 예술의전당',        memo: '예: 같이 간 사람, 인상 깊었던 작품' },
    travel:     { title: '예: 도쿄 3박 4일',            venue: '예: 신주쿠',            memo: '예: 같이 간 사람, 좋았던 기억' }
  };
  return map[subTypeId] || { title: '제목', venue: '장소', memo: '한 줄로' };
}

async function _showTicketSubTypePicker() {
  const enabled = _getTicketSubTypes().filter(s => s.enabled);
  if (enabled.length === 0) {
    showToast('티켓 종류가 비어 있어 — 설정에서 추가해줘');
    return null;
  }
  const options = enabled.map(s => ({ label: `${s.emoji} ${s.label}`, value: s.id }));
  const pick = await showOptionsModal({
    title: '어떤 티켓이야? 🎫',
    message: '종류 골라.',
    options
  });
  return pick || null;
}

async function saveTicketPearl(opts) {
  opts = opts || {};
  // V4 (사용자 명시 2026-05-14): sub-filter prefill — '영화' chip 활성 + 버튼 → sub-type picker 도 skip.
  let subTypeId;
  if (opts.prefillSubTypeId && _findTicketSubType(opts.prefillSubTypeId)) {
    subTypeId = opts.prefillSubTypeId;
  } else {
    subTypeId = await _showTicketSubTypePicker();
  }
  if (!subTypeId) return null;
  const sub = _findTicketSubType(subTypeId);
  const ph = _ticketFormPlaceholders(subTypeId);

  // 제목 (필수)
  const title = await showInputModal({
    title: `${sub.emoji} ${sub.label} — 제목`,
    message: '뭘 봤어? 한 줄로.',
    placeholder: ph.title,
    defaultValue: (opts.content || '').slice(0, 80),
    okLabel: '다음 →'
  });
  if (!title || !title.trim()) return null;

  // 본 날짜 (필수 — 캘린더 dot 기준)
  const today = todayKey();
  const eventDate = await showInputModal({
    title: `📅 언제 ${sub.label} 했어?`,
    message: 'YYYY-MM-DD 형식 (오늘 = 그대로 OK).',
    placeholder: today,
    defaultValue: today,
    okLabel: '다음 →'
  });
  if (eventDate === null) return null;
  let _eventDate = (eventDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(_eventDate)) _eventDate = today;

  // 장소 (선택)
  const venue = await showInputModal({
    title: `📍 장소 (선택)`,
    message: `어디였어? 비우고 OK 가능.`,
    placeholder: ph.venue,
    okLabel: '다음 →'
  });
  if (venue === null) return null;

  // 같이 (선택) + 한 줄 메모
  const memo = await showInputModal({
    title: `${sub.emoji} 한 줄로 (선택)`,
    message: '같이 간 사람 / 평점 / 짧은 감상. 비우고 OK 가능.',
    placeholder: ph.memo,
    okLabel: '다음 →'
  });
  if (memo === null) return null;

  // 사진 첨부 (선택)
  let photo = null;
  const wantPhoto = await showConfirmModal({
    title: '📷 사진도 같이?',
    message: '티켓 / 포스터 / 현장 사진 보탤래?',
    okLabel: '응 사진 추가',
    cancelLabel: '아니 글만'
  });
  if (wantPhoto) {
    try {
      const file = await pickPhotoFile();
      if (file) {
        showFullscreenLoader('사진 처리 중... 📸');
        photo = await fileToResizedDataUrl(file, 1024);
        hideFullscreenLoader();
      }
    } catch (e) {
      hideFullscreenLoader();
      console.warn('[ticket photo]', e);
      showToast('사진 처리 실패 — 글만 저장');
    }
  }

  const finalTitle = title.trim().slice(0, 80);
  const finalMemo = (memo || '').trim();
  const pearl = {
    id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    category: '티켓',
    subType: subTypeId,
    content: finalTitle,
    eventDate: _eventDate,
    createdAt: new Date().toISOString(),
    type: 'pearl'
  };
  if ((venue || '').trim()) pearl.venue = venue.trim().slice(0, 80);
  if (finalMemo) pearl.note = finalMemo.slice(0, 300);
  if (photo) pearl.photo = photo;
  if (typeof opts.sourceMsgIdx === 'number') pearl.sourceMsgIdx = opts.sourceMsgIdx;

  state.pearls = state.pearls || [];
  state.pearls.push(pearl);
  saveState();
  if (typeof renderLensPearls === 'function') renderLensPearls();
  if (typeof renderLensCalendarGrid === 'function') renderLensCalendarGrid();
  if (typeof renderLibraryHero === 'function') renderLibraryHero();
  showToast(`${sub.emoji} ${sub.label} 저장됨`);
  return pearl;
}
