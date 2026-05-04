// ═══════════════════════════════════════════════════════════════
// PHASE 5: DAILY QUESTION POOL & ROTATION
// ═══════════════════════════════════════════════════════════════

// Categories: G(gratitude) S(sensory) I(identity) R(relational) W(WOOP) D(distancing)
//             V(values) L(learning) B(body) P(playful) M(memory)
// Context tags: M=morning, E=evening, W=weekend, X=tired, N=normal, D=deadline, P=period
// Depth: L(light), M(medium), D(deep)

// V3.7: 인지심리학 연구 기반 사실 기록형 질문 50개
// 근거: Three Good Things(Seligman), Savoring(Bryant), Affect labeling(Lieberman),
//       Episodic specificity(Madore), Interoception(Mehling), Self-distancing(Kross),
//       Self-compassion(Neff), Implementation intention(Gollwitzer), Growth mindset(Dweck)
// 톤: 평가 X, 사실 관찰 ○. 답하기 쉽게. 부담 X.
const DAILY_QUESTIONS = [
  // === LIGHT — 일상 사실 기록 (Three Good Things, Savoring) ===
  { id: 'q01', cat: 'G', ctx: ['N','M','E'], depth: 'L', text: '오늘 웃겼던 일 있어? 작아도 OK.' },
  { id: 'q02', cat: 'G', ctx: ['N','E'], depth: 'L', text: '오늘 소소한 행복 하나만 떠올려봐.' },
  { id: 'q03', cat: 'G', ctx: ['N','E'], depth: 'L', text: '오늘 "다행이다" 싶었던 순간 있어?' },
  { id: 'q04', cat: 'G', ctx: ['N','E'], depth: 'L', text: '오늘 마지막으로 입꼬리 올라간 순간이 언제야?' },
  { id: 'q05', cat: 'G', ctx: ['N','E'], depth: 'L', text: '오늘 기대보다 좋았던 거 있어?' },

  // === LIGHT — 감각 / 신체 (Interoception, Sensory grounding) ===
  { id: 'q06', cat: 'S', ctx: ['N','E'], depth: 'L', text: '지금 들리는 소리 하나 적어봐.' },
  { id: 'q07', cat: 'S', ctx: ['N','E'], depth: 'L', text: '오늘 먹은 거 중 제일 맛있었던 거.' },
  { id: 'q08', cat: 'S', ctx: ['N','E'], depth: 'L', text: '지금 손에 닿는 것 중 가장 부드러운 거.' },
  { id: 'q09', cat: 'S', ctx: ['N'], depth: 'L', text: '오늘 본 색깔 중 기억에 남는 거.' },
  { id: 'q10', cat: 'S', ctx: ['N','E'], depth: 'L', text: '지금 어떤 향이 나? 안 나면 "안 남"도 OK.' },
  { id: 'q11', cat: 'B', ctx: ['N','E'], depth: 'L', text: '오늘 잠은 잘 잤어?' },
  { id: 'q12', cat: 'B', ctx: ['N','E'], depth: 'L', text: '지금 몸 어딘가 가벼운 데 있어?' },
  { id: 'q13', cat: 'B', ctx: ['N','E'], depth: 'L', text: '오늘 물 몇 잔쯤 마신 거 같아?' },
  { id: 'q14', cat: 'B', ctx: ['N','E'], depth: 'L', text: '오늘 하품 몇 번 했어? 대충.' },
  { id: 'q15', cat: 'B', ctx: ['N','E'], depth: 'L', text: '지금 체감 온도 — 추워, 적당해, 더워?' },

  // === LIGHT — 환경 / 사물 (Episodic specificity) ===
  { id: 'q16', cat: 'M', ctx: ['N','E'], depth: 'L', text: '지금 책상(또는 옆) 위에 뭐가 있어?' },
  { id: 'q17', cat: 'M', ctx: ['N','E'], depth: 'L', text: '오늘 어디 갔다 왔어? 한 군데만.' },
  { id: 'q18', cat: 'M', ctx: ['N','E'], depth: 'L', text: '오늘 신은 양말 색깔이 뭐야?' },
  { id: 'q19', cat: 'M', ctx: ['N','E'], depth: 'L', text: '지금 폰 배터리 몇 %?' },
  { id: 'q20', cat: 'M', ctx: ['N','E'], depth: 'L', text: '오늘 마지막으로 찍은 사진이 뭐야?' },
  { id: 'q21', cat: 'M', ctx: ['N'], depth: 'L', text: '오늘 아침에 뭐 먹었어? 안 먹었으면 안 먹었다고.' },
  { id: 'q22', cat: 'M', ctx: ['N','E'], depth: 'L', text: '오늘 본 동물 있어? (영상도 OK)' },
  { id: 'q23', cat: 'M', ctx: ['N','E'], depth: 'L', text: '지금 입고 있는 옷 — 한 마디로?' },

  // === LIGHT — 놀이 / 가벼움 (Positive emotion, Fredrickson) ===
  { id: 'q24', cat: 'P', ctx: ['N','E'], depth: 'L', text: '오늘 음악 들었어? 한 곡만.' },
  { id: 'q25', cat: 'P', ctx: ['N','E'], depth: 'L', text: '오늘의 너를 동물로 표현하면? 2초 안에.' },
  { id: 'q26', cat: 'P', ctx: ['N','E'], depth: 'L', text: '오늘 검색한 거 중 하나만.' },
  { id: 'q27', cat: 'P', ctx: ['N','E'], depth: 'L', text: '지금 뭐 하다가 여기 들어왔어?' },
  { id: 'q28', cat: 'P', ctx: ['N','E'], depth: 'L', text: '오늘 본 영상/짤 중 기억나는 거.' },
  { id: 'q29', cat: 'P', ctx: ['W'], depth: 'L', text: '최근에 새로 알게 된 단어/표현 있어?' },
  { id: 'q30', cat: 'P', ctx: ['N','E'], depth: 'L', text: '오늘 머리 묶었어 풀었어?' },

  // === LIGHT — 관계 (Relational well-being, gratitude) ===
  { id: 'q31', cat: 'R', ctx: ['N','E'], depth: 'L', text: '오늘 누구한테 연락 받았어?' },
  { id: 'q32', cat: 'R', ctx: ['N','E'], depth: 'L', text: '오늘 누구 얼굴 봤어? 안 봤으면 안 봤다고.' },
  { id: 'q33', cat: 'R', ctx: ['N','E'], depth: 'L', text: '오늘 누구 생각났어?' },
  { id: 'q34', cat: 'R', ctx: ['W'], depth: 'L', text: '최근 연락하고 싶은데 못 한 사람 있어?' },

  // === LIGHT — 성장 / 작은 발견 (Growth mindset) ===
  { id: 'q35', cat: 'L', ctx: ['N'], depth: 'L', text: '오늘 새로 알게 된 사실 있어? 작아도.' },
  { id: 'q36', cat: 'L', ctx: ['N'], depth: 'L', text: '오늘 막혔다가 풀린 거 있어?' },
  { id: 'q37', cat: 'L', ctx: ['N'], depth: 'L', text: '오늘 "오 이거 좋네" 한 거 있어?' },

  // === MEDIUM — 가벼운 성찰 (Affect labeling) ===
  { id: 'q38', cat: 'I', ctx: ['N','E'], depth: 'M', text: '오늘 너를 한 단어로 표현하면?' },
  { id: 'q39', cat: 'I', ctx: ['N','E'], depth: 'M', text: '오늘 가장 많이 든 감정 한 가지.' },
  { id: 'q40', cat: 'V', ctx: ['N','E'], depth: 'M', text: '오늘 가장 많이 쓴 시간이 어디 갔어?' },
  { id: 'q41', cat: 'W', ctx: ['N','M'], depth: 'M', text: '오늘 끝내고 싶은 거 1개만.' },
  { id: 'q42', cat: 'D', ctx: ['N','E'], depth: 'M', text: '오늘 친한 친구가 너랑 같은 하루를 보냈다면, 뭐라고 말해줄 거 같아?' },
  { id: 'q43', cat: 'D', ctx: ['N','E'], depth: 'M', text: '지금 1시간 쉴 수 있다면 뭐 하고 싶어?' },

  // === MEDIUM — 마감/피곤 모드 (Self-compassion) ===
  { id: 'q44', cat: 'B', ctx: ['X','D'], depth: 'M', text: '지금 피곤함이 어디서 오는 거 같아? 몸, 머리, 마음, 잘 모르겠음.' },
  { id: 'q45', cat: 'B', ctx: ['X'], depth: 'L', text: '지금 눈 한 번 감았다 떴어? 안 했으면 한 번 해봐.' },
  { id: 'q46', cat: 'P', ctx: ['X'], depth: 'L', text: '오늘 힘듦에 어울리는 이모지 하나.' },

  // === MEDIUM — 주말/전환점 ===
  { id: 'q47', cat: 'M', ctx: ['W'], depth: 'M', text: '이번 주에 가장 기억에 남는 순간 한 가지.' },
  { id: 'q48', cat: 'V', ctx: ['W'], depth: 'M', text: '이번 주 시간 잘 썼다 싶은 데 한 군데.' },

  // === DEEP — 가끔만 (자기 거리두기) ===
  { id: 'q49', cat: 'D', ctx: ['W'], depth: 'D', text: '1년 뒤의 네가 오늘의 너를 본다면, 뭐라고 말해줄까?' },
  { id: 'q50', cat: 'V', ctx: ['W'], depth: 'D', text: '요즘 너한테 가장 중요한 거 한 가지 — 한 단어로.' }
];

const CATEGORY_ICONS = { G: '🙏', S: '🧘', I: '🪞', R: '🤝', W: '🌱', D: '👥', V: '💎', L: '📚', B: '🫀', P: '🎈', M: '📜' };
const CATEGORY_LABELS = { G: '감사', S: '감각', I: '정체성', R: '관계', W: 'WOOP', D: '거리두기', V: '가치', L: '성장', B: '몸', P: '놀이', M: '기억' };

let _currentDailyQuestion = null;

function getDailyQuestionContext() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday
  const isWeekend = day === 0 || day === 6;
  const todayKeyVal = todayKey();
  const todayEntry = state.entries.find(e => e.date === todayKeyVal);

  // Active modes
  const activeModes = Object.keys(state.modes || {}).filter(k => state.modes[k]);
  const isDeadline = activeModes.includes('exam');
  const isPeriod = activeModes.includes('period');

  // Tiredness signal: vitality from latest check-in or current input
  const recentVitality = todayEntry?.vitality;
  const isTired = recentVitality && recentVitality <= 2;

  return {
    timeOfDay: hour < 12 ? 'M' : 'E',
    isWeekend,
    isDeadline,
    isPeriod,
    isTired,
    todayKey: todayKeyVal
  };
}

function pickDailyQuestion(forceReroll = false) {
  const ctx = getDailyQuestionContext();
  const todayKeyVal = ctx.todayKey;
  const dismissed = new Set(state.questionPreferences?.dismissed || []);
  const favorites = new Set(state.questionPreferences?.favorites || []);

  // If already chosen today and not rerolling, return cached
  if (!forceReroll) {
    const todaysShown = (state.questionHistory || []).find(h => h.shownDate === todayKeyVal);
    if (todaysShown) {
      const q = DAILY_QUESTIONS.find(qx => qx.id === todaysShown.questionId);
      if (q) return q;
    }
  }

  // Recently shown (last 14 days)
  const cutoff = Date.now() - 14 * 86400000;
  const recentlyShownIds = new Set(
    (state.questionHistory || [])
      .filter(h => new Date(h.shownDate).getTime() > cutoff)
      .map(h => h.questionId)
  );

  // Recent categories (last 7 days)
  const cutoffCat = Date.now() - 7 * 86400000;
  const recentCategories = new Set(
    (state.questionHistory || [])
      .filter(h => new Date(h.shownDate).getTime() > cutoffCat)
      .map(h => DAILY_QUESTIONS.find(qx => qx.id === h.questionId)?.cat)
      .filter(Boolean)
  );

  // Build candidate pool
  let candidates = DAILY_QUESTIONS.filter(q => {
    if (dismissed.has(q.id)) return false;
    if (recentlyShownIds.has(q.id)) return false;
    return true;
  });

  // If pool is empty (rare), fallback to all non-dismissed
  if (candidates.length === 0) {
    candidates = DAILY_QUESTIONS.filter(q => !dismissed.has(q.id));
  }
  if (candidates.length === 0) {
    candidates = DAILY_QUESTIONS;
  }

  // Score each candidate
  const scored = candidates.map(q => {
    let score = 0;
    // Context match
    if (ctx.isTired) {
      if (q.depth === 'D') score -= 10; // hard block deep on tired
      if (q.ctx.includes('X')) score += 5;
    } else {
      if (q.ctx.includes('X')) score -= 1;
    }
    if (ctx.isDeadline) {
      if (q.ctx.includes('D')) score += 5;
      if (q.cat === 'W' && q.depth === 'M') score -= 3; // big WOOP plans bad on deadline
      if (q.cat === 'I' && q.depth === 'D') score -= 4;
    }
    if (ctx.isWeekend) {
      if (q.depth === 'D') score += 3;
      if (q.ctx.includes('W')) score += 4;
    } else {
      if (q.depth === 'D') score -= 2;
    }
    if (ctx.timeOfDay === 'M' && q.ctx.includes('M')) score += 2;
    if (ctx.timeOfDay === 'E' && q.ctx.includes('E')) score += 2;
    // Category rotation: bonus if not shown recently
    if (!recentCategories.has(q.cat)) score += 3;
    // Favorite bonus
    if (favorites.has(q.id)) score += 2;
    // Random novelty
    score += Math.random() * 4;
    return { q, score };
  });

  // Sort and weighted-sample top 3
  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, Math.min(3, scored.length));
  const totalWeight = top3.reduce((s, x) => s + Math.max(0.1, x.score + 5), 0);
  let r = Math.random() * totalWeight;
  for (const item of top3) {
    r -= Math.max(0.1, item.score + 5);
    if (r <= 0) return item.q;
  }
  return top3[0].q;
}

function recordQuestionShown(questionId) {
  const todayKeyVal = todayKey();
  const existing = (state.questionHistory || []).find(h => h.shownDate === todayKeyVal);
  if (existing) {
    existing.questionId = questionId;
  } else {
    state.questionHistory.push({
      questionId,
      shownDate: todayKeyVal,
      answered: false,
      dismissed: false,
      favorited: false
    });
  }
  // Keep history bounded (last 200)
  if (state.questionHistory.length > 200) {
    state.questionHistory = state.questionHistory.slice(-200);
  }
  saveState();
}

function renderDailyQuestion() {
  // 사용자 요청 2026-04-30: AI 생성 분기 제거 — pool만 회전. LLM call 0, 비용 0.
  // generateAIDailyQuestion 함수는 dead code로 남김 (다른 데서 안 호출).
  renderPoolQuestion();
}

function renderPoolQuestion() {
  const q = pickDailyQuestion(false);
  if (!q) return;
  _currentDailyQuestion = q;
  const iconEl = document.getElementById('dailyQuestionIcon');
  const labelEl = document.getElementById('dailyQuestionLabel');
  const textEl = document.getElementById('dailyQuestionText');
  if (iconEl) iconEl.textContent = CATEGORY_ICONS[q.cat] || '💬';
  if (labelEl) labelEl.textContent = `오늘의 질문 · ${CATEGORY_LABELS[q.cat] || ''}`;
  if (textEl) textEl.textContent = q.text;
  recordQuestionShown(q.id);
}

// 사용자 요청 2026-04-30: generateAIDailyQuestion 함수 제거 — pool만 사용. dead code 정리.

function rerollDailyQuestion() {
  // 사용자 요청 2026-04-30: pool만 사용. AI 질문 분기 제거.
  const q = pickDailyQuestion(true);
  if (!q) return;
  _currentDailyQuestion = q;
  const iconEl = document.getElementById('dailyQuestionIcon');
  const labelEl = document.getElementById('dailyQuestionLabel');
  const textEl = document.getElementById('dailyQuestionText');
  if (iconEl) iconEl.textContent = CATEGORY_ICONS[q.cat] || '💬';
  if (labelEl) labelEl.textContent = `오늘의 질문 · ${CATEGORY_LABELS[q.cat] || ''}`;
  if (textEl) textEl.textContent = q.text;
  recordQuestionShown(q.id);
  showToast('다른 질문 ✦');
}

async function dismissDailyQuestion() {
  if (!_currentDailyQuestion) return;
  const yes = await showConfirmModal({
    title: '이 질문 안 보이게 할까?',
    message: '앞으로 다시 안 떠.',
    okLabel: '숨기기',
    cancelLabel: '취소'
  });
  if (!yes) return;
  if (!state.questionPreferences) state.questionPreferences = { dismissed: [], favorites: [], customQuestions: [] };
  if (!state.questionPreferences.dismissed.includes(_currentDailyQuestion.id)) {
    state.questionPreferences.dismissed.push(_currentDailyQuestion.id);
  }
  saveState();
  rerollDailyQuestion();
}

