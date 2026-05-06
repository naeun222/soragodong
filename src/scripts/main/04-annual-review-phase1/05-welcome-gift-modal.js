// V4 (사용자 명시 2026-05-04 ultrathink V193): 옛 showWelcomeBonusModal 함수 삭제. 신규 환영 모달 = _showWelcomeGiftModal (Core 1 끝 trigger).

// 개발자 도구 — 주간 리뷰 신규 schema 풀 미리보기 (시드 데이터, AI 호출 X).
// 사용자 명시 2026-04-30 ultrathink: chart / strengths / cycles / emotions / value_align / risk_signals 모두 demo. 위기 신호 'watch' 케이스 + 가치 align bar + 7일 차트 다 한 화면에.
function devPreviewWeeklyReview() {
  if (typeof renderReviewScreen !== 'function') { alert('renderReviewScreen 미정의'); return; }
  const today = new Date();
  // entries 가 부족하면 chart 가 표시 X 라 임시 7일 mood/energy 시드 inject (기존 entries 안 건드림 — testerMode 권장)
  if (!state.preferences || !state.preferences.testerMode) {
    if (!confirm('테스터 모드 OFF 인데 진행 시 임시 entries 가 state 에 적용될 수 있어. 권장: 테스터 모드 ON 후 진행. 계속?')) return;
  }
  const reviewData = {
    one_word_weekly: '회복중',
    summary: '잠을 챙긴 주, 마음이 한결 가벼웠어.',
    pattern: {
      headline: '잘 잔 다음날, 기분이 한 단계 가벼워',
      evidence: '"오늘 일찍 잤더니 머리 맑아." (화) / "잠 짧으면 한 적용하자 늦더라." (목)',
      condition: '평일 11시 전에 잤을 때 — 5일 중 4일'
    },
    quotes: [
      '"오늘 일찍 잤더니 머리 맑아."',
      '"엄마 통화하고 5분 걸으니까 풀려."',
      '"마감 임박 = 자연 진입, 미루기 X."',
      '"카페에서 글이 술술 써졌어."',
      '"운동 한 날 일기가 길어."'
    ],
    strengths: [
      '월요일 마감 임박에도 일찍 자고 잠 챙김 — 평소 패턴 깸',
      '엄마 통화 끝나고 5분 산책으로 바로 회복',
      '카페에서 글 쓴 날 3번 — 환경 잘 골랐어'
    ],
    cycles: {
      sleep: '평일에 일찍 잔 4번, 다음날마다 한결 가벼웠어. 토요일 늦게 잤더니 일요일 처짐.',
      mode: '시험기인데도 카페 가서 글이 술술 — 카페인 늘되 산책·일찍 자기로 회복 챙김',
      other: '비 오는 날 2일 살짝 무거웠어'
    },
    emotions: [
      { word: '안심', count: 5 },
      { word: '집중', count: 4 },
      { word: '뿌듯', count: 3 },
      { word: '압도', count: 2 }
    ],
    value_align: {
      score: 8,
      aligned: '"회복" — 잠 일찍 잔 날 4번, 산책 3번 / "자율" — 카페 가는 거 스스로 정함',
      gap: '"연결"은 살짝 약했어 — 이번 주는 회복기였으니 OK'
    },
    risk_signals: {
      level: 'watch',
      signals: ['주말에 한 번 늦잠 — 평일 리듬 안 무너지게만 챙기자'],
      suggestion: '주말도 평일이랑 한 시간 차이 안에서 자면 마음 안정. 무리 X — 의식만 살짝.'
    },
    seeds: [
      '평일 11시 알람 지킨 날 (목표: 5/5)',
      '카페에서 작업한 날 vs 집에서 작업한 날'
    ],
    seed_callbacks: '지난 주 씨앗 "잘 잔 다음날 어떤지" → 4번 중 4번 가벼웠어. 패턴 확정.'
  };

  // 사용자 명시 2026-04-30 ultrathink: '이 기간 깨달음 N개' 카드 통째로 보여주기 위해 풍부한 archive 5개 시드.
  // _buildReviewArchiveSummaryHTML 가 사용하는 모든 필드 inject: tags / type / savedAt / headline / body / starred / revisitCount
  // savedAt 분포 — 초/중/말미 시각 분포 보여주기 위해 분산 (chart 패턴 + 화두 무게중심 + 갈래 클러스터 시각화)
  const _seedNow = new Date();
  const _seedAgo = (days, hours) => new Date(_seedNow.getTime() - days * 86400000 - (hours || 0) * 3600000).toISOString();
  reviewData._seed_archive_for_preview = [
    {
      type: 'memo',
      headline: '아침 산책 한 날 = 그날 일기 길어',
      body: '아침 30분 걸은 화/목 — 일기에 자연스럽게 손이 가더라. 몸이 풀려야 글이 나오나봐.',
      tags: ['루틴', '회복', '글쓰기'],
      savedAt: _seedAgo(6),
      starred: true,
      revisitCount: 3
    },
    {
      type: 'scrap',
      headline: '카페 한 곳 정착 — 환경 안정',
      body: '같은 카페 3번 가니까 머리 자동 ON. 환경이 만들어주는 거 같아.',
      tags: ['환경', '집중', '루틴'],
      savedAt: _seedAgo(5, 4),
      revisitCount: 1
    },
    {
      type: 'memo',
      headline: '잠 일찍 자는 게 가장 큰 효과',
      body: '11시 전 자면 다음날 mood 한 단계 가벼움. 이거 진짜 핵심이야.',
      tags: ['수면', '회복'],
      savedAt: _seedAgo(4, 12),
      starred: true,
      revisitCount: 5
    },
    {
      type: 'reflection',
      headline: '엄마 통화는 반드시 산책 + 짝지어야 회복',
      body: '통화 직후 그냥 앉아있으면 무거움 남음. 5분 산책으로 풀어야 흐르네.',
      tags: ['회복', '관계'],
      savedAt: _seedAgo(2, 8)
    },
    {
      type: 'memo',
      headline: '마감 임박 = 자연 진입, 미루기 X',
      body: '결함이 아니라 작동 방식. 임박해야 진입 빠른 건 인정하고 활용.',
      tags: ['집중', '작동방식'],
      savedAt: _seedAgo(1, 2),
      starred: true,
      revisitCount: 2
    }
  ];
  // chart 표시 위해 임시 entries 7일 inject (state 적용하지 X — review screen 에서만 cutoff/cutoffEnd 안에서 entries 필터)
  // renderReviewScreen 가 state.entries 를 cutoff 으로 필터하므로, 시드 entries 있으면 chart 자동 표시
  // 7일 차트 — 마지막 7일에 mood/energy 변동 있는 시드 entry 가 state.entries 에 있으면 자동 그려짐 (testSeedV4Data 가 entries 채워둠)
  // entries 부족 시 chart X — graceful empty.

  // dataset 직접 set 후 renderReviewScreen 호출
  showScreen('review');
  setTimeout(() => {
    if (typeof renderReviewScreen === 'function') {
      renderReviewScreen('weekly', reviewData);
      showToast('📅 주간 리뷰 미리보기 (시드)');
    }
  }, 100);
}

// V4 (사용자 명시 2026-05-06 ultrathink): welcome-gift-modal 통째 폐기 → devPreviewWelcomeBonus 도 dead.
// 옛 dev tool 진입 stub 보존 — 호출 시 안내 토스트만.
function devPreviewWelcomeBonus() {
  if (typeof showToast === 'function') showToast('환영 모달 폐기됨 — 신규 무료 체험은 설정 카드 표시');
}

// 사용자 보고 2026-04-30 review (agent): AI 응답 JSON 견고 추출.
// max_tokens 부족 truncation / markdown code fence / 외부 텍스트 등 robust.
// 사용: generateFirstTouchFromCoreData, generateReview 등.
function _robustJsonExtract(text) {
  if (!text || typeof text !== 'string') throw new Error('빈 응답');
  // markdown fence strip
  let s = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  const start = s.indexOf('{');
  if (start < 0) throw new Error('JSON 객체 시작 없음');
  // brace-balanced 닫힘 (string literal escape 포함)
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('JSON 닫힘 없음 (truncated 의심 — max_tokens 부족 가능)');
  return JSON.parse(s.slice(start, end + 1));
}

