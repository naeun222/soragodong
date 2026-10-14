function _buildAnnualReviewSeedData(year) {
  const yr = year || (new Date().getFullYear() - 1);
  return {
    id: 'ar_seed_' + yr,
    type: 'annual',
    year: yr,
    completedAt: new Date().toISOString(),
    yearRange: `${yr} → ${yr + 1}`,
    oneWord: '회복',
    persona: '올해는 자책하던 자리에서 기록을 보기 시작한 해였어',
    personaReason: '잘 잔 다음날은 네 번 중 네 번 다 기분이 나았더라. 그리고 카페에 자리 잡고 나서는 글이 길어졌어.',
    // 사용자 명시 2026-05-06 ultrathink: 1-2월 vs 11-12월 너의 모습 한 줄 (정체성 변화 anchor).
    persona_evolution: {
      start: '1월엔 미루고 자책하고, 자책하다 또 미루는 날이 이어졌어',
      end: '12월엔 잠 시간 보고 자리부터 바꾸는 날이 더 많았어'
    },
    // 사용자 명시 2026-05-06 ultrathink: 4 분기 narrative — 1년 정체성 궤적.
    trajectory: [
      { quarter_label: 'Q1 / 봄', line: '"왜 또 못했지"라고 쓴 날이 많았어' },
      { quarter_label: 'Q2 / 여름', line: '잘 잔 다음날이 다르다는 게 처음 보였어' },
      { quarter_label: 'Q3 / 가을', line: '카페랑 폰 멀리 두기를 쓰기 시작했어' },
      { quarter_label: 'Q4 / 겨울', line: '마감 임박해야 시작되는 걸 그냥 그렇다고 쓰더라' }
    ],
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
      dataText: '평일 11시 전에 잔 닷새 중 나흘.\n다음날 기분이 한 단계 높았어.',
      conclusion: '일찍 잔 날은\n<span>다음날 기분이 달랐어</span>'
    },
    finding2: {
      label: '또 하나',
      friendLow: '23',
      friendLowLabel: '집에서\n작업한 날',
      friendHigh: '41',
      friendHighLabel: '카페에서\n작업한 날',
      conclusion: '집보다 카페에서 쓴 날이 <span>거의\n두 배</span>였어'
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
      caption: '올해 자리 잡은 것들이야'
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
      summary: '마감이 가까워져야 시작이 빨라지더라. 올해 기록에 가장 자주 나온 말이었어.',
      whyThisYear: '한 해 동안 일기랑 깨달음에 자꾸 나온 한 마디야. "왜 미루지"라고 쓰던 상반기보다, "임박해야 빨리 시작되는 게 내 방식"이라고 쓰기 시작한 하반기에 일이랑 쉬는 날 둘 다 기록이 고르더라.'
    },
    // 사용자 명시 2026-05-06 ultrathink: best_pearl 다음 4개 — 올해 진주 ranked.
    top_pearls: [
      { title: '잘 잔 다음날은 기분이 달랐어', note: '네 번 중 네 번 다 그랬어' },
      { title: '카페에서 쓴 날이 글이 길었어', note: '집에서 쓴 날보다 거의 두 배' },
      { title: '거절한 다음날 바로 쓴 날은 마음이 빨리 풀렸어', note: '일주일 미룬 날은 더 오래 갔어' },
      { title: '큰 결정은 2주 두고 보니까 답이 나왔어', note: '올해 한 번, 10월에' }
    ],
    realizations: {
      count: { scrap: 12, memo: 14, reflection: 5 },  // 합 31 = stats 의 깨달음 31 일치
      topTags: ['수면', '환경', '회복', '활용']
    },
    // 사용자 명시 2026-05-02 ultrathink: 깊은 숙고 = 보편 ADHD 자기관찰 — 기본기 vs 추진력.
    deep: {
      question: '"잘 자고 산책하는 게\n진짜 큰 일을 해내는 길일까?"',
      conclusion: '"쉬는 걸 빼면 일도 같이 빠지더라. 같이 간다"',
      date: yr + '.10.05 → 10.18 · 14일'
    },
    // oneLine = 이미 universal — 보존.
    oneLine: '올해 기록을 나란히 놓으니까\n\n자책하던 날이 줄고\n기록을 보는 날이 늘었더라.\n\n그게 올해였어.',
    // 사용자 명시 2026-04-30: 시드 진주 음악 카테고리 8곡 그대로 (artworkUrl + previewUrl + trackUrl). 자동 재생.
    // 사용자 명시 2026-05-06: 11카드 시퀀스 — card3 = trajectory (음악 X, 한 해 4 흐름 narrative 침묵). 표지 card1 = 마지막 card11 = LNGSHOT Vanilla Days (수미상관).
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
      // card3 = trajectory — 음악 X (4 분기 narrative 카드 — 침묵으로 정독).
      card4: {
        title: 'Love Hangover', artist: 'JENNIE & Dominic Fike',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/1c/57/15/1c571583-f4bc-3307-6e5e-8b9e68d05913/196872850918.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f6/4c/16/f64c164b-bd28-87fd-5217-7409675e6374/mzaf_10560279388547786839.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/love-hangover/1793379140?i=1793379141'
      },
      card5: {
        title: 'Stephanie', artist: 'Cloonee, Young M.A & InntRaw',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/97/e4/10/97e41086-cff2-f7b5-83b3-3a085b4d2026/cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/d0/1e/40/d01e4015-c383-2c2a-9445-f47edb4ae5e0/mzaf_10847000075002169806.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/stephanie/1779339882?i=1779339883'
      },
      card6: {
        title: "Moonwalkin'", artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/74/94/a2/7494a26e-4756-c082-5709-8526127baee8/cover_KM0023994_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/da/1f/e9/da1fe9e9-f784-b4f2-c181-c8f770aa2ede/mzaf_13144624855104730433.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/moonwalkin/1866762522?i=1866762525'
      },
      card7: {
        title: 'PINKY UP', artist: 'KATSEYE',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/1a/77/46/1a77460d-493c-a795-92ef-84674905409e/26UMGIM25100.rgb.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8a/2d/f8/8a2df8c0-e0d3-d040-5a98-958d4ad25ceb/mzaf_16340910211187354178.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/pinky-up-clean-edit/1891174008?i=1891174353'
      },
      card8: {
        title: "Upper Side Dreamin'", artist: 'ENHYPEN',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/07/f2/86/07f286a5-be02-94dd-4e0e-a781aba6d1d4/192641841651_Cover.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/49/a6/68/49a66800-4e6c-68e6-1e35-3be2919ac57e/mzaf_6950604213995548513.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/upper-side-dreamin/1587989646?i=1587989649'
      },
      card9: {
        title: 'Club classics', artist: 'Charli xcx',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/88/4e/63/884e6321-ad41-aab1-f6f0-20efcafcfd55/075679666130.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a5/bb/db/a5bbdb33-3887-5abb-81d5-de75e72c6abc/mzaf_8271755484089764888.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/club-classics/1739079974?i=1739080339'
      },
      card10: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      },
      // 사용자 명시 2026-04-30: 마지막 카드 = 표지 card1 과 수미상관 으로 동일 (Vanilla Days). 11카드라 card11.
      card11: {
        title: 'Vanilla Days', artist: 'LNGSHOT',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/cf/a8/de/cfa8dee7-da1a-eb20-6074-741a4af1a1f6/cover_KM0024394_1.jpg/200x200bb.jpg',
        previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/30/c2/9f/30c29f0b-bed7-d993-6909-0392418d4dcc/mzaf_15564917017364106254.plus.aac.p.m4a',
        url: 'https://music.apple.com/us/album/vanilla-days/1885487042?i=1885487047'
      }
    },
    auto: true
  };
}

// 사용자 명시 2026-04-30 ultrathink + 2026-05-06: 연간 리뷰 카드 시퀀스 (11 카드 — trajectory 추가).
const _ANNUAL_REVIEW_CARDS = [
  _annualReviewBuildCard1,           // 1. 표지
  _annualReviewBuildCard2,           // 2. 한 해 흐름 (365 dot + persona evolution row)
  _annualReviewBuildCardTrajectory,  // 3. 한 해의 4 흐름 (NEW — 분기별 narrative)
  _annualReviewBuildCard3,           // 4. 발견 #1 (Opus 4.7)
  _annualReviewBuildCard4,           // 5. 발견 #2 (Opus 4.7)
  _annualReviewBuildCard5,           // 6. 무기 DNA tree
  _annualReviewBuildCard6,           // 7. 모래사장 + 진주
  _annualReviewBuildCardMoments,     // 8. 잊지 못할 순간 (사진 grid)
  _annualReviewBuildCardPearl,       // 9. 올해의 깨달음 (best + top_pearls 4개 더)
  _annualReviewBuildCardDeep,        // 10. 가장 깊은 숙고 — 질문 하나 웅장
  _annualReviewBuildCard9            // 11. 마지막 — 한 단락 한 마디
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

