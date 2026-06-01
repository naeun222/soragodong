// 결과: state.topicCards에 1-3개 토픽 카드 저장
// 사용자 명시 2026-05-02 ultrathink: prompt builder + result processor 분리 — Batch API path 가 재사용.
// 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildTopicChapterChat 가 합성. 클라는 chatLog 만 _vars 로.
function _buildExtractTopicPrompt(prevChapterMsgs) {
  const chatLog = prevChapterMsgs.map(m => {
    const role = m.role === 'user' ? '나' : '소라';
    let content = m.content || '';
    content = content.replace(/```json[\s\S]*?```/g, '').trim();
    content = content.replace(/\{[\s\S]*"(?:new_traits|new_values)[\s\S]*\}\s*$/g, '').trim();
    return `${role}: ${content}`;
  }).join('\n\n');
  return { chatLog: chatLog.slice(0, 8000) };
}

// parsed JSON 받아 topicCards push + chapterMeta 갱신.
// V4 (V191): archive.summary 갱신 분기 폐기 — 히스토리 줄거리 요약 흐름 제거.
function _processExtractTopicData(parsed, prevChapterMsgs) {
  if (!parsed?.topics || !Array.isArray(parsed.topics)) return;
  if (!prevChapterMsgs || prevChapterMsgs.length === 0) return;
  const chapterStartedAt = prevChapterMsgs[0]?.timestamp;
  const chapterEndedAt = prevChapterMsgs[prevChapterMsgs.length - 1]?.timestamp;
  if (!chapterStartedAt) return;
  // dedupe — 같은 chapterStartedAt 으로 이미 만들어진 카드는 skip (중복 prompt 비용 / state 오염 방지)
  if ((state.topicCards || []).some(c => c.chapterStartedAt === chapterStartedAt)) return;

  parsed.topics.forEach(t => {
    if (!t.title || !t.summary) return;
    const V3_TO_V4 = { decision: 'concern', task: 'todo', emotional: 'emotion', strategy: 'idea' };
    let rawCat = V3_TO_V4[t.category] || t.category;
    const validCats = ['diary', 'casual', 'concern', 'emotion', 'memory', 'todo', 'idea', 'relationship'];
    const category = validCats.includes(rawCat) ? rawCat : 'memory';
    const cardTitle = String(t.title).trim().slice(0, 60);
    const cardSummary = String(t.summary).trim().slice(0, 300);
    const card = {
      id: 'tc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      chapterStartedAt,
      chapterEndedAt,
      title: cardTitle,
      summary: cardSummary,
      category,
      messageCount: prevChapterMsgs.length,
      createdAt: new Date().toISOString()
    };
    if (category === 'strategy') {
      card.generations = [{
        gen: 1, layer: 'L2', action: cardSummary || cardTitle,
        missions: [], shells: [], attempts: [], status: 'working'
      }];
      card.embodimentStatus = 'seedling';
      card.embodimentPath = null;
      card.evolutionChats = [];
    }
    if (!Array.isArray(state.topicCards)) state.topicCards = [];
    state.topicCards.push(card);
  });

  let metaUpdated = false;
  if (parsed.topics.length > 0 && prevChapterMsgs[0]) {
    const startMsg = prevChapterMsgs[0];
    if (startMsg.chapterStart) {
      const firstTopic = parsed.topics[0];
      const cat = firstTopic.category || null;
      const sum = firstTopic.title || null;
      if (!startMsg.chapterMeta) startMsg.chapterMeta = { category: null, summary: null, strategyId: null };
      if (cat && !startMsg.chapterMeta.category) { startMsg.chapterMeta.category = cat; metaUpdated = true; }
      if (sum && !startMsg.chapterMeta.summary) { startMsg.chapterMeta.summary = sum; metaUpdated = true; }
    }
  }

  // V4 (사용자 명시 2026-05-04 V191): archive.summary 갱신 제거 — 히스토리 API 줄거리 요약 기능 폐기.
  // topicCards 추출 흐름은 보존 (도서관 / 나 탭 카드 정상). chatArchive item 자체는 raw messages 그대로 보관.
  if (typeof _capGeneralTopicCards === 'function') _capGeneralTopicCards();
  saveState();
  if (metaUpdated && typeof renderChat === 'function') renderChat();
  console.log(`✦ 챕터 토픽 ${parsed.topics.length}개 추출됨`);
}

// 일반 path — 5h+ 갭 즉시 (신규유저 첫 3 챕터). 또는 batch fallback timeout 시.
async function extractPreviousChapterTopics(passedMessages) {
  if (!_canAI()) return;
  if (window._onbTutorialMode) return;
  if (state.preferences && state.preferences.testerMode) return;

  let prevChapterMsgs;
  if (Array.isArray(passedMessages) && passedMessages.length > 0) {
    prevChapterMsgs = passedMessages.filter(m => !m.typing && !m.error);
    if (prevChapterMsgs.length < 3) return;
  } else {
    // legacy 경로 — chatMessages chapterStart 마커 스캔 (호환 보존)
    const msgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
    if (msgs.length < 3) return;
    let newChapterIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].chapterStart) { newChapterIdx = i; break; }
    }
    if (newChapterIdx <= 0) return;
    let prevChapterStart = 0;
    for (let i = newChapterIdx - 1; i >= 0; i--) {
      if (msgs[i].chapterStart) { prevChapterStart = i; break; }
    }
    prevChapterMsgs = msgs.slice(prevChapterStart, newChapterIdx);
    if (prevChapterMsgs.length < 3) return;
  }

  // dedupe — submit 전 가드
  const chapterStartedAt = prevChapterMsgs[0]?.timestamp;
  if (!chapterStartedAt) return;
  if ((state.topicCards || []).some(c => c.chapterStartedAt === chapterStartedAt)) return;

  const _vars = _buildExtractTopicPrompt(prevChapterMsgs);
  try {
    const resp = await callAnthropic({
      _endpoint: 'extract_topic',
      _userContentType: 'chapter_chat',
      _vars,
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: '' }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let text = (data?.content?.[0]?.text || '').trim();
    if (!text) return;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    _processExtractTopicData(parsed, prevChapterMsgs);
  } catch (e) {
    console.warn('Topic extract failed:', e);
  }
}

