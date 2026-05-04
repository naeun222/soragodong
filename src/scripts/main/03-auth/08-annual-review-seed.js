function _buildAnnualReviewSeedData(year) {
  const yr = year || (new Date().getFullYear() - 1);
  return {
    id: 'ar_seed_' + yr,
    type: 'annual',
    year: yr,
    completedAt: new Date().toISOString(),
    yearRange: `${yr} → ${yr + 1}`,
    oneWord: '회복',
    persona: '자책에서 관찰로 1년 — 결함이 아닌 작동 방식을 본 사람',
    personaReason: '잘 잔 다음날 4번 중 4번 가벼웠어. 카페 자리잡은 후 글이 술술. 패턴이 보였어.',
    stats: [
      { emoji: '📔', num: 226, label: '일기' },
      { emoji: '💬', num: 142, label: '대화' },
      { emoji: '🎯', num: '67%', label: '성공률' },
      { emoji: '✨', num: 31, label: '깨달음' },
      { emoji: '🧬', num: 4, label: '체화' },
      { emoji: '🐚', num: 1, label: '큰 결정' }
    ],
    finding1: {
      label: '너는 몰랐지만 내가 발견한 것',
      quote: '"오늘 일찍 잤더니 머리 맑아."',
      dataNum: '+한 단계',
      dataText: '평일 11시 전 잔 5일 중 4일.\n다음날 mood 한 단계 가벼움.',
      conclusion: '잘 자는 게 일이 아니라\n<span>너를 살리는 첫 번째 도구</span>였어'
    },
    finding2: {
      label: '또 하나',
      friendLow: '23',
      friendLowLabel: '집에서\n작업한 날',
      friendHigh: '41',
      friendHighLabel: '카페에서\n작업한 날',
      conclusion: '환경이 너를 만들어 — <span>의지보다\n자리</span>가 먼저였어'
    },
    // 사용자 명시 2026-05-02 ultrathink: 보편 ADHD 자기관찰 — 잠 / 환경 / 회복 / 활용 패턴.
    tree: {
      embodied: [
        { name: '잠 11시 전 자기',     emoji: '🌙' },
        { name: '환경 큐잉 (폰 멀리)', emoji: '🏠' },
        { name: '14일 숙성',           emoji: '🐚' },
        { name: '마감 임박 = 활용',    emoji: '⚡' }
      ],
      growing: [
        { name: '아침 산책',           emoji: '🚶' },
        { name: '새벽 4시 컷오프',     emoji: '🌅' },
        { name: '카페 자리잡음',       emoji: '☕' },
        { name: '딱 5분 룰',           emoji: '⏱' }
      ],
      trying: [
        { name: '통화 후 5분 산책',    emoji: '📞' },
        { name: '감정 후 운동',        emoji: '🏃' },
        { name: '회의 30분 전 정리',   emoji: '📋' }
      ],
      caption: '이제 이 정도는 너 혼자서도 해낼 수 있어 🫂'
    },
    beach: {
      diaryCount: 226,
      pearlCount: 31,
      bestPearl: '결함이 아니라 작동 방식'
    },
    // 사용자 명시 2026-05-02 ultrathink: '잊지 못할 순간' = 보편 ADHD 자기관찰 turning points. 사진 X (emoji + bg fallback 자동).
    moments_card: [
      { date: yr + '.04.18', text: '잠 11시 전 자기 시작 — 첫 주', emoji: '🌙', bg: 'linear-gradient(135deg, #5a4a72 0%, #2a2440 100%)' },
      { date: yr + '.07.05', text: '카페 자리잡음 — 환경의 힘 발견',   emoji: '☕', bg: 'linear-gradient(135deg, #8b6f47 0%, #3d3024 100%)' },
      { date: yr + '.10.12', text: '마감 임박 = 자연 진입 인정한 날',   emoji: '⚡', bg: 'linear-gradient(135deg, #c98c5a 0%, #5a3a24 100%)' }
    ],
    // 사용자 명시 2026-05-02 ultrathink: best_pearl = 보편 ADHD self-compassion (결함 아닌 작동 방식).
    best_pearl: {
      title: '결함이 아니라 작동 방식',
      summary: '마감 임박이면 빠르게 진입하는 거 — 고치려 하지 말고 활용해.',
      whyThisYear: '한 해 동안 일기·깨달음에 자꾸 등장한 한 마디야. "왜 미루지?" 자책하던 시절보다, "임박해야 진입 빠른 게 내 작동 방식" 받아들인 다음부터 일·휴식 둘 다 더 안정적이었어. 머리로 정한 "정상 작동" 보다 몸의 진짜 리듬이 더 정확했던 거야.'
    },
    realizations: {
      count: { scrap: 12, memo: 14, reflection: 5 },  // 합 31 = stats 의 깨달음 31 일치
      topTags: ['수면', '환경', '회복', '활용']
    },
    // 사용자 명시 2026-05-02 ultrathink: 깊은 숙고 = 보편 ADHD 자기관찰 — 기본기 vs 추진력.
    deep: {
      question: '"잘 자고 산책하는 게\n진짜 큰 일을 해내는 길일까?"',
      conclusion: '"기본기가 곧 추진력 — 회복 챙기면서 한다"',
      date: yr + '.10.05 → 10.18 · 14일'
    },
    // oneLine = 이미 universal — 보존.
    oneLine: '너 올해 많이 컸어.\n\n자책에서 관찰로,\n회피에서 회복으로.\n\n수고했어 🫂',
    // 사용자 명시 2026-04-30: 시드 진주 음악 카테고리 8곡 그대로 (artworkUrl + previewUrl + trackUrl). 자동 재생.
    // narrative arc 매핑 — 표지 (card1) = 마지막 (card10) = LNGSHOT Vanilla Days (수미상관).
    songs: {
      card1: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      },
      card2: {
        title: 'Pink + White', artist: 'Frank Ocean',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/bb4568f3-68cd-619d-fbcb-4e179916545d/BlondCover-Final.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/45/a8/a2/45a8a2e0-9516-86b2-66ea-e8b2bf71de68/mzaf_10773372944954067241.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/pink-white/1146195596?i=1146195714'
      },
      card3: {
        title: 'Love Hangover', artist: 'JENNIE & Dominic Fike',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/1c/57/15/1c571583-f4bc-3307-6e5e-8b9e68d05913/196872850918.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f6/4c/16/f64c164b-bd28-87fd-5217-7409675e6374/mzaf_10560279388547786839.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/love-hangover/1793379140?i=1793379141'
      },
      card4: {
        title: 'Stephanie', artist: 'Cloonee, Young M.A & InntRaw',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/97/e4/10/97e41086-cff2-f7b5-83b3-3a085b4d2026/cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/d0/1e/40/d01e4015-c383-2c2a-9445-f47edb4ae5e0/mzaf_10847000075002169806.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/stephanie/1779339882?i=1779339883'
      },
      card5: {
        title: "Moonwalkin'", artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/74/94/a2/7494a26e-4756-c082-5709-8526127baee8/cover_KM0023994_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/da/1f/e9/da1fe9e9-f784-b4f2-c181-c8f770aa2ede/mzaf_13144624855104730433.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/moonwalkin/1866762522?i=1866762525'
      },
      card6: {
        title: 'PINKY UP', artist: 'KATSEYE',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/1a/77/46/1a77460d-493c-a795-92ef-84674905409e/26UMGIM25100.rgb.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8a/2d/f8/8a2df8c0-e0d3-d040-5a98-958d4ad25ceb/mzaf_16340910211187354178.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/pinky-up-clean-edit/1891174008?i=1891174353'
      },
      card7: {
        title: "Upper Side Dreamin'", artist: 'ENHYPEN',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/07/f2/86/07f286a5-be02-94dd-4e0e-a781aba6d1d4/192641841651_Cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/49/a6/68/49a66800-4e6c-68e6-1e35-3be2919ac57e/mzaf_6950604213995548513.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/upper-side-dreamin/1587989646?i=1587989649'
      },
      card8: {
        title: 'Club classics', artist: 'Charli xcx',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a5/bb/db/a5bbdb33-3887-5abb-81d5-de75e72c6abc/mzaf_8271755484089764888.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/club-classics/1739079974?i=1739080339'
      },
      card9: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      },
      // 사용자 명시 2026-04-30: 10번째(마지막) 카드도 CD — 표지 card1 과 수미상관 으로 동일 (Vanilla Days).
      card10: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      }
    },
    auto: true
  };
}

// 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 카드 시퀀스 (10 카드).
const _ANNUAL_REVIEW_CARDS = [
  _annualReviewBuildCard1,        // 1. 표지
  _annualReviewBuildCard2,        // 2. 한 해 흐름 (365 dot)
  _annualReviewBuildCard3,        // 3. 발견 #1 (Opus 4.7)
  _annualReviewBuildCard4,        // 4. 발견 #2 (Opus 4.7)
  _annualReviewBuildCard5,        // 5. 무기 DNA tree
  _annualReviewBuildCard6,        // 6. 모래사장 + 진주
  _annualReviewBuildCardMoments,  // 7. 잊지 못할 순간 (사진 grid)
  _annualReviewBuildCardPearl,    // 8. 올해의 깨달음 1 (Stories 톤 — 가장 현명한 한 마디)
  _annualReviewBuildCardDeep,     // 9. 가장 깊은 숙고 — 질문 하나 웅장
  _annualReviewBuildCard9         // 10. 마지막 — 한 단락 한 마디
];

// 사용자 명시 2026-04-30 ultrathink: 미리보기 = 시드 OR 실제 생성된 리뷰 둘 다 (state.annualReviews 우선).
function openAnnualReviewPreview() {
  const fromState = state.annualReviews && state.annualReviews.length > 0;
  const review = fromState ? state.annualReviews[0] : _buildAnnualReviewSeedData();
  console.log('[annual review preview]', fromState
    ? `state.annualReviews[0] 사용 (id=${review.id}, year=${review.year}, count=${state.annualReviews.length})`
    : '시드 fallback 사용 (state 비어 있음 — testSeedV4Data 미실행 또는 sweep 됨)');
  openAnnualReview(review);
}

// 사용자 명시 2026-04-30 ultrathink: 리뷰 객체 / id (string) / 연도 (number) 셋 다 지원.
// year 받으면 state.annualReviews 에서 year 매칭, 없으면 시드 빌더 fallback (NEW 시스템 일관 진입점).
function openAnnualReview(reviewOrIdOrYear) {
  let review = null;
  if (reviewOrIdOrYear && typeof reviewOrIdOrYear === 'object') {
    review = reviewOrIdOrYear;
  } else if (typeof reviewOrIdOrYear === 'string') {
    review = (state.annualReviews || []).find(r => r.id === reviewOrIdOrYear);
  } else if (typeof reviewOrIdOrYear === 'number') {
    review = (state.annualReviews || []).find(r => r.year === reviewOrIdOrYear);
    if (!review) review = _buildAnnualReviewSeedData(reviewOrIdOrYear);  // 시드 fallback
  }
  if (!review) {
    showToast('연간 리뷰 없음 — 시드 데이터 또는 생성 필요');
    return;
  }
  _annualReviewState = {
    data: review,
    cards: _ANNUAL_REVIEW_CARDS,
    currentIdx: 0
  };
  _annualReviewRender();
}

