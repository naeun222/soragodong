// V4-1m: 진주 능동 제안 — 사용자 메시지에서 행복/소중함 신호 감지.
// V4 비전 7.7 (a)+(c) 결합: 강한 감정 신호 + 키워드 트리거. 같은 날 1회.
const PEARL_SIGNAL_REGEX = /진짜\s*(좋|행복|기뻐|감동|뭉클|짜릿)|너무\s*(좋|행복|기뻐|감동|뭉클)|행복(하|해|함|했|해서)|사랑(스|해|받|했)|소중(해|함|했|한)|뭉클|벅차|벅찼|황홀|짜릿|끝내(주|준|줘)|기적|감동(이|적|해|받|했)|마음이?\s*(따뜻|뭉클|벅차)|기쁘다|기쁨에|좋아\s*죽|반짝|살\s*것\s*같/;
function detectPearlSignal(text) {
  if (!text || text.length < 8) return false;
  return PEARL_SIGNAL_REGEX.test(text);
}

async function saveMsgAsPearl(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.pearlSaved) return;

  // 사용자 메시지 텍스트 prefill로 진주 입력 모달
  const prefilled = (msg.content || '').slice(0, 200);
  const content = await showInputModal({
    title: '🔮 진주에 보관',
    message: '이 기억을 한 줄로 다듬어 — 나중에 봐도 기분 좋아질 수 있게.',
    defaultValue: prefilled,
    multiline: true,
    maxLength: 300,
    okLabel: '보관'
  });
  if (!content || !content.trim()) return;

  // 카테고리 선택 (V3 진주 패턴)
  const categories = state.preferences?.pearlBasketCategories || ['음악', '음식', '장소', '순간', '사람'];
  const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥' };
  const options = categories.map(c => ({
    label: `${iconMap[c] || '💎'} ${c}`,
    value: c
  }));
  let category = await showOptionsModal({
    title: '어떤 진주? 💎',
    message: '카테고리 골라.',
    options
  });
  if (!category) return;
  category = category.trim();

  // V4-fix (사용자 요청): 사진 첨부 묻기 (음악 카테고리 제외 — 음악은 별도 흐름)
  let photo = null;
  if (category !== '음악') {
    const wantPhoto = await showConfirmModal({
      title: '📷 사진도 같이?',
      message: '이 진주에 사진 같이 보관할래?\n(원하면 갤러리에서 골라)',
      okLabel: '응 사진 추가',
      cancelLabel: '아니 텍스트만'
    });
    if (wantPhoto) {
      try {
        const file = await pickPhotoFile();
        if (file) photo = await fileToResizedDataUrl(file, 1024);
      } catch (e) { console.warn('진주 사진:', e); }
    }
  }

  const pearl = {
    id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    content: content.trim(),
    category,
    createdAt: new Date().toISOString(),
    type: 'pearl',
    sourceMsgIdx: idx
  };
  if (photo) pearl.photo = photo;
  state.pearls.push(pearl);
  msg.pearlSaved = true;
  saveState();
  renderChat();
  if (typeof renderArchive === 'function') renderArchive();
  showToast(`🔮 진주에 보관됨${photo ? ' (사진 같이)' : ''}`);
}

