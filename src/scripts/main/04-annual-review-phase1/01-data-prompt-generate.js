// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-04-30 ultrathink: 연간 리뷰 실제 생성 (Phase 1 — Opus narrative + 결정적 helpers).
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-02 ultrathink: 연간 리뷰 batch path 재사용 위해 분리.
// _collectAnnualData → _buildAnnualReviewPrompt → callAnthropic / batch → _processAnnualReviewResult.
function _collectAnnualData(year) {
  const targetYear = year || (new Date().getFullYear() - 1);
  const yearStart = new Date(targetYear, 0, 1).getTime();
  const yearEnd = new Date(targetYear + 1, 0, 1).getTime();
  const inYear = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= yearStart && t < yearEnd;
  };
  const entries = (state.entries || []).filter(e => e.date && inYear(e.date + 'T12:00:00'));
  const pearls = (state.pearls || []).filter(p => !p._deleted && inYear(p.createdAt));
  // 사용자 명시 2026-05-06: 메모 type 은 annual review 에서 제외 (순수 메모)
  const archive = (state.archive || []).filter(a => !a._deleted && a.type !== 'memo' && !a._excludeFromAI && inYear(a.savedAt || a.createdAt));
  const decisions = (state.decisions || []).filter(d => !d._deleted && inYear(d.completedAt || d.startedAt));
  const quarterlies = (state.quarterlyReviews || []).filter(r => r.quarterKey && r.quarterKey.startsWith(targetYear + '-'));
  const insights = (state.insights || []).filter(i => !i._deleted && inYear(i.discoveredAt || i.createdAt));
  const chatArchive = (state.chatArchive || []).filter(c => !c._deleted && inYear(c.generatedAt || (c.date ? c.date + 'T12:00:00' : null)));
  return { targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive };
}

function _buildAnnualReviewPrompt(year, data) {
  const _data = data || _collectAnnualData(year);
  const { targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive } = _data;
  // 사용자 명시 2026-04-30 ultrathink: entries < 10 = 데이터 부족 → null return → caller skip.
  if (entries.length < 10) return null;
  const ctx = {
    year: targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive,
    stats: { entryCount: entries.length, pearlCount: pearls.length, archiveCount: archive.length, decisionCount: decisions.length }
  };
  const prompt = `${ctx.year}년 연간 리뷰 narrative 작성.

[목표]
1년 데이터 → 정체성 변화 / 핵심 finding 2개 / 가장 깊은 숙고 / 가장 현명한 깨달음 발견.
분기 리뷰 4개 종합 후 '한 해 = 한 단락' narrative.

[데이터 요약]
- 일기 ${ctx.stats.entryCount}개 / 깨달음 ${ctx.stats.archiveCount}개 / 진주 ${ctx.stats.pearlCount}개 / 큰 결정 ${ctx.stats.decisionCount}개

[분기 리뷰 4개]
${ctx.quarterlies.map(q => '· ' + q.quarterKey + ': ' + (q.summary || '')).join('\n')}

[일기 발췌 (최근 30개)]
${ctx.entries.slice(-30).map(e => '[' + e.date + '] ' + (e.text || '').slice(0, 150)).join('\n').slice(0, 4000)}

[깨달음 카드 top 20]
${ctx.archive.slice(0, 20).map(a => '· ' + (a.headline || (a.body || '').slice(0, 80))).join('\n').slice(0, 2000)}

[큰 결정 ${ctx.decisions.length}개]
${ctx.decisions.map(d => '· ' + (d.title || '') + ': ' + (d.conclusion || '')).join('\n').slice(0, 1000)}

[톤]
관찰 친화. 너 = 사용자. 칭찬 inflation X. 사실 관찰 ○. 친구 톤 (반말 OK). "적용하다" 동사 금지 (자연 동사로).

[출력 — JSON 만, 마크다운 X]
{
  "oneWord": "한 단어 (예: 전환, 회복, 시작)",
  "persona": "한 줄 페르소나 ('OOO한 사람' 형식)",
  "personaReason": "구체적 데이터 한 줄 (수치/날짜)",
  "persona_evolution": {
    "start": "올해 1-2월 너의 모습 한 줄 (사용자 어휘, 일기/대화 기반. 예: '거절 못하고 일주일 망치는 사람', '잠 안 자고 버티는 사람'). 따옴표 X.",
    "end": "올해 11-12월 너의 모습 한 줄 — start 와 대조되는 변화 (예: '명확히 말하는 사람', '11시에 자는 사람'). 따옴표 X."
  },
  "trajectory": [
    {"quarter_label": "Q1 / 봄", "line": "그 분기 한 줄 정체성 (사용자 어휘, 8-20자). 예: '거절 연습 시작한 분기', '잠 부족과 싸운 분기'"},
    {"quarter_label": "Q2 / 여름", "line": "..."},
    {"quarter_label": "Q3 / 가을", "line": "..."},
    {"quarter_label": "Q4 / 겨울", "line": "..."}
  ],
  "finding1": {
    "label": "발견 라벨 (15자 이내)",
    "quote": "사용자 인용 (10-15자)",
    "dataNum": "+30% 또는 비슷한 수치",
    "dataText": "구체 데이터 (2줄, \\n)",
    "conclusion": "결론 (2줄, <span> 핵심 강조 가능)"
  },
  "finding2": {
    "label": "또 하나",
    "friendLow": "낮은 수",
    "friendLowLabel": "낮은 라벨",
    "friendHigh": "높은 수",
    "friendHighLabel": "높은 라벨",
    "conclusion": "결론 (<span> 강조)"
  },
  "deep": {
    "question": "올해 가장 깊었던 질문 — 사용자가 마법고동 (14일 숙성) 으로 실제로 다룬 결정 중 가장 본질적인 것. 인용 형식 (\\\"...\\\"). 1줄 또는 2줄 (\\n 사용). 한국 사용자 일상 어휘 (예: '내가 원하는 건 / 적성인지 워라밸인지?', '이 관계 노력으로 풀릴까 / 그냥 멀어지는 게 맞을까?'). 추상 reframe X 구체 결정 ○.",
    "conclusion": "14일 후 결론 — 인용 형식 (\\\"...\\\"). 실행 가능한 짧은 문장 (예: '적성 우선 — 회복 시간은 챙기면서', '3개월 더 보고, 그동안 사이드만 시도')",
    "date": "YYYY.MM.DD → YYYY.MM.DD · 14일"
  },
  "best_pearl": {
    "title": "올해 가장 현명한 한 마디 (8-20자) — 위 [깨달음 카드 top 20] 또는 [일기 발췌] 에서 사용자가 실제로 한 말 / 표현 그대로 인용 또는 그 어휘로 paraphrase. 추상 reframe X (예: '결함이 아니라 내 결' 같은 합성 X). 사용자 1인칭 발화 톤 유지 (예: '마감 임박 = 도파민 부스터', '수면 7h 미만 = 그 주 망함', '아침 운동 한 날 일기가 길어', '욕망 속 감각이 진짜 방향임').",
    "summary": "그 깨달음 요약 한 줄 — 사용자 본인 어휘. 추상 X 구체 ○",
    "whyThisYear": "왜 가장 현명한지 — 일상어로 친절히 풀어쓰기. 'Q3 카드 #5' / '3월 일기' 같은 약어·dev 용어 X. '한 해 동안 ~ 반복 등장' / '~ 시점부터 변화' 같은 자연 한국어. 구체적 (어디서 / 언제 / 어떻게 변했는지) + 사용자 친근 톤. 2-3 문장."
  },
  "top_pearls": [
    {"title": "best_pearl 다음 2위 진주 한 마디 (8-20자, 사용자 어휘 그대로)", "note": "한 줄 부연 (선택)"},
    {"title": "3위 ...", "note": "..."},
    {"title": "4위 ...", "note": "..."}
  ],
  "oneLine": "한 해 마무리 — 따뜻한 토닥 톤 (분석 X). 친구가 어깨 토닥하며 하는 말. 한국어 자연 어순 + 띄어쓰기·문법 정확. 구조: 첫 줄 = 평가어 ('너 올해 많이 컸어' 류) → 빈 줄 → 변화 (자책에서 관찰로 / 회피에서 회복으로 류 — 2줄, 흐름 metaphor 'X에서 Y로') → 빈 줄 → 마무리 ('수고했어 🫂' 류 + 허그 emoji 🫂). \\n\\n 으로 빈 줄 표현. 예: '너 올해 많이 컸어.\\n\\n자책에서 관찰로,\\n회피에서 회복으로.\\n\\n수고했어 🫂'"
}

JSON만 출력.`;
  return {
    system: 'JSON 객체 하나만 반환. markdown code fence X. 모든 필수 필드 다 채워서 출력.',
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    userMessage: prompt,
    _endpoint: 'review_annual'
  };
}

// 연간 리뷰 결과 처리 — narrative JSON + 결정적 helpers 조립 + state.annualReviews push.
// inline path / batch path 둘 다 호출 (narrative = JSON, data = _collectAnnualData 결과, isTester = optional).
function _processAnnualReviewResult(narrative, year, data, isTester) {
  const _data = data || _collectAnnualData(year);
  const { targetYear, entries, pearls, archive, decisions } = _data;
  const stats = _computeAnnualStatsArray({entries, pearls, archive, decisions});
  const tree = _computeAnnualTree();
  const moments_card = _computeAnnualMoments(pearls);
  const songs = _computeAnnualSongs(pearls);
  const realizations = _computeAnnualRealizations(archive);
  const beach = {
    diaryCount: entries.length, pearlCount: pearls.length,
    bestPearl: (narrative?.best_pearl?.title) || ''
  };
  const review = {
    id: 'ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type: 'annual',
    year: targetYear,
    yearRange: `${targetYear} → ${targetYear + 1}`,
    completedAt: new Date().toISOString(),
    oneWord: narrative?.oneWord || '',
    persona: narrative?.persona || '',
    personaReason: narrative?.personaReason || '',
    persona_evolution: narrative?.persona_evolution || null,
    trajectory: Array.isArray(narrative?.trajectory) ? narrative.trajectory : null,
    stats,
    finding1: narrative?.finding1 || {},
    finding2: narrative?.finding2 || {},
    tree, beach, moments_card,
    best_pearl: narrative?.best_pearl || {},
    top_pearls: Array.isArray(narrative?.top_pearls) ? narrative.top_pearls : null,
    realizations,
    deep: narrative?.deep || {},
    oneLine: narrative?.oneLine || '',
    songs,
    auto: false
  };
  if (isTester) {
    review._mock = true;
    review._seed = Date.now();
  }
  state.annualReviews = state.annualReviews || [];
  state.annualReviews = state.annualReviews.filter(r => r.year !== targetYear);
  state.annualReviews.unshift(review);
  return review;
}

async function generateAnnualReview(year) {
  const targetYear = year || (new Date().getFullYear() - 1);
  const isTester = !!(state.preferences && state.preferences.testerMode);
  if (!isTester && !_canAI()) {
    showToast('연간 리뷰 생성 = 결제 정보 필요 (로그인 또는 API 키)');
    return null;
  }
  showToast(isTester ? '🧪 테스터 모드 — mock 리뷰 생성 (Opus 호출 X)' : '🐚 연간 리뷰 생성 중... (1-2분 소요)');
  const data = _collectAnnualData(targetYear);
  if (!isTester && data.entries.length < 10) {
    showToast(`${targetYear}년 일기 부족 (${data.entries.length}개) — 충분한 데이터 쌓인 후 재시도.`);
    return null;
  }
  let narrative = null;
  if (isTester) {
    const seed = _buildAnnualReviewSeedData(targetYear);
    narrative = {
      oneWord: seed.oneWord, persona: seed.persona, personaReason: seed.personaReason,
      finding1: seed.finding1, finding2: seed.finding2, deep: seed.deep,
      best_pearl: seed.best_pearl, oneLine: seed.oneLine
    };
  } else {
    const promptSpec = _buildAnnualReviewPrompt(targetYear, data);
    if (!promptSpec) {
      showToast(`${targetYear}년 데이터 부족 — 충분한 데이터 쌓인 후 재시도.`);
      return null;
    }
    try {
      const resp = await callAnthropic({
        _endpoint: promptSpec._endpoint,
        model: promptSpec.model,
        max_tokens: promptSpec.max_tokens,
        system: promptSpec.system,
        messages: [{ role: 'user', content: promptSpec.userMessage }]
      });
      if (!resp.ok) throw new Error('API ' + resp.status);
      const respData = await resp.json();
      const text = respData.content[0].text;
      narrative = _robustJsonExtract(text);
    } catch (e) {
      console.error('[generateAnnualReview]', e);
      showToast('연간 리뷰 생성 실패: ' + e.message);
      return null;
    }
    if (!narrative) return null;
  }
  const review = _processAnnualReviewResult(narrative, targetYear, data, isTester);
  if (typeof saveToCloudNow === 'function') await saveToCloudNow(); else saveState();
  showToast(isTester
    ? `🧪 ${targetYear}년 mock 리뷰 완료 (시드 narrative + 실제 helper). 미리보기에서 확인.`
    : `🐚 ${targetYear}년 연간 리뷰 완료. 미리보기에서 확인.`);
  return review;
}

