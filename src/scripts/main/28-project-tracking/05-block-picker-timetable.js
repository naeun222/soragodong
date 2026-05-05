function openBlockPicker(block) {
  _currentPickerBlock = block;
  const labels = {
    morning: '🌅 오전 (~12시)',
    afternoon1: '☀️ 오후 1부 (12-15시)',
    afternoon2: '🌤 오후 2부 (15-18시)',
    evening: '🌆 저녁 (18-21시)',
    night: '🌙 밤 (21시~)'
  };
  document.getElementById('blockPickerTitle').textContent = labels[block] || block;
  renderBlockPickerContent();
  const overlay = document.getElementById('blockPickerOverlay');
  overlay.style.display = 'flex';
  // 사용자 명시 2026-05-01 (agent audit): ESC = 닫기.
  if (window._blockPickerEscDetach) window._blockPickerEscDetach();
  window._blockPickerEscDetach = _registerModalEsc(overlay, () => closeBlockPicker());
}

function closeBlockPicker() {
  _currentPickerBlock = null;
  document.getElementById('blockPickerOverlay').style.display = 'none';
  if (window._blockPickerEscDetach) { window._blockPickerEscDetach(); window._blockPickerEscDetach = null; }
}

function renderBlockPickerContent() {
  const container = document.getElementById('blockPickerContent');
  if (!container) return;
  
  const todayKeyVal = todayKey();
  // Available tasks: now3 + drawer + memoryVault items
  const now3OtherBlocks = (state.tasks || []).filter(t => 
    t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done' && t.assignedBlock !== _currentPickerBlock
  );
  const drawer = (state.tasks || []).filter(t => 
    t.slot === 'drawer' && t.status !== 'done'
  );
  const vault = (state.memoryVault || []).filter(v => !v.processed);
  
  let html = '';
  
  if (now3OtherBlocks.length > 0) {
    html += `<div class="vault-section">
      <div class="vault-section-label">🐚 오늘의 카드</div>`;
    now3OtherBlocks.forEach(t => {
      html += `
        <div class="vault-item">
          <div class="content">${escapeHtml(t.title)}</div>
          <button class="promote-btn" onclick="assignTaskToBlock('${t.id}')">→ 여기로</button>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (drawer.length > 0) {
    html += `<div class="vault-section">
      <div class="vault-section-label">📋 서랍장 — 카드</div>`;
    drawer.forEach(t => {
      html += `
        <div class="vault-item">
          <div class="content">${escapeHtml(t.title)}</div>
          <button class="promote-btn" onclick="promoteAndAssign('${t.id}')">→ 여기로</button>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (vault.length > 0) {
    html += `<div class="vault-section">
      <div class="vault-section-label">🐚 서랍장 — 대화에서 흘린 것</div>`;
    vault.forEach(v => {
      html += `
        <div class="vault-item">
          <div class="content">${escapeHtml(v.content)}</div>
          <button class="promote-btn" onclick="vaultPromoteAndAssign('${v.id}')">→ 여기로</button>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  if (now3OtherBlocks.length === 0 && drawer.length === 0 && vault.length === 0) {
    html = `<div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px; line-height:1.8;">
      <div style="font-size:32px; margin-bottom:12px;">🐚</div>
      넣을 게 없어.<br>
      "🧠 고동에게 맡기기"로 카드 발급받거나<br>
      대화에서 할 일 흘리면 여기 모여.
    </div>`;
  }
  
  container.innerHTML = html;
}

function assignTaskToBlock(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.assignedBlock = _currentPickerBlock;
  saveState();
  showToast('이동됨 ✦');
  closeBlockPicker();
  renderExecute();
}

function promoteAndAssign(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.slot = 'now3';
  task.status = 'active';
  task.date = todayKey();
  task.assignedBlock = _currentPickerBlock;
  saveState();
  showToast('오늘의 카드 + 시간 지정 ✦');
  closeBlockPicker();
  renderExecute();
}

function vaultPromoteAndAssign(itemId) {
  const item = state.memoryVault.find(v => v.id === itemId);
  if (!item) return;
  state.tasks.push({
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: item.content,
    status: 'active',
    slot: 'now3',
    date: todayKey(),
    weight: 'daily',
    energy: 'medium',
    priority: typeof item.priority === 'number' ? item.priority : nextPriority(),
    source: 'vault_promoted',
    assignedBlock: _currentPickerBlock,
    createdAt: new Date().toISOString()
  });
  item.processed = true;
  saveState();
  showToast('카드 추가됨 ✦');
  closeBlockPicker();
  renderExecute();
}

// === MOVE TO TIME BLOCK ===
async function moveToBlock(taskId) {
  const options = [
    { label: '🌅 오전 (~12시)', value: 'morning' },
    { label: '☀️ 오후 1부 (12-15시)', value: 'afternoon1' },
    { label: '🌤 오후 2부 (15-18시)', value: 'afternoon2' },
    { label: '🌆 저녁 (18-21시)', value: 'evening' },
    { label: '🌙 밤 (21시~)', value: 'night' },
    { label: '시간 미지정', value: '__none__' }
  ];
  const choice = await showOptionsModal({
    title: '어느 시간대?',
    options
  });
  if (!choice) return;
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.assignedBlock = choice === '__none__' ? null : choice;
  saveState();
  renderExecute();
  if (choice === '__none__') {
    showToast('시간 미지정');
  } else {
    const lbl = options.find(o => o.value === choice)?.label.split(' ')[0] || '';
    showToast(`${lbl}로 이동`);
  }
}

function getBlockLabel(block) {
  return ({
    morning: '🌅 오전',
    afternoon1: '☀️ 오후1',
    afternoon2: '🌤 오후2',
    evening: '🌆 저녁',
    night: '🌙 밤'
  })[block] || '';
}

function getCurrentBlock() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 15) return 'afternoon1';
  if (h < 18) return 'afternoon2';
  if (h < 21) return 'evening';
  return 'night';
}

// === TIMETABLE ===
function renderTimetableHTML() {
  const todayKeyVal = todayKey();
  const blocks = ['morning', 'afternoon1', 'afternoon2', 'evening', 'night'];
  const labels = {
    morning: '🌅 오전',
    afternoon1: '☀️ 오후 1부',
    afternoon2: '🌤 오후 2부',
    evening: '🌆 저녁',
    night: '🌙 밤'
  };
  const current = getCurrentBlock();

  let html = `<div class="exec-timetable">
    <div class="exec-timetable-title">📅 오늘의 큰 그림</div>
  `;
  blocks.forEach(b => {
    const tasksInBlock = (state.tasks || []).filter(t => 
      t.date === todayKeyVal && t.assignedBlock === b && t.slot === 'now3'
    );
    html += `
      <div class="exec-tt-block ${b === current ? 'current' : ''}" onclick="openBlockPicker('${b}')" style="cursor:pointer;">
        <div class="exec-tt-label">${labels[b]}</div>
        <div class="exec-tt-cards">
          ${tasksInBlock.length > 0 
            ? tasksInBlock.map(t => `
                <div class="exec-tt-card ${t.status === 'done' ? 'completed' : ''}" onclick="event.stopPropagation(); toggleQuestComplete('${t.id}')">
                  ${escapeHtml(t.title.slice(0, 30))}
                </div>
              `).join('')
            : '<div class="exec-tt-empty">+ 여기 작업 넣기</div>'
          }
        </div>
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

// === LIQUID FLOW (auto-cascade incomplete tasks) ===
function liquidFlow() {
  const todayKeyVal = todayKey();
  const blocks = ['morning', 'afternoon1', 'afternoon2', 'evening', 'night'];
  const current = getCurrentBlock();
  const currentIdx = blocks.indexOf(current);

  (state.tasks || []).forEach(t => {
    if (t.date !== todayKeyVal) return;
    if (t.status === 'done') return;
    if (!t.assignedBlock) return;
    const taskIdx = blocks.indexOf(t.assignedBlock);
    // If task's block is in the past and not done, cascade to current
    if (taskIdx >= 0 && taskIdx < currentIdx) {
      t.assignedBlock = current;
    }
  });
}
