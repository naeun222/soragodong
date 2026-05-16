// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-16 ultrathink): 실행 탭 UI 전면 폐기. screen-execute / brain-dump / Now 3 / 서랍장 / Vault 핸들러 모두 제거.
//   옛 24-execute.js (746 lines) 의 render·핸들러 (renderExecute · openBrainDump · processBrainDump · addManualTask · rerollQuest · _renderTimetableStripHTML · toggle* 등) 삭제.
//   이 파일은 *도서관 캘린더 / 미션 / 채팅 / DNA 진주 / 스토리 등 다른 surface 가 share 하던 helper 만* 보존하는 thin core.
//
// 보존 함수 (외부 callsite 있음):
//   · _scheduleDateKey            — 25-archive-daily 4 파일 + 19-chat/10-process-analysis
//   · SHELL_POOLS                 — pickShellForTask / pickLegendaryShells / previewShellForTask 가 사용
//   · pickShellForTask            — 12-mission/09-complete-mission (미션 완료 셸 가챠)
//   · pickLegendaryShells         — 13-shell-collection/10-dna-pearl-story + seed
//   · previewShellForTask         — completeQuest 가 사용 (외부 직접 호출 X 지만 dead 아닌 internal)
//   · completeQuest               — 25-archive-daily/03-shell-story-task-time + 28-project-tracking/04-shortcut-quest-ritual
//   · totalShellPoints / shellCountByTier — 셸 통계 helper (도서관 모래사장 surface 가능성 — 보존)
//
// 추가:
//   · renderExecute()             — no-op stub. 외부 typeof-check 콜사이트 + 직접 호출자 모두 안전 (실행 탭 사라짐 → 그릴 컨테이너 X 라 어차피 no-op).

// 사용자 명시 2026-05-06 (정정): 실행탭 일정 = 자정 (00:00) cutoff. todayKey() 의 4AM cutoff X — 일반 자정 기준.
function _scheduleDateKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// === SHELL REWARD SYSTEM (V3.1) ===
// 사용자 요청 2026-04-27: 특별/탑티어 소라 아이콘 다양화 — DNA 조각 후보가 더 예쁘게
const SHELL_POOLS = {
  light:    { emojis: ['🐚','🐌','🪸','🌱','🍃','🌾','🪺'],                                  tier: 'light',   points: 1,  label: '가벼움' },
  daily:    { emojis: ['🌀','🐠','🪼','🐟','🪷','🫧','🐡','🐳'],                              tier: 'daily',   points: 2,  label: '일상' },
  main:     { emojis: ['🐢','🐬','🦀','🦭','🦦','🪻','🦩','🌷'],                              tier: 'main',    points: 5,  label: '메인' },
  golden:   { emojis: ['🦑','🐙','🦞','🐉','🦚','🌸','🌺','🪐'],                              tier: 'golden',  points: 10, label: '황금' },
  call:     { emojis: ['⭐','🌟','💫','🌙','🪄','💎','🌠','🔮','💠','🎐','🪬','🫧','🪻','🌹'],   tier: 'call',    points: 20, label: '부름' },
  legendary:{ emojis: ['✨','🌈','🎆','🎇','🪩','🦄','🌌','🦋','🌺','🦚','🌸','💖','🎀','🪷','🩵','🪐','🌷','🦢'], tier: 'legend',  points: 50, label: '특별' }
};

function pickShellForTask(task) {
  if (!task) return null;
  // 사용자 요청 2026-04-27: 특별 소라 어디서든 5% 등장 (오늘 카드/부름 모두)
  if (Math.random() < 0.05) {
    const pool = SHELL_POOLS.legendary;
    const emoji = pool.emojis[Math.floor(Math.random() * pool.emojis.length)];
    return { emoji, tier: pool.tier, points: pool.points, label: pool.label, rarity: 'legendary' };
  }
  if (task.source === 'ai_mission') {
    const pool = SHELL_POOLS.call;
    const emoji = pool.emojis[Math.floor(Math.random() * pool.emojis.length)];
    return { emoji, tier: pool.tier, points: pool.points, label: pool.label, rarity: 'rare' };
  }
  let pool;
  if (task.weight === 'main' && task.execMode === 'focus') pool = SHELL_POOLS.golden;
  else if (task.weight === 'main') pool = SHELL_POOLS.main;
  else if (task.weight === 'daily') pool = SHELL_POOLS.daily;
  else pool = SHELL_POOLS.light;
  const emoji = pool.emojis[Math.floor(Math.random() * pool.emojis.length)];
  const rarity = pool.tier === 'golden' ? 'rare' : 'common';
  return { emoji, tier: pool.tier, points: pool.points, label: pool.label, rarity };
}

// pearl_design_spec_2026-05-03 §2: 진주 안 소라 = legendary 풀에서 다 다른 종류 n개 random pick
function pickLegendaryShells(n) {
  const pool = (SHELL_POOLS && SHELL_POOLS.legendary && Array.isArray(SHELL_POOLS.legendary.emojis))
    ? [...SHELL_POOLS.legendary.emojis]
    : ['✨','🌈','💖','🌸','🪐','🦋'];
  const picked = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function previewShellForTask(task) {
  if (!task) return null;
  if (task.source === 'ai_mission') return SHELL_POOLS.call;
  if (task.weight === 'main' && task.execMode === 'focus') return SHELL_POOLS.golden;
  if (task.weight === 'main') return SHELL_POOLS.main;
  if (task.weight === 'daily') return SHELL_POOLS.daily;
  return SHELL_POOLS.light;
}

function totalShellPoints() {
  return (state.shellCollection || []).reduce((sum, s) => sum + (s.points || 1), 0);
}

function shellCountByTier() {
  const counts = {};
  (state.shellCollection || []).forEach(s => {
    const tier = s.tier || 'unknown';
    counts[tier] = (counts[tier] || 0) + 1;
  });
  return counts;
}

function completeQuest(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  // Snapshot for undo
  const _undoSnapshot = {
    status: task.status,
    completedAt: task.completedAt || null
  };
  task.status = 'done';
  task.completedAt = new Date().toISOString();

  // 사용자 명시 2026-05-08 ultrathink: 소라 보상 = '오늘의 카드' (now3 slot) 한정.
  if (task.slot !== 'now3' && task.source !== 'ai_mission') {
    saveState();
    if (typeof renderExecute === 'function') renderExecute();
    return;
  }

  // Generate shell reward
  const shell = pickShellForTask(task);
  let _undoShellId = null;
  if (shell) {
    const newShell = {
      type: shell.emoji,
      tier: shell.tier,
      points: shell.points,
      rarity: shell.rarity,
      label: shell.label,
      date: new Date().toISOString(),
      story: task.source === 'ai_mission'
        ? `소라의 부름 — "${task.title}"`
        : `"${task.title}"`,
      taskId: task.id,
      _id: 'shell_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    };
    _undoShellId = newShell._id;
    state.shellCollection.push(newShell);
    const shellIdx = state.shellCollection.length - 1;

    if (shell.rarity === 'legendary') {
      showCelebration('🌈', '특별한 부름이 왔어!', shell.emoji);
    } else if (shell.rarity === 'rare') {
      showCelebration('🐚', task.source === 'ai_mission' ? '소라의 부름 완료' : '황금 소라 획득!', shell.emoji);
    } else {
      // V3.7: 일반 tier만 undo 토스트
      showUndoToast(`${shell.emoji} 모았어`, () => {
        const t = state.tasks.find(x => x.id === taskId);
        if (t) { t.status = _undoSnapshot.status; t.completedAt = _undoSnapshot.completedAt; }
        if (_undoShellId) {
          state.shellCollection = state.shellCollection.filter(s => s._id !== _undoShellId);
        }
        saveState();
        if (typeof renderExecute === 'function') renderExecute();
        if (typeof renderShellBar === 'function') renderShellBar();
      });
    }

    // Async: AI가 경험 텍스트 생성 (not blocking)
    if (_canAI() && shell.tier !== 'light') {
      if (typeof generateShellStory === 'function') {
        generateShellStory(shellIdx, task).catch(e => console.warn('story gen failed:', e));
      }
    }
  }
  saveState();

  if (typeof renderExecute === 'function') renderExecute();
  // Check if all Now 3 done — promote drawer if available
  const todayKeyVal = todayKey();
  const remaining = state.tasks.filter(t => t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done').length;
  if (remaining === 0 && typeof promoteFromDrawer === 'function') {
    setTimeout(() => promoteFromDrawer(), 1000);
  }
}

// 실행 탭 UI 폐기 후 외부 typeof check / 직접 호출자 안전 보호 stub. 컨테이너 #executeContent 도 markup 에서 제거됐으니 호출 = no-op.
function renderExecute() {}
