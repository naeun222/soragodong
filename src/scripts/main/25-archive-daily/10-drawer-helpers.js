function toggleDrawerView() {
  _drawerView = _drawerView === 'auto' ? 'time' : 'auto';
  renderExecute();
}

// V4-fix #4: 서랍장 그룹 collapse 토글
function toggleDrawerGroup(key) {
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._drawerGroupCollapsed) {
    state.preferences._drawerGroupCollapsed = { now: false, big: false, later: true, idea: true };
  }
  const c = state.preferences._drawerGroupCollapsed;
  c[key] = !c[key];
  saveState();
  renderExecute();
}

// 단순 키워드 + heuristic 분류. 토글로 사용자 직접 변경 가능.
function classifyDrawerTask(task) {
  const text = ((task.title || '') + ' ' + (task.description || '')).toLowerCase();
  // 양생 가닥 후속 = 🎯 큰 것
  if (task.strategyId || task.weight === 'main') return 'big';
  // 조건 대기 키워드 = 📅 나중
  const laterKeywords = /(주말|다음|나중|친구|만나|카페|학교|병원|이번 주말|언젠가|올해|올가을)/;
  if (laterKeywords.test(text)) return 'later';
  // 아이디어 키워드 / 검토용 = 💭 아이디어
  const ideaKeywords = /(아이디어|생각|살펴|검토|찾아보|읽어|배워|언젠가는)/;
  if (ideaKeywords.test(text) && task.weight !== 'main') return 'idea';
  // default = 🌅 지금 가능
  return 'now';
}

// 사용자 명시 2026-05-27 ultrathink (re-iter): promoteFromDrawer 폐기 — now3 surface 폐기 후 무의미. 자동 trigger callsite (completeQuest setTimeout) 도 같이 제거.

// === IMMERSE START — V4 redesign (사용자 명시 2026-05-04 ultrathink): 진입장벽 제거 ===
// 옛: task 입력 modal → ritual 모달 (IF-THEN 4 step) → 발사
// 신: 버튼 누르면 즉시 단축어 trigger + start 기록 + active bar
