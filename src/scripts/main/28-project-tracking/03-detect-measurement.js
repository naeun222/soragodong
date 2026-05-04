// V3.12: 채팅 자연어 → 측정값 추출 (regex 기반 — AI 호출 절약)
// 사용자 메시지에 "체중 65kg" 같은 패턴 발견 + 활성 프로젝트 매칭 → 제안 카드
function detectProjectMeasurement(text) {
  const active = (state.projects || []).filter(p => p.status === 'active' && p.target !== undefined);
  if (active.length === 0) return null;
  // 숫자 + 단위 매칭
  const re = /(\d+(?:\.\d+)?)\s*(kg|km|분|회|시간|페이지|점|개|시)/g;
  let m;
  const matches = [];
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]);
    const unit = m[2];
    const matchedProject = active.find(p => p.unit && p.unit.includes(unit));
    if (matchedProject) {
      matches.push({ project: matchedProject, value, unit });
    }
  }
  return matches.length > 0 ? matches[0] : null;
}

