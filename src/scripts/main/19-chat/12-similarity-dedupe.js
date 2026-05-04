function similarText(a, b) {
  if (!a || !b) return false;
  const n = s => s.toLowerCase().replace(/\s+/g, '');
  return n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a));
}

// === [나 탭 자동 정리] 완전 일치 문장만 strict 비교 ===
// similarText는 fuzzy(부분일치 포함). 사용자 명시 요구는 "전체 문장이 완전히 일치하면" 만.
// 대소문자/공백 normalize는 하되, 부분 일치는 안 잡음.
function exactSameText(a, b) {
  if (!a || !b) return false;
  const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

// 두 항목이 "내용상 완전히 같은 항목"인지 (이름 + 설명 모두 완전 일치)
function exactSameModelItem(a, b, fields) {
  return fields.every(f => exactSameText(a[f] || '', b[f] || ''));
}

// 배열에서 완전 일치 항목 제거 (먼저 들어온 것 보존, 나중에 들어온 중복 제거)
function dedupeExactArray(arr, fields) {
  if (!Array.isArray(arr)) return arr;
  const out = [];
  arr.forEach(item => {
    if (!item) return;
    const dup = out.find(existing => exactSameModelItem(existing, item, fields));
    if (dup) {
      // 중복인 경우: evidence_count 합산 + confidence 유지
      dup.evidence_count = (dup.evidence_count || 1) + (item.evidence_count || 1);
      if ((item.confidence || 0) > (dup.confidence || 0)) dup.confidence = item.confidence;
      if (item.user_verified) dup.user_verified = true;
    } else {
      out.push(item);
    }
  });
  return out;
}

// case_formulation의 problems/mechanisms/strengths는 단순 문자열 배열
function dedupeStringArray(arr) {
  if (!Array.isArray(arr)) return arr;
  const out = [];
  arr.forEach(s => {
    if (!s) return;
    if (!out.some(existing => exactSameText(existing, s))) out.push(s);
  });
  return out;
}

// 한 번에 모든 모델 데이터 정리
function dedupeAllModelExactDuplicates() {
  let changed = false;
  const beforeT = (state.traits || []).length;
  const beforeV = (state.values || []).length;
  const beforeP = (state.patterns || []).length;
  state.traits = dedupeExactArray(state.traits || [], ['name', 'description']);
  state.values = dedupeExactArray(state.values || [], ['name', 'description']);
  state.patterns = dedupeExactArray(state.patterns || [], ['name', 'description', 'trigger', 'sequence']);
  if (state.caseFormulation) {
    const cf = state.caseFormulation;
    const bP = (cf.problems || []).length;
    const bM = (cf.mechanisms || []).length;
    const bS = (cf.strengths || []).length;
    cf.problems = dedupeStringArray(cf.problems || []);
    cf.mechanisms = dedupeStringArray(cf.mechanisms || []);
    cf.strengths = dedupeStringArray(cf.strengths || []);
    if (bP !== cf.problems.length || bM !== cf.mechanisms.length || bS !== cf.strengths.length) changed = true;
  }
  if (beforeT !== state.traits.length || beforeV !== state.values.length || beforeP !== state.patterns.length) changed = true;
  if (changed) {
    console.log(`✦ 나 탭 정리: traits ${beforeT}→${state.traits.length}, values ${beforeV}→${state.values.length}, patterns ${beforeP}→${state.patterns.length}`);
  }
  return changed;
}

