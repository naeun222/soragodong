// 사용자 보고 2026-04-30: 잔존 시드 흔적 강제 정리 (개발자 도구 버튼).
// id-prefix sweep 못 잡은 것들 + _seed marker 못 적용된 옛 시드 텍스트 매칭.
async function cleanLegacySeedData() {
  if (!confirm('잔존 시드 흔적 정리 — entries/chatMessages/chatArchive 등에 적용된 시드 텍스트 매칭으로 sweep. 본인 데이터엔 영향 X (알려진 시드 텍스트만 매칭). 정말 진행?')) return;
  // 알려진 시드 텍스트 (testSeedV4Data 안 diaryPool / noteSnips / 풍성화 데이터)
  const seedSnippets = [
    '엄마 김치찌개', '한강 산책 30분', '교수님 미팅', '실험 데이터 정리만',
    'LNGSHOT', 'Vanilla Days', '새벽 카페', '논문 서론 첫 단락', '논문 한 단락',
    '카페 모서리 자리', '한강 산책 후 논문', '머리 비워짐', '데이터 부족이라고',
    '비도 그 때처럼', '환경 셋업 = 진입 마찰', '며칠 막혀있던 게 한 시간',
    '카페 새벽 4시', '됐다 한 순간'
  ];
  let cleaned = 0;
  const stores = ['entries', 'chatMessages', 'chatArchive', 'weeklyReviews', 'monthlyReviews', 'quarterlyReviews', 'memoryVault', 'tasks', 'missions', 'pearls', 'archive', 'topicCards', 'reflectionQuestions', 'projects', 'starts', 'decisions', 'insights', 'diagnoses', 'shellCollection'];
  stores.forEach(k => {
    if (!Array.isArray(state[k])) return;
    const before = state[k].length;
    state[k] = state[k].filter(it => {
      if (!it || typeof it !== 'object') return true;
      // _seed marker 매칭
      if (it._seed) return false;
      // 알려진 시드 텍스트 매칭
      try {
        const txt = JSON.stringify(it).toLowerCase();
        if (seedSnippets.some(s => txt.includes(s.toLowerCase()))) return false;
      } catch {}
      return true;
    });
    cleaned += (before - state[k].length);
  });
  saveState({ force: true });
  if (typeof saveToCloudNow === 'function') {
    try { await saveToCloudNow(); } catch (e) { console.warn('seed cleanup save:', e); }
  }
  alert(`✅ ${cleaned}개 시드 항목 정리됨. 새로고침합니다.`);
  location.reload();
}

async function testForceQuarterlyReview() {
  showToast('📊 분기 리뷰 강제 생성 중...');
  const today = new Date();
  const prevQ = new Date(today.getFullYear(), today.getMonth() - 3, 15);
  const prevQuarterKey = getQuarterKey(prevQ);
  if (Array.isArray(state.quarterlyReviews)) {
    state.quarterlyReviews = state.quarterlyReviews.filter(r => r.quarterKey !== prevQuarterKey);
  }
  // V4-fix: 가드 우회 — runQuarterlyAutoReviewIfNeeded는 dayOfMonth<=7 필요. 직접 build.
  const stats = (typeof getQuarterlyStats === 'function' && getQuarterlyStats(prevQuarterKey)) || {
    checkins: 28, attempts: 12, worked: 8, pearls: 5, dnaPearls: 1,
    modeCount: { rest: 4, period: 3 },
    trackerStats: [],
    problemsTotal: 4, strengthsTotal: 4, growthCount: 2,
    quarterKey: prevQuarterKey
  };
  let summary = '';
  let sections = [];
  let transformation = null;
  let continuity = '';
  if (_canAI() &&typeof generateQuarterlyReview === 'function') {
    try {
      const aiReview = await generateQuarterlyReview(prevQuarterKey, stats);
      summary = aiReview.summary || '';
      sections = Array.isArray(aiReview.sections) ? aiReview.sections : [];
      transformation = aiReview.transformation || null;
      continuity = aiReview.continuity || '';
    } catch (e) { console.warn('quarterly AI failed:', e); }
  }
  if (!sections.length) {
    summary = '이번 분기, 환경 차원에서 작동하는 도구가 늘어남. 거절 패턴 깨끗해지는 중.';
    sections = [
      { label: '🌊 흐름', body: '이 분기 너는 환경 차원에 무게를 실음. 카페·자동 종료 등 의지에 덜 기대는 도구.' },
      { label: '🌱 새로 자라난 것', body: '"마감 직전 폭발력 신뢰" 가닥이 결정화됨 — DNA 진주.' },
      { label: '🌫 작동 중인 패턴', body: '"거절 후 부채감" 패턴이 N회 등장. 환경 도구로 일부 풀림.' },
      { label: '🧭 다음 분기에', body: '거절 → "그날 안에 한 줄" 자동화 시도.' }
    ];
    if (!transformation) {
      transformation = { start_quote: '또 거절 못해서 일주일 망쳤어', end_quote: '일정 충돌 확인하고 답함 — 의외로 OK', shift: '참는 거에서 명확히 말하기로' };
      continuity = '그래도 친구 챙기는 마음은 그대로';
    }
  }
  state.quarterlyReviews.push({
    id: 'qr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    quarterKey: prevQuarterKey,
    completedAt: new Date().toISOString(),
    stats, summary, sections, transformation, continuity, auto: true
  });
  saveState({ force: true });
  showToast('✅ 분기 리뷰 생성됨 (도서관 → 마법·리뷰 → 🌙 리뷰 모음)');
}

function testForceDiagnoses() {
  if (state.preferences) state.preferences._diagLastRunAt = null;
  const detected = detectDiagnoses();
  if (detected.length === 0) {
    showToast('🐚 감지된 관찰 X — 시드 데이터 쌓은 후 시도');
    return;
  }
  registerDiagnoses(detected);
  // V4-fix: shown 진단도 active로 복구 (검증 위해)
  (state.diagnoses || []).forEach(d => {
    if (d.status === 'shown') d.status = 'active';
  });
  saveState();
  const labels = { weak_tool: '도구 약함', wrong_layer: '차원 안 맞음', value_clash: '가치 상충', avoidance: '회피', willpower_cap: '의지 임계' };
  const types = detected.map(d => labels[d.type] || d.type).join(', ');
  showToast(`🐚 ${detected.length}개 관찰 감지됨 (${types}) — 테스트 모드라 다음 응답에 자동 인용. 대화 탭에서 메시지 보내봐.`);
}

