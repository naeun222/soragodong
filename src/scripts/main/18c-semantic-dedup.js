// 사용자 명시 2026-05-26 ultrathink: 빗자루 의미 dedup (A1 사용자 수동 + A2 일요일 자동).
//   18a (Levenshtein name) / 18b (Jaccard description) 가 못 잡는 의미 페어를 AI 가 추출 + 통합 표현 (merged) 생성.
//   사용자 페어 컨펌 path 유지 — AI 는 후보만 추천, 합치기는 빗자루 모달에서 사용자 결정 ([이 결과로 합치기] / [놔두기]).
//   cooldown: 사용자 수동 24h / 자동 7d. testerMode 우회 (시드 데이터 dedup 테스트).
//   비용 가드: 카드 list token cap + 페어 max 20 (백엔드 prompt 강제).

const SEMANTIC_DEDUP_COOLDOWN_MANUAL_MS = 24 * 60 * 60 * 1000;
const SEMANTIC_DEDUP_COOLDOWN_AUTO_MS = 7 * 24 * 60 * 60 * 1000;
const SEMANTIC_DEDUP_CARDS_JSON_MAX = 22000;  // chars. 백엔드 cap 25000 보다 buffer.

// ─────────────────────────────────────────────────────────────────────────
// cooldown 체크 (auto / manual 별)
// ─────────────────────────────────────────────────────────────────────────
function _isSemanticDedupTester() {
  return !!(state && state.preferences && state.preferences.testerMode);
}

function _semanticDedupCooldownMs(auto) {
  return auto ? SEMANTIC_DEDUP_COOLDOWN_AUTO_MS : SEMANTIC_DEDUP_COOLDOWN_MANUAL_MS;
}

function _semanticDedupLastAtMs(auto) {
  const key = auto ? '_lastSemanticDedupAutoAt' : '_lastSemanticDedupManualAt';
  const iso = state && state[key];
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return isFinite(ms) ? ms : 0;
}

function isSemanticDedupOnCooldown(auto) {
  if (_isSemanticDedupTester()) return false;
  const last = _semanticDedupLastAtMs(!!auto);
  if (!last) return false;
  return (Date.now() - last) < _semanticDedupCooldownMs(!!auto);
}

function semanticDedupCooldownRemainingMs(auto) {
  if (_isSemanticDedupTester()) return 0;
  const last = _semanticDedupLastAtMs(!!auto);
  if (!last) return 0;
  const remain = _semanticDedupCooldownMs(!!auto) - (Date.now() - last);
  return remain > 0 ? remain : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// name 정규화 (lowercase + 공백 제거) — AI 응답 name 매칭 가드
// ─────────────────────────────────────────────────────────────────────────
function _normalizeNameForMatching(name) {
  if (name == null) return '';
  return String(name).toLowerCase().replace(/\s+/g, '').trim();
}

// section 별 카드 array 반환 (live 참조). semantic_dedup 합치기 시점 lookup 용.
function _semanticDedupSectionArray(section) {
  if (!state) return null;
  if (section === 'traits') return state.traits;
  if (section === 'patterns') return state.patterns;
  if (section === 'values') return state.values;
  if (section === 'strengths') return state.caseFormulation && state.caseFormulation.strengths;
  if (section === 'mechanisms') return state.caseFormulation && state.caseFormulation.mechanisms;
  if (section === 'problems') return state.caseFormulation && state.caseFormulation.problems;
  return null;
}

// section + name (정규화) 로 live 카드 찾기. cf string array 도 지원.
function _semanticDedupFindCard(section, name) {
  const arr = _semanticDedupSectionArray(section);
  if (!Array.isArray(arr)) return null;
  const norm = _normalizeNameForMatching(name);
  if (!norm) return null;
  for (const item of arr) {
    if (item == null) continue;
    if (typeof item === 'string') {
      if (_normalizeNameForMatching(item) === norm) return item;
    } else {
      if (item._deleted) continue;
      const itemName = item.name || item.text;
      if (_normalizeNameForMatching(itemName) === norm) return item;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 카드 list 수집 — section 별 정규화. token cap 안에서 confidence DESC 우선 자름.
// ─────────────────────────────────────────────────────────────────────────
function _collectCardsForSemanticDedup() {
  const out = [];
  const _pushCard = (section, name, extras) => {
    if (!name) return;
    const card = Object.assign({ section, name }, extras || {});
    Object.keys(card).forEach(k => {
      if (card[k] === '' || card[k] == null) delete card[k];
    });
    out.push(card);
  };

  const _objSorted = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(x => x && !x._deleted)
      .slice()
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  };

  for (const t of _objSorted(state && state.traits)) {
    _pushCard('traits', t.name, {
      description: t.description,
      confidence: t.confidence,
      evidence_count: t.evidence_count,
      user_verified: t.user_verified
    });
  }
  for (const p of _objSorted(state && state.patterns)) {
    _pushCard('patterns', p.name, {
      description: p.description,
      trigger: p.trigger,
      sequence: p.sequence,
      confidence: p.confidence,
      evidence_count: p.evidence_count,
      user_verified: p.user_verified
    });
  }
  for (const v of _objSorted(state && state.values)) {
    _pushCard('values', v.name, {
      description: v.description,
      confidence: v.confidence,
      evidence_count: v.evidence_count,
      user_verified: v.user_verified
    });
  }

  // case formulation 5 dim — strengths / mechanisms / problems 만 (goals / growth 는 dedup 대상 X).
  const cf = state && state.caseFormulation;
  if (cf) {
    const _cfNorm = (arr, section) => {
      if (!Array.isArray(arr)) return;
      for (const item of arr) {
        if (item == null) continue;
        if (typeof item === 'string') {
          _pushCard(section, item, {});
        } else {
          if (item._deleted) continue;
          _pushCard(section, item.text || item.name, {
            confidence: item.confidence,
            evidence_count: item.evidence_count,
            user_verified: item.user_verified
          });
        }
      }
    };
    _cfNorm(cf.strengths, 'strengths');
    _cfNorm(cf.mechanisms, 'mechanisms');
    _cfNorm(cf.problems, 'problems');
  }

  // token cap — 너무 길면 약한 신호 (confidence 낮음) drop. 이미 confidence DESC 정렬됨.
  let json = JSON.stringify(out);
  if (json.length <= SEMANTIC_DEDUP_CARDS_JSON_MAX) return { cards: out, json };
  while (out.length > 20 && json.length > SEMANTIC_DEDUP_CARDS_JSON_MAX) {
    out.pop();
    json = JSON.stringify(out);
  }
  return { cards: out, json };
}

// ─────────────────────────────────────────────────────────────────────────
// 응답 파싱 — JSON only. markdown fence inside 추출 우선 → fallback indexOf/lastIndexOf.
//   사용자 보고 2026-05-26 ultrathink: AI 가 fence 앞에 설명 + ```json + JSON + ``` 형식으로 응답 시 옛 ^``` regex 가 fence 못 잡고 fail.
//   fix: fence pair 안쪽 추출 우선 (시작 위치 무관). fence 없으면 indexOf 폴백. parse fail 시 raw text 첫 300 char console.warn 으로 진단.
// 사용자 보고 2026-05-26 ultrathink (v2): max_tokens 도달로 mid-string 잘림. _tryRepairTruncatedDedupJson 으로 완성된 페어만 회수.
// ─────────────────────────────────────────────────────────────────────────
function _tryRepairTruncatedDedupJson(body) {
  // 잘린 JSON 에서 완성된 페어 object 만 살림.
  //   {"pairs":[{...},{...},{partial... → {"pairs":[{...},{...}]}
  //   brace depth 추적 (string escape 포함). depth 0 도달 위치 (페어 object 끝) 기록.
  if (!body || typeof body !== 'string') return null;
  const arrStart = body.indexOf('[', body.indexOf('"pairs"'));
  if (arrStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompletePos = -1;
  for (let i = arrStart + 1; i < body.length; i++) {
    const c = body[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) lastCompletePos = i;
    }
  }
  if (lastCompletePos < 0) {
    // 완성된 페어 0개 → 빈 array 로 fallback (parse-fail 보다 비어있음 OK).
    return '{"pairs":[]}';
  }
  return body.slice(0, lastCompletePos + 1) + ']}';
}

function _parseSemanticDedupResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim();
  if (!s) return null;
  // 1. fence pair 안 JSON 시도 — 시작 위치 무관, 가장 큰 fence block 채택.
  let body = '';
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    const inside = fenceMatch[1].trim();
    const fi = inside.indexOf('{');
    const fj = inside.lastIndexOf('}');
    if (fi >= 0 && fj > fi) body = inside.slice(fi, fj + 1);
  }
  // 2. fence 못 잡았으면 indexOf/lastIndexOf 폴백.
  if (!body) {
    const i = s.indexOf('{');
    const j = s.lastIndexOf('}');
    if (i < 0) {
      console.warn('[semantic_dedup] raw response — no { found:', s.slice(0, 300));
      return null;
    }
    body = j > i ? s.slice(i, j + 1) : s.slice(i);  // 잘림 케이스 — j <= i 면 끝까지.
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || !Array.isArray(parsed.pairs)) {
      console.warn('[semantic_dedup] parsed but no pairs array. raw:', s.slice(0, 300));
      return null;
    }
    return parsed;
  } catch (e) {
    // 잘림 추정 — repair 시도.
    console.warn('[semantic_dedup] JSON parse fail (truncation 추정 — repair 시도):', e && e.message);
    const repaired = _tryRepairTruncatedDedupJson(body);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        if (parsed && Array.isArray(parsed.pairs)) {
          console.warn('[semantic_dedup] repair OK — 완성 페어', parsed.pairs.length, '개 회수');
          return parsed;
        }
      } catch (e2) {
        console.warn('[semantic_dedup] repair 도 fail:', e2 && e2.message);
      }
    }
    console.warn('[semantic_dedup] raw (300):', s.slice(0, 300), '\nbody (300):', body.slice(0, 300));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 페어 검증 — AI hallucination 가드. live 카드 매칭 fail 페어 drop.
// ─────────────────────────────────────────────────────────────────────────
function _validateSemanticDedupPairs(rawPairs) {
  if (!Array.isArray(rawPairs)) return [];
  const valid = [];
  for (const p of rawPairs) {
    if (!p || typeof p !== 'object') continue;
    const aCard = _semanticDedupFindCard(p.a_section, p.a_name);
    const bCard = _semanticDedupFindCard(p.b_section, p.b_name);
    if (!aCard || !bCard) {
      console.warn('[semantic_dedup] live 카드 매칭 fail — skip:', p.a_name, '|', p.b_name);
      continue;
    }
    if (aCard === bCard) continue;  // 같은 카드 페어 skip
    const merged = (p.merged && typeof p.merged === 'object') ? p.merged : {};
    valid.push({
      a_name: String(p.a_name || ''),
      a_section: String(p.a_section || ''),
      b_name: String(p.b_name || ''),
      b_section: String(p.b_section || ''),
      reason: String(p.reason || '').slice(0, 200),
      merged: {
        name: String(merged.name || '').slice(0, 80),
        description: String(merged.description || '').slice(0, 600),
        trigger: String(merged.trigger || '').slice(0, 200),
        sequence: String(merged.sequence || '').slice(0, 200)
      }
    });
  }
  // cap 10 — 백엔드 prompt 도 명시하지만 client 도 가드 (사용자 보고 2026-05-26 ultrathink v2: max_tokens 잘림 잡기 위해 cap 20→10).
  return valid.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────
// 메인 호출 — opts = { auto: bool }. true = 일요일 자동 (7d cooldown), false = 사용자 수동 (24h cooldown).
// ─────────────────────────────────────────────────────────────────────────
async function runSemanticDedup(opts) {
  const auto = !!(opts && opts.auto);
  if (typeof _canAI === 'function' && !_canAI()) {
    return { ok: false, reason: 'no-ai' };
  }
  if (isSemanticDedupOnCooldown(auto)) {
    return { ok: false, reason: 'cooldown', remainingMs: semanticDedupCooldownRemainingMs(auto) };
  }
  const { cards, json } = _collectCardsForSemanticDedup();
  if (!cards.length) {
    return { ok: false, reason: 'no-cards' };
  }
  // 카드 < 4 면 의미 페어 가능성 낮음 — 호출 skip.
  if (cards.length < 4) {
    return { ok: false, reason: 'too-few-cards', cardCount: cards.length };
  }

  try {
    const response = await callAnthropic({
      _endpoint: 'semantic_dedup',
      _userContentType: 'semantic_dedup',
      _vars: { cardsJson: json },
      model: 'claude-opus-4-7',
      // 사용자 보고 2026-05-26 ultrathink (v2): 4000 → 8000. 직전 v1 fix 도 4000 한계 도달 → mid-string 잘림.
      //   페어 10 × (a/b name/section + reason 40자 + merged{name 15자 + description 120자 + trigger/sequence 60자 각}) ≈ ~5K char 안전 + 2K buffer.
      max_tokens: 8000,
      messages: [{ role: 'user', content: '' }]
    });
    if (!response || !response.ok) {
      const txt = response ? await response.text().catch(() => '') : '';
      console.warn('[semantic_dedup] HTTP fail', response && response.status, txt.slice(0, 300));
      return { ok: false, reason: 'http-fail', status: response && response.status };
    }
    const data = await response.json();
    // 사용자 보고 2026-05-26 ultrathink: content array 안 모든 text block 합치기 — 안전. 일반 messages 는 보통 [0] 하나지만 thinking / multi-block 케이스 안전망.
    let text = '';
    if (data && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          text += block.text;
        }
      }
    }
    // 사용자 보고 2026-05-26 ultrathink (v2): stop_reason 감지 — 'max_tokens' 면 잘림 확정. 진단 log.
    if (data && data.stop_reason === 'max_tokens') {
      console.warn('[semantic_dedup] stop_reason=max_tokens — response 잘림. text len:', text.length, '/ max_tokens:', 8000);
    }
    const parsed = _parseSemanticDedupResponse(text);
    if (!parsed) {
      return { ok: false, reason: 'parse-fail' };
    }
    const pairs = _validateSemanticDedupPairs(parsed.pairs);
    const nowIso = new Date().toISOString();
    state.aiSuggestedDedupPairs = {
      at: nowIso,
      source: auto ? 'auto' : 'manual',
      pairs
    };
    if (auto) {
      state._lastSemanticDedupAutoAt = nowIso;
    } else {
      state._lastSemanticDedupManualAt = nowIso;
    }
    if (typeof saveState === 'function') saveState();
    return { ok: true, pairs, cardCount: cards.length, source: auto ? 'auto' : 'manual' };
  } catch (e) {
    console.warn('[semantic_dedup] throw', e);
    return { ok: false, reason: 'throw', error: e && e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 빗자루 모달 통합용 — 현재 저장된 AI 페어 list (live 카드 객체 참조 변환).
// 18a / 18b candidates 와 같은 schema 로 변환: { category, a, b, similarity, source: 'semantic', merged }
// ─────────────────────────────────────────────────────────────────────────
function _collectSemanticDedupCandidates() {
  const stored = state && state.aiSuggestedDedupPairs;
  if (!stored || !Array.isArray(stored.pairs)) return [];
  const out = [];
  for (const p of stored.pairs) {
    const aCard = _semanticDedupFindCard(p.a_section, p.a_name);
    const bCard = _semanticDedupFindCard(p.b_section, p.b_name);
    if (!aCard || !bCard) continue;
    if (aCard === bCard) continue;
    // category 결정 — 같은 section 이면 그 이름, cross 이면 cluster 명.
    let category;
    if (p.a_section === p.b_section) {
      if (p.a_section === 'traits' || p.a_section === 'values' || p.a_section === 'patterns') {
        category = p.a_section;
      } else {
        category = 'cf_' + p.a_section;
      }
    } else {
      // cross — operating (traits ↔ patterns) / self_regulation (strengths ↔ mechanisms)
      const sa = p.a_section, sb = p.b_section;
      const op = (sa === 'traits' && sb === 'patterns') || (sa === 'patterns' && sb === 'traits');
      const sr = (sa === 'strengths' && sb === 'mechanisms') || (sa === 'mechanisms' && sb === 'strengths');
      if (op) category = 'cluster_operating';
      else if (sr) category = 'cluster_self_regulation';
      else category = sa + '_x_' + sb;  // edge case — 다른 cross
    }
    out.push({
      category,
      a: aCard,
      b: bCard,
      similarity: 0.9,  // AI 후보 — high similarity 로 정렬 우선.
      source: 'semantic',
      merged: p.merged,
      reason: p.reason,
      a_section: p.a_section,
      b_section: p.b_section
    });
  }
  return out;
}
