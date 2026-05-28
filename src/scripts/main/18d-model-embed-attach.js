// 사용자 명시 2026-05-29 (연결·통합 §2 + §14): 임베딩 기반 write-time attach.
//   문제: 현재 attach 후보 검색이 문자열 유사도(similarText / _modelSimilarity)만 써서
//         "글자 다른데 같은 뿌리"(예: "인간적 호감 기반 교류" ↔ "관계에서 이해·인정 욕구", 글자 겹침 0)를
//         못 잡고 둘 다 new 로 push → 원자화 지속.
//   해법: 모델 항목에 BGE 임베딩(1024dim) 저장 + 새 신호를 코사인으로 기존 노드에 attach.
//   게이트: _ragIsEnabled() (Plus/Premium + useRag ON, RAG/전략카드와 동일). 그 외엔 noop → 문자열 dedup 그대로(현행).
//   안티-thrash(§2/§6): write-time 은 *attach 만*. 노드↔노드 병합은 synthesis 패스(별도). 여기선 새 신호→기존 노드만.

// 코사인 ≥ 이 값이면 같은 뿌리로 보고 auto-attach. τ≈0.8(§11)보다 높게 — LLM 드라이버 검증(§2 b/PR2b) 없는
//   write-time 단계라 보수적 고임계(false merge 회피). 0.8~0.85 중간대는 그냥 new 로 두고 synthesis 가 LLM 검증 후 병합.
const _MODEL_EMBED_ATTACH_TAU = 0.85;
// 1회 backfill 시 최대 임베딩 호출 (free tier 100K/일 보호, serial).
const _MODEL_EMBED_BACKFILL_CAP = 60;

// 임베딩 켜졌나 — RAG 게이트(plan ∈ {Plus, Premium} + useRag ON) 재사용.
function _modelEmbedEnabled() {
  return typeof _ragIsEnabled === 'function' && _ragIsEnabled() && typeof _ragEmbedText === 'function';
}

// 항목 → 임베딩용 텍스트 (name + description + trigger/sequence, ≤400자).
function _modelItemEmbedText(item) {
  if (!item) return '';
  const parts = [item.name, item.description, item.trigger, item.sequence]
    .filter(s => s && typeof s === 'string').map(s => s.trim());
  return parts.join(' / ').slice(0, 400);
}

// 항목 1개 embedding 채움 (이미 있으면 skip). 반환: 채웠으면 true.
async function _modelEmbedItem(item) {
  if (!item || (Array.isArray(item.embedding) && item.embedding.length)) return false;
  if (!_modelEmbedEnabled()) return false;
  const text = _modelItemEmbedText(item);
  if (!text || text.length < 4) return false;
  try {
    const vec = await _ragEmbedText(text);
    if (!Array.isArray(vec) || !vec.length) return false;
    item.embedding = vec;
    return true;
  } catch { return false; }
}

// analysis 의 새 항목들 embedding 미리 채움 — sync _processExtractChapterAnalysis / force merge 전에 호출.
//   new_* (챕터 추출) 와 traits/values/patterns (force_analyze) 두 스키마 모두 처리. enabled 아니면 즉시 return.
async function _embedAnalysisItems(analysis) {
  if (!analysis || !_modelEmbedEnabled()) return;
  const lists = [
    analysis.new_traits, analysis.new_values, analysis.new_patterns,
    analysis.traits, analysis.values, analysis.patterns
  ];
  for (const arr of lists) {
    if (!Array.isArray(arr)) continue;
    for (const it of arr) {
      if (!it || typeof it.name !== 'string' || !it.name.trim()) continue;
      try { await _modelEmbedItem(it); } catch {}
    }
  }
}

// 기존 모델 항목 중 embedding 없는 것 lazy backfill (serial, cap). 게이트 OFF 면 noop.
//   renderModel 에서 fire-and-forget. running flag 로 재진입 차단, 전부 채워지면 사실상 no-op.
let _modelEmbedBackfillRunning = false;
async function _modelEmbedBackfillAll() {
  if (_modelEmbedBackfillRunning || !_modelEmbedEnabled()) return;
  _modelEmbedBackfillRunning = true;
  try {
    const all = [].concat(state.traits || [], state.values || [], state.patterns || [])
      .filter(it => it && !it._deleted && typeof it.name === 'string' && it.name.trim()
                 && !(Array.isArray(it.embedding) && it.embedding.length));
    let done = 0;
    for (const it of all) {
      if (done >= _MODEL_EMBED_BACKFILL_CAP) break;
      const ok = await _modelEmbedItem(it);
      if (ok) done++;
    }
    if (done) { try { saveState(); } catch {} }
  } finally {
    _modelEmbedBackfillRunning = false;
  }
}

// 임베딩 코사인 후보 매칭 — item.embedding(precomputed) vs arr[].embedding(backfilled) 중 최고 ≥ τ 반환.
//   item 또는 후보에 embedding 없으면 null (문자열 fallback 으로 흘러감). _processExtractChapterAnalysis / force 의
//   exists 후보 체인 끝에 붙임.
function _findEmbedMatch(item, arr, tau) {
  if (!item || !Array.isArray(item.embedding) || !item.embedding.length) return null;
  if (!Array.isArray(arr) || typeof _ragCosine !== 'function') return null;
  const t = (typeof tau === 'number') ? tau : _MODEL_EMBED_ATTACH_TAU;
  let best = null, bestSim = t;
  for (const e of arr) {
    if (!e || e._deleted || e === item) continue;
    if (!Array.isArray(e.embedding) || e.embedding.length !== item.embedding.length) continue;
    const sim = _ragCosine(item.embedding, e.embedding);
    if (sim >= bestSim) { bestSim = sim; best = e; }
  }
  return best;
}
