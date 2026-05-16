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
  const candidates = _collectModelDedupCandidates();
  _modelDedupState = {
    candidates,
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
