// V4 (사용자 명시 2026-05-14 ultrathink): 전략 카드 resurface 시스템 — keyword + embedding 추출 helper.
//   keyword: saveMsgAsStrategy 의 같은 AI 호출에 KEYWORDS 1줄 추가 (cost 0). backfill 만 Haiku 별도 호출.
//   embedding: _ragEmbedText 재활용 (BGE-M3 1024 dim). useRag OFF / Light 면 skip.
//   plan 별 차등: Light=keyword only, Plus=+embed top-1, Premium=+embed top-3.

// 전략 카드 1장의 검색용 text — 4 필드 결합 (≤ 600자).
function _strategyEmbedText(card) {
  if (!card) return '';
  const parts = [card.title, card.problemContext, card.psychConcept, card.actionStrategy]
    .filter(s => s && typeof s === 'string')
    .map(s => s.trim());
  return parts.join('\n').slice(0, 600);
}

// useRag 토글 + plan 차등 게이트 (Light/게스트 false).
//   _ragIsEnabled 가 이미 plan ∈ {light, premium} + useRag ON 둘 다 검사 → wrapper.
function _strategyResurfaceUseRagEnabled() {
  if (typeof _ragIsEnabled !== 'function') return false;
  return _ragIsEnabled();
}

// 전략 카드 1장의 embedding 추출 → card.embedding 박음. fire-and-forget.
//   useRag OFF / Light 면 첫 줄에서 return.
async function _strategyEmbed(card) {
  if (!card || !card.id) return false;
  if (Array.isArray(card.embedding) && card.embedding.length > 0) return false;
  if (!_strategyResurfaceUseRagEnabled()) return false;
  const text = _strategyEmbedText(card);
  if (!text || text.length < 5) return false;
  if (typeof _ragEmbedText !== 'function') return false;
  try {
    const vec = await _ragEmbedText(text);
    if (!Array.isArray(vec) || vec.length === 0) return false;
    card.embedding = vec;
    try { saveState(); } catch {}
    return true;
  } catch {
    return false;
  }
}

// backfill 용 — keywords null 카드의 keyword 만 AI 로 별도 추출 (Haiku).
//   buildStrategyCard prompt 재호출. 4 필드 결합한 reconstructed 본문 입력.
async function _strategyExtractKeywordsViaAI(card) {
  if (!card || typeof _canAI !== 'function' || !_canAI()) return [];
  const reconstructed = [
    card.title ? `[제목] ${card.title}` : '',
    card.problemContext ? `[상황] ${card.problemContext}` : '',
    card.psychConcept ? `[개념] ${card.psychConcept}` : '',
    card.actionStrategy ? `[행동] ${card.actionStrategy}` : ''
  ].filter(Boolean).join('\n');
  if (!reconstructed) return [];
  try {
    const resp = await callAnthropic({
      _endpoint: 'decision_step',
      _userContentType: 'strategy_card',
      _vars: { msgContent: reconstructed },
      model: 'claude-haiku-4-5',
      max_tokens: 250,
      messages: [{ role: 'user', content: '' }]
    });
    const data = await resp.json();
    let raw = (data?.content?.[0]?.text || '').trim();
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
    raw = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    const m = raw.match(/^KEYWORDS:\s*(.+)$/mi);
    if (!m) return [];
    return m[1].split(/[,，]/).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s.length >= 2).slice(0, 7);
  } catch {
    return [];
  }
}

// keywords/embedding null 인 카드 1개 lazy backfill — 일일 max 5, testerMode skip.
//   _findResurfaceCandidate 안에서 매칭 시도 도중 keywords null 카드 만나면 fire-and-forget.
async function _strategyLazyEnrich(card) {
  if (!card) return;
  const hasKw = Array.isArray(card.keywords) && card.keywords.length >= 3;
  const hasEmb = Array.isArray(card.embedding) && card.embedding.length > 0;
  if (hasKw && hasEmb) return;
  if (state?.preferences?.testerMode) return;
  if (typeof todayKey !== 'function') return;
  const today = todayKey();
  state.preferences = state.preferences || {};
  const log = state.preferences._strategyBackfillLog = state.preferences._strategyBackfillLog || {};
  if (log.date !== today) { log.date = today; log.count = 0; }
  if ((log.count || 0) >= 5) return;
  log.count = (log.count || 0) + 1;
  if (!hasKw) {
    try {
      const kws = await _strategyExtractKeywordsViaAI(card);
      if (kws.length >= 3) {
        card.keywords = kws;
        try { saveState(); } catch {}
      }
    } catch {}
  }
  if (!hasEmb && _strategyResurfaceUseRagEnabled()) {
    _strategyEmbed(card).catch(()=>{});
  }
}
