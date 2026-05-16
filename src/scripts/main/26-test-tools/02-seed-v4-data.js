async function testSeedV4Data() {
  if (!state.preferences || !state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON 후 사용 — 사용자 데이터 보호');
    return;
  }
  // 사용자 보고 2026-04-30: 시드 흔적이 entries/chatMessages/chatArchive 등에 잔존 — id-prefix sweep으로 못 잡힘.
  // 시작 시점 length 기록 → 끝에 새로 적용된 항목만 _seed: true marker. init sweep에서 marker 매칭으로 자동 정리.
  const _seedMarkerTs = Date.now();
  const _seedTrackStores = ['entries', 'chatMessages', 'chatArchive', 'weeklyReviews', 'monthlyReviews', 'quarterlyReviews', 'memoryVault', 'tasks', 'missions', 'pearls', 'archive', 'topicCards', 'reflectionQuestions', 'projects', 'starts', 'decisions', 'insights', 'diagnoses', 'shellCollection', 'godongDiary', 'miniReviews'];
  const _seedBeforeLen = {};
  _seedTrackStores.forEach(k => { _seedBeforeLen[k] = (state[k] || []).length; });
  const _markSeedItems = () => {
    _seedTrackStores.forEach(k => {
      const arr = state[k];
      if (!Array.isArray(arr)) return;
      for (let i = _seedBeforeLen[k]; i < arr.length; i++) {
        if (arr[i] && typeof arr[i] === 'object' && !arr[i]._seed) {
          arr[i]._seed = _seedMarkerTs;
        }
      }
    });
  };
  // 함수 끝 직전에 _markSeedItems() 호출됨 (saveState 직전).
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  // V4-fix v3 (사용자 요청): 1년 치 entries — 질적으로 진짜 같은 패턴 (계절·주기·마감·주말 효과)
  state.entries = [];
  // 의미 있는 일기 풀 (날짜별 다양)
  const diaryPool = [
    '오늘 한강 산책 30분. 머리 비워짐. 논문 한 단락 쓰고 끝남.',
    '교수님 미팅. 별로였어. 데이터 부족이라고. 그래도 방향성은 잡힘.',
    '엄마 김치찌개. 고등학교 그때 생각났어. 비도 그 때처럼 옴.',
    '실험 데이터 정리만 4시간. 머리 멍해짐. 카페 가서 환기.',
    '오늘 진짜 하나도 안 했어. 침대에서 종일. 무력했음.',
    '친구 결혼식. 오랜만에 다 만남. 좋았는데 피곤. 사람 많은 거 한계 인정.',
    '논문 서론 첫 단락 완성. 짧지만 시작이라 의미 있음.',
    '아침 6시 깨서 새벽 작업. 진짜 잘 됨. 이 시간이 나의 골든.',
    '동기 술자리. 박사 진로 얘기. 다들 비슷한 고민. 위로됨.',
    '월경 1일차. 진짜 아무것도 못함. 누워서 책만 읽음.',
    '카페 옮겨다니며 작업. 환경 바꾸니까 머리 다시 돌아감.',
    '학회 발표 준비. 슬라이드 30장 다 만듦. 늦게까지 했지만 뿌듯.',
    '주말 푹 쉬었음. 늦잠 + 산책 + 책. 회복 모드.',
    '교수님께 데이터 보냄. 답장 기다림 — 긴장됨.',
    '실험실 정리. 마음도 정리되는 느낌.',
    '엄마랑 한 시간 통화. 안 보고 살았다고 잔소리. 미안.',
    '오늘 거절했어. 술자리. 처음엔 부채감 있었는데 지나니 괜찮음.',
    '논문 쓰다가 막힘. 새벽까지 봤는데 답 안 나옴.',
    '친구가 갑자기 카톡. 그냥 안부. 진짜 고마웠어.',
    '오늘 운동 갔어 일주일 만에. 30분 뛰니 머리 맑아짐.',
    '책 1권 완독. 오랜만에 종이책. 집중 잘 됨.',
    '실험 한 개 망함. 처음부터 다시 해야 함. 짜증보다 무력감.',
    '오늘 SNS 안 봤음. 평소보다 시간 많이 남았어.',
    '친구 만남. 오래 못 본 친구라 어색했는데 풀림.',
    '논문 결과 부분 시작. 표 3개 만듦.',
    '주말 종일 침대. 죄책감보단 회복.',
    '교수님 칭찬. "이 부분 좋다" 한 마디인데 컸음.',
    '아침에 명상 10분. 진짜 차분해짐. 매일 하고 싶음.',
    '엄마 아프시다고. 주말에 가봐야겠음.',
    '오늘 일찍 잠. 11시. 쥐어짜낸 결정이지만 잘 한 듯.'
  ];
  const dailyQs = [
    '오늘 잘 됐던 한 순간은?', '하루 중 가장 차분했던 순간?',
    '내일의 너에게 한 줄?', '오늘 너답지 않게 한 일이 있다면?',
    '오늘 만난 사람 중 한 사람을 떠올려봐. 어떤 인상이었어?',
    '오늘 너에게 작은 자랑거리?', '내가 오늘 놓친 것 중 가장 아까운 건?'
  ];
  const noteSnips = [
    '카페 작업 잘됨', '오늘 거절 한 번 성공', '논문 한 단락',
    '운동 30분 — 머리 맑아짐', '엄마 통화 — 짧게',
    '교수님 회의 — 별로', '실험 한 개 완료', '책 50p',
    '커피 끊어본 첫날', '아침 일찍 일어남'
  ];
  // 현재 → 1년 전 거꾸로 — 의미 있는 패턴
  for (let i = 365; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const dk = d.toISOString().split('T')[0];
    const dow = d.getDay(); // 0 = 일, 6 = 토
    const isWeekend = (dow === 0 || dow === 6);
    const month = d.getMonth();
    const dayOfMonth = d.getDate();
    // mood/vitality 곡선:
    // - 주말 mood +1 / vitality +0.5
    // - 월경 (4주 주기 5일간) mood -1 / vitality -2
    // - 학기 마감 (3월/6월/9월/12월 말 주) vitality -1
    // - 휴식 모드 일부 일에
    const cycleDay = i % 28;
    const isPeriodDay = (cycleDay >= 0 && cycleDay <= 4);
    const isExamWeek = (dayOfMonth >= 22) && (month === 2 || month === 5 || month === 8 || month === 11);
    let baseMood = 3 + (isWeekend ? 1 : 0) - (isPeriodDay ? 1 : 0);
    let baseVit = 3 + (isWeekend ? 0.5 : 0) - (isPeriodDay ? 2 : 0) - (isExamWeek ? 1 : 0);
    // 약간의 noise (deterministic per day)
    const noise = ((dk.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 5) * 0.4 - 0.8;
    const mood = Math.max(1, Math.min(5, Math.round(baseMood + noise)));
    const vit = Math.max(1, Math.min(5, Math.round(baseVit + noise)));
    // 수면 — 평일 좀 늦게 / 주말 늦게 일어남
    const sleepStarts = isWeekend ? ['00:30', '01:00', '23:30'] : ['22:30', '23:00', '23:30', '00:00'];
    const sleepEnds = isWeekend ? ['08:30', '09:00', '07:30'] : ['06:30', '07:00', '07:30'];
    const e = {
      date: dk,
      mood,
      vitality: vit,
      sleepStart: sleepStarts[i % sleepStarts.length],
      sleepEnd: sleepEnds[i % sleepEnds.length],
      timestamp: d.toISOString(),
      modes: {}
    };
    if (isPeriodDay && cycleDay <= 2) e.modes.period = true;
    if (isExamWeek && i % 4 === 0) e.modes.exam = true;
    if (vit <= 2 && i % 5 === 0) e.modes.drained = true;
    // V4-fix: 추가 모드 다양화 (5 모드 시뮬 — travel/sick/rest)
    if (i % 60 === 5) e.modes.travel = true;       // 2달에 한 번 여행
    if (i % 45 === 12) e.modes.sick = true;        // 1.5달에 한 번 아픔
    if (isWeekend && i % 9 === 0) e.modes.rest = true;  // 주말 일부 휴식
    // 일기 (3-4일에 한 번)
    if (i % 3 === 0) e.diary = diaryPool[i % diaryPool.length];
    // 짧은 노트 (1주에 1-2번)
    if (i % 5 === 1) e.note = noteSnips[i % noteSnips.length];
    // 일일 질문 (1주에 한 번)
    if (i % 7 === 0) e.dailyQuestion = { text: dailyQs[Math.floor(i / 7) % dailyQs.length] };
    state.entries.push(e);
  }
  // 사용자 요청 2026-04-28: 2026-04-15 entry 풍성화 (일기/사진/음악/일일질문/노트) — 캘린더 모달 시드 시각 검증
  // chat/pearls/archive/topicCards 풍성화는 collection 초기화 후 push (아래 testSeedV4Data 끝부분)
  const richDate = '2026-04-15';
  const richEntryIdx = state.entries.findIndex(en => en.date === richDate);
  if (richEntryIdx >= 0) {
    const re = state.entries[richEntryIdx];
    re.mood = 4;
    re.vitality = 3;
    re.diary = '오늘 새벽 카페에서 LNGSHOT 듣다가 진짜 오랜만에 흐름이 트여서 논문 서론 첫 단락 끝냄. 며칠 막혀있던 게 한 시간 만에 풀림. 새벽 공기 + 그 곡 = 마법. 카페 모서리 자리 사진도 한 장 찍었어. 다시 갈 때마다 이 감각 떠올리고 싶어서.';
    re.note = '새벽 카페가 답이다. 환경 셋업 = 진입 마찰 ↓.';
    re.dailyQuestion = {
      text: '오늘 가장 살아있다고 느낀 순간은?',
      answer: '카페 새벽 4시, 첫 단락 마지막 줄 쓰면서 \'됐다\' 한 순간.'
    };
    re.music = {
      id: 'seed_rich_track',
      title: 'Vanilla Days',
      artist: 'LNGSHOT',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
      trackUrl: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
    };
    // 사용자 요청 2026-04-28: 카페 사진 — Lorem Picsum 결정론적 시드 (캐시 가능 + 항상 같은 사진)
    re.photoThumb = 'https://picsum.photos/seed/longshot-cafe-415/400/400';
    re.photo = re.photoThumb;
    re.aiSummary = '새벽 카페에서 음악 + 환경 시너지로 논문 서론 첫 단락 완성. "환경이 의지보다 강함" 패턴 명확히 인식한 날.';
  }

  // chatMessages 다양화 — 5 챕터 (각 4-6 메시지), 8 카테고리 골고루
  state.chatMessages = [];
  const chapters = [
    {
      cat: 'concern', summary: '논문 주제 변경 고민',
      msgs: [
        ['user', '논문 주제 바꿀까 진지하게 고민 중인데 너무 두려워. 매몰비용이 너무 커.'],
        ['assistant', '[내가 본 것]\n주제 변경 고민이 매몰비용으로 막혀 있어.\n[이게 뭐냐면]\n매몰비용 오류 — 이미 쓴 시간이 미래 결정에 가중치를 주고 있어.\n[이럴 땐 이렇게]\n앞으로 1년만 본다면? 매몰비용 빼고.\n[오늘의 제안]\n마법고동에서 14일 숙성 시작해볼래?'],
        ['user', '음 1년만 본다면 새 주제가 나아. 근데 시작하는 게 너무 두려워.'],
        ['assistant', '두려움이 어느 차원이야? 시작 자체? 실패? 주변 시선?']
      ]
    },
    {
      cat: 'emotion', summary: '저녁 무력감',
      msgs: [
        ['user', '저녁만 되면 아무것도 못 하겠어. 책상에 앉아도 멍해져.'],
        ['assistant', '[내가 본 것]\n저녁 시간대 무력감이 반복돼.\n[이게 뭐냐면]\n에너지 곡선상 자연스러운 저점 + 인지 자원 고갈.\n[이럴 땐 이렇게]\n저녁엔 의지 결정 X — 환경 셋업 (휴식 자동화).\n[오늘의 제안]\n9시 알람 → 무조건 책상 떠나기.'],
        ['user', '환경 차원이라는 게 뭔지 더 알려줘.']
      ]
    },
    {
      cat: 'memory', summary: '엄마 김치찌개 기억',
      msgs: [
        ['user', '오늘 엄마 김치찌개 먹었는데 진짜 좋았어. 고등학생 때 생각났어.'],
        ['assistant', '그 기억 어떤 모양이야? 맛? 분위기?'],
        ['user', '둘 다. 그날도 비 왔거든. 진짜 너무 좋아서 진주에 넣고 싶다.'],
        ['assistant', '진주에 넣을래? 카테고리 가족·연인 어때?']
      ]
    },
    {
      cat: 'idea', summary: '논문 아이디어',
      msgs: [
        ['user', '환경 데이터랑 ADHD 행동 데이터 결합하면 새로운 게 나올 거 같아.'],
        ['assistant', '[내가 본 것]\n환경×행동 결합 아이디어 — 두 분야 다 깊게 봤구나.\n[이게 뭐냐면]\n학제간 연구 가능성. 네 강점 (깊이 파는 습관) 작동.\n[이럴 땐 이렇게]\n초안 한 페이지부터.\n[오늘의 제안]\n주말 30분 쓰고 평가.'],
        ['user', '근데 평가는 어떻게?']
      ]
    },
    {
      cat: 'diary', summary: '오늘 산책',
      msgs: [
        ['user', '일기: 오늘 한강 산책 30분. 머리 비워짐. 논문 한 단락 쓰고 끝남. 보통.'],
        ['assistant', '한강 → 글쓰기 흐름이 자주 작동했어 (지난 N회). 몸 풀림 + 인지 시작 패턴.'],
        ['user', '맞아. 산책 후엔 잘 되는 거 같아.'],
        ['assistant', '"산책 → 글쓰기" 가닥으로 등록할래? 작동 패턴이 데이터로 뚜렷해.']
      ]
    }
  ];
  let cursor = today.getTime() - 5 * 86400000;
  chapters.forEach((ch, ci) => {
    ch.msgs.forEach((m, mi) => {
      const d = new Date(cursor + mi * 30 * 60000);
      const isStart = mi === 0;
      state.chatMessages.push({
        role: m[0],
        content: m[1],
        timestamp: d.toISOString(),
        ...(isStart ? {
          chapterStart: true,
          chapterMeta: {
            category: ch.cat,
            summary: ch.summary,
            strategyId: null
          }
        } : {})
      });
    });
    cursor += 18 * 3600000; // 다음 챕터 18시간 후
  });
  // 마지막 user 메시지 진주 제안 칩 잠재 (default false)
  for (let i = state.chatMessages.length - 1; i >= 0; i--) {
    if (state.chatMessages[i].role === 'user') {
      state.chatMessages[i].pearlSuggestion = false;
      break;
    }
  }
  // strategy 카드 — 관찰 5종 detect + 분기별 분산 (Stories 다차원 분석)
  state.topicCards = (state.topicCards || []).filter(c => c.category !== 'strategy');
  const stratSeeds = [
    // 최근 분기 (Q-1) — 환경 차원 도구
    { title: '마감 직전 폭발력 신뢰', status: 'working', gens: 1, attempts: [['worked',3]], days: 20,
      problem: '마감 임박해야 작업이 폭발적으로 돼. 일찍 시작 시도했지만 결국 미루다 자책 반복.',
      concept: 'ADHD time-blindness + activation 곤란. 마감 임박 = 도파민 ↑ → 자연 진입. 결함이 아니라 내 결. \'미루기\' 자책 X, 잠재의식이 준비 중.',
      action: '① 마감 5일 전 \'폭발력 trigger 시기\' 인지.\n② 2-3일 전 환경 셋업 (카페 / 폰 다른 방 / 노이즈 캔슬).\n③ 마감 직전 환경에 들어가기 — 의지 X 자동 발동.' },
    { title: '거절은 그날 안에', status: 'working', gens: 1, attempts: [['worked',3], ['didnt',1]], days: 25,
      problem: '거절 메일/메시지 며칠 미루다가 더 어려워짐. 부담만 커짐.',
      concept: 'Decisional procrastination. 미룰수록 인지 부하 ↑. 짧게 답하는 게 친절.',
      action: '들어온 요청은 그날 안에 yes/no 답. 길게 설명 X. "지금은 어려워" 한 줄.' },
    { title: '카페에서 30분 집중', status: 'trying', gens: 1, attempts: [['worked',1], ['didnt',1]], days: 30,
      problem: '집에서 작업 시작 안 됨. 핸드폰·이불·간식 유혹. 진입 마찰 큼.',
      concept: 'Environmental cuing. 작업 환경 = 작업 모드 신호. 분리된 공간 = 진입 마찰 ↓.',
      action: '막힐 때 카페로. "30분만" 약속. 도착하면 노트북만 펴기.' },
    { title: '잠 부족 시 결정 X', status: 'seedling', gens: 1, attempts: [], days: 35,
      problem: '새벽 작업 → 다음날 큰 결정 후회 반복. 잠 부족 시 reactive choice.',
      concept: '인지 자원 고갈 시 prefrontal cortex 기능 저하. 휴식 = reset.',
      action: '잠 6시간 미만이면 그날은 큰 결정 X. 다음날로 미루기.' },
    { title: 'SNS 자동 종료', status: 'embodied', gens: 3, path: 'evolved', attempts: [['didnt',2], ['didnt',1], ['worked',5]], days: 50,
      problem: 'SNS 잠깐만 보다가 1시간 가버림. 죄책감 + 진도 X.',
      concept: 'Variable reward → 자동 행동 강화. 의지 X로 끊기 어려움. 환경 차단 ○.',
      action: '작업 시작 전 SNS 앱 타이머 30분. 시간 차면 강제 종료.' },
    // Q-2 — 실험 사이클
    { title: '실험 새벽 사이클', status: 'embodied', gens: 2, path: 'quick-discovery', attempts: [['worked',2], ['worked',5]], layers: ['L2','L3'], days: 130,
      problem: '실험 데이터 처리 낮에 못함. 자꾸 미룸.',
      concept: 'Energy peak 활용. 새벽 = 인지 resource peak. 분산보다 집중 ○.',
      action: '새벽 5-7시 실험 데이터 처리. 낮엔 다른 일.' },
    { title: '주말 회복 자동화', status: 'embodied', gens: 1, path: 'quick-discovery', attempts: [['worked',4]], days: 145,
      problem: '주말도 일 생각. 회복 못함. 월요일 더 지침.',
      concept: 'Recovery vs resting. 적극적 회복 활동 = 인지 재충전.',
      action: '토요일 오전 = 운동. 일요일 오후 = 카페·산책. 일 X 약속.' },
    // Q-3 — 학회 발표
    { title: '발표 슬라이드 매주 1장', status: 'working', gens: 2, attempts: [['didnt',2], ['worked',3]], layers: ['L2','L4'], days: 220,
      problem: '학회 발표 임박해서 몰아치다 망침. 미리 못 함.',
      concept: 'Implementation intention + Distributed practice. 작은 단위 분산.',
      action: '매주 토요일 오전 슬라이드 1장. 그 이상 X.' },
    // Q-4 — 회복
    { title: '명상 10분 아침', status: 'working', gens: 1, attempts: [['worked',3], ['meh',1]], days: 320,
      problem: '아침에 폰 보면서 스트레스로 시작. 하루 전체 망침.',
      concept: 'Morning routine = 인지 anchor. 명상 = 주의력 회복.',
      action: '폰 알람 X. 일어나서 10분 명상 (앱). 그 다음 폰.' },
    // 관찰 5종 발동용 (양생방 숨김)
    { title: '관찰 시드: 알람 무한 반복', status: 'trying', gens: 1, attempts: [['didnt',4]], layers: ['L2'], days: 25 },
    { title: '관찰 시드: 인지 차원 막힘', status: 'trying', gens: 1, attempts: [['didnt',3]], layers: ['L1'], days: 25 },
    { title: '관찰 시드: 회피 50%', status: 'trying', gens: 1, attempts: [['skipped',3], ['worked',1]], layers: ['L2'], days: 20 },
    { title: '관찰 시드: 가치 상충 1', status: 'trying', gens: 1, attempts: [['didnt',2]], layers: ['L2'], days: 20 }
  ];
  stratSeeds.forEach((s, idx) => {
    const id = 'strat_seed_' + idx;
    const generations = [];
    for (let g = 0; g < s.gens; g++) {
      const layer = (s.layers && s.layers[g]) || ['L2', 'L3', 'L1'][g] || 'L2';
      generations.push({
        gen: g + 1, layer,
        action: s.title + (g > 0 ? ` (gen ${g+1})` : ''),
        missions: [], shells: [],
        attempts: g === s.gens - 1 ? (s.attempts.flatMap(([st, n]) => Array(n).fill({}).map(() => ({ status: st, at: new Date(today.getTime() - Math.random() * 30 * 86400000).toISOString() })))) : [{ status: 'didnt', at: new Date(today.getTime() - (s.gens - g) * 7 * 86400000).toISOString() }],
        status: g === s.gens - 1 ? 'working' : 'mutated'
      });
    }
    state.topicCards.push({
      id, category: 'strategy',
      title: s.title,
      problemContext: s.problem || '시드 문제 상황',
      psychConcept: s.concept || '시드 심리학 개념',
      actionStrategy: s.action || s.title,
      summary: `${s.title} — 시드`,
      generations,
      embodimentStatus: s.status,
      embodimentPath: s.path || null,
      evolutionChats: [],
      createdAt: new Date(today.getTime() - s.days * 86400000).toISOString(),
      messageCount: 5,
      source: 'manual',
      // V4-fix (사용자 보고): 관찰 시드는 양생방 숨김 (제목 "관찰 시드:"로 시작) — detectDiagnoses는 그대로 작동
      _isDiagnosticSeed: s.title.startsWith('관찰 시드:')
    });
  });
  // 사용자 요청 2026-04-28: 튜토리얼에서 '마감 직전 폭발력 신뢰' (strat_seed_0) DNA 트리 펼침 상태로 시작
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._strategyTreeOpen) state.preferences._strategyTreeOpen = {};
  state.preferences._strategyTreeOpen.strat_seed_0 = true;
  // willpower_cap 발동: rest 모드 30일+ + 신규 가닥 30일 내 X로 만들려면 모든 strategy createdAt 30일+여야.
  // 시드는 신규 strategy 일부 있어 willpower_cap은 부분 detect — 실 사용 시 자연 발동. 시드는 4종까지 보장.
  // modeActiveSince.rest 시뮬을 위해 넣어두기 (연관 데이터)
  if (!state.modeActiveSince) state.modeActiveSince = {};
  state.modeActiveSince.rest = new Date(today.getTime() - 35 * 86400000).toISOString();
  // 토픽 카드 2 (V4 사용자 명시 2026-05-16 ultrathink: 5→2 축소 — 메모리 탭 채우기만 했던 잉여 시드)
  for (let i = 0; i < 2; i++) {
    state.topicCards.push({
      id: 'tc_seed_' + i,
      category: 'memory',
      title: `시드 토픽 ${i+1}`,
      summary: `이건 ${i+1}번 시드 토픽 카드 요약.`,
      chapterStartedAt: new Date(today.getTime() - (i+1) * 3 * 86400000).toISOString(),
      chapterEndedAt: new Date(today.getTime() - (i+1) * 3 * 86400000).toISOString(),
      messageCount: 3 + i,
      createdAt: new Date(today.getTime() - (i+1) * 3 * 86400000).toISOString()
    });
  }
  // V4-fix v3: 진주 30+ (1년에 걸쳐, 월별 평균 2-3개, 4 카테고리 다양)
  state.pearls = [];
  const pearlSeeds = [
    // 사용자 요청 2026-04-28: 실제 LNGSHOT (LONGSHOT 아님 — 'O' 하나 적음) - Vanilla Days iTunes preview URL + artwork 하드코딩
    { c: '음악', content: 'LNGSHOT - Vanilla Days', daysAgo: 5, note: '새벽 카페에서 발견. 이 곡 들으면 그 시간으로 돌아감.', track: {
        id: 'pinned_lngshot_vanilla',
        title: 'Vanilla Days',
        artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      } },
    // 사용자 요청 2026-04-28: '잊지 못할 순간' 슬라이드에 노출되는 카드 — 사용자가 public/kimchi.jpg 직접 넣음 (~90KB)
    { c: '음식', content: '엄마 김치찌개', daysAgo: 8, note: '비 오는 날 — 고등학교 그 부엌 생각.', photo: '/kimchi.jpg' },
    { c: '장소', content: '한강 벤치 새벽 4시', daysAgo: 12, note: '논문 막힌 날. 30분 앉아있다 머리 풀림.' },
    { c: '순간', content: '논문 첫 단락 완성한 순간', daysAgo: 18 },
    { c: '사람', content: '오랜 친구가 갑자기 카톡', daysAgo: 22, note: '"잘 지내?" 그 한 마디.' },
    { c: '음악', content: '닝닝 - Ketchup and Lemonade', daysAgo: 28, searchQuery: 'NingNing Ketchup and Lemonade', note: '비 + 작업할 때만.' },
    { c: '음식', content: '연구실 옥상 도시락', daysAgo: 35, note: '같이 먹은 동기랑 진로 얘기.' },
    { c: '장소', content: '학교 도서관 창가 5층', daysAgo: 42, note: '거기 앉으면 항상 잘 됨.' },
    { c: '순간', content: '새벽 깨달음 — 환경이 의지보다 강함', daysAgo: 48 },
    { c: '사람', content: '교수님 한 마디 칭찬', daysAgo: 55, note: '"이 부분 좋다" — 한 줄인데 컸음.' },
    { c: '음악', content: '제니 - Love Hangover', daysAgo: 65, note: '논문 풀릴 때.', track: {
        id: 'pinned_jennie_love',
        title: 'Love Hangover',
        artist: 'JENNIE & Dominic Fike',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/1c/57/15/1c571583-f4bc-3307-6e5e-8b9e68d05913/196872850918.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f6/4c/16/f64c164b-bd28-87fd-5217-7409675e6374/mzaf_10560279388547786839.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/love-hangover/1793379140?i=1793379141'
      } },
    { c: '음식', content: '엄마가 보낸 김장 김치', daysAgo: 75, note: '한 통이 한 달 가요.' },
    { c: '장소', content: '카페 모서리 자리', daysAgo: 85, note: '거기 앉으면 두 시간은 집중.' },
    { c: '순간', content: '실험 결과 첫 success', daysAgo: 95, note: '진짜 소름. 6개월 만의 보상.' },
    { c: '사람', content: '동생이 깜짝 방문', daysAgo: 105 },
    { c: '음악', content: '코르티스 - REDRED', daysAgo: 120, searchQuery: 'CORTIS REDRED' },
    { c: '음식', content: '연구실 동기랑 라멘', daysAgo: 135, note: '진로 고민 토론.' },
    { c: '장소', content: '집 앞 천변길', daysAgo: 150, note: '운동 + 생각 정리.' },
    { c: '순간', content: '드디어 거절했어', daysAgo: 165, note: '술자리 — 첫 거절 성공.' },
    { c: '사람', content: '오래 못 본 친구 결혼식', daysAgo: 175 },
    { c: '음악', content: '하츠투하츠 - RUDE!', daysAgo: 190, searchQuery: 'Hearts2Hearts RUDE' },
    { c: '음악', content: 'LNGSHOT - Moonwalkin\'', daysAgo: 240, note: '진짜 신남.', track: {
        id: 'pinned_lngshot_moonwalkin',
        title: 'Moonwalkin\'',
        artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/74/94/a2/7494a26e-4756-c082-5709-8526127baee8/cover_KM0023994_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/da/1f/e9/da1fe9e9-f784-b4f2-c181-c8f770aa2ede/mzaf_13144624855104730433.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/moonwalkin/1866762522?i=1866762525'
      } },
    { c: '음식', content: '아빠 닭볶음탕', daysAgo: 210 },
    { c: '장소', content: '가을 단풍 — 학교 뒷산', daysAgo: 225 },
    { c: '순간', content: '새벽 4시 작업 끝낸 순간', daysAgo: 240 },
    { c: '사람', content: '5년만의 동창', daysAgo: 260 },
    { c: '음식', content: '겨울 호떡', daysAgo: 280 },
    { c: '장소', content: '제주도 협재 — 휴식', daysAgo: 300, note: '3박 4일.' },
    { c: '순간', content: '학회 첫 발표', daysAgo: 320 },
    { c: '사람', content: '동기 결혼식 축하', daysAgo: 340 },
    { c: '음악', content: 'KATSEYE - PINKY UP', daysAgo: 360, note: '봄 첫날 들음.', track: {
        id: 'pinned_katseye_pinky',
        title: 'PINKY UP',
        artist: 'KATSEYE',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/1a/77/46/1a77460d-493c-a795-92ef-84674905409e/26UMGIM25100.rgb.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8a/2d/f8/8a2df8c0-e0d3-d040-5a98-958d4ad25ceb/mzaf_16340910211187354178.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/pinky-up-clean-edit/1891174008?i=1891174353'
      } },
    // 사용자 요청 2026-04-28: 추가 4곡 — 실제 iTunes preview + artwork 직넣음
    { c: '음악', content: 'Cloonee - Stephanie', daysAgo: 45, note: '신나는 클럽 트랙.', track: {
        id: 'pinned_cloonee_stephanie',
        title: 'Stephanie',
        artist: 'Cloonee, Young M.A & InntRaw',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/97/e4/10/97e41086-cff2-f7b5-83b3-3a085b4d2026/cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/d0/1e/40/d01e4015-c383-2c2a-9445-f47edb4ae5e0/mzaf_10847000075002169806.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/stephanie/1779339882?i=1779339883'
      } },
    { c: '음악', content: 'Frank Ocean - Pink + White', daysAgo: 90, note: '늦은 밤 한 사람 생각나는 곡.', track: {
        id: 'pinned_frank_pinkwhite',
        title: 'Pink + White',
        artist: 'Frank Ocean',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/bb4568f3-68cd-619d-fbcb-4e179916545d/BlondCover-Final.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/45/a8/a2/45a8a2e0-9516-86b2-66ea-e8b2bf71de68/mzaf_10773372944954067241.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/pink-white/1146195596?i=1146195714'
      } },
    { c: '음악', content: '엔하이픈 - Upper Side Dreamin\'', daysAgo: 150, note: '첫 들었을 때 바로 적용됨.', track: {
        id: 'pinned_enhypen_upperside',
        title: 'Upper Side Dreamin\'',
        artist: 'ENHYPEN',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/07/f2/86/07f286a5-be02-94dd-4e0e-a781aba6d1d4/192641841651_Cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/49/a6/68/49a66800-4e6c-68e6-1e35-3be2919ac57e/mzaf_6950604213995548513.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/upper-side-dreamin/1587989646?i=1587989649'
      } },
    { c: '음악', content: 'Charli XCX - Club classics', daysAgo: 270, note: '파티 모드 trigger.', track: {
        id: 'pinned_charli_club',
        title: 'Club classics',
        artist: 'Charli xcx',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a5/bb/db/a5bbdb33-3887-5abb-81d5-de75e72c6abc/mzaf_8271755484089764888.plus.aac.p.m4a',
        trackUrl: 'https://music.apple.com/us/album/club-classics/1739079974?i=1739080339'
      } }
  ];
  // 사용자 요청 2026-04-28: 음악 시드 — iTunes Search API로 실제 Apple preview URL 가져오기
  for (let i = 0; i < pearlSeeds.length; i++) {
    const p = pearlSeeds[i];
    let trackData = p.track || null;
    if (p.c === '음악' && p.searchQuery && typeof searchITunes === 'function') {
      try {
        const results = await searchITunes(p.searchQuery);
        if (results && results.length > 0) {
          const t = results[0];
          trackData = {
            id: t.id,
            title: t.title,
            artist: t.artist,
            artworkUrl: t.artworkUrl,
            previewUrl: t.previewUrl,
            trackUrl: t.trackUrl
          };
        }
      } catch (e) { console.warn('iTunes seed for', p.searchQuery, e); }
    }
    state.pearls.push({
      id: 'pearl_seed_' + i,
      category: p.c,
      content: p.content,
      note: p.note || null,
      ...(trackData ? { track: trackData } : {}),
      createdAt: new Date(today.getTime() - p.daysAgo * 86400000).toISOString(),
      type: 'pearl'
    });
  }
  // DNA 진주 시드 3종 — 사용자 요청 2026-04-28 (3가지 path 시각 검증)
  // 🌱 빠른 발견 (one-shot) — 한 차원에서 바로 통한 전략
  // pearl_design_spec_2026-05-03 §1·§2: 체화 = 현재 Gen workedCount 5+ / shellsUsed = legendary 풀 random pick
  state.pearls.push({
    id: 'dpearl_seed_oneshot',
    type: 'dna_pearl',
    content: '주말 회복 자동화',
    category: 'DNA',
    strategyId: 'strat_seed_6',
    embodimentPath: 'one-shot',
    shellsUsed: pickLegendaryShells(5),
    totalAttempts: 5,
    totalGens: 1,
    workedCount: 5,
    createdAt: new Date(today.getTime() - 100 * 86400000).toISOString()
  });
  // 🌳 성장의 길 (quick-discovery) — 한 차원에서 반복으로 도달
  state.pearls.push({
    id: 'dpearl_seed_quick',
    type: 'dna_pearl',
    content: '실험 새벽 사이클',
    category: 'DNA',
    strategyId: 'strat_seed_5',
    embodimentPath: 'quick-discovery',
    shellsUsed: pickLegendaryShells(5),
    totalAttempts: 7,
    totalGens: 1,
    workedCount: 5,
    createdAt: new Date(today.getTime() - 80 * 86400000).toISOString()
  });
  // 🧬 진화한 길 (evolved) — 여러 차원 거쳐 진화로 도달
  state.pearls.push({
    id: 'dpearl_seed_evolved',
    type: 'dna_pearl',
    content: 'SNS 자동 종료',
    category: 'DNA',
    strategyId: 'strat_seed_4',
    embodimentPath: 'evolved',
    shellsUsed: pickLegendaryShells(6),
    totalAttempts: 8,
    totalGens: 3,
    workedCount: 6,
    createdAt: new Date(today.getTime() - 30 * 86400000).toISOString()
  });
  // V4 (사용자 명시 2026-05-14 ultrathink): #5 state.archive 일반 12개 시드 zap — sim 튜토 코치마크가 가리키지 않음.
  //   4/15 풍성화 chunk (line 후반 _richDate) 의 push 1개만 보존 — diaryLib 튜토가 4/15 day modal 에서 가리킴.
  state.archive = [];

  // 사용자 명시 2026-05-01 ultrathink: chatArchive 시드 — 날짜별 챕터 카드 (pending + 처리완료 mix, source=magic_help / reflection_chat / 메인 chat)
  state.chatArchive = [
    {
      id: 'arch_seed_1', date: getDayKey(new Date(today.getTime() - 1 * 86400000)),
      summary: '대화 #5', messageCount: 6,
      messages: [
        { role: 'user', content: '오늘 일이 진짜 안 풀려.', timestamp: new Date(today.getTime() - 1.5 * 86400000).toISOString() },
        { role: 'assistant', content: '뭐가 막혔어? 시작 자체? 아니면 중간에 끊긴 거?', timestamp: new Date(today.getTime() - 1.5 * 86400000 + 60000).toISOString() }
      ],
      generatedAt: new Date(today.getTime() - 1 * 86400000).toISOString(),
      _pendingExtract: true  // 4AM 처리 대기
    },
    {
      id: 'arch_seed_magic', date: getDayKey(new Date(today.getTime() - 3 * 86400000)),
      summary: '🌀 마법 (현실 검증): 대학원 진로', messageCount: 8,
      messages: [
        { role: 'user', content: '실제 대학원 다니는 사람들 얘기 들어보면 어때?', timestamp: new Date(today.getTime() - 3 * 86400000).toISOString() },
        { role: 'assistant', content: '몇 명 만나서 진짜 일주일을 어떻게 보내는지 들어봐. 입학 전 상상이랑 다를 수 있어.', timestamp: new Date(today.getTime() - 3 * 86400000 + 60000).toISOString() }
      ],
      generatedAt: new Date(today.getTime() - 3 * 86400000).toISOString(),
      source: 'magic_help',
      _pendingExtract: false
    },
    {
      id: 'arch_seed_refl', date: getDayKey(new Date(today.getTime() - 5 * 86400000)),
      summary: '🌊 숙고: 정말 두려워하는 건 뭘까', messageCount: 6,
      messages: [
        { role: 'user', content: '실패가 두려운 게 아니라 실패한 후 사람들 시선이 두려운 듯.', timestamp: new Date(today.getTime() - 5 * 86400000).toISOString() },
        { role: 'assistant', content: '시선이 진짜 두려운 게 사람들 시선인지, 아니면 그 시선이 비춰줄 너 자신의 부족함인지 — 어느 쪽이야?', timestamp: new Date(today.getTime() - 5 * 86400000 + 60000).toISOString() }
      ],
      generatedAt: new Date(today.getTime() - 5 * 86400000).toISOString(),
      source: 'reflection_chat',
      _pendingExtract: false
    }
  ];

  // V4-fix v3 (사용자 요청): traits/values/patterns — 분기별 분산 + 풍부 (Stories "AI 포착" 슬라이드용)
  state.traits = [];
  state.values = [];
  state.patterns = [];
  // 6 traits — 다양한 시기에 발견 (각 분기 1-2개)
  [
    { n: '완벽주의', daysAgo: 5,   conf: 0.85, verified: true,  desc: '시작 전 모든 정보 모으려 함. 시작 마찰↑.' },
    { n: '아침형', daysAgo: 25,    conf: 0.75, verified: true,  desc: '새벽 6시 작업이 가장 잘 됨. 패턴 일관.' },
    { n: '관계 우선', daysAgo: 70,  conf: 0.65, verified: false, desc: '거절 후 부채감 — 관계 손상 우려.' },
    { n: '깊이 파는 습관', daysAgo: 120, conf: 0.80, verified: true, desc: '한 주제 잡으면 끝까지. 학제간 연구.' },
    { n: '메타 사고형', daysAgo: 200, conf: 0.55, verified: false, desc: '큰 그림 / 가치 재검토를 자주.' },
    { n: '에너지 관리 의식적', daysAgo: 280, conf: 0.50, verified: false, desc: '피곤할 때 결정 미루기 명시.' }
  ].forEach((t, i) => {
    state.traits.push({
      id: 'trait_seed_' + i, name: t.n, description: t.desc,
      confidence: t.conf, user_verified: t.verified, evidence_count: 2 + i,
      created_at: new Date(today.getTime() - t.daysAgo * 86400000).toISOString()
    });
  });
  // 5 values
  [
    { n: '기여', daysAgo: 8,   conf: 0.78, verified: true,  desc: '연구로 누군가에 도움이 의미.' },
    { n: '연결', daysAgo: 45,  conf: 0.72, verified: true,  desc: '진정한 관계 = 깊은 만족 원천.' },
    { n: '자율', daysAgo: 110, conf: 0.85, verified: true,  desc: '시간/공간 자기 통제 핵심.' },
    { n: '성장', daysAgo: 180, conf: 0.68, verified: false, desc: '오늘보다 내일 더 깊어지기.' },
    { n: '진정성', daysAgo: 260, conf: 0.55, verified: false, desc: '거짓 X — 솔직한 자기 표현.' }
  ].forEach((v, i) => {
    state.values.push({
      id: 'val_seed_' + i, name: v.n, description: v.desc,
      confidence: v.conf, user_verified: v.verified, evidence_count: 2 + i,
      sdt_need: ['competence','relatedness','autonomy','competence','autonomy'][i],
      created_at: new Date(today.getTime() - v.daysAgo * 86400000).toISOString()
    });
  });
  // 6 patterns
  [
    { n: '마감 직전 폭발력', daysAgo: 12, conf: 0.85, verified: true, desc: 'ADHD time blindness — 도파민 trigger.', trigger: '마감 24시간', seq: '회피→폭발→완성' },
    { n: '저녁 무력감', daysAgo: 30, conf: 0.78, verified: true, desc: '인지 자원 고갈 곡선.', trigger: '저녁 8시 이후', seq: '시작 X→자책→포기' },
    { n: '거절 후 부채감', daysAgo: 60, conf: 0.65, verified: false, desc: 'Zeigarnik — 미결 부담.', trigger: '거절 직후', seq: '부채감→공부 X→자책' },
    { n: '새벽 결정 후회', daysAgo: 100, conf: 0.55, verified: false, desc: '잠 부족 시 인지 자원 X.', trigger: '잠 6시간 미만', seq: '큰 결정→다음날 후회' },
    { n: '주말 → 작업 회복', daysAgo: 160, conf: 0.70, verified: true, desc: '회복 모드가 작업 효율 ↑.', trigger: '주말 휴식', seq: '쉼→리셋→월요일 잘 됨' },
    { n: '환경 변화 → 집중 회복', daysAgo: 230, conf: 0.62, verified: false, desc: '카페 → 도서관 cycle.', trigger: '책상 막힘', seq: '환경 이동→2시간 집중' }
  ].forEach((p, i) => {
    state.patterns.push({
      id: 'pat_seed_' + i, name: p.n, description: p.desc,
      trigger: p.trigger, sequence: p.seq,
      confidence: p.conf, user_verified: p.verified, evidence_count: 3 + i,
      created_at: new Date(today.getTime() - p.daysAgo * 86400000).toISOString()
    });
  });
  // V4-fix v3 (사용자 요청 — 다차원 분석 풍부): 분기 리뷰 4개 + 풍부한 stats
  state.quarterlyReviews = [];
  const quarterlyTones = [
    { focus: '환경 차원 도구', growth: '"마감 직전 폭발력" 결정화', pattern: '거절 후 부채감 풀림 중', next: '거절 자동화',
      transformation: { start_quote: '또 거절 못해서 일주일 망쳤어', end_quote: '일정 충돌 확인하고 답함 — 의외로 OK', shift: '참는 거에서 명확히 말하기로' },
      continuity: '그래도 친구 챙기는 마음은 그대로',
      stats: { checkins: 72, attempts: 18, worked: 12, didnt: 4, meh: 2, pearls: 11, dnaPearls: 1,
        modeCount: { period: 8, drained: 5, rest: 3, exam: 4 },
        moodAvg: 3.4, vitalityAvg: 3.1, topMusicCount: 4, photoCount: 6, diaryCount: 22,
        problemsTotal: 5, strengthsTotal: 7, growthCount: 3, traitsTotal: 6, valuesTotal: 4, patternsTotal: 5,
        diagnoses: { weak_tool: 1, wrong_layer: 1 },
        trackerStats: [{ name: '체중', kind: 'numeric', delta: -2.0, unit: 'kg' }, { name: '러닝', kind: 'numeric', delta: 12, unit: 'km' }] } },
    { focus: '실험 사이클 + 결과', growth: '실험 첫 success — 6개월 만의 보상', pattern: '잠 부족 패턴 재등장', next: '11시 잠 자동화',
      transformation: { start_quote: '왜 또 새벽 3시에 깨있지', end_quote: '11시면 자동으로 졸려 오기 시작', shift: '버티기에서 흐름 만들기로' },
      continuity: '마감은 여전히 직전에 폭발',
      stats: { checkins: 68, attempts: 14, worked: 9, didnt: 3, meh: 2, pearls: 9, dnaPearls: 0,
        modeCount: { period: 9, drained: 7, rest: 5, sick: 2, exam: 2 },
        moodAvg: 3.0, vitalityAvg: 2.8, topMusicCount: 3, photoCount: 4, diaryCount: 18,
        problemsTotal: 6, strengthsTotal: 5, growthCount: 2, traitsTotal: 5, valuesTotal: 4, patternsTotal: 6,
        diagnoses: { avoidance: 1 },
        trackerStats: [{ name: '체중', kind: 'numeric', delta: -0.5, unit: 'kg' }, { name: '러닝', kind: 'numeric', delta: 8, unit: 'km' }] } },
    { focus: '학회 발표 + 거절 패턴', growth: '거절 첫 성공 + 발표 마무리', pattern: '발표 후 번아웃', next: '사회 차원 시도',
      transformation: { start_quote: '발표 한 달 남았는데 손도 못 대', end_quote: '오늘 발표 끝남 — 떨었지만 했어', shift: '회피에서 마주봄으로' },
      continuity: '발표 후 며칠 텅 빈 건 변함 X',
      stats: { checkins: 65, attempts: 16, worked: 10, didnt: 4, meh: 2, pearls: 10, dnaPearls: 0,
        modeCount: { period: 8, drained: 9, rest: 7, exam: 5 },
        moodAvg: 3.2, vitalityAvg: 2.9, topMusicCount: 5, photoCount: 7, diaryCount: 20,
        problemsTotal: 5, strengthsTotal: 6, growthCount: 2, traitsTotal: 5, valuesTotal: 4, patternsTotal: 5,
        diagnoses: { value_clash: 1, avoidance: 1 },
        trackerStats: [{ name: '명상', kind: 'check', delta: 18, unit: '회' }] } },
    { focus: '여름 회복 + 시작', growth: '운동 30일 지속', pattern: '회복 모드 정착', next: '아침 리듬',
      transformation: { start_quote: '운동? 일주일째 한 번도 못 갔어', end_quote: '오늘로 30일째 — 빠지면 오히려 찜찜', shift: '의지 짜내기에서 리듬 타기로' },
      continuity: '회복 시간 챙기는 자세는 그대로',
      stats: { checkins: 58, attempts: 10, worked: 7, didnt: 2, meh: 1, pearls: 8, dnaPearls: 0,
        modeCount: { period: 8, rest: 12, travel: 3, sick: 2 },
        moodAvg: 3.6, vitalityAvg: 3.3, topMusicCount: 3, photoCount: 8, diaryCount: 15,
        problemsTotal: 4, strengthsTotal: 6, growthCount: 1, traitsTotal: 5, valuesTotal: 4, patternsTotal: 4,
        diagnoses: {},
        trackerStats: [{ name: '러닝', kind: 'numeric', delta: 5, unit: 'km' }] } }
  ];
  // 사용자 요청 2026-04-28: 4 분기 모두 작년(2025) — 연간 stories 풍부하게
  const annualYear = today.getFullYear() - 1;
  for (let q = 1; q <= 4; q++) {
    const quarterKey = `${annualYear}-Q${q}`;
    // Q1 = 작년 1-3월 = today기준 약 15-13개월 전, Q4 = 작년 10-12월 = 약 6-4개월 전
    const monthsAgo = (12 - q * 3) + 4;  // Q1: 13개월, Q2: 10, Q3: 7, Q4: 4
    const tone = quarterlyTones[q - 1];
    state.quarterlyReviews.push({
      id: 'qr_seed_' + q,
      quarterKey,
      completedAt: new Date(today.getTime() - monthsAgo * 30 * 86400000).toISOString(),
      stats: { ...tone.stats, quarterKey },
      summary: `이 분기, ${tone.focus}에 무게가 실렸어. ${tone.growth}.`,
      sections: [
        { label: '🌊 흐름', body: `${tone.focus} 중심으로 움직였어. 의지에 덜 기대고 환경/도구로 무게 이동.` },
        { label: '🌱 새로 자라난 것', body: tone.growth },
        { label: '🌫 작동 중인 패턴', body: tone.pattern },
        { label: '🧭 다음 분기에', body: tone.next }
      ],
      transformation: tone.transformation,
      continuity: tone.continuity,
      auto: true
    });
  }
  // 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 시드 — 작년 (annualYear). 10 카드 시퀀스 풀 데이터.
  state.annualReviews = state.annualReviews || [];
  if (typeof _buildAnnualReviewSeedData === 'function') {
    const annualSeed = _buildAnnualReviewSeedData(annualYear);
    annualSeed.completedAt = new Date(today.getTime() - 30 * 86400000).toISOString();
    annualSeed._seed = Date.now();
    state.annualReviews.push(annualSeed);
  }
  // V4-fix v3 (사용자 요청): 관찰 시드 분기별 분산 + 학습 곡선 (Stories용)
  state.diagnoses = [
    // 최근 분기 — active
    { id: 'diag_seed_1', type: 'wrong_layer', confidence: 0.7, status: 'active',
      evidence: '"거절 후 부채감" — L2 행동만 시도, 다른 차원 X',
      targetCardId: 'strat_seed_1',
      detectedAt: new Date(today.getTime() - 2 * 86400000).toISOString() },
    // Q-2 — shown 후 confidence 갱신 (학습 곡선 데이터)
    { id: 'diag_seed_2', type: 'avoidance', confidence: 0.45, status: 'shown',
      evidence: '"잠 부족 시 결정 X" — 30일 미시도 (seedling)',
      targetCardId: 'strat_seed_3',
      detectedAt: new Date(today.getTime() - 80 * 86400000).toISOString(),
      lastUpdate: new Date(today.getTime() - 50 * 86400000).toISOString() },
    // Q-3 - shown
    { id: 'diag_seed_4', type: 'value_clash', confidence: 0.62, status: 'shown',
      evidence: '여러 가닥 모든 layer X — values 충돌 가능성',
      detectedAt: new Date(today.getTime() - 200 * 86400000).toISOString(),
      lastUpdate: new Date(today.getTime() - 180 * 86400000).toISOString() },
    // Q-4 - shown
    { id: 'diag_seed_5', type: 'avoidance', confidence: 0.55, status: 'shown',
      evidence: '회피 패턴 — skipped 50%+',
      targetCardId: 'strat_diag_seed_7',
      detectedAt: new Date(today.getTime() - 280 * 86400000).toISOString(),
      lastUpdate: new Date(today.getTime() - 260 * 86400000).toISOString() }
  ];
  // reflectionQuestions active 1 + resolved 1
  state.reflectionQuestions = [
    {
      id: 'rq_seed_active',
      text: '내가 진짜 원하는 일을 하면 워라밸이 없어도 괜찮은 사람인가?',
      shortText: '워라밸 vs 원하는 일',
      createdAt: new Date(today.getTime() - 5 * 86400000).toISOString(),
      source: 'manual',
      status: 'active',
      chatMessages: [
        { role: 'assistant', content: '이 질문, 같이 천천히 보자. 무엇이 처음 떠올라?', timestamp: new Date(today.getTime() - 5 * 86400000).toISOString() },
        { role: 'user', content: '내가 만약 하고 싶은 일을 하면서 살 수 있다고 해도, 워라밸을 포기하면서까지 그럴 수 있는 사람일까? 아니면 워라밸을 지키면서 살아도 하고 싶은 걸 못하면 버티기 힘든 사람일까?', timestamp: new Date(today.getTime() - 4 * 86400000).toISOString() },
        { role: 'assistant', content: '두 사람이 시기마다 번갈아 나오는 걸 수도 있어. — 지금까지 가장 \'살아있다\' 느꼈던 시기 떠올려봐. 그때 워라밸은 어땠어? 그리고 그 상태가 며칠짜리였어, 몇 달짜리였어?', timestamp: new Date(today.getTime() - 4 * 86400000).toISOString() }
      ]
    },
    // V4-fix v3 (사용자 요청): 가장 깊었던 숙고 시드 — chatMessages 풍부 (Stories용)
    {
      id: 'rq_seed_resolved_1',
      text: '박사 진로 — 학문 vs 산업 어느 길이 너에게 맞을지',
      shortText: '박사 진로 길',
      createdAt: new Date(today.getTime() - 110 * 86400000).toISOString(),
      source: 'manual',
      status: 'resolved',
      conclusion: '학문 자체보다 "환경 데이터로 사람 도움 주는 일"이 핵심. 학계만이 아니라 산업/공공도 길. 박사는 끝까지 가되, 출구 옵션 열어두기.',
      resolvedAt: new Date(today.getTime() - 60 * 86400000).toISOString(),
      chatMessages: [
        { role: 'assistant', content: '이 질문, 같이 천천히 보자. 무엇이 처음 떠올라?', timestamp: new Date(today.getTime() - 110 * 86400000).toISOString() },
        { role: 'user', content: '학문이 좋은 건지, 졸업장이 필요한 건지 헷갈려. 둘 다 진실 같기도.', timestamp: new Date(today.getTime() - 108 * 86400000).toISOString() },
        { role: 'assistant', content: '둘 다 진실일 수도 있어. 학문이 좋다면 — 어떤 부분이 가장 좋아?', timestamp: new Date(today.getTime() - 108 * 86400000).toISOString() },
        { role: 'user', content: '데이터로 패턴 발견하는 거. 그리고 그게 누군가에게 도움이 되면 진짜 만족.', timestamp: new Date(today.getTime() - 100 * 86400000).toISOString() },
        { role: 'assistant', content: '도움 = 학계만의 길? 산업 R&D, 공공 정책, NGO 데이터 컨설팅 — 다 같은 핵심을 다른 환경에서.', timestamp: new Date(today.getTime() - 100 * 86400000).toISOString() },
        { role: 'user', content: '아 그렇네. 학계 = 정체성처럼 생각해서 막혔던 듯. 길은 여러 개네.', timestamp: new Date(today.getTime() - 90 * 86400000).toISOString() },
        { role: 'assistant', content: '학계가 첫 길이 아니어도 네 핵심은 살아있을 거야. 어떻게 결론?', timestamp: new Date(today.getTime() - 85 * 86400000).toISOString() },
        { role: 'user', content: '박사 끝까지 가되, 산업/공공 출구 옵션 열어두기. 학위 자체가 정체성 X.', timestamp: new Date(today.getTime() - 70 * 86400000).toISOString() }
      ]
    },
  ];
  // missions 3 (오늘 pending / 어제 결과 체크 대기 / 오늘 completed worked) — V4 2026-05-16: mis_seed_3 expired 제거
  const yesterdayKey = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
  const dayBeforeKey = new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0];
  // 사용자 요청 2026-04-28: 결과 체크 트리거 — 미션 'completed' + attemptStatus 없음 (양생방 카드에 '🔍 결과 체크' 버튼 뜨도록)
  // 사용자 요청 2026-04-29: 코어 #2(소라의 부름)용 active 미션 추가 — 풀 튜토리얼은 ✦해볼게로 만들지만 코어 #2는 시드로 넣음
  state.missions = [
    // 사용자 보고 2026-04-30 ultrathink: status 'active' → 'pending' 필수 (createMission 표준 / getTodayMissions 필터). 'active' 면 home 에 표시 X → 튜토리얼 mission_done step 무력화 → demoAttemptResult 가 잘못된 미션(strat0_done) 픽 → step 18 결과 체크 버튼 버그.
    { id: 'mis_seed_active_call', title: '엄마 통화 시작 전 3초 호흡', description: '"나도 알아!" 나오기 전에 한 호흡 끼우기', status: 'pending', scheduledFor: todayStr, createdAt: new Date(today.getTime() - 3600000).toISOString() },
    // 사용자 명시 2026-05-01 (agent audit): _followupAsked: true 제거 — 시드 일관성. 양생방 button 자리에서 결과 체크 자연 trigger 보장.
    // 코어 #2 외 코어 (#5 / #8 등) 진입 시 testSeedV4Data 다시 호출돼도 fragile X.
    { id: 'mis_seed_strat0_done_unchecked', title: '마감 직전 환경 셋업 1번', description: '카페 자리 + 폰 다른 방', status: 'completed', completedDate: new Date(today.getTime() - 86400000).toISOString().split('T')[0], completedAt: new Date(today.getTime() - 86400000).toISOString(), createdAt: new Date(today.getTime() - 86400000).toISOString(), strategyId: 'strat_seed_0', generationIdx: 0 },
    { id: 'mis_seed_2', title: '논문 1단락', description: '서론 첫 단락', status: 'completed', completedDate: todayStr, completedAt: new Date(today.getTime() - 4 * 3600000).toISOString(), photoThumb: '', strategyId: 'strat_seed_4', generationIdx: 2, attemptStatus: 'worked' }
  ];
  // V4-fix v3 (사용자 요청): shells 180개 + SHELL_POOLS 다양 emoji 활용 (이쁜 아이콘 풍부)
  state.shellCollection = [];
  const shellTiers = ['light','daily','main','golden','call','legend'];
  const shellPoolKeys = ['light','daily','main','golden','call','legendary'];
  const shellLabels = ['가벼움','일상','메인','황금','부름','특별'];
  const shellPoints = [1, 2, 5, 10, 20, 50];
  const shellStories = [
    '오늘 한 걸음', '카페 작업 마무리', '논문 한 단락',
    '운동 30분', '실험 한 사이클', '엄마 통화',
    '거절 한 번', '책 50p', '명상 10분', '아침 일찍',
    '한강 산책', '음악 한 곡', '깊은 잠'
  ];
  // 가닥 미션 ID 풀 (DNA 조각으로 적용됨 — strategy seed 미션 ID + 새 미션)
  const strategyMissionIds = ['mis_seed_2', 'mis_seed_carryover_1'];
  // 사용자 요청 2026-04-27: 시드 소라 50개 cap
  const SEED_SHELL_CAP = 50;
  for (let i = 0; i < 360 && state.shellCollection.length < SEED_SHELL_CAP; i++) {
    const dayOffset = i;
    const dayShells = (i % 2 === 0) ? 1 : 0;
    if (dayShells === 0) continue;
    const seed = (i * 9301 + 49297) % 1000;
    let tIdx;
    if (seed < 600) tIdx = 0;
    else if (seed < 800) tIdx = 1;
    else if (seed < 900) tIdx = 2;
    else if (seed < 960) tIdx = 3;
    else if (seed < 990) tIdx = 4;
    else tIdx = 5;
    const d = new Date(today.getTime() - dayOffset * 86400000);
    // SHELL_POOLS의 다양 emoji 무작위 선택 (deterministic per index)
    const pool = (typeof SHELL_POOLS !== 'undefined') ? SHELL_POOLS[shellPoolKeys[tIdx]] : null;
    const emojiArr = pool && pool.emojis ? pool.emojis : ['🐚','🌀','🐢','🦞','⭐','✨'];
    const emoji = emojiArr[(seed >> 4) % emojiArr.length];
    // DNA 조각: 5% 확률로 가닥 미션 적용됨 (시각 차이 검증)
    const isDnaPiece = (seed % 20 === 0);
    const missionId = isDnaPiece ? strategyMissionIds[seed % strategyMissionIds.length]
                                  : (tIdx >= 4 ? 'mis_seed_2' : null);
    state.shellCollection.push({
      _id: 'shell_seed_' + state.shellCollection.length,
      type: emoji,
      tier: shellTiers[tIdx],
      points: shellPoints[tIdx],
      label: shellLabels[tIdx],
      rarity: tIdx >= 5 ? 'legendary' : (tIdx >= 4 ? 'rare' : 'common'),
      date: d.toISOString(),
      story: shellStories[i % shellStories.length],
      title: shellStories[i % shellStories.length],
      missionId,
      photoThumb: ''
    });
  }
  // 사용자 요청 2026-04-27: '특별' (legendary) 시드 5개 보장 — 등급으로 탭에서 다양한 예쁜 아이콘 보이게
  const legendarySeeds = [
    { emoji: '🌈', daysAgo: 3,  story: '발표 후 무지개 같은 해방감' },
    { emoji: '🦄', daysAgo: 18, story: '한 단락 술술 풀린 마법의 순간' },
    { emoji: '🌌', daysAgo: 35, story: '새벽 카페에서 별이 적용된 시간' },
    { emoji: '🦋', daysAgo: 70, story: '아이디어가 변태한 날' },
    { emoji: '✨', daysAgo: 120,story: '진짜 처음으로 \'할 수 있다\' 느낌' }
  ];
  legendarySeeds.forEach((ls, idx) => {
    state.shellCollection.push({
      _id: 'shell_seed_legend_' + idx,
      type: ls.emoji,
      tier: 'legend',
      points: 50,
      label: '특별',
      rarity: 'legendary',
      date: new Date(today.getTime() - ls.daysAgo * 86400000).toISOString(),
      story: ls.story,
      title: ls.story,
      missionId: null,
      photoThumb: ''
    });
  });
  // 가닥 generations에 shellId 적용하기 (gen.shells, missionId 매칭)
  // 사용자 보고 2026-04-29: DNA 조각은 'call' (부름) 또는 'legend' (특별) 티어만 — 실제 흐름과 일치
  // (이전 버그: 황금/메인/일상/가벼움 티어도 DNA로 적용돼서 시드만 비현실적으로 보임)
  (state.topicCards || []).filter(c => c.category === 'strategy' && !c._isDiagnosticSeed).forEach(card => {
    if (!Array.isArray(card.generations)) return;
    card.generations.forEach(gen => {
      if (!Array.isArray(gen.shells)) gen.shells = [];
      if (!Array.isArray(gen.attempts)) return;
      // 각 attempt에 마치 shell이 적용된 것처럼 임의 매칭 (시각 검증)
      gen.attempts.forEach((a, ai) => {
        if (a.status !== 'worked' && a.status !== 'meh') return;
        // 시드 shell 중 'call' 또는 'legend' 티어만 매칭 (이미 매칭된 거 제외)
        const free = state.shellCollection.find(s =>
          !s._dnaMatched
          && (s.tier === 'call' || s.tier === 'legend')
          && (gen.layer === 'L1' || gen.layer === 'L2' || gen.layer === 'L3')
        );
        if (free) {
          a.shellId = free._id;
          free._dnaMatched = true;
          free.missionId = a.missionId || free.missionId;
          if (!gen.shells.includes(free._id)) gen.shells.push(free._id);
        }
      });
    });
  });
  // _dnaMatched 임시 마커 제거
  state.shellCollection.forEach(s => { delete s._dnaMatched; });
  // V4 (사용자 명시 2026-05-14 ultrathink): #2 execute / archive-daily (tasks / starts) + #3 project tracking (memoryVault / projects) 시드 zap — sim 튜토 코치마크가 가리키지 않음.
  state.tasks = [];
  state.starts = [];
  state.memoryVault = [];
  state.projects = [];
  // 사용자 요청 2026-04-28: 시드 데이터 — 숙성 중·중단된 결정 제거. 1개만 (예시 — 사랑/썸 관련)
  state.decisions = [
    {
      id: 'dec_seed_active', topic: '그에게 용기를 내볼까 vs 말까', status: 'active',
      createdAt: new Date(today.getTime() - 3 * 86400000).toISOString(),
      messages: [],
      perspectives: [], predictions: [], values: []
    }
  ];
  // caseFormulation 8 차원 (problems / mechanisms / strengths / goals / growth + unverified 일부)
  // 사용자 보고 2026-04-29: cf 항목들 분기별 분산 (각 분기 review에 '자기 이해' 카테고리 보이도록)
  state.caseFormulation = {
    version: 7, lastUpdated: new Date().toISOString(),
    problems: [
      { text: '저녁 무력감으로 작업 X', confidence: 0.7, evidence_count: 3, user_verified: false, created_at: new Date(today.getTime() - 10 * 86400000).toISOString() },
      { text: '거절 후 부채감으로 공부 X', confidence: 0.6, evidence_count: 2, user_verified: true, created_at: new Date(today.getTime() - 100 * 86400000).toISOString() },
      { text: '잠 부족 시 큰 결정 후회', confidence: 0.55, evidence_count: 2, user_verified: false, created_at: new Date(today.getTime() - 200 * 86400000).toISOString() },
      { text: '관계 깊이 회피', confidence: 0.5, evidence_count: 1, user_verified: false, created_at: new Date(today.getTime() - 280 * 86400000).toISOString() }
    ],
    mechanisms: [
      { text: '과부하 → 회피 → 자책 루프', confidence: 0.65, evidence_count: 4, user_verified: false, created_at: new Date(today.getTime() - 15 * 86400000).toISOString() },
      { text: '인지 자원 고갈 → 충동적 결정', confidence: 0.6, evidence_count: 2, user_verified: false, created_at: new Date(today.getTime() - 130 * 86400000).toISOString() },
      { text: '시간 압박 → 도파민 급증 → 폭발력', confidence: 0.7, evidence_count: 3, user_verified: true, created_at: new Date(today.getTime() - 220 * 86400000).toISOString() }
    ],
    strengths: [
      { text: '마감 직전 폭발력 신뢰 가능', confidence: 0.85, evidence_count: 5, user_verified: true, created_at: new Date(today.getTime() - 25 * 86400000).toISOString() },
      { text: '깊이 파는 습관', confidence: 0.7, evidence_count: 3, user_verified: false, created_at: new Date(today.getTime() - 90 * 86400000).toISOString() },
      { text: '환경 셋업 능력', confidence: 0.75, evidence_count: 4, user_verified: true, created_at: new Date(today.getTime() - 180 * 86400000).toISOString() },
      { text: '자기 인식 의식적', confidence: 0.65, evidence_count: 2, user_verified: false, created_at: new Date(today.getTime() - 270 * 86400000).toISOString() }
    ],
    goals: [
      { text: '박사 졸업 (2027)', confidence: 0.9, evidence_count: 1, user_verified: true, created_at: new Date(today.getTime() - 30 * 86400000).toISOString() },
      { text: '논문 첫 저자 1편 (이번 분기)', confidence: 0.6, evidence_count: 2, user_verified: false, created_at: new Date(today.getTime() - 5 * 86400000).toISOString() },
      { text: '거절 패턴 풀기', confidence: 0.65, evidence_count: 2, user_verified: false, created_at: new Date(today.getTime() - 150 * 86400000).toISOString() },
      { text: '실험 결과 1건 publish', confidence: 0.55, evidence_count: 1, user_verified: false, created_at: new Date(today.getTime() - 240 * 86400000).toISOString() }
    ],
    growth: [
      { text: '환경 차원 도구 사용 늘어남', confidence: 0.8, evidence_count: 3, user_verified: false, created_at: new Date(today.getTime() - 7 * 86400000).toISOString() },
      { text: '자기 친절 톤 정착', confidence: 0.6, evidence_count: 2, user_verified: false, created_at: new Date(today.getTime() - 110 * 86400000).toISOString() },
      { text: '거절 그날 안에 답하기', confidence: 0.7, evidence_count: 3, user_verified: true, created_at: new Date(today.getTime() - 230 * 86400000).toISOString() }
    ],
    unverified: {
      problems: [{ text: '저녁 무력감으로 작업 X', addedAt: new Date(today.getTime() - 10 * 86400000).toISOString() }],
      mechanisms: [{ text: '과부하 → 회피 → 자책 루프', addedAt: new Date(today.getTime() - 15 * 86400000).toISOString() }],
      strengths: [{ text: '깊이 파는 습관', addedAt: new Date(today.getTime() - 18 * 86400000).toISOString() }],
      goals: [{ text: '논문 첫 저자 1편 (이번 분기)', addedAt: new Date(today.getTime() - 5 * 86400000).toISOString() }],
      growth: [{ text: '환경 차원 도구 사용 늘어남 (지난 분기 비교)', addedAt: new Date(today.getTime() - 7 * 86400000).toISOString() }]
    }
  };
  // V4-fix v3: monthlyReviews 12개 (지난 1년 매달)
  state.monthlyReviews = [];
  const monthlyTones = [
    { flow: '환경 차원 도구 시작 — 카페·자동 종료', pattern: '거절 후 부채감 N회' },
    { flow: '실험 사이클 정리 + 첫 success', pattern: '주말 휴식 부족' },
    { flow: '논문 서론 마무리 + 리뷰 받음', pattern: '저녁 무력감 ↑' },
    { flow: '학회 발표 준비 + 발표 완료', pattern: '발표 후 번아웃 1주' },
    { flow: '여름 휴식 + 가족 시간', pattern: '회복 모드 — 일 거의 X' },
    { flow: '실험 새 사이클 + 데이터 수집', pattern: '아침 리듬 회복' },
    { flow: '논문 결과 부분 시작', pattern: '잠 부족 패턴 재등장' },
    { flow: '거절 패턴 깨짐 — 첫 거절 성공', pattern: '관계 우선 재정립' },
    { flow: '운동 루틴 시작 + 30일 지속', pattern: '저녁 명상 시도' },
    { flow: '결정화 첫 가닥 — 마감 폭발력', pattern: 'DNA 진주 첫' },
    { flow: '겨울 — 심사숙고 시간 늘어남', pattern: '마법고동 활성화' },
    { flow: '봄 — 새 시작 에너지', pattern: 'SNS 줄임 시작' }
  ];
  for (let m = 1; m <= 12; m++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 15);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    const tone = monthlyTones[m - 1];
    state.monthlyReviews.push({
      id: 'mr_seed_' + m,
      monthKey,
      completedAt: new Date(today.getTime() - (m * 30 - 14) * 86400000).toISOString(),
      summary: `${m}달 전 흐름: ${tone.flow}`,
      sections: {
        patterns: tone.pattern,
        good_moments: '환경 도구 시도 늘어남 + 거절 패턴 부분 풀림.',
        hard_moments: '저녁 무력감 + 마감 직전 압박.',
        next_suggestion: '환경 차원 한 가지 더 시도.'
      },
      auto: true,
      stats: { checkins: 18 + (m % 5), missions: 5 + (m % 4), worked: 3 + (m % 3), pearls: 1 + (m % 3) }
    });
  }
  // 사용자 명시 2026-04-30 ultrathink: 주간 리뷰 시드 (옛 형식 폐기 → 새 schema 풀세트). 4 주치 — 신규 / 누적 / 위기 / 풀 풍부 케이스 다 demo.
  state.weeklyReviews = [];
  const _wkSeeds = [
    {
      offset: 5, weekKey: 'W-5',
      one_word_weekly: '회복중',
      summary: '잠을 챙긴 주, 마음이 한결 가벼워짐.',
      scenes: [
        { when: '화요일 밤', what: '7시간 잤더니 다음날 머리가 맑아', feeling: '안심' },
        { when: '목요일 저녁', what: '엄마 통화 후 5분 산책으로 회복', feeling: '따뜻' },
        { when: '토요일 새벽', what: '카페 갔는데 글이 술술 써짐', feeling: '풀림' }
      ],
      pattern: { headline: '잘 잔 다음날, 한결 가벼웠어', evidence: '"오늘 7시간 잤더니 머리가 맑아." (화/금)', condition: '평일 11시 전 취침 시' },
      quotes: ['"오늘 7시간 잤더니 머리가 맑아."', '"엄마 통화 후 5분 산책 = 회복."', '"마감 임박 = 자연 진입."', '"카페에서 글 잘 써짐."', '"운동 한 날 일기가 길어."'],
      strengths: ['월요일 마감 임박에도 잠 7시간 챙김', '엄마 통화 후 5분 산책으로 회복', '카페 환경 setup 적극 활용 — 3회'],
      cycles: { sleep: '평일 7h+ 4일 → mood 평균 +1.5', mode: '시험 모드 활성 → 카페인 ↑ but 회복 동시 챙김', other: '' },
      emotions: [{ word: '안심', count: 5 }, { word: '집중', count: 4 }, { word: '압도', count: 2 }],
      value_align: { score: 8, aligned: '회복 + 자기 친밀 가치와 align — 잠 챙김 + 산책', gap: '' },
      risk_signals: { level: 'none', signals: [], suggestion: '' },
    },
    {
      offset: 4, weekKey: 'W-4',
      one_word_weekly: '가속중',
      summary: '논문 마감 가까워서 몰입도 올라감.',
      scenes: [
        { when: '수요일 새벽', what: '4시간 통째 몰입 — 시간 사라짐', feeling: '뿌듯' },
        { when: '금요일 밤', what: '마감 5일 전부터 도파민 부스터', feeling: '몰입' },
        { when: '일요일 저녁', what: '운동 한 시간으로 몰입 후 회복', feeling: '균형감' }
      ],
      pattern: { headline: '마감 임박할수록 진짜 빠르게 몰입돼', evidence: '"마감 5일 전부터 도파민 부스터." (수)', condition: 'D-7 안쪽' },
      quotes: ['"마감 5일 전부터 도파민 부스터."', '"오늘 4시간 통째 몰입."', '"잠 줄여도 일 잘 돼."', '"음악 + 카페 = 시너지."', '"끝나면 다 회복."'],
      strengths: ['몰입 4시간 세션 2회 성공', '저녁 운동으로 몰입 후 회복 챙김', '음악 환경 일관 setup'],
      cycles: { sleep: '잠 6h 대로 살짝 줄음 — 마감 mode 일시적 OK', mode: '시험 모드 풀 가동', other: '' },
      emotions: [{ word: '몰입', count: 6 }, { word: '피곤', count: 3 }, { word: '뿌듯', count: 3 }],
      value_align: { score: 7, aligned: '성취 + 몰입 가치 align', gap: '회복 가치는 일시적으로 낮춤 (의도된 trade-off)' },
      risk_signals: { level: 'watch', signals: ['수면 6h 4일 연속 — 다음 주 회복 자리 확보'], suggestion: '마감 후 주말 휴식 의식적으로. 자책 X — 의도된 spike.' },
    },
    {
      offset: 3, weekKey: 'W-3',
      one_word_weekly: '휘청중',
      summary: '마감 끝났는데 회복 아직 못 잡힘.',
      scenes: [
        { when: '월요일 아침', what: '침대에서 못 일어남 — 그대로 12시', feeling: '텅' },
        { when: '수요일 밤', what: '산책 가려다 그냥 누움', feeling: '무기력' },
        { when: '금요일 점심', what: '카톡 답장도 귀찮아서 미룸', feeling: '공허' }
      ],
      pattern: { headline: '마감 끝나고 며칠은 텅 빈 느낌이 와', evidence: '"오늘도 침대에서 못 일어났어." (월/화/수)', condition: '큰 spike 직후' },
      quotes: ['"오늘도 침대에서 못 일어났어."', '"마감 끝났는데 텅 빈 느낌."', '"산책도 귀찮."', '"그냥 누워있고 싶어."', '"이게 burnout 인가?"'],
      strengths: ['그래도 매일 일기 한 줄은 남김', '엄마한테 카톡 한 번 답장', '잠은 충분히 잠'],
      cycles: { sleep: '잠 9h+ 3일 — 회복 mode 자동 진입', mode: '활성 모드 X — 자연 휴식', other: '비 오는 날 3일 → 무기력 ↑ 가능' },
      emotions: [{ word: '무기력', count: 7 }, { word: '공허', count: 4 }, { word: '평온', count: 2 }],
      value_align: { score: 4, aligned: '회복 가치 일치 — 무리 X', gap: '성장·연결 가치는 잠시 멈춤 (의도 X 자연 흐름)' },
      risk_signals: { level: 'watch', signals: ['mood 평균 2.3 — 평소보다 낮음 3일+', '사람 만남 0건'], suggestion: '무리 X 자기 친밀. 1-2명 가까운 사람 짧은 카톡 만 시도. 안 되면 패스 OK.' },
    },
    {
      offset: 2, weekKey: 'W-2',
      one_word_weekly: '재정비',
      summary: '천천히 일상 복귀, 새 리듬 잡는 중.',
      scenes: [
        { when: '목요일 아침', what: '30분 산책 후 일기가 길게 써짐', feeling: '풀림' },
        { when: '토요일 점심', what: '친구 카톡 답장 하나로 하루 살아남', feeling: '따뜻' },
        { when: '일요일 저녁', what: '카페 한 곳 정착 — 환경 안정됨', feeling: '안정' }
      ],
      pattern: { headline: '아침에 움직인 날, 일기가 길게 써졌어', evidence: '"아침 30분 산책 후 글이 술술." (목/토)', condition: '7시 기상 + 30분 운동' },
      quotes: ['"아침 30분 산책 후 글이 술술."', '"카페 한 곳 정착 — 환경 안정."', '"친구 카톡 답장 하나 = 하루 좋아짐."', '"잠 일찍 자는 게 가장 큰 효과."', '"느려도 괜찮아."'],
      strengths: ['아침 7시 기상 4일', '친구 카톡 답장 — 작은 연결 회복', '카페 환경 정착으로 작업 안정'],
      cycles: { sleep: '평일 7h+ 안정 → mood 평균 3.5', mode: '회복 모드 + 일상 mode 균형', other: '' },
      emotions: [{ word: '평온', count: 5 }, { word: '집중', count: 4 }, { word: '뿌듯', count: 3 }],
      value_align: { score: 8, aligned: '회복 + 작은 성장 가치 다 align', gap: '' },
      risk_signals: { level: 'none', signals: [], suggestion: '' },
    }
  ];
  _wkSeeds.forEach((s, i) => {
    state.weeklyReviews.push({
      id: 'wr_seed_' + (i + 1),
      _seed: today.getTime(),
      weekKey: s.weekKey,
      completedAt: new Date(today.getTime() - s.offset * 7 * 86400000).toISOString(),
      one_word_weekly: s.one_word_weekly,
      summary: s.summary,
      scenes: s.scenes,
      pattern: s.pattern,
      quotes: s.quotes,
      strengths: s.strengths,
      cycles: s.cycles,
      emotions: s.emotions,
      value_align: s.value_align,
      risk_signals: s.risk_signals,
      auto: true
    });
  });

  // chatArchive 3일치 (V3.13.x 7일 cap, 일부 채워두기)
  state.chatArchive = [];
  for (let d = 7; d >= 5; d--) {
    const ad = new Date(today.getTime() - d * 86400000);
    state.chatArchive.unshift({
      date: ad.toISOString().split('T')[0],
      summary: `${d}일 전 — 가볍게 일상 + 한 가지 고민. 환경 도구 시도.`,
      messageCount: 8,
      archivedAt: new Date(today.getTime() - (d - 1) * 86400000).toISOString()
    });
  }
  // V4-fix v3 (사용자 요청): insights 시드 — AI 인과관계/패턴 발견 (다양 type/confidence/상태)
  state.insights = [
    { id: 'ins_seed_1', type: 'causal',  content: '잠 6시간 미만인 다음 날 vitality가 평균 1.2 떨어짐.',
      evidence: '지난 30일 중 9번 잠 6시간 미만, 그 다음 날 mood/vit 모두 ↓.',
      supportingEntryIds: [], confidence: 0.78, discoveredAt: new Date(today.getTime() - 8 * 86400000).toISOString(), dismissed: false, user_verified: false },
    { id: 'ins_seed_2', type: 'pattern', content: '한강 산책한 날엔 논문 작업이 더 잘 됨.',
      evidence: '"한강" 키워드 일기 7번, 그 중 6번 작업 진척.',
      supportingEntryIds: [], confidence: 0.85, discoveredAt: new Date(today.getTime() - 14 * 86400000).toISOString(), dismissed: false, user_verified: true },
    { id: 'ins_seed_3', type: 'causal',  content: '저녁 9시 이후 작업 시도 → 다음 날 무력감 ↑.',
      evidence: '늦은 작업 12번, 다음 날 drained 모드 8번.',
      supportingEntryIds: [], confidence: 0.72, discoveredAt: new Date(today.getTime() - 20 * 86400000).toISOString(), dismissed: false, user_verified: false },
    { id: 'ins_seed_4', type: 'pattern', content: '월경 첫 2일은 휴식 모드가 안정적 — 죄책감 X 회복 우선.',
      evidence: '월경 1-2일차 entries 중 78%가 vit≤2 / mood↓ but 다음 주 회복.',
      supportingEntryIds: [], confidence: 0.68, discoveredAt: new Date(today.getTime() - 30 * 86400000).toISOString(), dismissed: false, user_verified: false },
    { id: 'ins_seed_5', type: 'causal',  content: '엄마 통화 후 이튿날 mood 평균 +0.8.',
      evidence: '엄마 키워드 메시지 5번, 그 다음 날 mood 평균 ↑.',
      supportingEntryIds: [], confidence: 0.65, discoveredAt: new Date(today.getTime() - 45 * 86400000).toISOString(), dismissed: false, user_verified: true },
    { id: 'ins_seed_6', type: 'pattern', content: '주말 늦잠 후 논문 작업이 평소보다 잘 됨.',
      evidence: '주말 9시+ 기상 4번, 그 중 3번 작업 진척.',
      supportingEntryIds: [], confidence: 0.55, discoveredAt: new Date(today.getTime() - 60 * 86400000).toISOString(), dismissed: false, user_verified: false },
    { id: 'ins_seed_7', type: 'causal',  content: '카페 환경에서 30분 이상 작업한 날 — 그날 일기 톤 긍정.',
      evidence: '"카페" 일기 11번, 그 중 9번 긍정 톤.',
      supportingEntryIds: [], confidence: 0.81, discoveredAt: new Date(today.getTime() - 90 * 86400000).toISOString(), dismissed: false, user_verified: false },
    { id: 'ins_seed_8', type: 'pattern', content: '거절 직후 5분 산책 → 부채감 빨리 풀림.',
      evidence: '거절 패턴 6번 중 산책 4번 동반, 그 4번 다음 날 mood 정상.',
      supportingEntryIds: [], confidence: 0.62, discoveredAt: new Date(today.getTime() - 120 * 86400000).toISOString(), dismissed: false, user_verified: false },
    // dismissed 1개 (시뮬용)
    { id: 'ins_seed_9', type: 'pattern', content: '비 오는 날 음악 진주 더 자주.',
      evidence: '비 일기 4번, 음악 진주 적용됨 2번.',
      supportingEntryIds: [], confidence: 0.48, discoveredAt: new Date(today.getTime() - 200 * 86400000).toISOString(), dismissed: true, user_verified: false }
  ];

  // V4 (사용자 명시 2026-05-14 ultrathink): #2 todaySchedule (archive-daily 타임테이블) 시드 zap — sim 튜토 코치마크가 가리키지 않음.
  state.todaySchedule = [];
  // 사용자 요청 2026-04-28: 2026-04-15 캘린더 모달 풍성화 — chat/pearls/archive/topicCards 모두 push (collection 초기화 다 끝난 시점)
  const _richDate = '2026-04-15';
  const _richTs = new Date(_richDate + 'T05:30:00').getTime();
  if (Array.isArray(state.chatMessages)) {
    state.chatMessages.push(
      { role: 'user',      content: '새벽 카페에서 한 시간 만에 첫 단락 끝남. 진짜 며칠 만에 흐름이 트임.', timestamp: new Date(_richTs).toISOString(), chapterStart: true, chapterMeta: { category: 'diary', summary: '새벽 카페 흐름', strategyId: null } },
      { role: 'assistant', content: '환경 + 음악 콤보가 진짜 강력했나봐. 그 \'됐다\' 순간이 머리 속에 적용됐을 거야 — 다음에도 비슷한 셋업이 trigger 될 가능성 ↑.', timestamp: new Date(_richTs + 60000).toISOString() },
      { role: 'user',      content: '맞아. 이 곡 자체가 trigger 같아. 카페 자리도 그 모서리 자리만 됨.', timestamp: new Date(_richTs + 120000).toISOString() },
      { role: 'assistant', content: '진주 후보야 — 음악 + 장소. "새벽 카페 LNGSHOT" 한 묶음으로 넣어두면 다음에 막혔을 때 돌아갈 anchor 돼.', timestamp: new Date(_richTs + 180000).toISOString() }
    );
  }
  if (Array.isArray(state.pearls)) {
    state.pearls.push({
      id: 'pearl_seed_rich_place', category: '장소',
      content: '새벽 카페 모서리 자리',
      note: 'LNGSHOT 들으면서 첫 단락 푼 자리. 다시 갈 때마다 그 감각.',
      createdAt: new Date(_richDate + 'T05:45:00').toISOString(),
      type: 'pearl'
    });
    state.pearls.push({
      id: 'pearl_seed_rich_moment', category: '순간',
      content: '논문 서론 첫 단락 마지막 줄',
      note: '\'됐다\' 한 그 순간. 며칠 막힘이 풀린 안도.',
      createdAt: new Date(_richDate + 'T05:50:00').toISOString(),
      type: 'pearl'
    });
  }
  if (Array.isArray(state.archive)) {
    state.archive.push({
      type: 'scrap',
      headline: '환경 + 음악 = trigger 묶음',
      body: '특정 음악 + 특정 장소 조합이 작업 진입 trigger로 작동. 우연 X 신호.',
      original: '[나]\n새벽 카페에서 LNGSHOT 들으면서 막힘이 풀렸어. 곡 + 자리 조합이 진짜 trigger 같아.\n\n[소라]\n환경 cuing 효과 — 특정 자극 묶음이 행동 trigger로 학습됨. 같은 셋업 의도적으로 재현하면 같은 흐름 가능성 ↑.',
      insight: '환경 cuing — 음악 + 장소 묶음 = 작업 진입 자동화.',
      tags: ['환경', '음악', '집중'],
      date: new Date(_richDate + 'T06:00:00').toLocaleDateString('ko-KR'),
      source: '대화',
      savedAt: new Date(_richDate + 'T06:00:00').toISOString(),
      revisitCount: 3,
      starred: true
    });
  }
  if (Array.isArray(state.topicCards)) {
    state.topicCards.push({
      id: 'topic_seed_rich_415',
      category: 'memory',
      title: '새벽 카페 흐름의 날',
      summary: 'LNGSHOT + 카페 모서리 자리 = 첫 단락 완성. 환경 cuing 패턴 인식.',
      chapterStartedAt: new Date(_richTs).toISOString(),
      chapterEndedAt: new Date(_richTs + 1800000).toISOString(),
      messageCount: 4,
      createdAt: new Date(_richDate + 'T05:30:00').toISOString()
    });
  }

  // V4 (사용자 명시 2026-05-14 ultrathink): #4 godongDiary (rotating card source) 시드 zap — sim 튜토 코치마크가 가리키지 않음.
  if (Array.isArray(state.godongDiary)) state.godongDiary = [];

  // 사용자 보고 2026-04-30: 새로 적용된 시드 항목 전부에 _seed marker 적용하기 → init sweep에서 자동 정리.
  _markSeedItems();
  saveState({ force: true });
  showToast('🌱 V4 전체 시드 데이터 적용됨. 도서관/모래사장/실행/나/홈 둘러보기.');
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderShellBar === 'function') renderShellBar();
  if (typeof renderReflectionHome === 'function') renderReflectionHome();
  if (typeof renderHome === 'function') renderHome();
}

