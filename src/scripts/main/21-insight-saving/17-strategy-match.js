// V4 (사용자 명시 2026-05-14 ultrathink): 전략 resurface 매칭 — keyword + embedding rerank.
//   사용자 메시지 ↔ 전략 problemContext 매칭. 가드 5종 (embodied X / 24h / 7일 / 챕터 1장 / _deleted X).
//   threshold: keyword score ≥ 4 (2 keyword 이상 match), Plus/Premium 은 embedding cosine ≥ 0.40 보강.

// keyword 매칭 score — 단순 substring (한국어 조사 자동 cover).
//   각 keyword 가 사용자 메시지에 포함되면 +2.
function _scoreStrategyKeywordOverlap(userMsgText, cardKeywords) {
  if (!Array.isArray(cardKeywords) || cardKeywords.length === 0) return 0;
  const lower = (userMsgText || '').toLowerCase();
  if (!lower) return 0;
  let score = 0;
  for (const kw of cardKeywords) {
    if (!kw || kw.length < 2) continue;
    if (lower.includes(kw.toLowerCase())) score += 2;
  }
  return score;
}

// embedding 기반 rerank (Plus/Premium + useRag ON 일 때만).
//   사용자 메시지 임베딩은 RAG 의 _ragLastQueryEmbedding cache 재사용 (14-rag.js:203 직후 박음).
//   cache miss 면 새로 1회 embed (그래도 같은 turn 1회 호출).
async function _embeddingRerankCandidates(userMsgText, candidates, topN) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (topN <= 0) return [];
  let userEmb = window._ragLastQueryEmbedding;
  if (!userEmb && typeof _ragEmbedText === 'function') {
    try { userEmb = await _ragEmbedText((userMsgText || '').slice(0, 500)); } catch {}
  }
  if (!Array.isArray(userEmb)) return candidates.slice(0, topN);
  if (typeof _ragCosine !== 'function') return candidates.slice(0, topN);
  const withSim = candidates
    .filter(c => Array.isArray(c.embedding) && c.embedding.length === userEmb.length)
    .map(c => ({ card: c, sim: _ragCosine(userEmb, c.embedding) }));
  if (withSim.length === 0) return candidates.slice(0, topN);
  withSim.sort((a, b) => b.sim - a.sim);
  return withSim.filter(x => x.sim >= 0.40).slice(0, topN).map(x => x.card);
}

// surface 자격 검사 — 가드 5종.
function _isResurfaceEligible(card, surfacedSet, nowMs) {
  if (!card || card.category !== 'strategy') return false;
  if (card.embodimentStatus === 'embodied') return false;
  if (card._deleted) return false;
  if (surfacedSet && typeof surfacedSet.has === 'function' && surfacedSet.has(card.id)) return false;
  if (card.lastResurfacedAt) {
    const since = nowMs - new Date(card.lastResurfacedAt).getTime();
    if (since < 24 * 3600 * 1000) return false;
  }
  if (card.resurfaceDismissedAt) {
    const since = nowMs - new Date(card.resurfaceDismissedAt).getTime();
    if (since < 7 * 86400 * 1000) return false;
  }
  return true;
}

// 메인 entry — 사용자 마지막 user message text 받아 매치 1장 또는 null.
//   flow: eligible filter → keyword score → (Plus/Premium + useRag ON) embedding rerank → 1장 또는 null.
//   keywords null 카드는 lazy enrich 큐 push (이번 turn 미반영, 다음 turn 부터 후보 진입).
async function _findResurfaceCandidate(userMsgText) {
  if (!userMsgText || typeof userMsgText !== 'string') return null;
  if (userMsgText.length < 5) return null;
  if (!Array.isArray(state.topicCards) || state.topicCards.length === 0) return null;
  const nowMs = Date.now();
  const surfacedSet = new Set(Array.isArray(state._strategyChapterSurfacedIds) ? state._strategyChapterSurfacedIds : []);
  const eligible = state.topicCards.filter(c => _isResurfaceEligible(c, surfacedSet, nowMs));
  if (eligible.length === 0) return null;
  let lazyTarget = null;
  const scored = [];
  for (const card of eligible) {
    if (!Array.isArray(card.keywords) || card.keywords.length < 3) {
      if (!lazyTarget) lazyTarget = card;
      continue;
    }
    const score = _scoreStrategyKeywordOverlap(userMsgText, card.keywords);
    if (score >= 4) scored.push({ card, score });
  }
  if (lazyTarget && typeof _strategyLazyEnrich === 'function') {
    _strategyLazyEnrich(lazyTarget).catch(()=>{});
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.card.resurfaceCount || 0) - (b.card.resurfaceCount || 0);
  });
  if (typeof _strategyResurfaceUseRagEnabled === 'function' && _strategyResurfaceUseRagEnabled()) {
    const plan = window._billingCache?.subscription_plan;
    let topN = 1;
    let keywordPoolSize = 3;
    if (plan === 'premium') { topN = 3; keywordPoolSize = 5; }
    const candidates = scored.slice(0, keywordPoolSize).map(s => s.card);
    const reranked = await _embeddingRerankCandidates(userMsgText, candidates, topN);
    if (reranked.length > 0) return reranked[0];
    return scored[0].card;
  }
  return scored[0].card;
}
