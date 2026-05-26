// 사용자 명시 2026-05-26 ultrathink: 일회성 내용 기반 dedup 후보 추출. description Jaccard 로
//   18a (Levenshtein, name only) 가 못 잡는 의미 중복 잡음.
//   "사회적 호감 감지 민감성" + "대인 호감 레이더" — name 만 보면 다르지만 description 거의 같은 단어 → Jaccard 0.3+ 매칭.
//   진입점 X — 18a `openModelDedupModal` 안에서 18a 후보와 함께 한 모달에 합쳐 보여줌.
//   백엔드 의존 X / LLM 호출 X. traits/values/patterns 만 다룸 (deep_/cf_ 는 18a 가 cover).

// ─────────────────────────────────────────────────────────────────────────
// 한국어 토큰화 — 공백/구두점 split + 길이 2+ + stopword 제외. 외부 morpheme analyzer X.
// ─────────────────────────────────────────────────────────────────────────
const _CONTENT_DEDUP_STOPWORDS = new Set([
  '이거', '저거', '그거', '있음', '없음', '하는', '되는', '있는', '없는',
  '같은', '한번', '이런', '저런', '그런', '이렇게', '저렇게', '그렇게',
  '경우', '때문', '대해', '대한', '거나', '면서', '으로', '에서', '에는',
  '에게', '한테', '에도', '에만', '으면', '으면서', '으나', '하고', '되고',
  '직접', '자기', '자신', '자체', '그대로', '바로', '계속', '정말', '진짜',
  '거의', '약간', '조금', '많이', '꽤', '되게', '아주', '너무', '좀'
]);

function _tokenizeForDedup(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[.,!?·•—\-…'"`()\[\]{}<>「」『』:;~]/g, ' ')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && !_CONTENT_DEDUP_STOPWORDS.has(s));
}

function _jaccardSim(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// 후보 페어 추출 — traits / values / patterns 안에서만 (cross-section X)
// ─────────────────────────────────────────────────────────────────────────
function _collectContentDedupCandidates() {
  const SIM_THRESHOLD = 0.3;
  const sections = [
    { arr: state.traits || [], category: 'traits' },
    { arr: state.values || [], category: 'values' },
    { arr: state.patterns || [], category: 'patterns' }
  ];
  const candidates = [];
  for (const { arr, category } of sections) {
    if (!Array.isArray(arr) || arr.length < 2) continue;
    // pre-tokenize — O(n²) 비교 비용 ↓
    const tokenized = arr.map(item => {
      if (!item || item._deleted) return null;
      const name = item.name || item.text || '';
      const desc = item.description || '';
      const trigger = item.trigger || '';
      const seq = item.sequence || '';
      const bag = new Set([
        ..._tokenizeForDedup(name),
        ..._tokenizeForDedup(desc),
        ..._tokenizeForDedup(trigger),
        ..._tokenizeForDedup(seq)
      ]);
      // bag < 3 단어면 매칭 신뢰 X — skip.
      if (bag.size < 3) return null;
      return { item, bag };
    });
    for (let i = 0; i < tokenized.length; i++) {
      if (!tokenized[i]) continue;
      for (let j = i + 1; j < tokenized.length; j++) {
        if (!tokenized[j]) continue;
        const sim = _jaccardSim(tokenized[i].bag, tokenized[j].bag);
        if (sim >= SIM_THRESHOLD) {
          candidates.push({
            category,
            a: tokenized[i].item,
            b: tokenized[j].item,
            similarity: sim,
            source: 'jaccard'
          });
        }
      }
    }
  }
  return candidates;
}
