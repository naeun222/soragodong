// ═══════════════════════════════════════════════════════════════
// INSIGHT SAVING
// ═══════════════════════════════════════════════════════════════
async function saveMsgAsInsight(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.saved) return;

  // V4-fix #8: 직전 user 메시지(질문) 같이 저장
  let priorUserMsg = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (state.chatMessages[i]?.role === 'user' && !state.chatMessages[i].typing) {
      priorUserMsg = state.chatMessages[i];
      break;
    }
  }
  const userQuestion = priorUserMsg?.content || '';

  let headline = '';
  let body = '';
  if (msg.insightCandidate) {
    body = msg.insightCandidate;
  } else {
    // V4 (사용자 보고 2026-05-04): summarizeForArchive 통합 (4 핸들러 일관 — 메인 chat / 마법 / 숙고 / 돌연변이).
    // 옛 'pearl_extract' endpoint key 잔재 (legacy — 진주 추출은 LLM X 사용자 직접 입력) → 'archive_summary' 통일.
    // [좋은 예] 3개 + [규칙] '지혜 추출' 정의 한 줄 = summarizeForArchive 에 보강해 통일.
    const summary = (typeof summarizeForArchive === 'function' && _canAI())
      ? await summarizeForArchive(msg.content, userQuestion)
      : null;
    if (summary) {
      headline = summary.headline || '';
      body = summary.body || '';
    }
  }
  if (!body && !headline) body = msg.content.slice(0, 150);
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const insight = headline ? `${headline} — ${body}` : body;
  state.archive.unshift({
    date, insight, headline, body,
    original: msg.content,
    question: userQuestion,  // V4-fix #8: 직전 user 메시지 같이 저장
    source: '대화',
    savedAt: new Date().toISOString(),
    type: 'scrap',
    tags: []
  });
  msg.saved = true;
  saveState();
  renderChat();
  showToast('깨달음 도서관에 저장됐어 ✦');
}

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

// V4-1h: ✎ 메모 — 자유 텍스트 + AI 해시태그 자동 생성. 컨텍스트 X (대화 인용 X).
// V4 비전 7.6: archive 객체 { type:'memo', userMemo, tags[], date, savedAt, source:'메모' }
async function addMemoArchive() {
  // V4-fix v3 (사용자 요청): 테스터 모드 → 예시 메모 자동 채움
  const isTester = !!(state.preferences && state.preferences.testerMode);
  const memoExamples = [
    '새벽 작업이 가장 잘 돼. 이 시간이 네 골든.',
    '거절 = 약함 X 강함. 부채감은 일시.',
    '환경이 의지보다 강함. 도구 셋업 한 번이 의지 매일보다 효과 큼.',
    '한강 → 글쓰기 흐름 작동. 몸 풀림 + 인지 시작 패턴.',
    '잠 6시간 미만이면 큰 결정 다음날로 미루기.'
  ];
  const seed = (Date.now() % memoExamples.length);
  const userMemo = await showInputModal({
    title: '✎ 메모',
    message: '깨달음 한 줄. 자유롭게 — 짧아도 OK.',
    placeholder: '예: 새벽엔 결정 미루기 / 카페가 답이다',
    defaultValue: isTester ? memoExamples[seed] : '',
    multiline: true,
    maxLength: 400,
    okLabel: '저장 ✦'
  });
  if (!userMemo || !userMemo.trim()) return;
  const trimmed = userMemo.trim();

  // AI 해시태그 자동 생성 (3-5개, 짧은 키워드)
  let tags = [];
  if (_canAI()) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: _anthropicHeaders(),
        body: JSON.stringify({
          _endpoint: 'memo',
          model: 'claude-haiku-4-5',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `메모: "${trimmed}"

이 메모의 핵심을 짧은 해시태그 3-5개로 뽑아.
각 태그 2-6자 한국어 명사형. 예: 결정, 환경, ADHD, 새벽, 회피, 자기효능감.

[출력 — JSON만]
{ "tags": ["태그1", "태그2", "태그3"] }

[금지]
- # 기호 X (태그 텍스트만)
- 마크다운, 코드블록 X
- 영어 (단 ADHD/CBT 등 약어 OK)
- 6자 초과 태그 X
- 일반 동사·형용사 (행동, 좋다 등) X
- 5개 초과 X

JSON만 출력.`
          }]
        })
      });
      const data = await resp.json();
      let raw = data.content[0].text.trim();
      raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.tags)) {
          tags = parsed.tags
            .map(t => String(t).replace(/^#/, '').trim())
            .filter(t => t && t.length <= 8)
            .slice(0, 5);
        }
      }
    } catch (e) {
      console.warn('memo tag AI failed:', e);
    }
  }

  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  state.archive.unshift({
    type: 'memo',
    userMemo: trimmed,
    headline: '',
    body: trimmed.slice(0, 80),
    insight: trimmed,        // 검색·legacy 호환
    tags,
    date,
    source: '메모',
    savedAt: new Date().toISOString()
  });
  saveState();
  if (typeof renderArchive === 'function') renderArchive();
  showToast(tags.length ? `메모 저장됨 ✎  ${tags.map(t => '#' + t).join(' ')}` : '메모 저장됨 ✎');
}

// V3.13.x: askDeeper 응답을 전략 카드로 저장 (state.topicCards에 category='strategy')
// 4-필드 구조: title / problemContext / psychConcept / actionStrategy
async function saveMsgAsStrategy(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.savedStrategy) return;
  let title = '', problemContext = '', psychConcept = '', actionStrategy = '';
  if (!_canAI()) {
    title = msg.content.slice(0, 30);
    actionStrategy = msg.content.slice(30, 200);
  } else {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: _anthropicHeaders(),
        body: JSON.stringify({
          _endpoint: 'decision_step',
          // 사용자 요청 2026-04-30: 사실상 대화 내용 정리 → sonnet 4.6 적합 (opus 과함).
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: `아래 4단 분석/전략 응답에서 "전략 카드"로 저장할 핵심을 뽑아줘.

[출력 형식 — 정확히 4줄, 각 줄은 라벨로 시작]
TITLE: <제목, 5-14자, 짧고 임팩트. 명사형 또는 짧은 명제>
PROBLEM: <문제 상황, 50-90자, "어떤 순간·패턴에 적용?">
CONCEPT: <심리학 개념 이름 + 1줄 설명, 30-80자>
ACTION: <전략적 행동, 50-120자, 구체적 무엇을 어떻게>

[좋은 예]
TITLE: 마감 직전 폭발력 신뢰하기
PROBLEM: 마감 24h 이상 남았는데 시작 못 했을 때 자책감으로 더 미루는 패턴.
CONCEPT: ADHD time blindness — 마감 임박해야 도파민이 충분해져 시작 가능.
ACTION: 24h 전엔 시작 못 했다고 자책 X. 마감 24h 전에 알람 1개만 설정. 그 알람을 trigger로 펼치기.

TITLE: 거절은 짧게 그날 안에
PROBLEM: 부탁받고 미루다 며칠 끌면서 부채감 커지는 패턴.
CONCEPT: 미결 부담 누적 (Zeigarnik effect) — 결정 안 된 것이 인지 자원 잡아먹음.
ACTION: 거절할 거면 "이번엔 어려워" 한 줄로 그날 안에 답하기. 이유 길게 설명 X.

[금지]
- "나는 ~다" 일반 서술
- 마크다운 (**, ##)
- JSON, 코드블록, 따옴표
- 추상적 다짐 ("열심히 하자")
- 4줄 외 다른 줄

[원본 응답]
${(msg.content || '').slice(0, 1500)}

정확히 TITLE/PROBLEM/CONCEPT/ACTION 4줄만 출력.` }]
        })
      });
      const data = await resp.json();
      let raw = data.content[0].text.trim();
      raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
      raw = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
      const grab = (label) => {
        const re = new RegExp(`^${label}:\\s*(.+)$`, 'mi');
        const m = raw.match(re);
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
      };
      title = grab('TITLE').slice(0, 30);
      problemContext = grab('PROBLEM').slice(0, 200);
      psychConcept = grab('CONCEPT').slice(0, 200);
      actionStrategy = grab('ACTION').slice(0, 240);
    } catch (e) {
      title = msg.content.slice(0, 30);
      actionStrategy = msg.content.slice(30, 200);
    }
  }
  if (!title) title = '전략';
  const now = new Date().toISOString();
  // backward-compat summary 결합 (legacy 코드가 summary 참조)
  const summary = [problemContext, psychConcept, actionStrategy].filter(Boolean).join(' / ');
  state.topicCards = state.topicCards || [];
  const stratId = 'strat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  state.topicCards.push({
    id: stratId,
    category: 'strategy',
    title,
    summary,
    problemContext,
    psychConcept,
    actionStrategy,
    chapterStartedAt: now,
    chapterEndedAt: now,
    createdAt: now,
    messageCount: 1,
    source: 'deeper',
    // V4: 체화 시스템
    generations: [{
      gen: 1,
      layer: 'L2',
      action: actionStrategy || title,
      missions: [],
      shells: [],
      attempts: [],
      status: 'working'
    }],
    embodimentStatus: 'seedling',
    embodimentPath: null,
    evolutionChats: []
  });
  msg.savedStrategy = true;
  msg.strategyId = stratId;  // 사용자 요청 2026-04-28: msg에 strategyId 적용하기 → acceptProposal에서 mission 만들 때 자동 link
  saveState();
  renderChat();
  // V4 (v8 묶음 13): Core 2 튜토리얼 시점 — 카드 시각화 모달 자동 (사용자가 카드 미리보기)
  if (window._onbTutorialMode && _activeCoreId === 'core2' && typeof _showStrategyCardModal === 'function') {
    const justSaved = state.topicCards[state.topicCards.length - 1];
    setTimeout(() => _showStrategyCardModal(justSaved), 200);
  } else {
    showToast('전략 카드로 저장됐어 🧬');
  }
}

// ═══════════════════════════════════════════════════════════════
// V4 EMBODIMENT STATE MACHINE (체화 상태 머신)
// ───────────────────────────────────────────────────────────────
// 전략 카드의 generations[] 안 attempts[]를 기록하고,
// 누적 worked 수에 따라 embodimentStatus 자동 전환.
// V4 비전 5.4 전환 규칙:
//   🌱 seedling → 🌿 trying: 자동 (시도 1회+)
//   🌿 trying → 🌳 working: 누적 worked 3회 + 사용자 확인 (V4-1d-2 prompt)
//   🌳 working → 🍃 embodied: 누적 worked 5회 + 사용자 확인 (V4-1d-4 결정화 의식)
//   any → 🪦 mutated: 사용자 "안 통함" 클릭 → 새 generation
// ═══════════════════════════════════════════════════════════════

function getStrategyCard(strategyId) {
  if (!strategyId || !Array.isArray(state.topicCards)) return null;
  // 사용자 명시 2026-05-01: first-gen mutation (topic → strategy 변환) 진행 중이면 category 무관 검색.
  // finalize 시점 (옵션 선택 후) 에 category='strategy' 로 promote.
  if (_mutationChatState && _mutationChatState.firstGenTopicId === strategyId) {
    return state.topicCards.find(c => c.id === strategyId) || null;
  }
  return state.topicCards.find(c => c.id === strategyId && c.category === 'strategy') || null;
}

function getCurrentGeneration(card) {
  if (!card || !Array.isArray(card.generations) || !card.generations.length) return null;
  return card.generations[card.generations.length - 1];
}

function countWorkedAttempts(card) {
  if (!card || !Array.isArray(card.generations)) return 0;
  return card.generations.reduce((acc, g) =>
    acc + (Array.isArray(g.attempts) ? g.attempts.filter(a => a.status === 'worked').length : 0)
  , 0);
}

function countTotalAttempts(card) {
  if (!card || !Array.isArray(card.generations)) return 0;
  return card.generations.reduce((acc, g) =>
    acc + (Array.isArray(g.attempts) ? g.attempts.length : 0)
  , 0);
}

// status: 'worked' | 'meh' | 'didnt' | 'skipped'
function recordStrategyAttempt(strategyId, status, missionId) {
  const card = getStrategyCard(strategyId);
  if (!card) return null;
  const gen = getCurrentGeneration(card);
  if (!gen) return null;
  if (!Array.isArray(gen.attempts)) gen.attempts = [];
  // 사용자 요청 2026-04-28: shell 매핑 — missionId에 해당하는 shell이 있으면 attempt에 shellId 적용하고 gen.shells에 추가 (DNA 조각화)
  let shellId = null;
  if (missionId && (status === 'worked' || status === 'meh')) {
    const matched = (state.shellCollection || []).find(s => s.missionId === missionId);
    if (matched) shellId = matched._id;
  }
  gen.attempts.push({
    missionId: missionId || null,
    shellId,
    status,
    at: new Date().toISOString()
  });
  if (!Array.isArray(gen.shells)) gen.shells = [];
  if (shellId && !gen.shells.includes(shellId)) gen.shells.push(shellId);
  if (missionId && Array.isArray(gen.missions) && !gen.missions.includes(missionId)) {
    gen.missions.push(missionId);
  }
  updateEmbodimentStatus(card);
  // V4-1o-3: 자기 학습 — recently shown 진단의 confidence를 결과로 갱신
  // V4 비전 9.5: "관찰 받고 행동 → 결과로 confidence 갱신"
  // weak_tool / wrong_layer 진단이 7일 내 shown인 경우, 이 카드 attempt 결과로 confidence 조정
  if (typeof updateDiagnosisConfidence === 'function') {
    try { updateDiagnosisConfidence(strategyId, status); } catch (e) { console.warn('updateDiagConf:', e); }
  }
  saveState();
  return card;
}

// V4-1o-3: 진단 자기 학습 — recently shown 진단의 confidence 조정
function updateDiagnosisConfidence(strategyId, status) {
  if (!Array.isArray(state.diagnoses)) return;
  const now = Date.now();
  const window = 7 * 86400000;  // 7일 내 shown 진단만
  state.diagnoses.forEach(d => {
    if (d.status !== 'shown') return;
    if (d.targetCardId && d.targetCardId !== strategyId) return;
    if (!d.detectedAt) return;
    const age = now - new Date(d.detectedAt).getTime();
    if (age > window) return;
    // weak_tool / wrong_layer: worked → confidence 감소 (진단 틀렸다는 신호) / didnt → 증가
    if (d.type === 'weak_tool' || d.type === 'wrong_layer') {
      const delta = status === 'worked' ? -0.15 : (status === 'didnt' ? 0.10 : 0);
      if (delta) {
        d.confidence = Math.max(0, Math.min(1, (d.confidence || 0.5) + delta));
        d.lastUpdate = new Date().toISOString();
        // confidence가 너무 낮아지면 status='dismissed' (다시 안 띄움 + 흔적 보존)
        if (d.confidence < 0.2) d.status = 'dismissed';
      }
    }
    // avoidance: worked → 회피 패턴 깨짐 → confidence 감소
    if (d.type === 'avoidance' && status === 'worked') {
      d.confidence = Math.max(0, (d.confidence || 0.5) - 0.20);
      if (d.confidence < 0.2) d.status = 'dismissed';
    }
  });
}

function updateEmbodimentStatus(card) {
  if (!card) return;
  // 사용자 명시 2026-05-01 (agent audit P9): 'archived' 분기 dead 정리. 사용자 진입 UI 없는 dead state.
  // 체화 (embodied = 5번 성공 → DNA 진주) 와 보관 (archived = 사용자 X 표시) 의미상 다름. archived 는 미구현 자리.
  if (card.embodimentStatus === 'embodied') return;

  const total = countTotalAttempts(card);
  const worked = countWorkedAttempts(card);

  // seedling → trying: 첫 시도부터
  if (card.embodimentStatus === 'seedling' && total >= 1) {
    card.embodimentStatus = 'trying';
  }

  // trying → working: worked 3회+ 자동 전환 + 5.8 톤 토스트.
  // (5.4 "사용자 확인"은 5회+ 결정화 의식에 한정. 3회 단계는 자동 + 인지 부담↓)
  // V4 (v8 묶음 19-H): 'trying' 또는 'evolved' 둘 다 working 으로 전환 (진화 가지도 worked 3회면 성장)
  if ((card.embodimentStatus === 'trying' || card.embodimentStatus === 'evolved') && worked >= 3) {
    card.embodimentStatus = 'working';
    if (typeof showToast === 'function') {
      showToast('🧬 가닥 색 진해짐 — 너만의 코드로 자리 잡고 있어');
    }
  }

  // working → embodied: worked 5회+ → 결정화 의식 prompt (V4-1d-4)
  if (worked >= 5 && card.embodimentStatus !== 'embodied') {
    if (typeof promptCrystallize === 'function') {
      try { promptCrystallize(card); } catch (e) { console.warn('promptCrystallize:', e); }
    }
  }
}

// V4-1d-3 wire용: 사용자 "안 통함" → 새 generation 생성, 이전 gen은 mutated.
function mutateToNewGeneration(strategyId, layer, action) {
  const card = getStrategyCard(strategyId);
  if (!card) return null;
  if (!Array.isArray(card.generations)) card.generations = [];
  const prevGen = getCurrentGeneration(card);
  if (prevGen) {
    prevGen.status = 'mutated';
    // 사용자 요청 2026-04-28: 옛 카드 내용 (title/problem/concept/action) prev gen에 snapshot 보존 — 진화 트리에서 보임
    if (!prevGen.snapshot) {
      prevGen.snapshot = {
        title: card.title || '',
        problemContext: card.problemContext || '',
        psychConcept: card.psychConcept || '',
        actionStrategy: card.actionStrategy || ''
      };
    }
  }
  const newGen = {
    gen: card.generations.length + 1,
    layer: layer || 'L2',
    action: action || '',
    missions: [],
    shells: [],
    attempts: [],
    status: 'working'
  };
  card.generations.push(newGen);
  card.embodimentStatus = 'evolved'; // V4 (v8 묶음 19-H, 사용자 짚음 2026-05-03): 진화 가지 시작 — 신 상태 evolved (옛 'trying' reset 정정)
  // V4-fix v3 (사용자 보고): 양생방 카드 시각 갱신
  // - title = 돌연변이로 바뀐 새 행동 전략 (사용자 요청 — 제목 자체 변경)
  // - actionStrategy = 새 generation의 action 그대로
  // - 진화 트리 자동 펼침
  if (action) {
    card.actionStrategy = action;
    card.title = action.length > 40 ? action.slice(0, 40) + '...' : action;
  }
  // 사용자 요청 2026-04-28: 진화 직후엔 트리 접힘 (사용자가 직접 제목 클릭해서 펼치는 경험)
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._strategyTreeOpen) state.preferences._strategyTreeOpen = {};
  state.preferences._strategyTreeOpen[strategyId] = false;
  saveState();
  return card;
}

// V4-1d-4 wire용: 5.6 3 경로 결정.
function determineEmbodimentPath(card) {
  if (!card || !Array.isArray(card.generations)) return 'one-shot';
  const gens = card.generations;
  if (gens.length === 1) return 'one-shot';
  if (gens.length <= 2) return 'quick-discovery';
  return 'evolved';
}

// V4-1d-2: 시도 결과 체크 4 옵션 모달.
// 안티-자책 톤 (V4 비전 5.9): "실패" X, "안 통했어 / 못 시도했어" 톤.
// returns: 'worked' | 'meh' | 'didnt' | 'skipped' | 'defer' | null (사용자 취소)
// V4 (v8 묶음 1): 결과 체크 모달 — 시그너처 객체 ({ strategyName, situation, missionTitle }) + string legacy 호환.
// 옵션 4개 (skipped 폐기) + 배경 클릭 X (명시 선택 강제) + 📌 원래 문제 박스 (situation 있을 때만)
async function showAttemptResultModal(arg) {
  let strategyName = '', situation = '', missionTitle = '';
  if (typeof arg === 'string') {
    strategyName = arg;
  } else if (arg && typeof arg === 'object') {
    strategyName = arg.strategyName || '';
    situation = arg.situation || '';
    missionTitle = arg.missionTitle || '';
  }
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'attempt-result-modal-overlay';
    const sitHtml = situation ? `
      <div class="attempt-result-section problem">
        <div class="attempt-result-section-label">📌 원래 문제</div>
        <div class="attempt-result-section-text">${escapeHtml(String(situation).slice(0, 200))}</div>
      </div>` : '';
    const missionHtml = missionTitle ? `
      <div class="attempt-result-section attempt">
        <div class="attempt-result-section-label">🌿 이번 시도</div>
        <div class="attempt-result-section-text">${escapeHtml(missionTitle)}</div>
      </div>` : '';
    const promptLine = strategyName
      ? `「${escapeHtml(strategyName)}」 통했어?`
      : `통했어?`;
    overlay.innerHTML = `
      <div class="attempt-result-modal">
        <div class="attempt-result-title">어땠어?</div>
        ${sitHtml}
        ${missionHtml}
        <div class="attempt-result-prompt">${promptLine}</div>
        <div class="attempt-result-options">
          <button class="result-option-btn primary" data-status="worked">👍 해결 됐어</button>
          <button class="result-option-btn" data-status="meh">🤔 그저 그래</button>
          <button class="result-option-btn" data-status="didnt">👎 안 통했어</button>
          <button class="result-option-btn defer" data-status="defer">⏸ 아직 결과 안 나왔어</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlay.querySelectorAll('.result-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        overlay.classList.remove('show');
        setTimeout(() => { try { overlay.remove(); } catch {} }, 200);
        resolve(status);
      });
    });
    // 배경 클릭 X — 사용자 명시 선택 강제 (의도된 cancel 막힘)
  });
}

// V4-1d-3: 돌연변이 진화 — 임시 채팅 (4 옵션 picker).
// V4 비전 6.3: 안 통한 가지 → 다른 가지에서 4 옵션 즉석 → 사용자 선택 → 새 generation + 새 미션.
// 5.8 톤: "🧬 돌연변이 시점. [전략명] 가지 끝났어 — 발견 [무엇]. 새 가지 어디서? 🌍/👥/🧠/🪞"
// 메인 흐름 X (anchor 29). non-blocking: completeMission이 await 안 함.
const _LAYER_EMOJI = { L1: '🧠', L2: '🎯', L3: '🌍', L4: '👥', L5: '🪞' };
const _LAYER_NAME  = { L1: '인지', L2: '행동', L3: '환경', L4: '사회', L5: '메타' };

// V4-fix v2: 돌연변이 임시 대화창 (V4 비전 6.3 + anchor 27/29)
// 현재 진행 중인 mutation chat state (overlay 단일 instance)
let _mutationChatState = null;

async function openMutationChat(strategyId, missionTitle, opts) {
  opts = opts || {};
  const firstGen = !!opts.firstGen;
  // first-gen 모드: getStrategyCard 검색이 category='strategy' 여도 통과하도록 marker pre-set.
  // (아래 본 _mutationChatState 할당 전에 lookup 호환)
  if (firstGen) {
    _mutationChatState = { firstGenTopicId: strategyId };
  }
  const card = getStrategyCard(strategyId);
  if (!card) { _mutationChatState = null; return; }
  const prevGen = getCurrentGeneration(card);
  const prevLayer = prevGen?.layer || 'L2';
  // 사용자 요청 2026-04-29: 자동 생성 X. 사용자가 대화 후 [🌱 가지 만들기] 버튼 누를 때 생성.
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  const inceptionMessage = firstGen
    ? `🌱 "${card.title}" — 이 주제를 *전략 카드*로 결정화해보자.\n\n어떤 상황에서 이 패턴/고민이 자주 나타나? 어떤 게 가장 어렵게 느껴져?\n\n충분히 풀고 [🌱 첫 가지 만들기] 누르면 5 가지 (인지/행동/환경/사회/메타) 제안할게.`
    : `🌿 "${card.title}" — 이 전략은 잘 안 맞았군.\n🧬 DNA가 진화할 준비 됐어. ✨\n\n어떤 점이 어려웠는지 같이 풀어보자. 충분히 풀고 [🌱 가지 만들기] 누르면 새 가지 4개 제안할게.`;
  _mutationChatState = {
    strategyId,
    missionTitle,
    prevLayer,
    firstGen,
    firstGenTopicId: firstGen ? strategyId : null,
    selectedRef: null,  // { msgIdx, optIdx } 또는 null
    confirmStep: false,
    messages: [{ role: 'assistant', content: inceptionMessage }],
    loading: false,
    chatRecord: {
      gen: (card.generations?.length || 0),
      triggerMission: missionTitle,
      triggerAt: new Date().toISOString(),
      options: [],
      selectedLayer: null,
      selectedAction: null,
      messages: [],
      firstGen
    }
  };
  _renderMutationChat();
}

// 사용자 요청 2026-04-29: 대화 흐름 반영해 가지 생성 — 인라인 메시지로 적용됨. 같은 차원 refine OK.
// 사용자 명시 2026-05-01: firstGen 모드 — topic → strategy 첫 결정화. 5 옵션 (L1-L5 각 1개) + prompt 분기.
async function _generateMutationOptions(strategyId, missionTitle, opts) {
  if (!_mutationChatState) return;
  const card = getStrategyCard(strategyId);
  if (!card) return;
  const firstGen = !!_mutationChatState.firstGen;
  const allowSameLayer = !!(opts && opts.allowSameLayer);
  const prevGen = getCurrentGeneration(card);
  const prevAction = prevGen?.action || card.actionStrategy || card.summary || '';
  const prevLayer = prevGen?.layer || 'L2';

  // 가지 만드는 중 — 임시 placeholder 메시지
  _mutationChatState.loading = true;
  _mutationChatState.messages.push({ role: 'assistant', content: '가지 만들고 있어... ✦', _placeholder: true });
  _renderMutationChat();

  // 사용자 보고 2026-04-29: 'isRegen' 변수 제거됐는데 reference 남아있던 ReferenceError fix.
  // 항상 임시 대화 전체를 컨텍스트로 (인사 메시지만 있어도 무해, 대화 풀린 상태면 사용자 컨텍스트 반영).
  const recentMsgs = _mutationChatState.messages
    .filter(m => m.role !== 'options' && !m._placeholder)
    .map(m => `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`)
    .join('\n');
  const sameLayerNote = firstGen
    ? `\n[5 가지 모두 — L1, L2, L3, L4, L5 각 1개. 제외 X.]`
    : (allowSameLayer
      ? `\n[같은 가지 허용] 이전이 ${prevLayer} 여도 OK — 같은 가지에서 refine된 옵션 (이유 분석 + 보완) 도 1-2개 포함 가능. 단 똑같이 X — 대화에서 발견한 이유 반영해서 보완.`
      : `\n이전이 ${prevLayer} 였으니 그 외 4 가지 각 1개.`);
  const convoNote = recentMsgs
    ? `\n\n[지금까지 대화 — 이 사용자 컨텍스트 우선 반영]\n${recentMsgs}\n\n위 대화에서 사용자가 짚은 진짜 어려움을 옵션에 녹여. generic 답 X.`
    : '';
  const headerLine = firstGen
    ? `[주제 (토픽 → 전략 첫 결정화)] "${card.title}"\n[summary] ${card.summary || '(없음)'}\n[원래 카테고리] ${card.sourceTopicCategory || card.category || '?'}`
    : `[전략 카드] "${card.title}"\n[심리학 개념] ${card.psychConcept || '(없음)'}\n[문제 상황] ${card.problemContext || '(없음)'}\n[이전 가지 ${prevLayer} ${_LAYER_NAME[prevLayer]||''}] "${prevAction}"\n[안 통한 미션] "${missionTitle}"`;

  // AI 호출 (있으면) — fallback 즉시 사용 (UI 멈추지 않게)
  let aiOptions = [];
  if (_canAI()) {
    try {
      const resp = await callAnthropic({
          _endpoint: 'mutation',
          model: 'claude-opus-4-7',
          max_tokens: 900,
          messages: [{
            role: 'user',
            content: `${firstGen ? '토픽 → 전략 결정화: 첫 가지 5 옵션 (L1-L5 각 1개)' : '돌연변이 진화 4 옵션 생성'} (사용자 요청 2026-04-29: 대화 흐름 반영, 같은 가지 refine도 허용).

${headerLine}

[5 가지 — 의지 부담 ↓일수록 관찰 친화]
- L1 인지: 생각의 틀 재구조화 (CBT, 인지 재해석) — 의지 100%
- L2 행동: 알람·체크리스트·시간 박스 — 의지 90%
- L3 환경: 물리적 환경/도구 자체 변경, 자동 trigger — 의지 30%
- L4 사회: 친구·책임 파트너·공개 약속 — 의지 20%
- L5 메타: 가치 재검토, 마법의 소라고동, 큰 그림 보기 — 의지 10%
${sameLayerNote}${convoNote}

[옵션 작성 가이드 — 매우 중요]
1. 추상 X 구체 ○: "환경 바꿔" X, "오늘 저녁 7시까지 폰을 거실 책상 충전기에 꽂아두기" ○
2. 첫 행동 명확: 동사로 시작 + 5분 안에 시작 가능
3. 네 사용자 ${card.title} 패턴에 맞게 — 일반론 X
4. 왜 도움되는지 1구절 포함 (예: "도파민 trigger 외부화", "결정 부담 ↓")
5. 관찰 친화: 의지 부담 ↓ 가지 (L3/L4) 우선, L1·L5는 신중하게
6. 한 줄 70-100자

[출력 JSON만 — 마크다운 X 따옴표 안 escape]
{ "options": [{"layer":"L3","action":"오늘 저녁 7시까지 폰을 거실 충전기에 꽂아두기 — 손에 안 닿으면 자동 차단 (도파민 trigger 외부화)"},...] }

[절대 금지]
- "실패" / "안 됨" / "왜 못 했지" 단어
- 추상 다짐 ("열심히", "노력")
- 마크다운 / 줄바꿈 / 따옴표 escape`
          }]
      });
      const data = await resp.json();
      let raw = data.content[0].text.trim();
      raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.options)) {
          // firstGen: 모두 허용 (5 옵션) / 같은 가지 허용 시 prevLayer filter X / 기본 4 옵션 (prevLayer 제외)
          aiOptions = parsed.options.filter(o =>
            o.layer && o.action && (firstGen || allowSameLayer || o.layer !== prevLayer)
          );
        }
      }
    } catch (e) { console.warn('mutation AI failed:', e); }
  }
  if (!aiOptions.length) {
    // 사용자 요청 2026-04-28: 더 디테일·실용 — 구체 행동 + 왜 도움되는지 명시 (의료법 회피 wording).
    const allFallback = [
      { layer: 'L3', action: '오늘 저녁 7시까지 폰을 다른 방 충전기에 꽂아두기 — 손에 안 닿으면 자동 차단 (의지 X 환경 차원에서 trigger 외부화)' },
      { layer: 'L4', action: '믿을 친구 1명한테 카톡 한 줄: "나 오늘부터 X 시도 중. 매일 결과 한 줄 공유" — 책임 파트너 효과 + 외부 시선 = 도파민' },
      { layer: 'L2', action: '알람 1개 (실제 가능한 시간) + 5분만 시작하기 룰 — 5분 후 그만둬도 OK. 진입 마찰 ↓' },
      { layer: 'L1', action: '이 행동이 안 됐을 때 머릿속에 뜨는 생각을 적어보기 ("난 못해" 같은 거) → 다른 해석 시도 ("오늘은 못 했을 뿐, 내일 다시")' },
      { layer: 'L5', action: '마법의 소라고동에 큰 질문 적용하기: "이 행동이 정말 지금 나에게 필요한가?" 일주일 안고 살아보기 — 가치 재검토' }
    ];
    // firstGen: 5개 다 / mutation: prevLayer 제외 4개 (or allowSameLayer 시 4개 무제한)
    aiOptions = firstGen
      ? allFallback
      : allFallback.filter(o => allowSameLayer || o.layer !== prevLayer).slice(0, 4);
  }
  if (!_mutationChatState) return;  // 사용자가 그 사이 닫음
  // placeholder 메시지 제거
  _mutationChatState.messages = _mutationChatState.messages.filter(m => !m._placeholder);
  // 사용자 요청 2026-04-29: 가지를 인라인 메시지로 넣음 (대화 흐름에 자연 적용됨 — 시간순)
  _mutationChatState.messages.push({
    role: 'options',
    options: aiOptions,
    generatedAt: new Date().toISOString()
  });
  _mutationChatState.loading = false;
  // chatRecord.options = 가장 최근 (선택용)
  _mutationChatState.chatRecord.options = aiOptions.slice();
  _renderMutationChat();
}

// 사용자 요청 2026-04-29: 돌연변이 임시 대화창의 assistant 메시지를 ✦ 깨달음(scrap)으로 archive에 저장
async function saveMutationMsgAsInsight(msgIdx) {
  if (!_mutationChatState) return;
  const m = _mutationChatState.messages[msgIdx];
  if (!m || m.role !== 'assistant' || m.savedAsInsight) return;
  // 직전 user 메시지(질문) 같이 저장
  let priorUser = null;
  for (let i = msgIdx - 1; i >= 0; i--) {
    const p = _mutationChatState.messages[i];
    if (p && p.role === 'user') { priorUser = p; break; }
  }
  const userQuestion = priorUser?.content || '';
  const card = getStrategyCard(_mutationChatState.strategyId);
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  // 사용자 명시 2026-05-01 ultrathink: haiku 정리 (4 ✦ 핸들러 일관 형식)
  const summary = await summarizeForArchive(m.content, userQuestion);
  const headline = (summary && summary.headline) ? summary.headline : (m.content || '').slice(0, 30);
  const body = (summary && summary.body) ? summary.body : (m.content || '').slice(0, 200);

  state.archive = state.archive || [];
  state.archive.unshift({
    type: 'scrap',
    headline,
    body,
    insight: m.content,
    userMsg: userQuestion,
    assistantMsg: m.content,
    date,
    source: card ? `🧬 돌연변이 (${card.title})` : '🧬 돌연변이',
    savedAt: new Date().toISOString(),
    tags: ['돌연변이', '진화']
  });
  m.savedAsInsight = true;
  saveState();
  if (typeof renderArchive === 'function') renderArchive();
  showToast('✦ 깨달음에 저장됐어');
  _renderMutationChat();
  // 사용자 요청 2026-04-29: 임시 대화 → caseFormulation feed-in (background, fail silent)
  extractAndApplyInsightToModel(m.content, userQuestion, 'mutation').catch(() => {});
}

// 사용자가 [🌱 가지 만들기] / [🔄 가지 다시 만들기] 버튼 클릭
async function triggerGenerateMutationOptions() {
  if (!_mutationChatState) return;
  if (_mutationChatState.loading) return;
  const { strategyId, missionTitle } = _mutationChatState;
  // 첫 가지: allowSameLayer = false (다른 차원 권유)
  // 그 이후 (이미 options 메시지 있으면): allowSameLayer = true (같은 차원 refine OK)
  const hasPrior = _mutationChatState.messages.some(m => m.role === 'options');
  await _generateMutationOptions(strategyId, missionTitle, { allowSameLayer: hasPrior });
}

function _renderMutationChat() {
  if (!_mutationChatState) return;
  const card = getStrategyCard(_mutationChatState.strategyId);
  if (!card) { closeMutationChat(false); return; }

  // overlay 없으면 생성
  let overlay = document.getElementById('mutationChatOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mutationChatOverlay';
    overlay.className = 'mutation-chat-overlay';
    overlay.innerHTML = `
      <div class="mutation-chat-modal" onclick="event.stopPropagation()">
        <div class="mutation-chat-header">
          <div style="flex:1;">
            <div class="mutation-chat-header-title">
              <span>🧬 돌연변이 — DNA 진화</span>
              <span id="mutationChatSelectedChip"></span>
            </div>
            <div class="mutation-chat-header-sub" id="mutationChatSubtitle"></div>
          </div>
          <button class="chat-mode-btn js-chat-mode-btn" onclick="toggleChatModel()" aria-label="대화 모델 전환" title="대화 모델 전환" style="margin-right:8px;"><img src="/godongicon.png" alt="" class="chat-mode-img"></button>
          <button class="mutation-chat-close" onclick="closeMutationChat(false)" aria-label="닫기">✕</button>
        </div>
        <div class="mutation-chat-area" id="mutationChatArea"></div>
        <div class="mutation-chat-footer" id="mutationChatFooter"></div>
      </div>
    `;
    overlay.onclick = (e) => { if (e.target === overlay) closeMutationChat(false); };
    document.body.appendChild(overlay);
    if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
  }
  // V4-fix v2: footer는 매번 재렌더 (confirm bar 분기)
  // 선택된 가지 — 모든 'options' 메시지 중 selectedRef 위치
  const sel = _mutationChatState.selectedRef;
  const selectedOpt = sel
    ? (_mutationChatState.messages[sel.msgIdx]?.options || [])[sel.optIdx]
    : null;
  const hasPriorOptions = _mutationChatState.messages.some(m => m.role === 'options');

  const footer = document.getElementById('mutationChatFooter');
  if (footer) {
    if (_mutationChatState.confirmStep && selectedOpt) {
      const layerName = _LAYER_NAME[selectedOpt.layer] || selectedOpt.layer;
      footer.innerHTML = `
        <div class="mutation-confirm-bar">
          <div class="mutation-confirm-text">"${escapeHtml(card.title)}" → ${escapeHtml(layerName)} 차원 새 가닥 등록.<br>
          이 대화 흐름 (${_mutationChatState.messages.length}개) 도 같이 보관할까?</div>
          <div class="mutation-confirm-actions">
            <button class="mutation-confirm-btn" onclick="_completeMutationFinish(false)">아니 결과만</button>
            <button class="mutation-confirm-btn primary" onclick="_completeMutationFinish(true)">응 같이 보관</button>
          </div>
        </div>
      `;
    } else {
      // 사용자 요청 2026-04-29: [🌱 가지 만들기] / [🔄 가지 다시 만들기] 버튼 — 입력 위 sticky
      const genBtnLabel = hasPriorOptions ? '🔄 가지 다시 만들기' : '🌱 가지 만들기';
      const genBtnTitle = hasPriorOptions
        ? '대화 반영해서 새 가지 4개 — 같은 차원 refine OK'
        : '대화 좀 풀고 가지 만들거나, 바로 만들어도 OK';
      footer.innerHTML = `
        <div class="mutation-gen-bar">
          <button class="mutation-gen-btn" onclick="triggerGenerateMutationOptions()" title="${genBtnTitle}" ${_mutationChatState.loading ? 'disabled' : ''}>
            ${genBtnLabel}
          </button>
        </div>
        <div class="mutation-chat-input-row">
          <textarea class="mutation-chat-input" id="mutationChatInput" placeholder="자유롭게 대화..." rows="1"></textarea>
          <button class="input-mic-btn" id="mutationMicBtn" onclick="_toggleInputSpeech('mutationChatInput', 'mutationMicBtn')" aria-label="음성 입력" title="음성 입력"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11Z"/></svg></button>
          <button class="mutation-chat-send" id="mutationChatSendBtn" onclick="sendMutationMessage()">↑</button>
          <!-- V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 돌연변이 깨달음 추출 ✓ button -->
          <button class="mutation-chat-extract" id="mutationChatExtractBtn" onclick="_extractMutationInsight({ trigger: 'manual' })" aria-label="여기서 깨달은 거 추출" title="여기서 깨달은 거 추출">✓</button>
        </div>
        <div class="mutation-chat-actions">
          <button class="mutation-chat-mission-btn" id="mutationFinishBtn" onclick="finishMutationChat()" ${!selectedOpt ? 'disabled' : ''}>✦ 이 가지로 해볼게</button>
        </div>
      `;
      const ta = document.getElementById('mutationChatInput');
      if (ta) {
        // 사용자 보고 2026-05-02: rAF coalesce — 매 keystroke sync reflow 차단.
        let _mutResizeRaf = 0;
        ta.addEventListener('input', () => {
          if (_mutResizeRaf) return;
          _mutResizeRaf = requestAnimationFrame(() => {
            _mutResizeRaf = 0;
            ta.style.height = 'auto';
            ta.style.height = Math.min(100, ta.scrollHeight) + 'px';
          });
        });
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMutationMessage(); }
        });
      }
    }
  }
  // subtitle: 가닥 제목
  const subEl = document.getElementById('mutationChatSubtitle');
  if (subEl) subEl.textContent = `"${card.title}"`;
  // 헤더 chip — 선택된 가지 표시 (선택 시만)
  const chipEl = document.getElementById('mutationChatSelectedChip');
  if (chipEl) {
    if (selectedOpt) {
      chipEl.innerHTML = `<span class="mutation-selected-chip" title="선택된 가지">${_LAYER_EMOJI[selectedOpt.layer] || '✦'} ${_LAYER_NAME[selectedOpt.layer] || selectedOpt.layer}</span>`;
    } else {
      chipEl.innerHTML = '';
    }
  }
  // 채팅 영역 — 메시지 시간순 (options 메시지 인라인 적용됨)
  const area = document.getElementById('mutationChatArea');
  if (area) {
    let html = '';
    _mutationChatState.messages.forEach((m, msgIdx) => {
      if (m.role === 'options') {
        // 가지 카드 4개 인라인
        const opts = m.options || [];
        html += `<div class="mutation-msg assistant" style="background:transparent; border:none; padding:0; max-width:100%;">
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">🌱 가지 ${opts.length}개</div>
          <div class="mutation-options-stack">
            ${opts.map((o, oi) => {
              const isSelected = sel && sel.msgIdx === msgIdx && sel.optIdx === oi;
              const otherSelected = sel && !isSelected;
              return `
                <button class="mutation-option-card${isSelected ? ' selected' : ''}${otherSelected ? ' dim' : ''}" onclick="selectMutationOption(${msgIdx}, ${oi})">
                  <div class="mutation-option-layer">${_LAYER_EMOJI[o.layer] || '✦'} ${_LAYER_NAME[o.layer] || o.layer}</div>
                  <div class="mutation-option-action">${escapeHtml(o.action)}</div>
                </button>
              `;
            }).join('')}
          </div>
        </div>`;
      } else if (m.role === 'assistant' && !m._placeholder) {
        // 사용자 보고 2026-05-01 ultrathink: '깨달음으로' 버튼 bubble 안 → bubble 밖 sibling 으로 분리 (메인 chat 패턴 일치, gold pill on dark bubble 시각 충돌 해소).
        const saved = !!m.savedAsInsight;
        html += `<div class="mutation-msg assistant">${escapeHtml(m.content)}</div>`;
        html += `<div class="mutation-msg-actions"><button class="mutation-insight-btn${saved ? ' saved' : ''}" onclick="saveMutationMsgAsInsight(${msgIdx})">${saved ? '✦ 저장됨' : '✦ 깨달음으로'}</button></div>`;
      } else {
        html += `<div class="mutation-msg ${m.role}">${escapeHtml(m.content)}</div>`;
      }
    });
    area.innerHTML = html;
    area.scrollTop = area.scrollHeight;
  }
}

async function selectMutationOption(msgIdx, optIdx) {
  if (!_mutationChatState) return;
  const optMsg = _mutationChatState.messages[msgIdx];
  if (!optMsg || optMsg.role !== 'options') return;
  const opt = (optMsg.options || [])[optIdx];
  if (!opt) return;
  // 같은 가지 다시 클릭 = 선택 해제 (toggle)
  const cur = _mutationChatState.selectedRef;
  if (cur && cur.msgIdx === msgIdx && cur.optIdx === optIdx) {
    _mutationChatState.selectedRef = null;
    _renderMutationChat();
    return;
  }
  _mutationChatState.selectedRef = { msgIdx, optIdx };
  _mutationChatState.chatRecord.selectedLayer = opt.layer;
  _mutationChatState.chatRecord.selectedAction = opt.action;
  _mutationChatState.messages.push({
    role: 'user',
    content: `${_LAYER_EMOJI[opt.layer] || '✦'} ${_LAYER_NAME[opt.layer] || opt.layer} — ${opt.action}`
  });
  // V4-fix v3 (사용자 요청): 선택 후 step by step 구체 안내
  _mutationChatState.messages.push({ role: 'assistant', content: '구체적인 단계 정리 중... ✦' , _placeholder: true });
  _renderMutationChat();

  const card = getStrategyCard(_mutationChatState.strategyId);
  const layerName = _LAYER_NAME[opt.layer] || opt.layer;
  let stepText = '';

  if (_canAI()) {
    try {
      const resp = await callAnthropic({
          _endpoint: 'mutation',
          // 사용자 요청 2026-04-30: 고른 후 정리 task → sonnet 4.6 적합.
          model: 'claude-sonnet-4-6', max_tokens: 400,
          messages: [{
            role: 'user',
            content: `사용자 가닥 "${card?.title || ''}" — 새 시도 차원: ${opt.layer} ${layerName}\n행동: "${opt.action}"\n\n[네 일]\n이 행동을 *오늘부터 바로 할 수 있도록* 구체적 step-by-step 3-5단계.\n각 단계: 짧고 명확하게 (한 줄 max 40자). 의지 부담↓ 환경 셋업 우선.\n\n[톤]\n진지 모드 친구. 외재화. "실패" 단어 X. 관찰 친화 (작은 단위).\n\n[출력 — 다른 거 X, 단계만]\n1. (첫 단계 — 가장 작게)\n2. ...\n3. ...\n\n도입 한 줄 + 단계 + 마무리 한 줄 ("시작 전에 더 얘기 X면 ✦ 해볼게로 등록").`
          }]
      });
      const data = await resp.json();
      stepText = data.content?.[0]?.text?.trim() || '';
    } catch (e) { console.warn('mutation step AI:', e); }
  }
  // fallback (AI 없거나 실패)
  if (!stepText) {
    const fb = {
      L3: `좋아. 환경 차원은 의지 부담 ↓↓ — 한 번 셋업하면 자동 발동.\n\n1. 그 행동이 자연스레 일어날 환경 1가지 정하기 (장소/도구/시간)\n2. 셋업 한 번 (5분 이내) — 예: 폰 차단, 알람 X, 도구 미리 펼침\n3. 다음 trigger가 왔을 때 그 환경에 그냥 들어가기\n4. 작동했는지 한 줄 기록\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L4: `좋아. 사회 차원은 의지 부담 ↓ — 다른 사람의 존재가 trigger.\n\n1. 믿을 사람 1명 정하기 (친구/동기/가족)\n2. 카톡 한 줄로 알리기 — "나 X 시도 중이야"\n3. 매주 1번 짧게 결과 공유 (긴 설명 X)\n4. 작동 안 해도 알리기 — 발견 자체가 가치\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L1: `좋아. 인지 차원은 의지 부담 높음 — 생각의 틀 자체를 바꿈.\n\n1. 이 패턴이 어디서 오는지 한 줄 적기 (왜 작동하지)\n2. 다른 해석 1개 시도 — "X = Y 아니라 Z일 수도"\n3. 그 해석으로 하루 살아보기\n4. 어떤 차이 있었는지 저녁에 한 줄\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L5: `좋아. 메타 차원은 의지 부담 ↓ — 큰 그림에서 다시 봄.\n\n1. 마법의 소라고동 또는 일기에 큰 질문 적용하기 — "이게 정말 네 길인지"\n2. 일주일 그 질문 안고 살기 (답 강요 X)\n3. 일주일 후 한 단락 쓰기\n4. 결론은 "지금은 모름"도 OK — 머무는 시간도 의미\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`,
      L2: `좋아. 행동 차원 — 알람/체크리스트로 trigger 만들기.\n\n1. 행동을 5분 이하로 쪼개기\n2. 알람 1개 설정 (실제 가능한 시간)\n3. 알람 울리면 그냥 시작 — 5분만\n4. 작동했는지 한 줄 기록\n\n시작 전에 더 얘기 X면 ✦ 해볼게로 등록.`
    };
    stepText = fb[opt.layer] || fb.L2;
  }

  // placeholder 제거 + 실제 응답 push
  _mutationChatState.messages = _mutationChatState.messages.filter(m => !m._placeholder);
  _mutationChatState.messages.push({ role: 'assistant', content: stepText });
  _renderMutationChat();
}

function sendMutationMessage() {
  if (!_mutationChatState) return;
  const ta = document.getElementById('mutationChatInput');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  _mutationChatState.messages.push({ role: 'user', content: text });
  ta.value = '';
  ta.style.height = 'auto';
  // AI 호출 — 간단 응답 (fallback 우선)
  if (!_canAI()) {
    _mutationChatState.messages.push({
      role: 'assistant',
      content: '응. 그 부분 같이 보자. 어떤 게 가장 망설여져?'
    });
    _renderMutationChat();
    return;
  }
  _renderMutationChat();
  // AI 호출 (백그라운드)
  (async () => {
    try {
      const card = getStrategyCard(_mutationChatState.strategyId);
      // 사용자 요청 2026-04-29: 임시 대화 전체 활용 + 진지 모드 + 사용자 본인 데이터 인용
      const allMsgs = _mutationChatState.messages
        .filter(m => m.role !== 'options' && !m._placeholder)
        .map(m => `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`).join('\n');
      // 사용자 본인 데이터 인용용
      const _topByConf = (arr, n) => (arr || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, n);
      const traits = _topByConf(state.traits, 5).map(t => `- ${t.name}${t.description ? ': ' + t.description : ''}`).join('\n');
      const patterns = _topByConf(state.patterns, 5).map(p => `- ${p.name}${p.trigger ? ' (트리거: ' + p.trigger + ')' : ''}`).join('\n');
      const values = _topByConf(state.values, 3).map(v => `- ${v.name}`).join('\n');
      const cf = state.caseFormulation;
      const cfLine = (cf && cf.version > 0)
        ? `통합분석 v.${cf.version}: 문제 ${(cf.problems||[]).slice(0,2).map(p => typeof p==='string'?p:p.text||'').join('; ').slice(0,150)}`
        : '';
      const activeDiag = (state.diagnoses || []).find(d => d.status === 'active' || d.status === 'shown');
      const diagLine = activeDiag && _DIAG_LABELS && _DIAG_LABELS[activeDiag.type]
        ? `관찰: ${_DIAG_LABELS[activeDiag.type].name} — ${activeDiag.evidence || ''}`
        : '';

      const resp = await callAnthropic({
          _endpoint: 'mutation',
          model: 'claude-sonnet-4-6', max_tokens: 350,
          messages: [{
            role: 'user',
            content: `너는 돌연변이 진화 임시 대화창 안 AI. "${card.title}" 가닥의 다음 시도를 사용자가 진지하게 고민 중.

[톤 — 진지 모드 (가벼운 ㅋㅋ / 농담 X)]
- 1-4문장. 차분한 친구. 외재화 ("X 패턴이 작동" / "이 도구 안 맞을 수도"). "실패" 단어 X.
- 사용자 페이스 따라가. 추궁성 질문 X.
- 사용자 메시지 짧아도 진지 톤 유지 (모드 sticky).
- 분석/제안 강요 X. 사용자가 자기 발견하도록.

[사용자 본인 데이터 — 우선 인용. generic textbook 단독 회피]
${traits ? '특성:\n' + traits : ''}
${patterns ? '\n패턴:\n' + patterns : ''}
${values ? '\n가치:\n' + values : ''}
${cfLine ? '\n' + cfLine : ''}
${diagLine ? '\n' + diagLine : ''}

[지금 대화 전체]
${allMsgs}

[네 응답만, 마크다운 X]`
          }]
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text?.trim() || '응. 더 얘기해봐.';
      if (_mutationChatState) {
        _mutationChatState.messages.push({ role: 'assistant', content: text });
        _renderMutationChat();
      }
    } catch (e) {
      if (_mutationChatState) {
        _mutationChatState.messages.push({ role: 'assistant', content: '응. 더 얘기해봐.' });
        _renderMutationChat();
      }
    }
  })();
}

// 사용자 요청 2026-04-28: ✦ 클릭 → 임시 대화창 닫고 → openStrategyMissionChat (어떤 상황? → 오늘의 제안 → 부름 등록)
async function finishMutationChat() {
  if (!_mutationChatState) return;
  const sel = _mutationChatState.selectedRef;
  if (!sel) return;
  const card = getStrategyCard(_mutationChatState.strategyId);
  if (!card) { closeMutationChat(false); return; }
  const optMsg = _mutationChatState.messages[sel.msgIdx];
  if (!optMsg || optMsg.role !== 'options') return;
  const opt = (optMsg.options || [])[sel.optIdx];
  if (!opt) return;
  // 사용자 명시 2026-05-01: first-gen 변환 — 토픽 카드 category 'strategy' 로 정식 promote (옵션 선택 후만).
  if (_mutationChatState.firstGen && card.category !== 'strategy') {
    card.category = 'strategy';
  }
  // chatRecord 자동 보관
  _mutationChatState.chatRecord.messages = _mutationChatState.messages.slice();
  _mutationChatState.chatRecord.kept = true;
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  card.evolutionChats.push(_mutationChatState.chatRecord);
  saveState();
  const strategyId = _mutationChatState.strategyId;
  const chatHistory = _mutationChatState.messages.slice();
  closeMutationChat(true);
  // 사용자 요청 2026-04-28: 돌연변이는 이미 대화로 맥락 충분 → '어떤 상황?' 모달 X. 바로 오늘의 제안 → 부름 등록
  await _completeMutationToMission(strategyId, opt, chatHistory);
}

// 돌연변이 직접 흐름 — 카드만 update (사용자 요청 2026-04-28: mission 자동 생성 X. ✦ 해볼게로 재사용)
async function _completeMutationToMission(strategyId, opt, chatHistory) {
  const card = getStrategyCard(strategyId);
  if (!card) return;
  const layerName = _LAYER_NAME[opt.layer] || opt.layer;
  showToast('🧬 카드 진화 중...');
  // 새 generation 추가 + 옛 카드 내용 snapshot
  mutateToNewGeneration(strategyId, opt.layer, opt.action);
  const refreshed = getStrategyCard(strategyId);
  if (refreshed) {
    // 임시 fallback (AI 호출 실패 대비)
    const fallbackTitle = opt.action.length > 40 ? opt.action.slice(0, 40) + '...' : opt.action;
    refreshed.title = fallbackTitle;
    refreshed.psychConcept = `${layerName} 차원 — ${opt.action.slice(0, 60)}`;
    refreshed.actionStrategy = opt.action;
    const lastGen = refreshed.generations[refreshed.generations.length - 1];
    if (lastGen) {
      lastGen.layerName = layerName;
    }
    // AI로 새 4 필드 재생성 (TITLE/PROBLEM/CONCEPT/ACTION) — 옛 가닥 맥락 + 새 차원 + 임시 대화 흐름 종합
    if (_canAI()) {
      try {
        const oldSnapshot = lastGen?.snapshot || refreshed.generations[refreshed.generations.length - 2]?.snapshot;
        const oldCtx = oldSnapshot
          ? `[옛 가닥] ${oldSnapshot.title}\n[옛 문제] ${oldSnapshot.problemContext}\n[옛 심리학] ${oldSnapshot.psychConcept}\n[옛 행동] ${oldSnapshot.actionStrategy}`
          : `[옛 가닥] ${refreshed.title}`;
        const recentMsgs = (chatHistory || []).slice(-6).map(m => `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`).join('\n');
        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: _anthropicHeaders(),
          body: JSON.stringify({
            _endpoint: 'mutation',
            // 사용자 요청 2026-04-30: 4 필드 정리 task → sonnet 4.6 적합.
            model: 'claude-sonnet-4-6', max_tokens: 500,
            messages: [{
              role: 'user',
              content: `진화한 새 가닥 — 카드 4 필드 정리.

${oldCtx}
[새 차원] ${layerName} (${opt.layer})
[새 행동] ${opt.action}
[돌연변이 대화]
${recentMsgs}

[네 일]
새 차원/행동 맞춰 진화한 카드의 4 필드 작성.

[출력 — 정확히 4줄]
TITLE: <짧은 제목, 5-14자>
PROBLEM: <문제 상황, 50-90자, 옛 가닥 안 통한 맥락 반영>
CONCEPT: <심리학 개념 + 1줄 설명, ${layerName} 차원 메커니즘, 30-80자>
ACTION: <전략적 행동, 50-120자, 구체적 무엇을 어떻게>

[금지] 마크다운, JSON, 따옴표, "실패" 단어, 추상적 다짐.`
            }]
          })
        });
        const aiData = await aiResp.json();
        const raw = (aiData.content?.[0]?.text || '').trim();
        const titleM = raw.match(/TITLE:\s*(.+)/);
        const probM = raw.match(/PROBLEM:\s*(.+)/);
        const conM = raw.match(/CONCEPT:\s*(.+)/);
        const actM = raw.match(/ACTION:\s*(.+)/);
        if (titleM) refreshed.title = titleM[1].trim().slice(0, 40);
        if (probM) refreshed.problemContext = probM[1].trim().slice(0, 200);
        if (conM) refreshed.psychConcept = conM[1].trim().slice(0, 200);
        if (actM) refreshed.actionStrategy = actM[1].trim().slice(0, 240);
      } catch (e) { console.warn('mutation AI 4-field:', e); }
    }
  }
  // V4 (v8 묶음 19-J): 진화된 카드 시각 효과 stash — .just-evolved 클래스 부여 (CSS 샤랄라)
  if (refreshed) {
    state._justEvolvedCardId = refreshed.id;
  }
  saveState({ force: true });
  // V4 (v8 묶음 19-G): 토스트 단축
  showToast('🧬 전략 카드 진화 완료');
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof showScreen === 'function') showScreen('archive');
  // V4 (v8 묶음 19-J): Core 3-B step 2 try_evolved_card — 진화 직후 ✦ 해볼게 안내 (첫 경험만)
  if (state.tutorialShown && !state.tutorialShown.core3b_try) {
    setTimeout(() => {
      if (state.tutorialShown.core3b_try) return;
      const idx = ONBOARDING_STEPS.findIndex(s => s && s.id === 'try_evolved_card');
      if (idx < 0) return;
      _onbStep = idx;
      _onbTutorialMode = true;
      window._onbTutorialMode = true;
      _activeCoreId = 'core3b';
      if (typeof onbRenderStep === 'function') onbRenderStep();
    }, 800);
  }
}

// V4 (사용자 명시 2026-05-04): 돌연변이 깨달음 추출 ✓ 적용 완료 (v7 §11 / v8 §11)
// - 기능 A ✓: mutation-chat-input-row ✓ button → _extractMutationInsight({ trigger: 'manual' }) → state.archive type='mutation'
// - 기능 B ✓: maybeRunDailyChapterExtract 안 _mutationChatState 활성 + messages>=5 면 자동 추출
// - 데이터 모델: state.archive type='mutation' (도서관 깨달음 카테고리 6번째 sub-category)
// - 시각 구분: .archive-type-mutation CSS + CATS array 'mutation' 항목
// V4-fix v2: 보관 여부 결정 후 실제 미션 생성
function _completeMutationFinish(keepHistory) {
  if (!_mutationChatState) return;
  const sel = _mutationChatState.selectedRef;
  if (!sel) return;
  const card = getStrategyCard(_mutationChatState.strategyId);
  if (!card) { closeMutationChat(false); return; }
  const optMsg = _mutationChatState.messages[sel.msgIdx];
  if (!optMsg || optMsg.role !== 'options') return;
  const opt = (optMsg.options || [])[sel.optIdx];
  if (!opt) return;

  // 사용자 명시 2026-05-01: first-gen 변환 — 토픽 카드 category promote (옵션 선택 후만)
  if (_mutationChatState.firstGen && card.category !== 'strategy') {
    card.category = 'strategy';
  }

  _mutationChatState.chatRecord.messages = keepHistory ? _mutationChatState.messages.slice() : [];
  _mutationChatState.chatRecord.kept = !!keepHistory;
  if (!Array.isArray(card.evolutionChats)) card.evolutionChats = [];
  card.evolutionChats.push(_mutationChatState.chatRecord);

  mutateToNewGeneration(_mutationChatState.strategyId, opt.layer, opt.action);
  const refreshed = getStrategyCard(_mutationChatState.strategyId);
  const newGenIdx = (refreshed?.generations?.length || 1) - 1;
  createMission(opt.action, `🧬 ${card.title} — ${_LAYER_NAME[opt.layer] || opt.layer} 차원 진화`, {
    strategyId: _mutationChatState.strategyId,
    generationIdx: newGenIdx,
    linkedStrategy: card.title
  });

  saveState({ force: true });
  showToast(`🧬 새 가닥 등록 — ${_LAYER_NAME[opt.layer] || opt.layer} 차원. ${keepHistory ? '대화도 보관됨.' : ''} 홈 → 부름.`);
  closeMutationChat(true);
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof showScreen === 'function') showScreen('home');
}

// V4 (사용자 명시 2026-05-04 — v7 §11 / v8 §11): 돌연변이 깨달음 추출 — saveMsgAsInsight 와 메커니즘 100% 동일.
// "돌연변이 임시대화창에서 좋은 말 나오면 저장" — 마지막 AI 메시지 1개 에서 지혜 추출 → state.archive type='mutation' push.
// trigger: 'manual' (사용자 ✓ click) 또는 'cutoff_auto' (4AM cutoff 진행 중 mutation chat 자동).
async function _extractMutationInsight(opts) {
  opts = opts || {};
  const trigger = opts.trigger || 'manual';
  const stateChat = opts.mutationChatState || _mutationChatState;
  if (!stateChat || !Array.isArray(stateChat.messages) || stateChat.messages.length < 1) {
    if (trigger === 'manual' && typeof showToast === 'function') showToast('대화가 짧아 추출할 게 없어');
    return null;
  }
  // saveMsgAsInsight 와 동일 — 마지막 AI 메시지 1개 + 직전 user 메시지 (맥락)
  const msgs = stateChat.messages || [];
  let lastAiIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i] && msgs[i].role === 'assistant' && msgs[i].content && !msgs[i].typing) {
      lastAiIdx = i; break;
    }
  }
  const lastAi = lastAiIdx >= 0 ? msgs[lastAiIdx] : null;
  if (!lastAi) {
    if (trigger === 'manual' && typeof showToast === 'function') showToast('AI 응답이 없어 추출 X');
    return null;
  }
  let priorUserMsg = null;
  for (let i = lastAiIdx - 1; i >= 0; i--) {
    if (msgs[i]?.role === 'user' && !msgs[i].typing) { priorUserMsg = msgs[i]; break; }
  }
  const userQuestion = priorUserMsg?.content || '';
  if (trigger === 'manual' && typeof showToast === 'function') showToast('🧬 깨달음 추출 중...');
  // V4 (사용자 보고 2026-05-04 정정): 4 핸들러 (메인 chat / 마법 helpChat / 숙고 chat / 돌연변이) 통합 헬퍼 summarizeForArchive 사용.
  // magic save (19135) / reflection save (21819) 와 100% 동일 메커니즘. saveMsgAsInsight 는 옛 자리 (직접 prompt 잔재).
  const summary = (typeof summarizeForArchive === 'function')
    ? await summarizeForArchive(lastAi.content, userQuestion)
    : null;
  const headline = (summary && summary.headline) ? summary.headline : '';
  const body = (summary && summary.body) ? summary.body : (lastAi.content || '').slice(0, 200);
  if (!body && !headline) {
    if (trigger === 'manual' && typeof showToast === 'function') showToast('추출할 내용이 없어');
    return null;
  }
  // saveMsgAsInsight 와 동일 객체 구조 (28953~) — type 만 'mutation' (시각 구분)
  state.archive = state.archive || [];
  const _dayKey = (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().split('T')[0];
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const insight = headline ? `${headline} — ${body}` : body;
  const ins = {
    date, insight, headline, body,
    original: lastAi.content,
    question: userQuestion,
    source: '돌연변이 대화',
    savedAt: new Date().toISOString(),
    type: 'mutation',
    tags: []
  };
  state.archive.unshift(ins);
  saveState();
  if (trigger === 'manual' && typeof showToast === 'function') {
    showToast('깨달음 도서관에 저장됐어 ✦');
  }
  if (typeof renderLensArchive === 'function') { try { renderLensArchive(); } catch {} }
  return ins;
}

function closeMutationChat(skipSave) {
  if (!skipSave && _mutationChatState) {
    // 사용자 명시 2026-05-01: first-gen + 옵션 선택 X 취소 = 토픽 그대로 (category 변경 X). evolutionChats 저장도 skip — 토픽 카드 깨끗하게.
    const isFirstGenCancel = _mutationChatState.firstGen && !_mutationChatState.selectedRef;
    // 저장 X로 닫음 — chatRecord에 messages 비움 (선택 X 케이스)
    const card = getStrategyCard(_mutationChatState.strategyId);
    if (!isFirstGenCancel && card && _mutationChatState.chatRecord && !_mutationChatState.selectedRef) {
      // 사용자 요청 2026-04-29: 가지 선택 X여도 대화 messages 보존 (깊이 있는 내용 가능). kept=false 마킹만.
      _mutationChatState.chatRecord.kept = false;
      _mutationChatState.chatRecord.messages = (_mutationChatState.messages || [])
        .map(m => ({ role: m.role, content: m.content }));
      card.evolutionChats.push(_mutationChatState.chatRecord);
      saveState();
    }
  }
  _mutationChatState = null;
  const overlay = document.getElementById('mutationChatOverlay');
  if (overlay) overlay.remove();
}

// V4-1d-4: DNA 진주 결정화 의식.
// V4 비전 6.4 + 5.7 + 5.8: worked 5회 도달 시 confirm → 결정화 의식 모달 (1회) → DNA 진주 생성.
// 데이터 모델 (14.1): state.pearls에 type:'dna_pearl', strategyId, embodimentPath, shellsUsed.
async function promptCrystallize(card) {
  if (!card || card.embodimentStatus === 'embodied') return;
  // 한 카드 기준 한 번만 prompt (재기 가드)
  if (card._crystallizePromptShown) return;
  card._crystallizePromptShown = true;
  saveState();

  const path = determineEmbodimentPath(card);
  const totalAttempts = countTotalAttempts(card);
  const totalGens = (card.generations || []).length;
  const workedCount = countWorkedAttempts(card);

  const yes = await showConfirmModal({
    title: '🧬 DNA 진주로 결정화할까?',
    message: `"${card.title}" 가닥이 ${workedCount}번 작동했어.\n\n결정화하면 너의 일부 — 진주로 남아.\n한 번뿐인 의식이야.`,
    okLabel: '응 결정화',
    cancelLabel: '아직'
  });
  if (!yes) {
    // 사용자가 거절했으면 다음 worked attempt 시 다시 prompt 가능하도록 flag 해제
    card._crystallizePromptShown = false;
    saveState();
    return;
  }

  card.embodimentStatus = 'embodied';
  card.embodimentPath = path;
  card.crystallizedAt = new Date().toISOString();

  // 이 가닥이 받은 모든 shellId 누적
  const shellsUsed = [];
  (card.generations || []).forEach(g => {
    if (Array.isArray(g.shells)) shellsUsed.push(...g.shells);
  });

  const dnaPearl = {
    id: 'dpearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type: 'dna_pearl',
    content: card.title,
    category: 'DNA',
    strategyId: card.id,
    embodimentPath: path,
    shellsUsed,
    totalAttempts,
    totalGens,
    workedCount,
    createdAt: card.crystallizedAt
  };
  if (!Array.isArray(state.pearls)) state.pearls = [];
  state.pearls.push(dnaPearl);
  saveState();

  // V4 (v8 묶음 19-F): _lastCrystallizedCardTitle stash — Core 4 crystallize_complete step body 동적 주입용
  window._lastCrystallizedCardTitle = card.title;
  showCrystallizeRitualModal(card, dnaPearl);
}

function showCrystallizeRitualModal(card, dnaPearl) {
  const path = dnaPearl.embodimentPath;
  // 5.8 톤 (path별)
  // 사용자 요청 2026-04-28: 3종 라벨 통일 — 빠른 발견 / 성장의 길 / 진화한 길
  const ritualMessages = {
    'one-shot': {
      emoji: '🌱',
      label: '빠른 발견',
      msg: `한 차원에서 바로 통했어. 너 자신을 잘 알아서 빠르게 길 찾은 거야.\n\n이제 너의 일부 — 진주가 그 증거.\n\n너만의 진주.`
    },
    'quick-discovery': {
      emoji: '🌳',
      label: '성장의 길',
      msg: `${dnaPearl.totalAttempts}번 반복 시도로 한 차원에서 끝까지 성장했어.\n\n천천히 도달한 곳, 너만의 진주.`
    },
    'evolved': {
      emoji: '🧬',
      label: '진화한 길',
      msg: `${dnaPearl.totalAttempts}번 시도, ${Math.max(0, dnaPearl.totalGens - 1)}번 진화, 결국 너에게 맞는 모양 됨.\n\n여러 차원 거쳐 도착한 곳, 너만의 진주.`
    }
  };
  const m = ritualMessages[path] || ritualMessages['one-shot'];

  // 결정 다면체 외곽 색 (path별 — 사용자 요청 2026-04-28 색상 다양화)
  const outerColor = {
    'one-shot':        '#8fc88f',  // 빠른 발견 — 새싹 초록
    'quick-discovery': '#ffd93d',  // 성장의 길 — 황금
    'evolved':         'url(#crystallize-rainbow)'  // 진화한 길 — 무지개
  }[path] || '#ffd700';
  const safeOuter = (typeof outerColor === 'string' && outerColor.startsWith('#')) ? outerColor : '#ffd700';

  // V4-fix v2: 결정화 모달 — faceted gem (8 삼각 면 + 다층 glow + sparkle)
  // 8각형 꼭짓점
  const RV = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 360 - 90;
    const r = 88;
    RV.push({ x: 100 + r * Math.cos(a * Math.PI / 180), y: 100 + r * Math.sin(a * Math.PI / 180) });
  }
  // 8 삼각 facet
  const ritualFacets = RV.map((v, i) => {
    const next = RV[(i + 1) % 8];
    return {
      points: `100,100 ${v.x.toFixed(1)},${v.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`,
      gradId: `cryst-facet-${i}-${dnaPearl.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
    };
  });
  const polyRitual = RV.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
  // 사용자 요청 2026-04-28: 점 → 매핑된 소라 아이콘 (gens.shells 또는 shellsUsed)
  const shellList = (state.shellCollection || []);
  // 카드의 모든 generation에서 사용된 shell IDs 모으기 (DNA 적용된 소라들)
  let collectedShellIds = (dnaPearl.shellsUsed || []).slice();
  if (collectedShellIds.length === 0 && card && Array.isArray(card.generations)) {
    card.generations.forEach(g => {
      if (Array.isArray(g.shells)) collectedShellIds.push(...g.shells);
    });
    // attempts에서 shellId도 모음 (record로 적용된 거)
    card.generations.forEach(g => {
      (g.attempts || []).forEach(a => {
        if (a.shellId && !collectedShellIds.includes(a.shellId)) collectedShellIds.push(a.shellId);
      });
    });
  }
  // 시드/튜토리얼 데모 fallback 소라 emoji
  const demoShellEmojis = ['⭐','🌟','✨','💫','🌙','💎','🪐','🦄'];
  const tierColors = { legend: '#ffd93d', call: '#d4a76a', golden: '#e8c170', main: '#7ec8e3', daily: '#a89dc8', light: '#b39ddb' };
  // 8개 슬롯: 매핑된 shell이 있으면 그 emoji, 없으면 demo emoji
  const ritualShells = [];
  for (let i = 0; i < 8; i++) {
    const sid = collectedShellIds[i];
    const matched = sid ? shellList.find(x => x._id === sid) : null;
    if (matched) {
      ritualShells.push({ emoji: matched.type, color: tierColors[matched.tier] || '#a89dc8' });
    } else {
      ritualShells.push({ emoji: demoShellEmojis[i % demoShellEmojis.length], color: '#ffd93d' });
    }
  }
  const dotColors = ritualShells.map(s => s.color);
  // 외곽 헬릭스 — 소라 emoji 텍스트 (각 다른 위치 + pulse glow)
  const outerDotsRitual = ritualShells.map((s, i) => {
    const angle = (i / 8) * 360 - 90;
    const cx = 100 + 76 * Math.cos(angle * Math.PI / 180);
    const cy = 100 + 76 * Math.sin(angle * Math.PI / 180);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="${s.color}" opacity="0.20" filter="url(#cryst-bigglow)"/>
      <text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle" font-size="16" style="filter:drop-shadow(0 0 4px ${s.color});">${s.emoji}
      <animateTransform attributeName="transform" type="scale" values="1;1.2;1" dur="${2 + (i % 3) * 0.5}s" additive="sum" repeatCount="indefinite"/>
      </text>`;
  }).join('');
  // 안쪽 헬릭스 (역회전, 색 다양화)
  const innerColors = [dotColors[0], dotColors[2], dotColors[4], dotColors[6], dotColors[1], dotColors[3]];
  const innerDotsRitual = [0,1,2,3,4,5].map(n => {
    const a = (n / 6) * 360 + 30;
    const x = 100 + 32 * Math.cos(a * Math.PI / 180);
    const y = 100 + 32 * Math.sin(a * Math.PI / 180);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${innerColors[n] || safeOuter}" opacity="0.92"/>`;
  }).join('');
  // V4-fix v3 (사용자 보고): 진짜 DNA 헬릭스 — 결정 안에 이중 나선 (sine 반대) + 다채로운 사다리(rungs)
  const helixYStart = 32;
  const helixYEnd = 168;
  const helixHeight = helixYEnd - helixYStart;
  const helixSteps = 28;
  const helixWaves = 2.2;
  const helixAmp = 16;
  const helixPath1 = [];
  const helixPath2 = [];
  const helixRungs = [];
  for (let s = 0; s <= helixSteps; s++) {
    const t = s / helixSteps;
    const y = helixYStart + t * helixHeight;
    const phase = t * helixWaves * Math.PI * 2;
    const x1 = 100 + Math.sin(phase) * helixAmp;
    const x2 = 100 + Math.sin(phase + Math.PI) * helixAmp;
    helixPath1.push(`${s === 0 ? 'M' : 'L'}${x1.toFixed(1)},${y.toFixed(1)}`);
    helixPath2.push(`${s === 0 ? 'M' : 'L'}${x2.toFixed(1)},${y.toFixed(1)}`);
    if (s % 3 === 0 && s > 0 && s < helixSteps) {
      const rungColor = fallbackPalette[s % fallbackPalette.length];
      helixRungs.push(`<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${rungColor}" stroke-width="1.4" opacity="0.7" stroke-linecap="round"/>`);
    }
  }
  const helixHtml = `
    <g class="cryst-helix-flow" opacity="0.88">
      <path d="${helixPath1.join(' ')}" fill="none" stroke="${safeOuter}" stroke-width="1.6" stroke-opacity="0.85" stroke-linecap="round"/>
      <path d="${helixPath2.join(' ')}" fill="none" stroke="${fallbackPalette[2]}" stroke-width="1.6" stroke-opacity="0.85" stroke-linecap="round"/>
      ${helixRungs.join('')}
    </g>
  `;
  // sparkles ✦
  const sparklesRitual = [
    { x: 28, y: 48, d: 0 }, { x: 172, y: 56, d: 0.5 }, { x: 48, y: 162, d: 1.0 },
    { x: 168, y: 160, d: 1.6 }, { x: 100, y: 22, d: 2.2 }, { x: 18, y: 110, d: 0.3 },
    { x: 182, y: 110, d: 1.2 }, { x: 100, y: 178, d: 1.9 }
  ].map(s => `<text x="${s.x}" y="${s.y}" class="dna-sparkle" style="animation-delay:${s.d}s" text-anchor="middle" font-size="16">✦</text>`).join('');
  // facet gradients
  const facetGradDefsRitual = ritualFacets.map((f, i) => {
    const o1 = (0.6 - (i % 4) * 0.1).toFixed(2);
    const o2 = (0.18 - (i % 4) * 0.04).toFixed(2);
    return `<linearGradient id="${f.gradId}" x1="0%" y1="0%" x2="100%" y2="${100 + (i % 3) * 30}%">
      <stop offset="0%" stop-color="${safeOuter}" stop-opacity="${o1}"/>
      <stop offset="100%" stop-color="${safeOuter}" stop-opacity="${o2}"/>
    </linearGradient>`;
  }).join('');

  const html = `
    <div class="crystallize-ritual-overlay" id="crystallizeRitual">
      <div class="crystallize-ritual-modal">
        <div class="crystallize-emoji">${m.emoji}</div>
        <div class="crystallize-svg-wrap dna-pearl-stage">
          <svg viewBox="0 0 200 200" width="240" height="240" aria-hidden="true">
            <defs>
              <linearGradient id="crystallize-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stop-color="#ff6b6b"/>
                <stop offset="33%"  stop-color="#ffd93d"/>
                <stop offset="66%"  stop-color="#5fcfba"/>
                <stop offset="100%" stop-color="#8b7ec4"/>
              </linearGradient>
              <radialGradient id="cryst-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="${safeOuter}" stop-opacity="0.6"/>
                <stop offset="60%" stop-color="${safeOuter}" stop-opacity="0.18"/>
                <stop offset="100%" stop-color="${safeOuter}" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="cryst-halo" cx="50%" cy="50%" r="50%">
                <stop offset="60%" stop-color="${safeOuter}" stop-opacity="0"/>
                <stop offset="80%" stop-color="${safeOuter}" stop-opacity="0.32"/>
                <stop offset="100%" stop-color="${safeOuter}" stop-opacity="0"/>
              </radialGradient>
              <filter id="cryst-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="cryst-bigglow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="7" result="b"/>
                <feMerge><feMergeNode in="b"/></feMerge>
              </filter>
              ${facetGradDefsRitual}
            </defs>
            <!-- 외곽 halo -->
            <circle cx="100" cy="100" r="98" fill="url(#cryst-halo)"/>
            <!-- 외곽 회전 ring -->
            <g class="dna-pearl-ring">
              <circle cx="100" cy="100" r="92" fill="none" stroke="${safeOuter}" stroke-width="0.9" stroke-opacity="0.6" stroke-dasharray="3 6"/>
              <circle cx="100" cy="100" r="86" fill="none" stroke="${safeOuter}" stroke-width="0.5" stroke-opacity="0.4" stroke-dasharray="1 5"/>
            </g>
            <!-- 내부 core glow -->
            <circle cx="100" cy="100" r="80" fill="url(#cryst-core)"/>
            <!-- 결정 본체 — 8 facet (회전) -->
            <g class="dna-pearl-spin">
              ${ritualFacets.map(f => `<polygon points="${f.points}" fill="url(#${f.gradId})" stroke="${safeOuter}" stroke-width="0.5" stroke-opacity="0.5"/>`).join('')}
              <polygon points="${polyRitual}" fill="none" stroke="${outerColor}" stroke-width="2.5" filter="url(#cryst-glow)"/>
              <polygon points="${polyRitual}" fill="none" stroke="${safeOuter}" stroke-width="0.6" stroke-opacity="0.95"/>
              <polygon points="${RV.map(v => `${(100 + (v.x - 100) * 0.45).toFixed(1)},${(100 + (v.y - 100) * 0.45).toFixed(1)}`).join(' ')}"
                       fill="none" stroke="${safeOuter}" stroke-width="0.5" stroke-opacity="0.55"/>
            </g>
            <!-- V4-fix: 진짜 DNA 헬릭스 (이중 나선 + 다채로운 사다리) — 결정 안 가운데 -->
            ${helixHtml}
            <!-- 안쪽 헬릭스 (역회전) -->
            <g class="dna-pearl-inner-spin">${innerDotsRitual}</g>
            <!-- 외곽 헬릭스 점 (반시계 회전 — 사용자 요청) -->
            <g class="dna-pearl-outer-spin">${outerDotsRitual}</g>
            <!-- 중심 빛 -->
            <circle cx="100" cy="100" r="4.2" fill="${safeOuter}" opacity="1"/>
            <circle cx="100" cy="100" r="7" fill="${safeOuter}" opacity="0.42" filter="url(#cryst-bigglow)"/>
            <!-- sparkles -->
            <g fill="${safeOuter}" opacity="0.9">${sparklesRitual}</g>
          </svg>
        </div>
        <div class="crystallize-label">${m.label}</div>
        <div class="crystallize-title">${escapeHtml(card.title)}</div>
        <div class="crystallize-msg">${escapeHtml(m.msg)}</div>
        <button class="crystallize-accept-btn" onclick="closeCrystallizeRitual()">받아들여 ✦</button>
      </div>
    </div>
  `;

  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  document.body.appendChild(wrap.firstElementChild);
}

function closeCrystallizeRitual() {
  const el = document.getElementById('crystallizeRitual');
  if (el) el.remove();
  if (typeof renderShellBar === 'function') renderShellBar();
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof renderTodayMission === 'function') renderTodayMission();
  // V4 (v8 묶음 19-E): Core 4 첫 결정화 hook — crystallize_complete step 자동 진입 (한 번만)
  if (state.tutorialShown && !state.tutorialShown.core4 && typeof startCore4 === 'function') {
    setTimeout(() => startCore4(), 500);
  }
}

// V4 (v8 묶음 19-E): startCore4 — 첫 결정화 의식 직후 안내 (1 step)
function startCore4() {
  if (state.tutorialShown && state.tutorialShown.core4) return;
  const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'crystallize_complete') : -1;
  if (idx < 0) { console.warn('[startCore4] crystallize_complete step missing'); return; }
  _onbStep = idx;
  _onbTutorialMode = true;
  window._onbTutorialMode = true;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core4_pearl';
  if (typeof onbRenderStep === 'function') onbRenderStep();
}

// ═══════════════════════════════════════════════════════════════
// V4-1o: CASE FORMULATION 관찰 5종 (anchor 17 / V4 비전 9.5)
// ───────────────────────────────────────────────────────────────
// 5종: 도구 약함 / 차원 안 맞음 / 가치 상충 / 회피 패턴 / 의지 임계치 X
// 노출 위치 (B): 채팅 자연 인용만 (양생방 라벨 X / 나 탭 별도 섹션 X). 한 진단당 1회.
// 거울 3원칙 (9.6): 외재화 톤 / 균형 노출 / 사용자 자기 발견.
// 자기 학습 루프: 관찰 받고 행동 → 결과로 confidence 갱신 (V4-1o-2 이후).
// ═══════════════════════════════════════════════════════════════

const _DIAG_LABELS = {
  weak_tool:    { name: '도구 약함',     emoji: '🔧' },
  wrong_layer:  { name: '차원 안 맞음',   emoji: '📐' },
  value_clash:  { name: '가치 상충',     emoji: '⚖️' },
  avoidance:    { name: '회피 패턴',     emoji: '🌫' },
  willpower_cap:{ name: '의지 임계치',   emoji: '🪫' }
};

// ═══════════════════════════════════════════════════════════════
// CRISIS DETECTION & CAROUSEL (V4 사용자 명시 2026-05-01)
// 자살예방법 §15-6 + 제조물책임법 안전 의무 보호 layer.
// 자살/자해 신호 감지 시 강제 carousel (1393/1577-0199/119) — skip X.
// 일일 1회 cap (학습 차단). internal _crisisLog 기록 (분쟁 증거).
// ═══════════════════════════════════════════════════════════════

// 보수적 키워드 list — false positive OK / false negative X
const _CRISIS_KEYWORDS = [
  '죽고 싶', '죽어버리', '죽었으면', '사라지고 싶', '사라져버리',
  '더 이상 못 살', '더 못 살', '끝내고 싶', '끝내버리', '혼자 끝내',
  '뛰어내리', '없어지고 싶', '없어져버리', '자해', '자살',
  '살기 싫', '살고 싶지 않', '살아갈 의미'
];

function _detectCrisisSignal(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  return _CRISIS_KEYWORDS.some(k => t.includes(k));
}

function _checkCrisisPattern() {
  // 일주일 mood 1-2/5 가 5일+ 연속이면 패턴 trigger
  const entries = (state.entries || []).slice(-7);
  if (entries.length < 5) return false;
  const lowMood = entries.filter(e => e.mood && e.mood <= 2).length;
  return lowMood >= 5;
}

function showCrisisCarousel(triggerKind, opts) {
  opts = opts || {};
  const isPreview = !!opts.preview;

  // 사용자 보고 2026-05-01 긴급: 튜토리얼 / testerMode 중에는 trigger X (onboarding 흐름 disrupt 회피).
  // 단 isPreview = 개발자 도구 강제 미리보기 — 모든 가드 무시.
  if (!isPreview) {
    if (window._onbTutorialMode) return;
    if (state.preferences && state.preferences.testerMode) return;
    // 일일 cap (학습 차단)
    if (!state.preferences) state.preferences = {};
    const today = (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0, 10);
    if (state.preferences._lastCrisisCarouselAt === today) return;
    state.preferences._lastCrisisCarouselAt = today;
    // internal log (분쟁 시 안전 의무 충족 증거 — E2EE 라 회사 read X, 사용자 본인이 복호화 가능)
    if (!Array.isArray(state.preferences._crisisLog)) state.preferences._crisisLog = [];
    state.preferences._crisisLog.push({ at: new Date().toISOString(), trigger: triggerKind || 'auto' });
    // 사용자 보고 2026-05-01: log 무제한 증가 차단 — 최근 100개만 보관
    if (state.preferences._crisisLog.length > 100) {
      state.preferences._crisisLog = state.preferences._crisisLog.slice(-100);
    }
    try { saveState({ force: true }); } catch (e) { console.warn('[crisisCarousel] saveState:', e); }
    if (typeof saveToCloudNow === 'function') saveToCloudNow().catch(e => console.warn('[crisisCarousel] cloud:', e));
  }

  // 이미 떠있으면 중복 X
  if (document.getElementById('crisisCarousel')) return;

  const overlay = document.createElement('div');
  overlay.id = 'crisisCarousel';
  overlay.className = 'crisis-carousel-overlay';
  // overlay click 무시 (skip 차단). 닫기 버튼만 동작.
  overlay.addEventListener('click', (e) => { e.stopPropagation(); });
  overlay.innerHTML = `
    <div class="crisis-carousel-modal" onclick="event.stopPropagation()">
      <img src="/godongicon.png" class="crisis-carousel-godong" alt="">
      <div class="crisis-carousel-head">잠깐 — 너 괜찮아?${isPreview ? ' <span style="font-size:11px; opacity:0.55; font-weight:400; letter-spacing:0.04em;">(미리보기)</span>' : ''}</div>
      <div class="crisis-carousel-body">
        요즘 좀 무거워 보여서 한 번 묻고 싶었어.<br>
        지금 진짜 힘들면 <b>전문가</b> 만나봐 진심으로.<br>
        나는 도구일 뿐이야.
      </div>
      <div class="crisis-carousel-resources">
        <a href="tel:1393" class="crisis-carousel-link"><span class="cc-icon">☎</span><span><b>1393</b> 자살예방상담<br><span class="cc-sub">24시간 무료</span></span></a>
        <a href="tel:1577-0199" class="crisis-carousel-link"><span class="cc-icon">☎</span><span><b>1577-0199</b> 정신건강위기상담</span></a>
        <a href="tel:119" class="crisis-carousel-link"><span class="cc-icon">☎</span><span><b>119</b> 응급</span></a>
      </div>
      <button class="crisis-carousel-close" onclick="closeCrisisCarousel()">알겠어, 닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeCrisisCarousel() {
  const m = document.getElementById('crisisCarousel');
  if (m) m.remove();
}

// 사용자 명시 2026-05-01: 개발자 도구 미리보기 — 일일 cap / log / testerMode 가드 무시. 표시만.
function devPreviewCrisisCarousel() {
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    if (typeof showToast === 'function') showToast('관리자만');
    return;
  }
  showCrisisCarousel('dev_preview', { preview: true });
}

// 9.5 임계값 기반 신호 검사. 한 가닥 또는 전체 state 검사.
function detectDiagnoses() {
  const detected = [];
  const cards = (state.topicCards || []).filter(c => c.category === 'strategy');
  if (cards.length === 0) return detected;

  // (1) 도구 약함: 한 가닥 같은 layer attempt 3+ / worked 0
  cards.forEach(card => {
    if (!Array.isArray(card.generations)) return;
    card.generations.forEach(gen => {
      const attempts = gen.attempts || [];
      if (attempts.length < 3) return;
      const worked = attempts.filter(a => a.status === 'worked').length;
      if (worked === 0) {
        detected.push({
          type: 'weak_tool',
          confidence: 0.7,
          evidence: `"${card.title}" — ${gen.layer} 차원 ${attempts.length}회 시도, 작동 0`,
          targetCardId: card.id
        });
      }
    });
  });

  // (2) 차원 안 맞음: 한 layer 3+ didnt + 같은 카드 다른 layer 시도 X
  cards.forEach(card => {
    if (!Array.isArray(card.generations)) return;
    const usedLayers = new Set();
    let weakLayer = null;
    let weakDidntCount = 0;
    card.generations.forEach(gen => {
      usedLayers.add(gen.layer);
      const didnt = (gen.attempts || []).filter(a => a.status === 'didnt').length;
      if (didnt >= 3 && !weakLayer) {
        weakLayer = gen.layer;
        weakDidntCount = didnt;
      }
    });
    if (weakLayer && usedLayers.size === 1) {
      detected.push({
        type: 'wrong_layer',
        confidence: 0.7,
        evidence: `"${card.title}" — ${weakLayer} 차원만 ${weakDidntCount}회 안 통함. 다른 차원 시도 X.`,
        targetCardId: card.id
      });
    }
  });

  // (3) 가치 상충: 여러 가닥(2+)에서 모든 attempt didnt + values N개+
  const totalCardsWithAllDidnt = cards.filter(card => {
    const allAttempts = (card.generations || []).flatMap(g => g.attempts || []);
    if (allAttempts.length < 2) return false;
    return allAttempts.every(a => a.status === 'didnt' || a.status === 'meh');
  });
  if (totalCardsWithAllDidnt.length >= 2 && (state.values || []).length >= 2) {
    detected.push({
      type: 'value_clash',
      confidence: 0.6,
      evidence: `${totalCardsWithAllDidnt.length}개 가닥에서 모든 시도 안 통함 — 가치 상충 가능성`
    });
  }

  // (4) 회피 패턴: seedling > 30일 OR skipped > 50%
  const now = Date.now();
  cards.forEach(card => {
    if (card.embodimentStatus === 'seedling' && card.createdAt) {
      const days = Math.floor((now - new Date(card.createdAt).getTime()) / 86400000);
      if (days >= 30) {
        detected.push({
          type: 'avoidance',
          confidence: 0.55,
          evidence: `"${card.title}" — ${days}일째 미시도 (seedling)`,
          targetCardId: card.id
        });
      }
    }
    const allAttempts = (card.generations || []).flatMap(g => g.attempts || []);
    if (allAttempts.length >= 4) {
      const skipped = allAttempts.filter(a => a.status === 'skipped').length;
      if (skipped / allAttempts.length > 0.5) {
        detected.push({
          type: 'avoidance',
          confidence: 0.65,
          evidence: `"${card.title}" — ${allAttempts.length}회 중 ${skipped}회 못 시도 (50%+)`,
          targetCardId: card.id
        });
      }
    }
  });

  // (5) 의지 임계치 X: drained 모드 30일+ + strategy 신규 X
  // (drained 모드는 V3.11.x: state.modes.rest? 아니면 별도 — 단순화: rest 모드 활성 30일+)
  const restSince = state.modeActiveSince?.rest;
  if (restSince) {
    const days = Math.floor((now - new Date(restSince).getTime()) / 86400000);
    if (days >= 30) {
      // 신규 strategy 30일 내 X
      const recentNewStrategy = cards.some(c => {
        if (!c.createdAt) return false;
        const cdays = Math.floor((now - new Date(c.createdAt).getTime()) / 86400000);
        return cdays < 30;
      });
      if (!recentNewStrategy) {
        detected.push({
          type: 'willpower_cap',
          confidence: 0.6,
          evidence: `${days}일째 휴식 모드 + 신규 가닥 X`
        });
      }
    }
  }

  return detected;
}

// 진단 결과를 state.diagnoses에 등록 (한 진단당 1회 가드).
// type별로 detectedAt 30일 이내 같은 type 있으면 skip.
function registerDiagnoses(detected) {
  if (!Array.isArray(state.diagnoses)) state.diagnoses = [];
  const now = Date.now();
  // 사용자 명시 2026-05-01 (agent audit): cooldown 분기 — 일반 30일 / dismissed 진단 180일.
  // dismissed 된 진단 type 이 같은 카드에서 30일 후 재감지되며 반복 dismiss 사이클 자리 차단.
  const cooldownActive = 30 * 86400000;
  const cooldownDismissed = 180 * 86400000;
  let added = 0;
  detected.forEach(d => {
    const recentSame = state.diagnoses.find(x => {
      if (x.type !== d.type || x.targetCardId !== d.targetCardId) return false;
      if (!x.detectedAt) return false;
      const elapsed = now - new Date(x.detectedAt).getTime();
      const cool = (x.status === 'dismissed') ? cooldownDismissed : cooldownActive;
      return elapsed < cool;
    });
    if (recentSame) return;
    state.diagnoses.push({
      id: 'diag_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: d.type,
      confidence: d.confidence,
      evidence: d.evidence,
      targetCardId: d.targetCardId || null,
      detectedAt: new Date().toISOString(),
      status: 'active'
    });
    added++;
  });
  if (added > 0) saveState();
  return added;
}

// 자동 trigger: 홈 진입 시 또는 init 후 1회. 조용히 등록 (UI 표시 X — chat 자연 인용용).
function runDiagnosesIfNeeded() {
  // 마지막 실행 24시간 이내면 skip (state.preferences._diagLastRunAt)
  if (!state.preferences) state.preferences = {};
  const last = state.preferences._diagLastRunAt;
  if (last && (Date.now() - new Date(last).getTime()) < 24 * 3600000) return;
  const detected = detectDiagnoses();
  registerDiagnoses(detected);
  state.preferences._diagLastRunAt = new Date().toISOString();
  saveState();
}

// active 진단 1개 가져오기 (chat system prompt inject용)
function getActiveDiagnosis() {
  return (state.diagnoses || []).find(d => d.status === 'active') || null;
}

// 진단을 chat에 인용한 후 status='shown' 마킹 (재기 가드)
function markDiagnosisShown(id) {
  const d = (state.diagnoses || []).find(x => x.id === id);
  if (d) {
    d.status = 'shown';
    saveState();
  }
}

// V4-1e: 양생 미션 흐름 — strategy 카드 "✦ 해볼게" → 임시 대화 → 오늘의 제안 → 부름.
// 사용자 요청 2026-04-28: 해볼게 누르면 임시 대화창 → "어떤 상황이야?" → AI 오늘의 제안 → 부름 등록
async function callTryStrategy(strategyId) {
  const card = getStrategyCard(strategyId);
  if (!card) return;

  // 사용자 요청 2026-04-30: 같은 strategy로 여러 미션 OK (내용 다르면).
  // strategyId 기반 blanket 차단 제거. 동일 title 중복은 createMission 직전에 체크 (createMission 안에).

  if (card.embodimentStatus === 'embodied') {
    showToast('이미 체화된 가닥이야 ✨');
    return;
  }

  // V4 (v8 묶음 19-I): just-evolved 클래스 청소 — 사용자가 ✦ 해볼게 클릭 = 진화 안내 끝
  if (state._justEvolvedCardId === strategyId) {
    state._justEvolvedCardId = null;
    saveState();
    if (typeof renderArchive === 'function') renderArchive();
  }

  await openStrategyMissionChat(strategyId, null);
}

// 임시 대화 흐름 — 양생방 ✦ 해볼게 / 돌연변이 ✦ 이 차원으로 해볼게 둘 다 사용
async function openStrategyMissionChat(strategyId, mutationOpt) {
  const card = getStrategyCard(strategyId);
  if (!card) return;

  const isMutation = !!mutationOpt;
  const layerName = isMutation ? (_LAYER_NAME[mutationOpt.layer] || mutationOpt.layer) : '';
  const introMsg = isMutation
    ? `"${card.title}" → ${layerName} 차원 진화 시작.\n어떤 상황이야? 오늘 시도하려는 거 짧게 알려줘.\n그 맥락에 맞춰 '오늘의 제안' 만들어줄게.`
    : `"${card.title}" — 다시 시도해보자!\n어떤 상황이야? 오늘 하려는 거 짧게 알려줘.\n그 맥락에 맞춰 '오늘의 제안' 만들어줄게.`;

  // 사용자 요청 2026-04-28: 튜토리얼/테스터 모드 시 예시 자동 입력
  const _isAuto = !!(window._onbTutorialMode || (state.preferences && state.preferences.testerMode));
  const situation = await showInputModal({
    title: '🌿 어떤 상황이야?',
    message: introMsg,
    placeholder: '예: 내일 발표인데 자료 준비가 안 돼서 카페에서 30분 집중 시도',
    multiline: true,
    okLabel: '제안 받기 →',
    defaultValue: _isAuto ? '카페에서 30분 집중' : ''
  });
  if (!situation) return;

  showToast('🐚 오늘의 제안 생성 중...');
  let proposal = '';
  // 사용자 보고 2026-04-30: 개인 API 키 비운 상태에서도 백엔드 프록시로 동작하게.
  // fetch interceptor가 state.apiKey 비어있으면 자동으로 /api/chat 라우팅. 게이트만 풀면 됨.
  if (_canAI()) {
    try {
      const ctx = isMutation
        ? `[전략] ${card.title}\n[새 차원] ${layerName}: ${mutationOpt.action}\n[사용자 상황] ${situation}`
        : `[전략] ${card.title}\n[전략 행동] ${card.actionStrategy || ''}\n[심리학] ${card.psychConcept || ''}\n[사용자 상황] ${situation}`;
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: _anthropicHeaders(),
        body: JSON.stringify({
          _endpoint: 'decision_step',
          model: 'claude-sonnet-4-6', max_tokens: 120,
          messages: [{
            role: 'user',
            content: `${ctx}\n\n[네 일]\n위 상황·전략에 맞춰 '오늘의 제안' 1개 — 오늘 바로 할 수 있는 구체 행동.\n한 줄 (max 40자). 동사로 시작. 환경 셋업 우선. 의지 부담 ↓.\n\n[출력]\n제안만 한 줄. 다른 거 X. 마크다운 X.`
          }]
        })
      });
      const data = await resp.json();
      proposal = (data.content?.[0]?.text || '').trim().replace(/^["「'`]|["」'`]$/g, '').split('\n')[0].trim();
    } catch (e) { console.warn('proposal AI:', e); }
  }
  if (!proposal) {
    proposal = isMutation ? mutationOpt.action : (card.actionStrategy || card.title);
  }

  const yes = await showConfirmModal({
    title: '🌿 오늘의 제안',
    message: `"${proposal}"\n\n이걸로 '소라의 부름' 등록할까?`,
    okLabel: '✦ 부름으로 등록',
    cancelLabel: '취소'
  });
  if (!yes) return;

  if (isMutation) {
    mutateToNewGeneration(strategyId, mutationOpt.layer, mutationOpt.action);
    const refreshed = getStrategyCard(strategyId);
    const newGenIdx = (refreshed?.generations?.length || 1) - 1;
    createMission(proposal, `🧬 ${card.title} — ${layerName} 차원`, {
      strategyId,
      generationIdx: newGenIdx,
      linkedStrategy: card.title,
      // V4 (v8 묶음 2): 사용자가 직접 입력한 상황 → 결과 체크 모달 📌 원래 문제 박스
      situation: situation,
      _situationSource: 'user_input'
    });
  } else {
    const newGenIdx = (card.generations?.length || 1) - 1;
    createMission(proposal, card.actionStrategy || '', {
      strategyId,
      generationIdx: newGenIdx,
      linkedStrategy: card.title,
      // V4 (v8 묶음 2): 사용자가 직접 입력한 상황 → 결과 체크 모달 📌 원래 문제 박스
      situation: situation,
      _situationSource: 'user_input'
    });
  }

  saveState({ force: true });
  showCelebration('🐚', '새 부름 등록!', '✨');
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderArchive === 'function') renderArchive();
  if (typeof showScreen === 'function') showScreen('home');
}

