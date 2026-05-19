// V4-1m: 진주 능동 제안 — 사용자 메시지에서 행복/소중함 신호 감지.
// V4 비전 7.7 (a)+(c) 결합: 강한 감정 신호 + 키워드 트리거. 같은 날 1회.
const PEARL_SIGNAL_REGEX = /진짜\s*(좋|행복|기뻐|감동|뭉클|짜릿)|너무\s*(좋|행복|기뻐|감동|뭉클)|행복(하|해|함|했|해서)|사랑(스|해|받|했)|소중(해|함|했|한)|뭉클|벅차|벅찼|황홀|짜릿|끝내(주|준|줘)|기적|감동(이|적|해|받|했)|마음이?\s*(따뜻|뭉클|벅차)|기쁘다|기쁨에|좋아\s*죽|반짝|살\s*것\s*같/;

// V4 (사용자 명시 2026-05-20 ultrathink): 진주 하루 50장 hard cap (anti-abuse).
//   카테고리 무관 — 일반/음악/티켓/책 합산. dna_pearl (시스템 자동) 은 cap 제외.
//   사용자 명시 add path 4곳 (addPearl / saveMsgAsPearl / saveTicketPearl / saveBookPearl) 에서 호출.
//   자동 promotion (체크인 3+ 같은 음악 → 음악 진주, chat-saved music auto, topic → pearl 등) 은 우회.
const PEARL_DAILY_HARD_CAP = 50;
function _canAddPearlToday() {
  try {
    const todayK = (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0, 10);
    const count = (state.pearls || []).filter(p => {
      if (!p || p.type === 'dna_pearl') return false;
      if (!p.createdAt) return false;
      const dk = (typeof getDayKey === 'function') ? getDayKey(p.createdAt) : p.createdAt.slice(0, 10);
      return dk === todayK;
    }).length;
    if (count >= PEARL_DAILY_HARD_CAP) {
      if (typeof showToast === 'function') showToast(`진주는 하루에 ${PEARL_DAILY_HARD_CAP}개까지 저장할 수 있습니다.`);
      return false;
    }
    return true;
  } catch (e) { console.warn('[pearl cap check]', e); return true; }
}
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
    // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildPearlPolish 가 합성.
    const resp = await callAnthropic({
      _endpoint: 'archive_summary',
      _userContentType: 'pearl_polish',
      _vars: { messageContent },
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: '' }]
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
  // V4 (사용자 명시 2026-05-20 ultrathink): 진주 하루 50장 hard cap.
  if (!_canAddPearlToday()) return;

  // V4 (사용자 요청 2026-05-09): 진주 한 줄 정리 방식 선택 — 직접 쓰기 vs 고동이 정리.
  // 사용자 명시 2026-05-10 (재정정): 고동이 정리 선택 시 = AI 결과 그대로 바로 저장 (input modal skip). 카테고리/사진 단계만 거침.
  //   직접 쓰기 = 옛 흐름 (input modal 띄워 사용자가 다듬음).
  let prefilled = (msg.content || '').slice(0, 200);
  let _aiAutoSave = false;
  if (_canAI()) {
    const mode = await showOptionsModal({
      title: '🔮 진주 한 줄, 어떻게 다듬을래?',
      options: [
        { label: '✏️ 내가 직접 쓸래', value: 'manual' },
        { label: '✨ 고동이가 정리해줘', value: 'ai' }
      ]
    });
    if (!mode) return;
    if (mode === 'ai') {
      showToast('✨ 한 줄 정리 중…');
      const aiSummary = await summarizeForPearl(msg.content);
      if (aiSummary) {
        prefilled = aiSummary;
        _aiAutoSave = true;
      } else {
        showToast('AI 정리 실패 — 직접 다듬어볼까');
      }
    }
  }

  let content;
  if (_aiAutoSave) {
    content = prefilled;
  } else {
    content = await showInputModal({
      title: '🔮 진주에 보관',
      message: '이 기억을 한 줄로 다듬어 — 나중에 봐도 기분 좋아질 수 있게.',
      defaultValue: prefilled,
      multiline: true,
      maxLength: 300,
      okLabel: '보관'
    });
    if (!content || !content.trim()) return;
  }

  // 카테고리 선택 (V3 진주 패턴)
  // V4 (사용자 명시 2026-05-14 ultrathink): 카테고리 5 → 7개 (티켓/책 추가).
  //   '티켓' 선택 시 saveTicketPearl flow / '책' 선택 시 saveBookPearl flow.
  const baseCategories = state.preferences?.pearlBasketCategories || ['음악', '음식', '장소', '순간', '사람'];
  const categories = baseCategories.concat(['티켓', '책']);
  const iconMap = { 음악: '🎵', 음식: '🍴', 장소: '📍', 순간: '✨', 사람: '👥', 티켓: '🎫', 책: '📚' };
  const options = categories.map(c => ({
    label: `${iconMap[c] || '💎'} ${c}`,
    value: c
  }));
  let category = await showOptionsModal({
    title: '어떤 진주? 💎',
    message: '',
    options
  });
  if (!category) return;
  category = category.trim();

  // V4 (사용자 명시 2026-05-14 ultrathink): 티켓 / 책 분기 — chat 한 줄 (content) 을 prefill 로 넘김.
  if (category === '티켓' && typeof saveTicketPearl === 'function') {
    const saved = await saveTicketPearl({ content: content.trim(), sourceMsgIdx: idx });
    if (saved) {
      msg.pearlSaved = true;
      saveState();
      renderChat();
      if (typeof renderArchive === 'function') renderArchive();
    }
    return;
  }
  if (category === '책' && typeof saveBookPearl === 'function') {
    const saved = await saveBookPearl({ content: content.trim(), sourceMsgIdx: idx });
    if (saved) {
      msg.pearlSaved = true;
      saveState();
      renderChat();
      if (typeof renderArchive === 'function') renderArchive();
    }
    return;
  }

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
        if (file) photo = await fileToResizedDataUrl(file, 1024, 0.85);
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
  // V4 (사용자 명시 2026-05-18 ultrathink): Phase 1C — photo Storage 직접 업로드. 실패 시 진주 자체 안 만듦.
  if (photo) {
    try {
      if (typeof showFullscreenLoader === 'function') showFullscreenLoader('사진 업로드 중... 📸');
      await _attachPearlPhoto(pearl, photo);
      if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
    } catch (e) {
      if (typeof hideFullscreenLoader === 'function') hideFullscreenLoader();
      console.warn('[saveMsgAsPearl] photo attach fail:', e);
      showToast('사진 업로드 실패 — 다시 시도해줘');
      return;
    }
  }
  state.pearls.push(pearl);
  msg.pearlSaved = true;
  saveState();
  renderChat();
  if (typeof renderArchive === 'function') renderArchive();
  showToast(`🔮 진주에 보관됨${photo ? ' (사진 같이)' : ''}`);
}

