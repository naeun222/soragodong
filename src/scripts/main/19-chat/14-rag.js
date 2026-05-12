// V4 (사용자 명시 2026-05-13 ultrathink): RAG (Retrieval-Augmented Generation) 모듈.
//
// 정책:
//   - Light/미구독/게스트 = RAG 미지원 (토글 hide, 모듈 noop)
//   - Plus = state.preferences.useRag ON 시 top-1 retrieve
//   - Premium = state.preferences.useRag ON 시 top-3 retrieve
//   - 대화탭 메인 chat (sendChat) 에서만 사용. 마법고동/숙고/돌연변이 X.
//
// 흐름:
//   1) archive 생성 시 → _ragEmbedArchive (fire-and-forget) → state.archiveEmbeddings.push
//   2) sendChat 직전 → _ragRetrieveTopN(userMessage) → top-N archive
//   3) system-prompt builder 가 _ragFormatInject(archives) 결과를 inject
//   4) AI 응답 — 자연스럽게 옛 챕터 참조
//
// Embedding: Cloudflare Workers AI BGE-M3 (1024 dim, multilingual).
// Retrieval: MMR (Maximal Marginal Relevance, λ=0.5).

const _RAG_BACKFILL_CONCURRENCY = 1;  // serial — Cloudflare rate limit 보호
const _RAG_MAX_BACKFILL_BATCH = 200;  // 한 번에 최대 200 archive 백필 (그 이상은 다음 진입에)
const _RAG_MMR_LAMBDA = 0.5;          // 0=다양성 최대 / 1=관련성 최대 / 0.5=균형
const _RAG_QUERY_MIN_LEN = 5;         // query 너무 짧으면 retrieve skip

// V4: Plan 별 retrieve N.
function _ragGetTopN() {
  const plan = window._billingCache?.subscription_plan;
  const active = !!window._billingCache?.subscription_active;
  if (!active) return 0;
  if (plan === 'premium') return 3;
  if (plan === 'light') return 1;  // Plus
  return 0;  // Light(early_lifetime) / early_light / guest = X
}

function _ragIsEnabled() {
  if (!state.preferences || !state.preferences.useRag) return false;
  return _ragGetTopN() > 0;
}

// V4: embed 가능한 archive 인지 — 메시지 길이 + 시드/시뮬 제외.
function _ragShouldEmbed(archiveItem) {
  if (!archiveItem || !archiveItem.id || archiveItem._seed || archiveItem._deleted) return false;
  if (!Array.isArray(archiveItem.messages) || archiveItem.messages.length < 3) return false;
  // 시뮬 only 챕터는 사용자 일반 대화 context 와 톤 다름 — RAG 제외.
  if (archiveItem.isSimulation) return false;
  return true;
}

// V4: archive 의 검색용 텍스트 — messages 평문 (8000자 cap).
function _ragArchiveText(archiveItem) {
  if (!archiveItem || !Array.isArray(archiveItem.messages)) return '';
  // 시뮬 메시지 제외 (혼합 archive 케이스).
  const msgs = archiveItem.messages.filter(m => m && !m.isSimulationContext);
  const text = msgs.map(m => {
    const role = m.role === 'user' ? '나' : '소라';
    return `${role}: ${(m.content || '').replace(/```json[\s\S]*?```/g, '').trim()}`;
  }).join('\n');
  return text.slice(0, 8000);
}

// V4: backend POST /api/embeddings/bge — embedding 벡터 1024 차원 반환.
async function _ragEmbedText(text) {
  if (!text || typeof text !== 'string' || text.length < 3) return null;
  if (!session?.access_token) return null;
  try {
    const _origFetch = window._anthropicOrigFetch || window.fetch;
    const resp = await _origFetch('/api/embeddings/bge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ text })
    });
    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      console.warn('[rag] embed fail:', resp.status, errTxt.slice(0, 200));
      return null;
    }
    const data = await resp.json();
    return Array.isArray(data?.embedding) ? data.embedding : null;
  } catch (e) {
    console.warn('[rag] embed throw:', e?.message || e);
    return null;
  }
}

// V4: archive 1개 embed → state.archiveEmbeddings 에 추가. 중복 skip.
//   fire-and-forget — 호출자 await 안 해도 OK.
async function _ragEmbedArchive(archiveItem) {
  if (!_ragShouldEmbed(archiveItem)) return false;
  state.archiveEmbeddings = state.archiveEmbeddings || [];
  // 중복 skip
  if (state.archiveEmbeddings.some(e => e && e.archiveId === archiveItem.id)) return false;
  const text = _ragArchiveText(archiveItem);
  if (!text || text.length < _RAG_QUERY_MIN_LEN) return false;
  const embedding = await _ragEmbedText(text);
  if (!embedding) return false;
  state.archiveEmbeddings.push({
    archiveId: archiveItem.id,
    embedding,
    embeddedAt: new Date().toISOString(),
    textLen: text.length
  });
  try { saveState(); } catch {}
  return true;
}

// V4: 옛 chatArchive 모두 일괄 embed. RAG 토글 ON 첫 진입 또는 첫 사용 시 호출.
//   진행률 토스트. serial (rate limit 보호).
let _ragBackfillInProgress = false;
async function _ragBackfillAll(opts) {
  if (_ragBackfillInProgress) return { skipped: true, reason: 'already_running' };
  _ragBackfillInProgress = true;
  opts = opts || {};
  const silent = !!opts.silent;
  try {
    state.archiveEmbeddings = state.archiveEmbeddings || [];
    const have = new Set(state.archiveEmbeddings.map(e => e && e.archiveId).filter(Boolean));
    const targets = (state.chatArchive || []).filter(a => _ragShouldEmbed(a) && !have.has(a.id));
    if (targets.length === 0) {
      _ragBackfillInProgress = false;
      return { embedded: 0, skipped: true };
    }
    const batch = targets.slice(0, _RAG_MAX_BACKFILL_BATCH);
    // V4 (사용자 명시 2026-05-13): 백필 진행률 토스트 제거 — 백그라운드 silent 동작.
    let done = 0, fail = 0;
    for (const a of batch) {
      const ok = await _ragEmbedArchive(a);
      if (ok) done++; else fail++;
    }
    _ragBackfillInProgress = false;
    return { embedded: done, failed: fail, total: batch.length };
  } catch (e) {
    _ragBackfillInProgress = false;
    console.warn('[rag] backfill throw:', e?.message || e);
    return { error: e?.message || String(e) };
  }
}

// V4: cosine similarity (1024 dim).
function _ragCosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

// V4: MMR retrieve — 관련성 + 다양성 균형. λ=0.5 균형.
//   1) query 와 가장 관련 높은 1개 선택.
//   2) 다음은 (query 관련성) - λ × max(이미 선택된 항목과의 유사도) 가 가장 높은 1개.
//   3) topN 도달까지 반복.
function _ragMMR(candidates, queryEmbedding, topN, lambda) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (topN <= 0) return [];
  lambda = (typeof lambda === 'number') ? lambda : _RAG_MMR_LAMBDA;
  // Pre-compute query similarity
  const scored = candidates.map(c => ({
    item: c,
    qSim: _ragCosine(queryEmbedding, c.embedding)
  }));
  const selected = [];
  const remaining = scored.slice();
  while (selected.length < topN && remaining.length > 0) {
    let bestIdx = 0;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const s of selected) {
        const sim = _ragCosine(cand.item.embedding, s.item.embedding);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * cand.qSim - (1 - lambda) * maxSim;
      if (mmr > bestMmr) { bestMmr = mmr; bestIdx = i; }
    }
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return selected.map(s => s.item);
}

// V4: query message → top-N archive retrieve.
//   반환 = [{ archiveId, archiveItem, similarity }] 정렬됨.
async function _ragRetrieveTopN(queryText, topN) {
  if (!_ragIsEnabled()) return [];
  topN = topN || _ragGetTopN();
  if (topN <= 0) return [];
  if (!queryText || queryText.length < _RAG_QUERY_MIN_LEN) return [];
  state.archiveEmbeddings = state.archiveEmbeddings || [];
  if (state.archiveEmbeddings.length === 0) return [];
  // 활성 archive 만 (휴지통/시드 제외) + embedding 매칭.
  const archiveById = new Map();
  (state.chatArchive || []).forEach(a => { if (a && a.id && !a._deleted && !a._seed) archiveById.set(a.id, a); });
  const candidates = state.archiveEmbeddings
    .filter(e => e && e.archiveId && Array.isArray(e.embedding) && archiveById.has(e.archiveId))
    .map(e => ({ archiveId: e.archiveId, embedding: e.embedding, archiveItem: archiveById.get(e.archiveId) }));
  if (candidates.length === 0) return [];
  // Query embed.
  const qEmb = await _ragEmbedText(queryText.slice(0, 500));
  if (!qEmb) return [];
  // MMR retrieve.
  const picked = _ragMMR(candidates, qEmb, topN, _RAG_MMR_LAMBDA);
  return picked.map(p => ({
    archiveId: p.archiveId,
    archiveItem: p.archiveItem,
    similarity: _ragCosine(qEmb, p.embedding)
  }));
}

// V4: system prompt 에 inject 할 텍스트 — top-N archive 의 요약.
//   각 archive 의 *topicCards (있으면)* 또는 *messages 핵심 발췌*.
//   매 메시지 마다 다름 = prompt cache invalidate (의도된 동작).
function _ragFormatInject(retrieved) {
  if (!Array.isArray(retrieved) || retrieved.length === 0) return '';
  const sections = retrieved.map(r => {
    const a = r.archiveItem;
    if (!a) return '';
    const dateLabel = a.date || (a.generatedAt ? a.generatedAt.slice(0, 10) : '');
    // topicCards 우선 (이미 압축된 요약).
    const topics = (state.topicCards || []).filter(c =>
      c && !c._deleted && c.sourceArchiveId === a.id && c.category !== 'strategy'
    );
    let summary = '';
    if (topics.length > 0) {
      summary = topics.slice(0, 3).map(t => `  · ${t.title || ''}${t.summary ? ': ' + t.summary : ''}`).join('\n');
    } else {
      // topicCards 없으면 messages 첫 2개 user 메시지로 핵심 추정.
      const userMsgs = (a.messages || [])
        .filter(m => m && m.role === 'user' && !m.isSimulationContext && !m._starter)
        .slice(0, 2)
        .map(m => (m.content || '').slice(0, 100))
        .filter(Boolean);
      summary = userMsgs.length > 0 ? userMsgs.map(u => `  · "${u}"`).join('\n') : '  · (요약 없음)';
    }
    return `- [${dateLabel}]\n${summary}`;
  }).filter(Boolean);
  if (sections.length === 0) return '';
  return [
    '',
    '[관련 옛 챕터 (지금 대화와 의미적으로 가까운)]',
    sections.join('\n'),
    '  · 자연스럽게 참조 가능. 단 "옛 ~일에 이런 얘기 했었지" 식 직접 인용보단 *연결되는 자기관찰 흐름* 으로.',
    ''
  ].join('\n');
}
