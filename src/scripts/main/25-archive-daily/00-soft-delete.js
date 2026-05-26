// ═══════════════════════════════════════════════════════════════
// V4 사용자 명시 2026-05-04 ultrathink: 챗 히스토리 삭제 + cascade
// ───────────────────────────────────────────────────────────────
// archive 를 지우면 그 archive 에서 4AM 분석으로 추출된 derived 항목 (traits/
// values/patterns/insights/pearls/topicCards/state.archive 항목 / udp.turning-
// Points / udp.relationships / cf.problems...) 도 같이 soft delete 되어야
// 주/월/계절/연 후속 분석에 다시 들어가지 않는다.
//
// 추적 방식:
// - 객체형 derived: 추출 직후 sourceArchiveId 직접 박음 (cascade = filter id)
// - 텍스트형 derived (cf.* / udp.identityKeywords): archive 에 _derivedRefs 메타
//   (cascade 시 splice).
// ═══════════════════════════════════════════════════════════════

// 추출 직전 snapshot — id set + 텍스트 array.
function _captureDerivedSnapshot() {
  const idSet = (arr) => new Set((Array.isArray(arr) ? arr : []).map(x => x && x.id).filter(Boolean));
  const txtArr = (arr) => (Array.isArray(arr) ? arr.slice() : []);
  const udp = state.userDeepProfile || {};
  const cf = state.caseFormulation || {};
  return {
    traits: idSet(state.traits),
    values: idSet(state.values),
    patterns: idSet(state.patterns),
    archive: idSet(state.archive),
    pearls: idSet(state.pearls),
    insights: idSet(state.insights),
    topicCards: idSet(state.topicCards),
    udpTurningPoints: idSet(udp.development && udp.development.turningPoints),
    udpRelationships: idSet(udp.relationships),
    cfProblems: txtArr(cf.problems),
    cfMechanisms: txtArr(cf.mechanisms),
    cfStrengths: txtArr(cf.strengths),
    cfGoals: txtArr(cf.goals),
    cfGrowth: txtArr(cf.growth),
    udpIdentityKeywords: txtArr(udp.selfNarrative && udp.selfNarrative.identityKeywords)
  };
}

// 추출 직후 — before snapshot 와 비교 → 새 항목에 sourceArchiveId 박기 +
// archiveItem._derivedRefs 에 텍스트 ref 저장.
function _stampSourceArchiveId(before, archiveId, archiveItem) {
  if (!archiveId || !before) return;
  const stamp = (arr, beforeSet) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(x => {
      if (!x || !x.id) return;
      if (beforeSet.has(x.id)) return;
      // 이미 다른 source 박혀 있으면 덮어쓰지 않음 (magic/reflection 의 sourceChatArchiveId 등)
      if (!x.sourceArchiveId) x.sourceArchiveId = archiveId;
    });
  };
  stamp(state.traits, before.traits);
  stamp(state.values, before.values);
  stamp(state.patterns, before.patterns);
  stamp(state.archive, before.archive);
  stamp(state.pearls, before.pearls);
  stamp(state.insights, before.insights);
  stamp(state.topicCards, before.topicCards);
  const udp = state.userDeepProfile || {};
  stamp(udp.development && udp.development.turningPoints, before.udpTurningPoints);
  stamp(udp.relationships, before.udpRelationships);

  // 텍스트 array — archive item 에 ref 저장
  if (!archiveItem) return;
  if (!archiveItem._derivedRefs) archiveItem._derivedRefs = {};
  const refs = archiveItem._derivedRefs;
  const newOnly = (after, beforeArr) => after.filter(x => !beforeArr.includes(x));
  const cf = state.caseFormulation || {};
  const pushRefs = (key, after, beforeArr) => {
    const fresh = newOnly(Array.isArray(after) ? after : [], beforeArr);
    if (!fresh.length) return;
    refs[key] = (refs[key] || []).concat(fresh);
  };
  pushRefs('cfProblems', cf.problems, before.cfProblems);
  pushRefs('cfMechanisms', cf.mechanisms, before.cfMechanisms);
  pushRefs('cfStrengths', cf.strengths, before.cfStrengths);
  pushRefs('cfGoals', cf.goals, before.cfGoals);
  pushRefs('cfGrowth', cf.growth, before.cfGrowth);
  pushRefs('udpIdentityKeywords', udp.selfNarrative && udp.selfNarrative.identityKeywords, before.udpIdentityKeywords);
}

// archive 한 개 soft delete + cascade. derived 객체엔 _deleted/_deletedAt 박고,
// 텍스트 ref 는 caseFormulation/identityKeywords 에서 splice (text 동일하면).
// 반환 = { cascaded: { traits: n, values: n, ... } } 으로 토스트 표시용.
function _softDeleteArchiveCascade(archiveId) {
  const arch = (state.chatArchive || []).find(a => a && (a.id === archiveId || a.date === archiveId));
  if (!arch) return null;
  const _now = new Date().toISOString();
  arch._deleted = true;
  arch._deletedAt = _now;
  // V4 fix (사용자 보고 2026-05-26 ultrathink): cleanup 마커 동시 strip — 좀비 archive 방지.
  //   원인: 마커 잔존하면 30-force-analyze.js 의 cleanup batch filter (a => !a._deleted && a._pendingCleanup) 가 영구 거부 →
  //   매일 새벽 unprocessed=[] → submitChapterCleanupBatch([]) → requests.length===0 early return → lastChapterCleanupAt 만 stamp →
  //   사용자 모델 (trait/value/pattern) 분석 한 달 freeze.
  delete arch._pendingCleanup;
  delete arch._pendingExtract;
  delete arch._pendingCaseAnalysis;
  delete arch._batchSubmittedAt;

  const counts = { traits: 0, values: 0, patterns: 0, archive: 0, pearls: 0, insights: 0, topicCards: 0, udpTurningPoints: 0, udpRelationships: 0 };
  const cascadeArr = (arr, key) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(x => {
      if (!x || x._deleted) return;
      if (x.sourceArchiveId === archiveId || x.sourceChatArchiveId === archiveId) {
        x._deleted = true;
        x._deletedAt = _now;
        counts[key] += 1;
      }
    });
  };
  cascadeArr(state.traits, 'traits');
  cascadeArr(state.values, 'values');
  cascadeArr(state.patterns, 'patterns');
  cascadeArr(state.archive, 'archive');
  cascadeArr(state.pearls, 'pearls');
  cascadeArr(state.insights, 'insights');
  cascadeArr(state.topicCards, 'topicCards');
  const udp = state.userDeepProfile || {};
  cascadeArr(udp.development && udp.development.turningPoints, 'udpTurningPoints');
  cascadeArr(udp.relationships, 'udpRelationships');

  // 텍스트 ref — splice (hard remove). 사용자가 archive 영구 삭제 후 복원 X 이라 OK.
  // 단, restore 할 수 있게 archive._derivedRefsBackup 으로 보존.
  if (arch._derivedRefs) {
    const cf = state.caseFormulation || (state.caseFormulation = { version: 0, lastUpdated: null, problems: [], mechanisms: [], strengths: [], goals: [], growth: [], unverified: {} });
    const removeFromArr = (arr, items) => {
      if (!Array.isArray(arr) || !Array.isArray(items)) return 0;
      let removed = 0;
      items.forEach(t => {
        const idx = arr.indexOf(t);
        if (idx >= 0) { arr.splice(idx, 1); removed += 1; }
      });
      return removed;
    };
    const r = arch._derivedRefs;
    let textRemoved = 0;
    textRemoved += removeFromArr(cf.problems, r.cfProblems);
    textRemoved += removeFromArr(cf.mechanisms, r.cfMechanisms);
    textRemoved += removeFromArr(cf.strengths, r.cfStrengths);
    textRemoved += removeFromArr(cf.goals, r.cfGoals);
    textRemoved += removeFromArr(cf.growth, r.cfGrowth);
    // unverified 도 같이 제거 (혹시 등록되어 있으면)
    if (cf.unverified && typeof cf.unverified === 'object') {
      ['problems', 'mechanisms', 'strengths', 'goals', 'growth'].forEach(b => {
        textRemoved += removeFromArr(cf.unverified[b], (r['cf' + b.charAt(0).toUpperCase() + b.slice(1)]) || []);
      });
    }
    if (udp.selfNarrative) {
      textRemoved += removeFromArr(udp.selfNarrative.identityKeywords, r.udpIdentityKeywords);
    }
    counts.cfText = textRemoved;
  }
  return counts;
}

// archive 복원 — _deleted 마커 제거. derived 객체는 sourceArchiveId 매칭으로
// 같이 복원. 단, cf/identityKeywords 는 splice 됐으니 _derivedRefs 보고 다시 push.
function _restoreArchiveCascade(archiveId) {
  const arch = (state.chatArchive || []).find(a => a && (a.id === archiveId || a.date === archiveId));
  if (!arch || !arch._deleted) return null;
  delete arch._deleted;
  delete arch._deletedAt;

  const counts = { traits: 0, values: 0, patterns: 0, archive: 0, pearls: 0, insights: 0, topicCards: 0, udpTurningPoints: 0, udpRelationships: 0 };
  const restoreArr = (arr, key) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(x => {
      if (!x || !x._deleted) return;
      if (x.sourceArchiveId === archiveId || x.sourceChatArchiveId === archiveId) {
        delete x._deleted;
        delete x._deletedAt;
        counts[key] += 1;
      }
    });
  };
  restoreArr(state.traits, 'traits');
  restoreArr(state.values, 'values');
  restoreArr(state.patterns, 'patterns');
  restoreArr(state.archive, 'archive');
  restoreArr(state.pearls, 'pearls');
  restoreArr(state.insights, 'insights');
  restoreArr(state.topicCards, 'topicCards');
  const udp = state.userDeepProfile || {};
  restoreArr(udp.development && udp.development.turningPoints, 'udpTurningPoints');
  restoreArr(udp.relationships, 'udpRelationships');

  // 텍스트 ref — 다시 push (중복 체크)
  if (arch._derivedRefs) {
    const cf = state.caseFormulation || (state.caseFormulation = { version: 0, lastUpdated: null, problems: [], mechanisms: [], strengths: [], goals: [], growth: [], unverified: {} });
    const pushIfMissing = (arr, items) => {
      if (!Array.isArray(arr) || !Array.isArray(items)) return;
      items.forEach(t => { if (!arr.includes(t)) arr.push(t); });
    };
    const r = arch._derivedRefs;
    pushIfMissing(cf.problems, r.cfProblems);
    pushIfMissing(cf.mechanisms, r.cfMechanisms);
    pushIfMissing(cf.strengths, r.cfStrengths);
    pushIfMissing(cf.goals, r.cfGoals);
    pushIfMissing(cf.growth, r.cfGrowth);
    if (udp.selfNarrative) {
      if (!Array.isArray(udp.selfNarrative.identityKeywords)) udp.selfNarrative.identityKeywords = [];
      pushIfMissing(udp.selfNarrative.identityKeywords, r.udpIdentityKeywords);
    }
  }
  return counts;
}

// 영구 삭제 (hard delete) — chatArchive + 그 archive 에 sourceArchiveId 박힌
// derived 객체들 array 에서 완전히 제거. 휴지통 비우기 / 영구 삭제 시 호출.
function _purgeArchive(archiveId) {
  const purgeArr = (arr) => {
    if (!Array.isArray(arr)) return 0;
    const before = arr.length;
    for (let i = arr.length - 1; i >= 0; i--) {
      const x = arr[i];
      if (x && (x.sourceArchiveId === archiveId || x.sourceChatArchiveId === archiveId)) {
        arr.splice(i, 1);
      }
    }
    return before - arr.length;
  };
  purgeArr(state.traits);
  purgeArr(state.values);
  purgeArr(state.patterns);
  purgeArr(state.archive);
  purgeArr(state.pearls);
  purgeArr(state.insights);
  purgeArr(state.topicCards);
  const udp = state.userDeepProfile || {};
  if (udp.development) purgeArr(udp.development.turningPoints);
  purgeArr(udp.relationships);
  // chatArchive 자체에서 제거
  if (Array.isArray(state.chatArchive)) {
    state.chatArchive = state.chatArchive.filter(a => !(a && (a.id === archiveId || a.date === archiveId)));
  }
  // V4 (사용자 명시 2026-05-20 ultrathink): chat_messages 별도 테이블 cascade — chapter_id 의 row hard delete.
  //   fire-and-forget. fail 해도 chatArchive 에서 archive 자체 사라지니 user-facing 영향 X. row leak 만 잔존.
  if (archiveId && typeof _deleteChapterMessages === 'function') {
    _deleteChapterMessages(archiveId).catch(e => console.warn('[_purgeArchive] chat_messages cascade fail:', e));
  }
}
