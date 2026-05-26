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
  // V4 fix (사용자 명시 2026-05-26 ultrathink — createdAt fallback): generatedAt + date 모두 없는 archive 도 createdAt 으로 시점 추정.
  //   다른 collect 함수 (archive: savedAt || createdAt) 패턴과 일관.
  const chatArchive = (state.chatArchive || []).filter(c => !c._deleted && inYear(c.generatedAt || c.createdAt || (c.date ? c.date + 'T12:00:00' : null)));
  return { targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive };
}

function _buildAnnualReviewPrompt(year, data) {
  const _data = data || _collectAnnualData(year);
  const { targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive } = _data;
  // 사용자 명시 2026-05-10 (메커니즘 일관 — weekly/monthly/quarterly 와 동일): year idempotent skip — 같은 해 review 이미 있으면 null. 사용자 click 두 번 방지.
  if (targetYear && (state.annualReviews || []).some(r => r.year === targetYear)) {
    return null;
  }
  // 사용자 명시 2026-05-08 ultrathink: 마지막 annual review 이후 새 데이터 1개라도 있어야 trigger.
  const lastReview = (state.annualReviews || []).slice().sort((a, b) =>
    new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0)
  )[0];
  if (lastReview) {
    const lastAt = new Date(lastReview.completedAt || lastReview.createdAt || 0);
    const lastISO = lastAt.toISOString().split('T')[0];
    const hasNewSinceLast =
      (state.entries || []).some(e => e.date && e.date > lastISO) ||
      (state.chatMessages || []).some(m => m && m.role === 'user' && !m.typing && !m.error && m.timestamp && new Date(m.timestamp) > lastAt) ||
      (state.archive || []).some(a => a && !a._deleted && a.savedAt && new Date(a.savedAt) > lastAt) ||
      (state.missions || []).some(m => m && m.createdAt && new Date(m.createdAt) > lastAt) ||
      (state.pearls || []).some(p => p && !p._deleted && p.createdAt && new Date(p.createdAt) > lastAt) ||
      (state.topicCards || []).some(t => t && !t._deleted && t.createdAt && new Date(t.createdAt) > lastAt);
    if (!hasNewSinceLast) return null;
  }
  // 사용자 명시 2026-04-30 ultrathink: entries < 10 = 데이터 부족 → null return → caller skip.
  if (entries.length < 10) return null;
  const ctx = {
    year: targetYear, entries, pearls, archive, decisions, quarterlies, insights, chatArchive,
    stats: { entryCount: entries.length, pearlCount: pearls.length, archiveCount: archive.length, decisionCount: decisions.length }
  };
  // 사용자 명시 2026-05-11 ultrathink: review_annual stable system (JSON schema ~70줄) backend 이전.
  //   functions/api/_lib/prompts/review-systems.ts REVIEW_ANNUAL_SYSTEM. backend 가 _endpoint='review_annual' 매칭하여 강제 inject.
  //   volatile (사용자 데이터) 만 user message 로 전송 — cache 적용 X (매번 변동).

  const volatile = `${ctx.year}년 연간 리뷰 narrative 작성.

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

위 데이터로 ${ctx.year}년 연간 리뷰 작성. JSON만 출력.`;
  return {
    // 사용자 명시 2026-05-11 ultrathink: stable system 자체는 backend (review-systems.ts) 가 강제 inject — client system 비움.
    system: undefined,
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    userMessage: volatile,
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
  // 사용자 명시 2026-05-09 ultrathink: 365 dot grid 실제 entries/pearls/archive 매핑 (옛 deterministic seed 제거).
  const dotmap = (typeof _computeAnnualDotmap === 'function')
    ? _computeAnnualDotmap(targetYear, entries, pearls, archive)
    : null;
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
    dotmap,  // 365 dot 실데이터 (옛 review = null → 카드 빌더 fallback)
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

