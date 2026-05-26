// 사용자 명시 2026-05-10 (옵션 A): 나 탭 '정리' 버튼 — 사용자 컨펌 dedup. AI 호출 X.
//   1. 코드가 후보 페어 추출 (편집 거리 0.7+ + similarText 포함 매칭).
//   2. 모달에 페어 한 개씩 preview (양 카드 메타 강조).
//   3. 사용자 [합치기] / [놔두기] 선택.
//   4. 합치기 = 메타데이터 명시 처리 (verified 우선 + evidence 합 + confidence max + extractedFrom 'chapter' > 'simulation').
//   비용 X / 데이터 무결성 보장 / 격리 (batch 12) 보존.

// =============================================================================
// 편집 거리 (Levenshtein) — 한글/영문 fuzzy 매칭. 0.7+ = 후보, 1.0 = 완전 일치 (코드 dedup 이미 처리).
// =============================================================================
function _modelEditDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function _modelSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = String(a).toLowerCase().replace(/\s+/g, '');
  const nb = String(b).toLowerCase().replace(/\s+/g, '');
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;  // 포함 = 강한 매칭 (similarText 와 일관)
  const dist = _modelEditDistance(na, nb);
  return 1 - (dist / maxLen);
}

// =============================================================================
// 후보 페어 추출 — 카테고리 별 (cross-category 매칭 X)
// =============================================================================
function _collectModelDedupCandidates() {
  const SIM_THRESHOLD = 0.7;  // 0.7+ = 후보 (사용자 컨펌). 1.0 = 코드 dedup 이미 처리.
  const candidates = [];  // { category, a, b, similarity }
  // 사용자 명시 2026-05-16 ultrathink: 더 깊은 나 의 string array (coreBeliefs / identityKeywords) 도 dedup 대상 → string item 자동 처리.
  const _findPairs = (arr, category, nameField) => {
    if (!Array.isArray(arr) || arr.length < 2) return;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a == null || b == null) continue;
        const aIsStr = typeof a === 'string';
        const bIsStr = typeof b === 'string';
        if (!aIsStr && a._deleted) continue;
        if (!bIsStr && b._deleted) continue;
        const aName = aIsStr ? a : (a[nameField] || a.text || a.name);
        const bName = bIsStr ? b : (b[nameField] || b.text || b.name);
        if (!aName || !bName) continue;
        const sim = _modelSimilarity(aName, bName);
        if (sim >= SIM_THRESHOLD && sim < 1.0) {
          candidates.push({ category, a, b, similarity: sim });
        }
      }
    }
  };
  _findPairs(state.traits, 'traits', 'name');
  _findPairs(state.values, 'values', 'name');
  _findPairs(state.patterns, 'patterns', 'name');
  // cf 5차원 (text array)
  if (state.caseFormulation) {
    ['problems', 'mechanisms', 'strengths', 'goals', 'growth'].forEach(dim => {
      _findPairs(state.caseFormulation[dim], 'cf_' + dim, 'text');
    });
  }
  // V4 feat (사용자 명시 2026-05-26 ultrathink): cross-cluster 페어 — 4 클러스터 통합 의도.
  //   "네 특성" + "보이는 패턴" = 핵심 작동 패턴 클러스터 (traits ∪ patterns).
  //   "네 강점" + "어떻게 작동하는지" = 자기조절 도구 클러스터 (cf.strengths ∪ cf.mechanisms).
  //   기존 within-array 페어는 그대로 두고 cross-array 페어만 추가 — 같은 페어가 양쪽에서 잡힐 일은 없음 (서로 다른 array).
  const _findCrossPairs = (arrA, arrB, category, nameFieldA, nameFieldB) => {
    if (!Array.isArray(arrA) || !Array.isArray(arrB) || arrA.length === 0 || arrB.length === 0) return;
    for (const a of arrA) {
      if (a == null) continue;
      const aIsStr = typeof a === 'string';
      if (!aIsStr && a._deleted) continue;
      const aName = aIsStr ? a : (a[nameFieldA] || a.text || a.name);
      if (!aName) continue;
      for (const b of arrB) {
        if (b == null) continue;
        const bIsStr = typeof b === 'string';
        if (!bIsStr && b._deleted) continue;
        const bName = bIsStr ? b : (b[nameFieldB] || b.text || b.name);
        if (!bName) continue;
        const sim = _modelSimilarity(aName, bName);
        if (sim >= SIM_THRESHOLD && sim < 1.0) {
          candidates.push({ category, a, b, similarity: sim });
        }
      }
    }
  };
  _findCrossPairs(state.traits, state.patterns, 'cluster_operating', 'name', 'name');
  if (state.caseFormulation) {
    _findCrossPairs(state.caseFormulation.strengths, state.caseFormulation.mechanisms, 'cluster_self_regulation', 'text', 'text');
  }
  // 사용자 명시 2026-05-16 ultrathink: 더 깊은 나 (userDeepProfile) 6 영역 dedup.
  //   - 객체 array: turningPoints (title 매칭) / relationships (name 매칭)
  //   - string array: coreBeliefs.aboutSelf/aboutWorld/aboutFuture / identityKeywords
  if (state.userDeepProfile) {
    const dev = state.userDeepProfile.development;
    if (dev) _findPairs(dev.turningPoints, 'deep_turningPoints', 'title');
    _findPairs(state.userDeepProfile.relationships, 'deep_relationships', 'name');
    const sn = state.userDeepProfile.selfNarrative;
    if (sn) {
      const cb = sn.coreBeliefs;
      if (cb) {
        _findPairs(cb.aboutSelf, 'deep_aboutSelf', null);
        _findPairs(cb.aboutWorld, 'deep_aboutWorld', null);
        _findPairs(cb.aboutFuture, 'deep_aboutFuture', null);
      }
      _findPairs(sn.identityKeywords, 'deep_identityKeywords', null);
    }
  }
  // similarity 높은 순 정렬 (가장 명백한 중복부터)
  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates;
}

// =============================================================================
// 모달 state — 진행 중 페어 인덱스 + 결과 카운트
// =============================================================================
let _modelDedupState = null;

function openModelDedupModal() {
  if (document.getElementById('modelDedupOverlay')) return;
  // 사용자 명시 2026-05-26 ultrathink: 18a (Levenshtein name, 14 카테고리) + 18b (Jaccard description, traits/values/patterns) 둘 다 후보 추출 후 merge.
  //   같은 (a, b) 페어가 양쪽에서 잡히면 max similarity 채택 — 사용자한테 한 번만 보여줌. _renderModelDedupStep / _modelDedupMerge 는 18b 후보의 category (traits/values/patterns) 도 일반 path 로 처리.
  const lev = _collectModelDedupCandidates();
  const jac = (typeof _collectContentDedupCandidates === 'function')
    ? _collectContentDedupCandidates()
    : [];
  const _samePair = (x, y) => (x.a === y.a && x.b === y.b) || (x.a === y.b && x.b === y.a);
  const all = [];
  for (const c of lev) all.push(c);
  for (const c of jac) {
    const dup = all.find(m => _samePair(m, c));
    if (dup) {
      if (c.similarity > dup.similarity) dup.similarity = c.similarity;
    } else {
      all.push(c);
    }
  }
  all.sort((a, b) => b.similarity - a.similarity);
  _modelDedupState = {
    candidates: all,
    idx: 0,
    merged: 0,
    skipped: 0,
  };
  const overlay = document.createElement('div');
  overlay.id = 'modelDedupOverlay';
  overlay.className = 'input-modal-overlay show';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = '<div class="input-modal model-dedup-modal" id="modelDedupModal" style="max-width:480px; padding:22px;"></div>';
  document.body.appendChild(overlay);
  _renderModelDedupStep();
}

function closeModelDedupModal() {
  const ov = document.getElementById('modelDedupOverlay');
  if (ov) ov.remove();
  _modelDedupState = null;
}

function _renderModelDedupStep() {
  if (!_modelDedupState) return;
  const modal = document.getElementById('modelDedupModal');
  if (!modal) return;
  const { candidates, idx, merged, skipped } = _modelDedupState;

  // 후보 0개 또는 끝
  if (candidates.length === 0) {
    modal.innerHTML = `
      <div style="text-align:center; padding:20px 10px;">
        <div style="font-size:32px; margin-bottom:12px;">✨</div>
        <div style="font-size:14px; color:var(--text); margin-bottom:20px;">정리할 중복 후보 X.</div>
        <button class="btn-primary" onclick="closeModelDedupModal()" style="width:100%;">닫기</button>
      </div>
    `;
    return;
  }
  if (idx >= candidates.length) {
    modal.innerHTML = `
      <div style="text-align:center; padding:20px 10px;">
        <div style="font-size:32px; margin-bottom:12px;">🧹</div>
        <div style="font-size:14px; color:var(--text); margin-bottom:8px;">정리 끝.</div>
        <div style="font-size:11.5px; color:var(--text-soft); margin-bottom:20px; line-height:1.8;">합친 거 ${merged}개 · 놔둔 거 ${skipped}개</div>
        <button class="btn-primary" onclick="closeModelDedupModal()" style="width:100%;">닫기</button>
      </div>
    `;
    if (typeof renderModel === 'function') { try { renderModel(); } catch {} }
    return;
  }

  const cur = candidates[idx];
  const { category, a, b, similarity } = cur;

  // 사용자 명시 2026-05-16 ultrathink: 카테고리 별 name/desc 추출 — string array (deep_aboutSelf 등) / 객체 array (deep_turningPoints, deep_relationships) / 기존 cf/특성 모두 분기.
  const isStringItem = typeof a === 'string';
  let aName, bName, aDesc = '', bDesc = '';
  if (isStringItem) {
    aName = a;
    bName = b;
  } else if (category === 'deep_turningPoints') {
    aName = a.title || '?';
    bName = b.title || '?';
    aDesc = [a.when, a.impact].filter(Boolean).join(' — ');
    bDesc = [b.when, b.impact].filter(Boolean).join(' — ');
  } else if (category === 'deep_relationships') {
    aName = a.name || '?';
    bName = b.name || '?';
    aDesc = [a.relation, a.tone, a.notes].filter(Boolean).join(' / ');
    bDesc = [b.relation, b.tone, b.notes].filter(Boolean).join(' / ');
  } else if (category === 'cluster_self_regulation') {
    // V4 (사용자 명시 2026-05-26 ultrathink): cf.strengths ↔ cf.mechanisms cross. string/object hybrid 안전.
    aName = (typeof a === 'string') ? a : (a.text || a.name || '?');
    bName = (typeof b === 'string') ? b : (b.text || b.name || '?');
  } else {
    const nameField = category.startsWith('cf_') ? 'text' : 'name';
    aName = a[nameField] || a.name;
    bName = b[nameField] || b.name;
    aDesc = a.description || '';
    bDesc = b.description || '';
  }

  const _categoryLabel = ({
    traits: '🌿 특성',
    values: '✨ 가치',
    patterns: '🔄 패턴',
    cf_problems: '📌 짚어본 곳',
    cf_mechanisms: '⚙️ 작동 방식',
    cf_strengths: '💪 잘 풀린 곳',
    cf_goals: '🎯 가고 싶은 곳',
    cf_growth: '🌱 자라는 곳',
    deep_turningPoints: '🔀 전환점',
    deep_relationships: '👥 핵심 인물',
    deep_aboutSelf: '💭 자신에 대한 신념',
    deep_aboutWorld: '🌍 세상에 대한 신념',
    deep_aboutFuture: '🌅 미래에 대한 신념',
    deep_identityKeywords: '🏷️ 정체성 keyword',
    cluster_operating: '🌀 핵심 작동 패턴 (특성 ↔ 보이는 패턴)',
    cluster_self_regulation: '🔧 자기조절 도구 (강점 ↔ 어떻게 작동)',
  })[category] || category;

  // deep_* 항목은 verified/confidence/evidence/extractedFrom metadata 가 없음 → badge skip.
  const _showBadge = !isStringItem && !category.startsWith('deep_');
  const _metaBadge = (item) => {
    if (!_showBadge) return '';
    const verified = item.user_verified === true ? '<span style="color:#8fc88f; font-size:10px;">✓ 컨펌</span>' : '<span style="color:var(--text-soft); font-size:10px;">? 미컨펌</span>';
    const conf = typeof item.confidence === 'number' ? `<span style="font-size:10px; color:var(--text-dim);">conf ${item.confidence.toFixed(2)}</span>` : '';
    const evi = item.evidence_count ? `<span style="font-size:10px; color:var(--text-dim);">evi ×${item.evidence_count}</span>` : '';
    const src = item.extractedFrom === 'simulation' ? '<span style="font-size:10px; color:var(--accent);">💭 시뮬</span>' : '';
    return `<div style="display:flex; gap:8px; margin-top:4px; flex-wrap:wrap;">${verified}${conf ? ' · ' + conf : ''}${evi ? ' · ' + evi : ''}${src ? ' · ' + src : ''}</div>`;
  };
  const _mergeHint = category.startsWith('deep_')
    ? '합치면: 더 자세한 쪽 남김.'
    : '합치면: 컨펌 ✓ 우선 / evidence 합산 / confidence 큰 쪽 / 시뮬 출처 → 일반 출처 우선.';

  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
      <div style="font-size:11px; color:var(--text-soft);">${idx + 1} / ${candidates.length} · ${_categoryLabel}</div>
      <div style="font-size:10px; color:var(--text-dim);">유사도 ${(similarity * 100).toFixed(0)}%</div>
    </div>
    <div style="font-size:14px; font-weight:600; color:var(--text); margin-bottom:14px;">이 둘 합칠까?</div>
    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
      <div style="padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px;">
        <div style="font-size:13px; color:var(--text); font-weight:500;">${escapeHtml(aName)}</div>
        ${aDesc ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px; line-height:1.6;">${escapeHtml(aDesc.slice(0, 200))}</div>` : ''}
        ${_metaBadge(a)}
      </div>
      <div style="text-align:center; font-size:11px; color:var(--text-soft);">↕</div>
      <div style="padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px;">
        <div style="font-size:13px; color:var(--text); font-weight:500;">${escapeHtml(bName)}</div>
        ${bDesc ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px; line-height:1.6;">${escapeHtml(bDesc.slice(0, 200))}</div>` : ''}
        ${_metaBadge(b)}
      </div>
    </div>
    <div style="font-size:10.5px; color:var(--text-soft); margin-bottom:14px; padding:8px 10px; background:rgba(126,200,227,0.04); border-left:2px solid rgba(126,200,227,0.3); border-radius:0 6px 6px 0; line-height:1.7;">
      ${_mergeHint}
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn-secondary" onclick="_modelDedupSkip()" style="flex:1;">놔두기</button>
      <button class="btn-primary" onclick="_modelDedupMerge()" style="flex:1;">합치기 ✦</button>
    </div>
    <button class="btn-secondary" onclick="closeModelDedupModal()" style="width:100%; margin-top:8px; font-size:11px; opacity:0.7;">중단</button>
  `;
}

function _modelDedupSkip() {
  if (!_modelDedupState) return;
  _modelDedupState.skipped++;
  _modelDedupState.idx++;
  _renderModelDedupStep();
}

function _modelDedupMerge() {
  if (!_modelDedupState) return;
  const cur = _modelDedupState.candidates[_modelDedupState.idx];
  if (!cur) return;
  const { category, a, b } = cur;

  // 사용자 명시 2026-05-16 ultrathink: 더 깊은 나 dedup — string array (coreBeliefs/identityKeywords) + 객체 array (turningPoints/relationships) 별도 처리.
  const deepArrGetter = {
    deep_turningPoints: () => state.userDeepProfile && state.userDeepProfile.development && state.userDeepProfile.development.turningPoints,
    deep_relationships: () => state.userDeepProfile && state.userDeepProfile.relationships,
    deep_aboutSelf: () => state.userDeepProfile && state.userDeepProfile.selfNarrative && state.userDeepProfile.selfNarrative.coreBeliefs && state.userDeepProfile.selfNarrative.coreBeliefs.aboutSelf,
    deep_aboutWorld: () => state.userDeepProfile && state.userDeepProfile.selfNarrative && state.userDeepProfile.selfNarrative.coreBeliefs && state.userDeepProfile.selfNarrative.coreBeliefs.aboutWorld,
    deep_aboutFuture: () => state.userDeepProfile && state.userDeepProfile.selfNarrative && state.userDeepProfile.selfNarrative.coreBeliefs && state.userDeepProfile.selfNarrative.coreBeliefs.aboutFuture,
    deep_identityKeywords: () => state.userDeepProfile && state.userDeepProfile.selfNarrative && state.userDeepProfile.selfNarrative.identityKeywords,
  };
  if (deepArrGetter[category]) {
    const arr = deepArrGetter[category]();
    if (Array.isArray(arr)) {
      const idxA = arr.indexOf(a);
      const idxB = arr.indexOf(b);
      if (idxA >= 0 && idxB >= 0) {
        const _longer = (x, y) => (String(x || '').length >= String(y || '').length) ? x : y;
        if (category === 'deep_turningPoints') {
          arr[idxA] = {
            when: a.when || b.when || '',
            title: _longer(a.title, b.title) || '',
            impact: _longer(a.impact, b.impact) || '',
            merged_at: new Date().toISOString(),
          };
        } else if (category === 'deep_relationships') {
          arr[idxA] = {
            name: _longer(a.name, b.name) || '',
            relation: a.relation || b.relation || '',
            tone: a.tone || b.tone || '',
            notes: _longer(a.notes, b.notes) || '',
            merged_at: new Date().toISOString(),
          };
        } else {
          // string array (coreBeliefs / identityKeywords) — 긴 쪽 남김
          arr[idxA] = (String(a).length >= String(b).length) ? a : b;
        }
        arr.splice(idxB, 1);
        if (typeof _bumpUserDeepProfile === 'function') {
          try { _bumpUserDeepProfile(); } catch {}
        }
      }
    }
    if (typeof saveState === 'function') saveState();
    _modelDedupState.merged++;
    _modelDedupState.idx++;
    while (_modelDedupState.idx < _modelDedupState.candidates.length) {
      const next = _modelDedupState.candidates[_modelDedupState.idx];
      if (next && next.a !== b && next.b !== b && next.a !== a && next.b !== a) break;
      _modelDedupState.idx++;
    }
    _renderModelDedupStep();
    return;
  }

  // V4 feat (사용자 명시 2026-05-26 ultrathink): cluster_operating — 특성 ↔ 보이는 패턴 cross 합치기.
  //   흡수 룰: user_verified=true 우선 > evidence_count 큰 쪽 > trait 우선 (안정 성향이 행동 시퀀스보다 상위).
  //   keep 이 trait 이고 drop 이 pattern 이면 description 끝에 trigger/sequence 흡수 (정보 손실 방지).
  if (category === 'cluster_operating') {
    const _opScore = (x, isTrait) => (x.user_verified === true ? 1000 : 0) + (x.evidence_count || 1) * 10 + (isTrait ? 5 : 0);
    const aIsTrait = (state.traits || []).indexOf(a) >= 0;
    const bIsTrait = (state.traits || []).indexOf(b) >= 0;
    const aArr = aIsTrait ? state.traits : state.patterns;
    const bArr = bIsTrait ? state.traits : state.patterns;
    const aScore = _opScore(a, aIsTrait);
    const bScore = _opScore(b, bIsTrait);
    const keep = aScore >= bScore ? a : b;
    const drop = keep === a ? b : a;
    const keepIsTrait = keep === a ? aIsTrait : bIsTrait;
    const dropArr = drop === a ? aArr : bArr;
    keep.evidence_count = (keep.evidence_count || 1) + (drop.evidence_count || 1);
    keep.confidence = Math.max(keep.confidence || 0, drop.confidence || 0);
    if (drop.user_verified === true) keep.user_verified = true;
    if ((drop.description || '').length > (keep.description || '').length) keep.description = drop.description;
    if (keepIsTrait && (drop.trigger || drop.sequence)) {
      const triggerInfo = [drop.trigger && `트리거: ${drop.trigger}`, drop.sequence && `흐름: ${drop.sequence}`].filter(Boolean).join(' / ');
      if (triggerInfo) keep.description = (keep.description ? keep.description + ' — ' : '') + triggerInfo;
    }
    if (drop.extractedFrom === 'chapter') keep.extractedFrom = 'chapter';
    keep.merged_at = new Date().toISOString();
    keep.merged_from_cluster = 'operating';
    const dropIdx = dropArr.indexOf(drop);
    if (dropIdx >= 0) dropArr.splice(dropIdx, 1);
    if (typeof saveState === 'function') saveState();
    _modelDedupState.merged++;
    _modelDedupState.idx++;
    while (_modelDedupState.idx < _modelDedupState.candidates.length) {
      const next = _modelDedupState.candidates[_modelDedupState.idx];
      if (next && next.a !== b && next.b !== b && next.a !== a && next.b !== a) break;
      _modelDedupState.idx++;
    }
    _renderModelDedupStep();
    return;
  }

  // V4 feat (사용자 명시 2026-05-26 ultrathink): cluster_self_regulation — 강점 ↔ 어떻게 작동 cross 합치기.
  //   흡수 방향: strengths 우선 (사용자 표현 "강점 = 작동하는 도구"). 둘 다 같은 array 면 within 처럼 처리.
  //   string / object 둘 다 안전 (시드 object array vs production string array hybrid).
  if (category === 'cluster_self_regulation') {
    const cf = state.caseFormulation || {};
    const sArr = cf.strengths || [];
    const mArr = cf.mechanisms || [];
    const aInS = sArr.indexOf(a) >= 0;
    const bInS = sArr.indexOf(b) >= 0;
    let keep, drop, keepArr, dropArr;
    if (aInS && !bInS) { keep = a; drop = b; keepArr = sArr; dropArr = mArr; }
    else if (!aInS && bInS) { keep = b; drop = a; keepArr = sArr; dropArr = mArr; }
    else { keep = a; drop = b; keepArr = aInS ? sArr : mArr; dropArr = aInS ? sArr : mArr; }
    const _toObj = (x) => typeof x === 'string' ? { text: x } : { ...x };
    const keepObj = _toObj(keep);
    const dropObj = _toObj(drop);
    keepObj.evidence_count = (keepObj.evidence_count || 1) + (dropObj.evidence_count || 1);
    keepObj.confidence = Math.max(keepObj.confidence || 0, dropObj.confidence || 0);
    if (dropObj.user_verified === true) keepObj.user_verified = true;
    if ((dropObj.text || '').length > (keepObj.text || '').length) keepObj.text = dropObj.text;
    keepObj.merged_at = new Date().toISOString();
    keepObj.merged_from_cluster = 'self_regulation';
    const keepIdx = keepArr.indexOf(keep);
    if (keepIdx >= 0) keepArr[keepIdx] = keepObj;
    const dropIdx = dropArr.indexOf(drop);
    if (dropIdx >= 0) dropArr.splice(dropIdx, 1);
    if (typeof saveState === 'function') saveState();
    _modelDedupState.merged++;
    _modelDedupState.idx++;
    while (_modelDedupState.idx < _modelDedupState.candidates.length) {
      const next = _modelDedupState.candidates[_modelDedupState.idx];
      if (next && next.a !== b && next.b !== b && next.a !== a && next.b !== a) break;
      _modelDedupState.idx++;
    }
    _renderModelDedupStep();
    return;
  }

  // 메타데이터 명시 처리
  const _verifiedKept = (a.user_verified === true) || (b.user_verified === true);
  const _confKept = Math.max(a.confidence || 0, b.confidence || 0);
  const _evidenceKept = (a.evidence_count || 1) + (b.evidence_count || 1);
  // extractedFrom 우선순위: 'chapter' > 'simulation' (일반 신호 우선)
  const _srcKept = (a.extractedFrom === 'chapter' || b.extractedFrom === 'chapter')
    ? 'chapter'
    : (a.extractedFrom || b.extractedFrom || 'chapter');
  // 더 자세한 description 채택 (긴 쪽). 둘 다 있으면 a 우선.
  const _descKept = (a.description && a.description.length >= (b.description || '').length)
    ? a.description
    : (b.description || a.description || '');
  // name / text — verified=true 쪽 우선, 둘 다 verified 면 a 우선
  const nameField = category.startsWith('cf_') ? 'text' : 'name';
  const _nameKept = (b.user_verified === true && a.user_verified !== true)
    ? (b[nameField] || b.name)
    : (a[nameField] || a.name);

  // a 갱신, b 제거
  if (category.startsWith('cf_')) {
    const dim = category.slice(3);
    const arr = state.caseFormulation && state.caseFormulation[dim];
    if (Array.isArray(arr)) {
      const idxA = arr.indexOf(a);
      const idxB = arr.indexOf(b);
      if (idxA >= 0 && idxB >= 0) {
        arr[idxA] = {
          ...a,
          text: _nameKept,
          confidence: _confKept,
          evidence_count: _evidenceKept,
          user_verified: _verifiedKept,
          merged_at: new Date().toISOString(),
        };
        arr.splice(idxB, 1);
      }
    }
  } else {
    const arr = state[category];
    if (Array.isArray(arr)) {
      const idxA = arr.indexOf(a);
      const idxB = arr.indexOf(b);
      if (idxA >= 0 && idxB >= 0) {
        arr[idxA] = {
          ...a,
          name: _nameKept,
          description: _descKept,
          confidence: _confKept,
          evidence_count: _evidenceKept,
          user_verified: _verifiedKept,
          extractedFrom: _srcKept,
          merged_at: new Date().toISOString(),
        };
        arr.splice(idxB, 1);
      }
    }
  }
  if (typeof saveState === 'function') saveState();
  _modelDedupState.merged++;
  // 다음 후보로 — 이미 합친 a/b 가 다른 페어에 있으면 skip
  _modelDedupState.idx++;
  while (_modelDedupState.idx < _modelDedupState.candidates.length) {
    const next = _modelDedupState.candidates[_modelDedupState.idx];
    if (next && next.a !== b && next.b !== b && next.a !== a && next.b !== a) break;
    // 옛 페어 가 합쳐진 항목 참조 → skip
    _modelDedupState.idx++;
  }
  _renderModelDedupStep();
}
