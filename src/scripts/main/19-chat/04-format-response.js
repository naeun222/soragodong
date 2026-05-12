function formatAIResponse(text) {
  let cleaned = text.replace(/```json[\s\S]*?```/g, '').trim();
  cleaned = cleaned.replace(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)[\s\S]*\}\s*$/g, '').trim();
  // V4 (v8 묶음 3): [상황] 섹션 출력 시 제거 — 결과 체크 모달용 메타데이터, 화면 노출 X
  cleaned = cleaned.replace(/\[상황\][\s\S]*?(?=\n*\[내가 본 것\]|\n*\[이게 뭐냐면\]|\n*\[이럴 땐 이렇게\]|\n*\[오늘의 제안\]|$)/g, '').trim();
  let formatted = escapeHtml(cleaned);
  // 사용자 요청 2026-04-30: 4단 라벨 디자인 — bracket 제거 + emoji + stage별 구분.
  // V4 (v8 사용자 명시 2026-05-03 ultrathink): 4단 분석 이모티콘 — 🎯 (관찰) / 🔍 (살펴봄) / 💡 (아이디어) / ⭐ (제안 → 소라의 부름 흐름 강조)
  const labelMap = [
    ['[내가 본 것]',     '🎯 내가 본 것',    'observation'],
    ['[이게 뭐냐면]',    '🔍 이게 뭐냐면',   'concept'],
    ['[이럴 땐 이렇게]', '💡 이럴 땐 이렇게', 'guide'],
    ['[오늘의 제안]',    '⭐ 오늘의 제안',   'proposal']
  ];
  labelMap.forEach(([raw, pretty, stage]) => {
    const regex = new RegExp(raw.replace(/[\[\]]/g, '\\$&'), 'g');
    formatted = formatted.replace(regex, `<span class="stage-label" data-stage="${stage}">${pretty}</span>`);
  });
  // V3.12.x: 인라인 마크다운 (**bold** / *italic*)
  formatted = formatted.replace(/\*\*([^\*\n]+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/(^|[^*])\*([^\*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  return formatted;
}

// 사용자 요청 2026-04-30: 메인 chat 일일 cap 헬퍼. 4시 cutoff 기준. cap=0 = 무제한.
function _checkDailyChatCap() {
  if (!state.preferences) state.preferences = {};
  // V4 (사용자 명시 2026-05-13): 어드민 overlay 활성 시 모든 cap X. 옛 '특혜 제거' 정책 폐기.
  if (typeof _isAdmin === 'function' && _isAdmin()) return { ok: true };
  const cap = state.preferences.dailyChatCap;
  if (cap === 0 || cap == null) return { ok: true };
  const todayK = todayKey();
  if (!state.dailyChatCount || state.dailyChatCount.date !== todayK) {
    state.dailyChatCount = { date: todayK, count: 0 };
  }
  return { ok: state.dailyChatCount.count < cap, current: state.dailyChatCount.count, cap };
}
function _incrementDailyChatCount() {
  const todayK = todayKey();
  if (!state.dailyChatCount || state.dailyChatCount.date !== todayK) {
    state.dailyChatCount = { date: todayK, count: 0 };
  }
  state.dailyChatCount.count += 1;
}

