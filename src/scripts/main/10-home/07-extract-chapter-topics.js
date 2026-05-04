async function extractChapterCaseAnalysis(messages) {
  try {
    if (!_canAI()) return;
    if (window._onbTutorialMode) return;
    if (state.preferences && state.preferences.testerMode) return;
    if (!Array.isArray(messages) || messages.length < 3) return;

    const prompt = _buildExtractChapterPrompt(messages);
    const resp = await callAnthropic({
      _endpoint: 'extract_chapter',
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const raw = data?.content?.[0]?.text || '';
    const jm = raw.match(/\{[\s\S]*\}/);
    if (!jm) return;
    let analysis;
    try { analysis = JSON.parse(jm[0]); } catch { return; }

    const touched = _processExtractChapterAnalysis(analysis);

    if (touched) {
      saveState();
      if (typeof renderModel === 'function') {
        try { renderModel(); } catch {}
      }
    }
  } catch (e) {
    console.warn('[chapter case extract] fail:', e);
  }
}

// 사용자 요청 2026-04-29: 임시대화 (숙고/마법) close 시 → 도서관 토픽 카드 자동 추출.
// 메인 chat extractPreviousChapterTopics 패턴 통일. background, fail silent.
// source: 'reflection' | 'magic_help', sourceId: 추출 중복 방지 키 (q.id 또는 decision:step), context: 짧은 컨텍스트 라벨.
async function extractTopicsFromTempChat(messages, source, sourceId, context) {
  try {
    if (!_canAI()) return;
    if (!Array.isArray(messages) || messages.length < 4) return;
    if (window._onbTutorialMode) return;
    if (state.preferences && state.preferences.testerMode) return;

    // 이미 같은 sourceId로 추출됐으면 skip (중복 prompt + 중복 비용 방지)
    const dupKey = `${source}:${sourceId}`;
    if (Array.isArray(state.topicCards) && state.topicCards.some(c => c.tempChatKey === dupKey)) return;

    const chatLog = messages.map(m => {
      const role = m.role === 'user' ? '나' : '소라';
      let content = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim();
      content = content.replace(/\{[\s\S]*"(?:new_traits|new_values)[\s\S]*\}\s*$/g, '').trim();
      return `${role}: ${content}`;
    }).join('\n\n');

    const sourceLabel = source === 'reflection' ? '🌊 숙고 (사용자가 한 질문에 대해 깊이 파고드는 임시 대화)'
      : source === 'magic_help' ? '🌀 마법 도움 받기 (큰 결정의 한 단계에서 도움 요청한 임시 대화)'
      : '임시 대화';

    const prompt = `사용자가 AI 친구 "소라고동"과 ${sourceLabel} 모드에서 나눈 대화를 토픽 카드로 정리해.

[컨텍스트] ${context || '(없음)'}

[대화 원문]
${chatLog.slice(0, 8000)}

[토픽 카드 추출 규칙]
- 의미 있는 토픽 1-3개 (잡담은 X)
- 카테고리 (V4 8 카테고리): diary | casual | concern | emotion | memory | todo | idea | relationship
- 각 카드: 짧은 제목 (~25자) + 1-2문장 요약
- 의미 없으면 빈 배열

[출력 형식 — JSON만]
{ "topics": [ { "title": "...", "summary": "...", "category": "concern" } ] }

JSON만, 마크다운 X.`;

    const resp = await callAnthropic({
      _endpoint: 'extract_topic',
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let text = (data?.content?.[0]?.text || '').trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return;
    const parsed = JSON.parse(m[0]);
    if (!parsed.topics || !Array.isArray(parsed.topics)) return;

    if (!Array.isArray(state.topicCards)) state.topicCards = [];
    const _dayKey = todayKey();
    const nowIso = new Date().toISOString();
    let pushed = 0;
    parsed.topics.forEach(t => {
      if (!t || !t.title) return;
      const title = String(t.title).trim().slice(0, 60);
      if (!title) return;
      // 정확 동일 제목 + 같은 sourceId면 중복 방지
      if (state.topicCards.some(c => c.title === title && c.tempChatKey === dupKey)) return;
      state.topicCards.push({
        id: 'tc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title,
        summary: String(t.summary || '').trim().slice(0, 300),
        category: ['diary','casual','concern','emotion','memory','todo','idea','relationship'].includes(t.category) ? t.category : 'casual',
        date: _dayKey,
        createdAt: nowIso,
        source: source,           // 'reflection' / 'magic_help'
        tempChatKey: dupKey,      // 중복 방지 키
        sourceLabel: sourceLabel.split(' ')[0]
      });
      pushed += 1;
    });
    if (pushed > 0) {
      saveState();
      if (typeof renderArchive === 'function') {
        try { renderArchive(); } catch {}
      }
    }
  } catch (e) {
    console.warn('[temp topic extract] fail:', e);
  }
}

// V4-fix: 숙고 채팅 안 AI 메시지를 ✦ 깨달음(reflection)으로 archive에 저장
async function saveReflectionMsgAsInsight(qId, msgIdx) {
  const q = (state.reflectionQuestions || []).find(x => x.id === qId);
  if (!q || !Array.isArray(q.chatMessages)) return;
  const msg = q.chatMessages[msgIdx];
  if (!msg || msg.savedAsInsight) return;

  if (!Array.isArray(state.archive)) state.archive = [];
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  // 직전 user 메시지 찾기
  let priorUserMsg = '';
  for (let i = msgIdx - 1; i >= 0; i--) {
    if (q.chatMessages[i]?.role === 'user') { priorUserMsg = q.chatMessages[i].content; break; }
  }

  // 사용자 명시 2026-05-01 ultrathink: haiku 정리 (4 ✦ 핸들러 일관 형식)
  const summary = await summarizeForArchive(msg.content, priorUserMsg);
  const headline = (summary && summary.headline) ? summary.headline : (q.shortText || q.text).slice(0, 30);
  const body = (summary && summary.body) ? summary.body : (msg.content || '').slice(0, 200);

  state.archive.unshift({
    type: 'reflection',
    headline,
    body,
    insight: body,
    original: msg.content,
    question: priorUserMsg,
    date,
    source: '🌊 숙고',
    savedAt: new Date().toISOString(),
    tags: ['숙고'],
    reflectionQuestionId: qId
  });
  msg.savedAsInsight = true;
  saveState();
  renderReflectionChat();
  showToast('✦ 깨달음에 저장됐어');
  // 사용자 요청 2026-04-29: 임시 대화 → caseFormulation feed-in (background, fail silent)
  extractAndApplyInsightToModel(msg.content, priorUserMsg, 'reflection').catch(() => {});
}

