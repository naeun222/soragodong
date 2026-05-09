// V4-1m: 진주 능동 제안 — 사용자 메시지에서 행복/소중함 신호 감지.
// V4 비전 7.7 (a)+(c) 결합: 강한 감정 신호 + 키워드 트리거. 같은 날 1회.
const PEARL_SIGNAL_REGEX = /진짜\s*(좋|행복|기뻐|감동|뭉클|짜릿)|너무\s*(좋|행복|기뻐|감동|뭉클)|행복(하|해|함|했|해서)|사랑(스|해|받|했)|소중(해|함|했|한)|뭉클|벅차|벅찼|황홀|짜릿|끝내(주|준|줘)|기적|감동(이|적|해|받|했)|마음이?\s*(따뜻|뭉클|벅차)|기쁘다|기쁨에|좋아\s*죽|반짝|살\s*것\s*같/;
function detectPearlSignal(text) {
  if (!text || text.length < 8) return false;
  return PEARL_SIGNAL_REGEX.test(text);
}

// V4 (사용자 요청 2026-05-09): 진주 한 줄 — AI 정리 선택지 헬퍼.
// summarizeForArchive (깨달음/지혜 추출) 와 톤 다름 — 진주는 회상의 한 줄.
// 같은 endpoint 'archive_summary' 재사용 (백엔드 chat-style 가드 통과).
async function summarizeForPearl(messageContent) {
  if (!_canAI()) return null;
  if (!messageContent || typeof messageContent !== 'string') return null;
  try {
    const resp = await callAnthropic({
      _endpoint: 'archive_summary',
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: `사용자가 행복했던/좋았던 순간을 진주(보석함)에 보관하려 해. 아래 메시지를 한 줄로 다듬어 — 나중에 다시 봐도 그 기분이 떠오르게.

[규칙]
- 한 줄, 20-60자
- 회상 톤 (그때 어떤 일이었고 어떤 느낌이었는지)
- 마크다운/JSON/따옴표/이모지 X
- 격언·조언·교훈 X
- "~좋았다 / ~행복했다 / ~따뜻했다" 같은 자연스러운 문장 OK
- 명령조 / 일반 서술 ("나는 ~다") X

[좋은 예]
한강에서 김치찌개 먹은 그날 바람이 살랑했음
엄마랑 통화하다 웃음이 터져서 30분을 더 떠들었음
새벽에 비 오는 소리 들으며 마신 따뜻한 차

[메시지]
${messageContent.slice(0, 1500)}

한 줄만 출력.` }]
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    let raw = (data?.content?.[0]?.text || '').trim();
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
    raw = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    raw = raw.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
    raw = raw.replace(/^["']|["']$/g, '').trim();
    if (!raw) return null;
    return raw.slice(0, 200);
  } catch (e) {
    console.warn('[summarizeForPearl] fail:', e);
    return null;
  }
}

async function saveMsgAsPearl(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.pearlSaved) return;

  // V4 (사용자 요청 2026-05-09): 진주 한 줄 정리 방식 선택 — 직접 쓰기 vs AI 정리.
  // AI 사용 가능 (_canAI) 시에만 분기 노출, 아니면 옛 흐름 (메시지 prefill 직접 다듬기) 그대로.
  let prefilled = (msg.content || '').slice(0, 200);
  if (_canAI()) {
    const mode = await showOptionsModal({
      title: '🔮 진주 한 줄, 어떻게 다듬을래?',
      message: '한 줄 정리 방법 골라.',
      options: [
        { label: '✏️ 내가 직접 쓸래', value: 'manual' },
        { label: '✨ AI 가 정리해줘', value: 'ai' }
      ]
    });
    if (!mode) return;
    if (mode === 'ai') {
      showToast('✨ 한 줄 정리 중…');
      const aiSummary = await summarizeForPearl(msg.content);
      if (aiSummary) {
        prefilled = aiSummary;
      } else {
        showToast('AI 정리 실패 — 직접 다듬어볼까');
      }
    }
  }

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

