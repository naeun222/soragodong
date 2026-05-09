
// 사용자 명시 2026-05-03: VAULT modal 의 dead code 일괄 제거 (메인 section drawer-row list 와 중복).
// 옛 함수 (openVault / closeVault / renderVault / todoComplete / todoDelete / todoToToday) 제거.
// memoryVault state / push 는 보존 (chat 의 vaultProposals / promoteFromVault / nextPriority / todoDrag* = 별도 cleanup task 자리).
// V3.9: 드래그 & 드롭 재정렬
let _todoDragId = null;
let _todoDragKind = null;

function todoDragStart(e) {
  const item = e.currentTarget;
  _todoDragId = item.dataset.id;
  _todoDragKind = item.dataset.kind;
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Firefox 호환
  try { e.dataTransfer.setData('text/plain', _todoDragId); } catch(_) {}
}

function todoDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target.dataset.id === _todoDragId) return;
  // 위/아래 placeholder 표시
  const rect = target.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  document.querySelectorAll('.todo-item').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
  target.classList.add(above ? 'drop-above' : 'drop-below');
}

function todoDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (!_todoDragId || target.dataset.id === _todoDragId) {
    todoDragEnd(e);
    return;
  }
  
  // 드래그된 항목과 타깃 항목 찾기
  const findItem = (kind, id) => {
    if (kind === 'task') return state.tasks.find(t => t.id === id);
    if (kind === 'vault') return state.memoryVault.find(v => v.id === id);
    return null;
  };
  
  const dragItem = findItem(_todoDragKind, _todoDragId);
  const targetItem = findItem(target.dataset.kind, target.dataset.id);
  if (!dragItem || !targetItem) {
    todoDragEnd(e);
    return;
  }
  
  // 위치 계산: above면 targetItem.priority - 0.5, below면 +0.5
  const rect = target.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  const newPriority = above 
    ? (targetItem.priority || 0) - 0.5 
    : (targetItem.priority || 0) + 0.5;
  dragItem.priority = newPriority;
  
  // 모든 priority 정수화 (재정렬 후 0,1,2,...)
  const all = [];
  (state.tasks || []).filter(t => t.status !== 'done').forEach(t => all.push({ kind: 'task', item: t }));
  (state.memoryVault || []).filter(v => !v.processed).forEach(v => all.push({ kind: 'vault', item: v }));
  all.sort((a, b) => (a.item.priority || 0) - (b.item.priority || 0));
  all.forEach((entry, idx) => { entry.item.priority = idx; });
  
  saveState();
  todoDragEnd(e);
  renderVault();
}

function todoDragEnd(e) {
  document.querySelectorAll('.todo-item').forEach(el => {
    el.classList.remove('dragging', 'drop-above', 'drop-below');
  });
  _todoDragId = null;
  _todoDragKind = null;
}

// V3.9: priority 자동 부여 헬퍼
// 모든 task/vault 생성 지점에서 사용 → 일관된 정렬
function nextPriority() {
  const all = [
    ...(state.tasks || []).map(x => x.priority),
    ...(state.memoryVault || []).map(x => x.priority)
  ].filter(p => typeof p === 'number');
  return all.length === 0 ? 0 : Math.max(...all) + 1;
}

function promoteFromVault(itemId) {
  const item = state.memoryVault.find(v => v.id === itemId);
  if (!item) return;
  const todayKeyVal = todayKey();
  const now3Count = (state.tasks || []).filter(t => t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done').length;
  
  state.tasks.push({
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: item.content,
    status: now3Count < 3 ? 'active' : 'drawer',
    slot: now3Count < 3 ? 'now3' : 'drawer',
    date: todayKeyVal,
    weight: 'daily',
    energy: 'medium',
    priority: typeof item.priority === 'number' ? item.priority : nextPriority(),
    source: 'vault_promoted',
    createdAt: new Date().toISOString()
  });
  item.processed = true;
  saveState();
  renderVault();
  renderExecute();
  showToast(now3Count < 3 ? '오늘의 카드에 추가됨' : '서랍장으로');
}

function promoteTaskToNow3(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const todayKeyVal = todayKey();
  const now3Count = (state.tasks || []).filter(t => t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done').length;
  if (now3Count >= 3) {
    showToast('오늘의 카드가 꽉 찼어. 하나 끝내거나 리롤 해.');
    return;
  }
  task.slot = 'now3';
  task.status = 'active';
  task.date = todayKeyVal;
  saveState();
  renderVault();
  renderExecute();
  showToast('오늘의 카드에 추가됨');
}

async function deleteVaultItem(itemId) {
  if (!await confirmDelete('이 항목')) return;
  state.memoryVault = state.memoryVault.filter(v => v.id !== itemId);
  saveState();
  renderVault();
  renderExecute();
}

// V3.13.x: 서랍장 → 오늘 할 일 목록으로 (체크박스 작은 항목)
// 사용자 보고 2026-05-09 ultrathink: 옛 date drawer task (며칠 전 brain_dump) 를 promote 시
// '오늘 할 일' 필터 (date===todayKey 요구) 와 '서랍장' 필터 (!isToday 요구) 둘 다에서 빠져 사라지는 버그.
// fix: promote = "오늘로 가져온다" 의미 → date 도 today 로 갱신.
function promoteToToday(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  task.isToday = true;
  task.date = todayKey();
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast('📋 오늘 할 일로');
}
// V3.13.x: 오늘 할 일 → 서랍장으로 되돌리기
function demoteFromToday(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  task.isToday = false;
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast('📂 서랍장으로');
}

// V3.13.x: 서랍장 중복 합치기 — 내용상 완전 같은 task 그룹화 후 가장 오래된 것만 keep
async function mergeDuplicateTasks() {
  const drawerTasks = (state.tasks || []).filter(t => t.slot === 'drawer' && t.status !== 'done');
  if (drawerTasks.length < 2) { showToast('합칠 항목이 없어'); return; }
  // 그룹화: title이 exactSameText로 같은 것
  const groups = [];
  drawerTasks.forEach(task => {
    const found = groups.find(g => exactSameText(g[0].title || '', task.title || ''));
    if (found) found.push(task);
    else groups.push([task]);
  });
  const dupGroups = groups.filter(g => g.length > 1);
  const dupCount = dupGroups.reduce((sum, g) => sum + g.length - 1, 0);
  if (dupCount === 0) {
    // 합칠 거 없으면 그대로 두고 짧은 토스트만
    if (typeof renderExecute === 'function') renderExecute();
    showToast('✦ 깔끔한 상태야');
    return;
  }
  const yes = await showConfirmModal({
    title: '중복 합치기',
    message: `완전히 같은 카드 ${dupCount}개를 합칠게.\n각 그룹에서 가장 오래된 카드만 남기고 나머지 제거.\n되돌릴 수 없어.`,
    okLabel: '합치기',
    cancelLabel: '취소'
  });
  if (!yes) return;
  const removeIds = new Set();
  dupGroups.forEach(g => {
    g.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    g.slice(1).forEach(t => removeIds.add(t.id));
  });
  state.tasks = state.tasks.filter(t => !removeIds.has(t.id));
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast(`✦ ${dupCount}개 합쳐짐`);
}

// V3.13.x: 카드 제목/설명 수정
async function editTaskCard(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  const newTitle = await showInputModal({
    title: '카드 수정',
    message: '제목 바꾸기',
    placeholder: '카드 제목',
    defaultValue: task.title || '',
    okLabel: '저장'
  });
  if (newTitle === null) return;
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  task.title = trimmed;
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast('카드 수정됨 ✦');
}

async function deleteTask(taskId) {
  if (!await confirmDelete('이 카드')) return;
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  saveState();
  renderVault();
  renderExecute();
}

// === NIGHT SHUTDOWN — 미완료 자동 처리 ===
function nightShutdown() {
  // Called when user opens app at night and has incomplete tasks
  const todayKeyVal = todayKey();
  const incomplete = (state.tasks || []).filter(t => 
    t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done'
  );
  
  if (incomplete.length === 0) return;
  
  // Move to drawer for tomorrow (gentle, no shame)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().split('T')[0];
  
  incomplete.forEach(t => {
    t.date = tomorrowKey;
    t.slot = 'drawer';
    t.status = 'rolled_over';
    t.rolledOverAt = new Date().toISOString();
  });
  saveState();
}

function showArchiveReviews() {
  showScreen('archive-reviews');
  renderArchiveReviews();
}
