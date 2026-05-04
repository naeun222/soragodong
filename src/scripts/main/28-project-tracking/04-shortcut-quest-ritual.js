function showShortcutGuide() {
  showScreen('shortcut-guide');
}

// === START QUEST — V4 redesign: ritual 모달 폐기 (V191 V4-1u 흐름 단순화) ===
// 옛 _ritualState / startRitualGame / renderRitualStep / setupRitualEnter / ritualChooseType /
//    ritualSkipToLaunch / ritualNextStep / ritualBackStep / ritualLaunch 모두 제거.
// 신: startQuest / openImmerseStart 가 _quickStart 직접 호출 → 즉시 단축어 trigger.
function startQuest(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  // V4 redesign (사용자 명시 2026-05-04 ultrathink): IF-THEN 모달 skip — 즉시 단축어 trigger.
  _quickStart({ taskId, taskTitle: task.title });
}


function closeRitual() {
  document.getElementById('ritualOverlay').style.display = 'none';
}

function showRitualActiveBar() {
  // Remove existing if any
  document.getElementById('ritualActiveBar')?.remove();
  
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) { return; }
  if (!active) return;
  
  const bar = document.createElement('div');
  bar.className = 'ritual-active-bar';
  bar.id = 'ritualActiveBar';
  // V4 redesign: taskTitle 없으면 "몰입 중" 만 (옛 "몰입 중: 몰입" 중복 제거)
  const titleText = active.taskTitle ? `몰입 중: ${escapeHtml(active.taskTitle)}` : '몰입 중';
  bar.innerHTML = `
    <span class="icon">🌧</span>
    <span class="text">${titleText}</span>
    <button class="check-btn" onclick="event.stopPropagation(); ritualReturn()">✓ 돌아옴</button>
  `;
  bar.onclick = () => ritualReturn();
  document.body.appendChild(bar);
}

function hideRitualActiveBar() {
  document.getElementById('ritualActiveBar')?.remove();
}

function ritualReturn() {
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) { return; }
  if (!active) { hideRitualActiveBar(); return; }
  
  // Show return check modal
  const stage = document.getElementById('ritualStage');
  if (!stage) return;
  
  document.getElementById('ritualOverlay').style.display = 'flex';
  
  const elapsed = Math.floor((Date.now() - active.launchedAt) / 60000);
  const elapsedLabel = elapsed < 1 ? '방금' : elapsed < 60 ? `${elapsed}분` : `${Math.floor(elapsed/60)}시간 ${elapsed%60}분`;
  
  stage.innerHTML = `
    <div class="ritual-step-label">— 돌아왔구나 —</div>
    <div class="ritual-icon">🐚</div>
    <div class="ritual-question">"${escapeHtml(active.taskTitle || '몰입')}"<br>어땠어?</div>
    <div class="ritual-sub">${elapsedLabel} 동안 갔다 왔네</div>
    <div class="ritual-actions">
      <button class="ritual-btn primary" onclick="ritualOutcome('done')">✓ 했어 (또는 진전 있었어)</button>
      <button class="ritual-btn secondary" onclick="ritualOutcome('partial')">조금만</button>
      <button class="ritual-btn secondary" onclick="ritualOutcome('off')">딴 거 했어 / 못 했어</button>
    </div>
  `;
}

function ritualOutcome(outcome) {
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) {}
  
  // Update start record
  if (active?.startId) {
    const startEntry = state.starts.find(s => s.id === active.startId);
    if (startEntry) {
      startEntry.returnedAt = new Date().toISOString();
      startEntry.outcome = outcome;
      saveState();
    }
  }
  
  // Clear active ritual
  try { localStorage.removeItem('soragodong_active_ritual'); } catch(e) {}
  hideRitualActiveBar();
  closeRitual();
  
  // Feedback based on outcome
  if (outcome === 'done') {
    if (active?.taskId) {
      // Offer to mark task complete
      setTimeout(() => {
        if (confirm('카드도 완료 처리할까?')) {
          completeQuest(active.taskId);
        }
      }, 300);
    } else {
      showToast('잘했어 ✦');
    }
  } else if (outcome === 'partial') {
    showToast('조금이라도 한 거, 충분해 🐚');
  } else {
    showToast('괜찮아. 시도한 것도 한 걸음이야 🐚');
  }
}

// Restore active ritual bar on app load
function restoreActiveRitualOnLoad() {
  let active;
  try {
    active = JSON.parse(localStorage.getItem('soragodong_active_ritual') || 'null');
  } catch(e) { return; }
  if (!active) return;
  // If older than 8 hours, expire silently
  if (Date.now() - active.launchedAt > 8 * 3600 * 1000) {
    try { localStorage.removeItem('soragodong_active_ritual'); } catch(e) {}
    return;
  }
  showRitualActiveBar();
}

// === BLOCK PICKER (timetable empty block click) ===
let _currentPickerBlock = null;

