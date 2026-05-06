// ═══════════════════════════════════════════════════════════════
// V3 EXECUTE TAB — Brain Dump → Now 3 → Vault → Timetable
// ═══════════════════════════════════════════════════════════════

let _execMode = 'balance';

// V4 (사용자 명시 2026-05-04 ultrathink): 실행 탭 redesign 상태
let _timetableExpanded = false;          // 화면 위 strip 탭으로 전체 타임테이블 펼침 (세션 한정)
let _expandedExecCards = new Set();      // Now 3 카드 펼침 상태 (세션 한정)

// 화면 위 compact 타임테이블 strip — 현재 시각 + 다음 일정 1개 + 토글 화살표
function _renderTimetableStripHTML() {
  const items = (state.todaySchedule || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  // 사용자 명시 2026-05-06: 새벽 4시 cutoff 후 어제 일정 사라지던 동작 폐기 — 사용자 직접 삭제 시까지 보임.
  const todayItems = items;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowLabel = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  // 다음 일정 — 지금 이후 시작하는 항목
  const upcoming = todayItems.find(it => {
    const sParts = (it.start || '').split(':');
    const sMin = (parseInt(sParts[0]) || 0) * 60 + (parseInt(sParts[1]) || 0);
    return sMin >= nowMin;
  });

  let nextLabel;
  if (upcoming) {
    const sParts = (upcoming.start || '').split(':');
    const sMin = (parseInt(sParts[0]) || 0) * 60 + (parseInt(sParts[1]) || 0);
    const remainMin = sMin - nowMin;
    let remainStr;
    if (remainMin < 60) remainStr = `${remainMin}분 남음`;
    else remainStr = `${Math.floor(remainMin / 60)}h ${remainMin % 60}m 남음`;
    nextLabel = `→ ${upcoming.start} ${escapeHtml(upcoming.title)} (${remainStr})`;
  } else if (todayItems.length === 0) {
    nextLabel = '— 오늘 일정 비어있어';
  } else {
    nextLabel = '— 오늘 일정 다 끝남';
  }

  return `
    <div class="exec-tt-strip" onclick="toggleTimetableSection()" title="탭하면 전체 타임테이블 펼침">
      <span class="exec-tt-strip-now">⏰ ${nowLabel}</span>
      <span class="exec-tt-strip-next">${nextLabel}</span>
      <span class="exec-tt-strip-toggle">${_timetableExpanded ? '▾ 접기' : '▸ 펼치기'}</span>
    </div>
  `;
}

function toggleTimetableSection() {
  _timetableExpanded = !_timetableExpanded;
  if (typeof renderExecute === 'function') renderExecute();
}

function toggleExecCardExpand(taskId) {
  if (_expandedExecCards.has(taskId)) _expandedExecCards.delete(taskId);
  else _expandedExecCards.add(taskId);
  if (typeof renderExecute === 'function') renderExecute();
}

function toggleDrawerSection() {
  state.preferences = state.preferences || {};
  state.preferences._drawerSectionExpanded = !state.preferences._drawerSectionExpanded;
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
}

function renderExecute() {
  const container = document.getElementById('executeContent');
  if (!container) return;

  // Liquid flow check first — auto-cascade incomplete blocks
  liquidFlow();

  const todayKeyVal = todayKey();
  const todayTasks = (state.tasks || []).filter(t => t.date === todayKeyVal);
  const now3 = todayTasks.filter(t => t.slot === 'now3' && t.status !== 'done');
  const completed = todayTasks.filter(t => t.status === 'done');
  // V4-fix v3 (사용자 보고): 서랍장 카운트 — 빈 title 제외, renderVault와 동일 기준
  const drawerCount = (state.tasks || []).filter(t =>
    (t.status === 'drawer' || (t.date === todayKeyVal && t.slot === 'drawer')) && (t.title || '').trim()
  ).length;
  const vaultCount = (state.memoryVault || []).filter(v =>
    !v.processed && ((v.content || v.title || '').trim())
  ).length;

  let html = `
    <div class="screen-title">실행 🚀</div>
    <div class="screen-sub">머릿속 짐 → 오늘의 카드 → 차근히.</div>
  `;

  // V4 (사용자 명시 2026-05-04 ultrathink): 타임테이블 strip 을 화면 위로.
  // strip 한 줄 (현재 시각 + 다음 일정) + 탭 시 전체 타임테이블 inline 펼침.
  html += _renderTimetableStripHTML();
  if (_timetableExpanded) {
    html += renderV4TimetableHTML();
    if (!window._v4ttScrolledOnce) {
      window._v4ttScrolledOnce = true;
      setTimeout(() => {
        const nowLine = document.querySelector('.v4-tt-now-line');
        if (nowLine && nowLine.scrollIntoView) {
          try { nowLine.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        }
      }, 250);
    }
  }

  html += `
    <button class="exec-immerse-btn" onclick="openImmerseStart()">
      🌧 시작
      <div class="sub">빗소리·방해금지·집중 모드 ON</div>
    </button>
  `;

  // 사용자 명시 2026-05-02 ultrathink: empty 상태 큰 brain-dump button 폐기 — 모든 섹션 항상 노출 (오늘 할 일 / 서랍장 / 일정).
  // 뇌 풀기 = bottom actions-row chip 으로 통합 (default 진입 시 한눈에 layout 파악 — agency 우선).
  // empty 상태 hint = 각 섹션 inline 으로 ("비어있어 — + 추가" 등).
  {
    // Now 3 section (있을 때만 — 빈 hint X)
    if (now3.length > 0) {
      html += `
        <div class="exec-now-section">
          <div class="exec-section-label">✦ 오늘의 카드 · ${now3.length}장</div>
      `;
      now3.forEach(task => {
        const isAIMission = task.source === 'ai_mission';
        const energyLabel = task.energy === 'low' ? '가벼움' : task.energy === 'high' ? '무거움' : '보통';
        const tag = isAIMission ? '🐚 소라의 부름' : task.weight === 'main' ? (task.execMode === 'focus' ? '🔥 무거운 메인' : '⚡ 메인') : task.weight === 'light' ? '🍃 가벼움' : '📌 일상';
        const preview = previewShellForTask(task);
        const previewEmoji = preview ? preview.emojis[0] : '🐚';
        const rarityClass = preview?.tier === 'golden' ? 'shell-golden' : preview?.tier === 'call' ? 'shell-call' : preview?.tier === 'main' ? 'shell-main' : '';
        // V4 (사용자 명시 2026-05-04 ultrathink): Now 3 카드 slim 보기 — 기본 = shell+타이틀+[시작][✓]. 탭하면 description/메타/태그/삭제 펼침.
        const isExpanded = _expandedExecCards.has(task.id);
        const elapsedStr = getTaskElapsedTime(task.id);
        html += `
          <div class="exec-card" data-task-id="${task.id}">
            <div class="exec-card-row" onclick="toggleExecCardExpand('${task.id}')" title="탭하면 자세히 보기">
              <span class="exec-card-shell-preview-inline ${rarityClass}" title="이거 깨면 ${preview?.label || ''} 소라">${previewEmoji}</span>
              <span class="exec-card-row-title">${escapeHtml(task.title)}</span>
              <span class="exec-card-actions-mini" onclick="event.stopPropagation()">
                <button class="start-mini" onclick="startQuest('${task.id}')">시작</button>
                <button onclick="toggleQuestComplete('${task.id}')">✓</button>
              </span>
            </div>
            ${isExpanded ? `
              <div class="exec-card-detail">
                <span class="exec-card-tag">${tag}</span>
                ${task.description ? `<div class="exec-card-detail-desc">${escapeHtml(task.description)}</div>` : ''}
                <div class="exec-card-meta">
                  <span>${energyLabel}</span>
                  ${task.assignedBlock ? `<span>📅 ${getBlockLabel(task.assignedBlock)}</span>` : ''}
                  ${elapsedStr ? `<span>⏱ ${elapsedStr}</span>` : ''}
                </div>
                <div class="exec-card-actions">
                  ${!isAIMission ? `<button onclick="deleteTask('${task.id}')">✕ 삭제</button>` : ''}
                </div>
              </div>
            ` : ''}
          </div>
        `;
      });
      html += `</div>`;
    }

    // V3.13.x: 오늘 할 일 목록 (now3 밑) — drawer 중 isToday=true. 체크박스 + 수정 + 삭제만
    const todayList = (state.tasks || [])
      .filter(t => t.slot === 'drawer' && t.isToday && t.status !== 'done')
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    // V4-fix: 오늘 할 일 헤더에 + 추가 버튼 (todayList 없어도 보이게)
    html += `<div class="exec-now-section">
      <div class="exec-section-label" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <span>📋 오늘 할 일${todayList.length > 0 ? ` · ${todayList.length}개` : ''}</span>
        <button onclick="addTodayTask()" style="font-size:11px; padding:4px 10px; background:var(--surface2); border:1px solid var(--border); color:var(--accent2); border-radius:8px; cursor:pointer; font-family:inherit; font-weight:500;">+ 추가</button>
      </div>`;
    if (todayList.length === 0) {
      html += `<div style="font-size:11px; color:var(--text-soft); padding:8px 4px 6px;">비어있어. + 추가로 시작.</div></div>`;
    } else {
      html += `<div class="todo-list">`;
      todayList.forEach(task => {
        const schedLabel = task.scheduledStart ? `<span class="todo-sched-label">⏰ ${task.scheduledStart}${task.scheduledEnd ? `–${task.scheduledEnd}` : ''}</span>` : '';
        html += `
          <div class="todo-item" data-task-id="${task.id}">
            <button class="todo-check" onclick="toggleQuestComplete('${task.id}')" aria-label="완료"></button>
            <span class="todo-title">${escapeHtml(task.title)}${schedLabel}</span>
            <button class="todo-action" onclick="scheduleTaskToTime('${task.id}')" title="일정 적용하기">⏰</button>
            <button class="todo-action" onclick="editTaskCard('${task.id}')" title="수정">✎</button>
            <button class="todo-action" onclick="demoteFromToday('${task.id}')" title="서랍장으로">↩</button>
            <button class="todo-action" onclick="deleteTask('${task.id}')" title="삭제">✕</button>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // V3.13.x: 서랍장 (시간순 + 중복 dedupe display). drawer 중 !isToday만
    const drawerRaw = (state.tasks || [])
      .filter(t => t.slot === 'drawer' && !t.isToday && t.status !== 'done')
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    // 중복 자동 dedupe (display only — title 기준)
    const seenTitles = new Set();
    const drawerTasks = drawerRaw.filter(t => {
      const key = (t.title || '').trim().toLowerCase();
      if (!key) return true;
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
    if (drawerTasks.length > 0) {
      const dupCount = drawerRaw.length - drawerTasks.length;
      // V4 (사용자 명시 2026-05-04 ultrathink): 서랍장 default 접힘 — 헤더만 보이고 탭하면 전체 목록 + sub-options 펼침.
      const drawerExpanded = !!(state.preferences && state.preferences._drawerSectionExpanded);
      if (!drawerExpanded) {
        html += `
          <div class="exec-drawer-header-collapsed" onclick="toggleDrawerSection()">
            <span>📂 서랍장 · ${drawerTasks.length}개${dupCount > 0 ? ` <span style="color:var(--text-soft); font-size:11px;">(중복 ${dupCount} 숨김)</span>` : ''}</span>
            <span class="toggle-arrow">▸ 펼치기</span>
          </div>
        `;
        // 서랍장 본문 skip — pop out of inner block
      } else {
      html += `
        <div class="exec-now-section">
          <div class="exec-section-label" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span style="flex:1; min-width:0; cursor:pointer;" onclick="toggleDrawerSection()" title="탭하면 접기">📂 서랍장 · ${drawerTasks.length}개${dupCount > 0 ? ` <span style="color:var(--text-soft); font-size:10px;">(중복 ${dupCount}개 숨김)</span>` : ''} <span style="color:var(--text-soft); font-size:11px;">▾</span></span>
            <button onclick="toggleDrawerView()" title="자동 분류 / 시간순 토글" style="font-size:11px; padding:4px 10px; background:var(--surface2); border:1px solid var(--border); color:var(--text-dim); border-radius:8px; cursor:pointer; font-family:inherit; flex-shrink:0; white-space:nowrap;">${_drawerView === 'auto' ? '🌅 자동' : '⏱ 시간순'}</button>
            <button onclick="mergeDuplicateTasks()" title="중복 합치기" style="font-size:12px; padding:5px 12px; background:var(--surface2); border:1px solid var(--border); color:var(--text); border-radius:8px; cursor:pointer; font-family:inherit; flex-shrink:0; white-space:nowrap; line-height:1.4; font-weight:500;">🔗 정리</button>
          </div>
      `;
      // V4-fix #4: 서랍장 한 줄 형태 (카드 X) — 정보 밀도 ↑, 시각 정리
      const renderDrawerRow = (task) => {
        const isAIMission = task.source === 'ai_mission';
        const tagEmoji = isAIMission ? '🐚' : task.weight === 'main' ? '⚡' : task.weight === 'light' ? '🍃' : '📌';
        return `
          <div class="drawer-row" data-task-id="${task.id}">
            <span class="drawer-row-tag">${tagEmoji}</span>
            <span class="drawer-row-title" onclick="editTaskCard('${task.id}')" title="탭해서 수정">${escapeHtml(task.title)}</span>
            <button class="drawer-row-action up" onclick="promoteToToday('${task.id}')" title="오늘로">↑</button>
            <button class="drawer-row-action del" onclick="deleteTask('${task.id}')" title="삭제">✕</button>
          </div>
        `;
      };
      if (_drawerView === 'auto') {
        const groups = { now: [], later: [], idea: [], big: [] };
        drawerTasks.forEach(t => { groups[classifyDrawerTask(t)].push(t); });
        const groupOrder = [
          { key: 'now',   label: '🌅 지금 가능' },
          { key: 'big',   label: '🎯 큰 것' },
          { key: 'later', label: '📅 나중' },
          { key: 'idea',  label: '💭 아이디어' }
        ];
        // 그룹 collapse default: now/big만 펼침, later/idea 접힘
        if (!state.preferences) state.preferences = {};
        if (!state.preferences._drawerGroupCollapsed) {
          state.preferences._drawerGroupCollapsed = { now: false, big: false, later: true, idea: true };
        }
        const collapsed = state.preferences._drawerGroupCollapsed;
        groupOrder.forEach(({ key, label }) => {
          const items = groups[key];
          if (!items.length) return;
          const isCollapsed = !!collapsed[key];
          // V4-fix: collapsed 그룹 헤더에 첫 항목 미리보기 (감 잡기)
          const preview = isCollapsed && items[0]
            ? `<span class="drawer-group-preview">${escapeHtml((items[0].title || '').slice(0, 24))}${items.length > 1 ? ` +${items.length - 1}` : ''}</span>`
            : '';
          html += `<div class="drawer-group group-${key}">
            <div class="drawer-group-header" onclick="toggleDrawerGroup('${key}')">
              <span>${isCollapsed ? '▸' : '▾'} ${label} · ${items.length}${preview ? '' : ''}</span>
              ${preview}
            </div>`;
          if (!isCollapsed) {
            html += `<div class="drawer-row-list">`;
            items.forEach(t => { html += renderDrawerRow(t); });
            html += `</div>`;
          }
          html += `</div>`;
        });
      } else {
        // 시간순 (한 줄 형태)
        html += `<div class="drawer-row-list">`;
        drawerTasks.forEach(task => { html += renderDrawerRow(task); });
        html += `</div>`;
      }
      html += `</div>`;
      }  // V4 redesign: drawerExpanded 분기 닫음
    }

    // Completed today
    if (completed.length > 0) {
      html += `
        <div class="exec-now-section">
          <div class="exec-section-label">✓ 오늘 클리어 · ${completed.length}장</div>
      `;
      completed.forEach(task => {
        const elapsed = getTaskElapsedTime(task.id);
        html += `
          <div class="exec-card completed" onclick="toggleQuestComplete('${task.id}')" style="cursor:pointer;" title="실수로 눌렀으면 다시 탭해서 되살릴 수 있어">
            <div class="exec-card-title">${escapeHtml(task.title)}</div>
            <div style="font-size:10px; color:var(--text-soft); margin-top:4px;">${elapsed ? `⏱ ${elapsed} · ` : ''}탭해서 되살리기 ↻</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    // 사용자 명시 2026-05-03: 서랍장 button 제거 — 메인 section 의 drawer-row list (line 31266+) 와 중복 (이미 있는 기능).
    html += `
      <div class="exec-actions-row">
        <button onclick="openBrainDump()">🧠 고동에게 맡기기</button>
        <button onclick="addManualTask()">➕ 직접 추가</button>
      </div>
    `;

    // V4 (사용자 명시 2026-05-04 ultrathink): 하단 타임테이블 제거 — 화면 위 strip 으로 이동.
    // V4-fix: V3 5블록 완전 삭제 (사용자 명시). dayPlan 데이터는 보존.
  }

  // 사용자 명시 2026-05-06 ultrathink: 추적 항목 (체중/수면/운동 그래프) '나' 탭에서 실행 탭으로 이동.
  // 행동 데이터라 실행 탭이 더 자연스러움 — '나' 탭은 정체성 모델 전용.
  html += `<div id="projectsSection"></div>`;
  container.innerHTML = html;
  if (typeof renderProjects === 'function') renderProjects();
}

// === BRAIN DUMP ===
let _brainDumpEscDetach = null;
function openBrainDump() {
  const overlay = document.getElementById('brainDumpOverlay');
  overlay.style.display = 'flex';
  // 사용자 명시 2026-05-01 (agent audit): ESC = 닫기.
  if (_brainDumpEscDetach) _brainDumpEscDetach();
  _brainDumpEscDetach = _registerModalEsc(overlay, () => closeBrainDump());
  // V4-fix (사용자 요청): 테스터 모드면 예시 자동 채움 (사용자 의도 표명 한 번 더 X)
  if (state.preferences && state.preferences.testerMode) {
    const ta = document.getElementById('brainDumpInput');
    if (ta && !ta.value.trim()) {
      ta.value = `교수님 메일 답장 — 다음 주까지
논문 서론 첫 단락 쓰기
실험 데이터 정리 (어제 받은 거)
샴푸 떨어졌어 사야 함
동생 생일 선물 — 주말 안에
운동 가야지 진짜 일주일째 미룸
세탁기 점검 신청
세금 신고 미뤄놓은 거
친구 결혼식 답장
연구실 청소 좀
SNS 줄여야 하는데
저녁 약속 답장 안 함
도서관 책 반납 (오늘 마지막 날)
약 처방 받기
휴대폰 데이터 확인
부모님께 안부 전화
아 맞다 영양제 떨어짐
학회 발표 슬라이드 시작
주간 회의 자료 정리
새 노트북 케이스 알아보기`;
    }
  }
  setTimeout(() => document.getElementById('brainDumpInput').focus(), 100);
  selectExecMode('balance');
}

function closeBrainDump() {
  document.getElementById('brainDumpOverlay').style.display = 'none';
  document.getElementById('brainDumpInput').value = '';
  if (_brainDumpEscDetach) { _brainDumpEscDetach(); _brainDumpEscDetach = null; }
}

function selectExecMode(mode) {
  _execMode = mode;
  document.getElementById('execModeFocus').classList.toggle('selected', mode === 'focus');
  document.getElementById('execModeBalance').classList.toggle('selected', mode === 'balance');
}

async function processBrainDump() {
  const input = document.getElementById('brainDumpInput');
  const dump = input.value.trim();
  if (!dump) { showToast('뭐든 좀 써볼래?'); return; }

  const submitBtn = document.getElementById('brainDumpSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = '고동이 정리 중... ✦';

  if (!_canAI()) {
    // Fallback: split by line, no AI
    const lines = dump.split('\n').filter(l => l.trim()).slice(0, 10);
    const todayKeyVal = todayKey();
    const basePriority = nextPriority();
    lines.forEach((line, i) => {
      state.tasks.push({
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: line.trim(),
        status: i < 3 ? 'active' : 'drawer',
        slot: i < 3 ? 'now3' : 'drawer',
        date: todayKeyVal,
        weight: i === 0 ? 'main' : (i === 1 ? 'light' : 'daily'),
        energy: 'medium',
        priority: basePriority + i,
        source: 'manual',
        createdAt: new Date().toISOString()
      });
    });
    saveState();
    closeBrainDump();
    submitBtn.disabled = false;
    submitBtn.textContent = '고동에게 맡기기 ✦';
    renderExecute();
    showToast('정리 완료. 카드 3장 발급됨 ✦');
    return;
  }

  try {
    const traits = (state.traits || []).slice(0, 5).map(t => t.name).join(', ');
    const patterns = (state.patterns || []).slice(0, 5).map(p => p.name).join(', ');
    const activeModes = Object.keys(state.modes || {}).filter(k => state.modes[k]).join(', ');

    const prompt = `너는 사용자의 AI 친구 "소라고동". 사용자가 머릿속에 떠다니는 할 일들을 와다다 풀어놨어. 이걸 정리해서 "Now 3" 카드 3장과 나머지 "서랍장(drawer)" 항목으로 분류해.

[사용자 정보]
특성: ${traits || '아직 모름'}
패턴: ${patterns || '아직 모름'}
활성 모드: ${activeModes || '없음'}
선택 모드: ${_execMode === 'focus' ? '🔥 몰입 모드 — 급하고 중요한 일 우선' : '🌿 여유 모드 — 가벼운 것도 섞어줘'}

[브레인 덤프]
${dump}

[Now 3 구성 규칙]
- 정확히 3장 (가능하면)
- 각 카드: title (15자 이내), description (선택, 1줄), weight, energy
- weight: 'main' (무거운 메인) / 'light' (5분컷 가벼움) / 'daily' (샴푸 사기 같은 일상)
- energy: 'high' (무거움) / 'medium' / 'low' (가벼움)

[몰입 모드일 때]
- 무거운 메인 위주 (main 2-3개)
- 마감/긴급한 거 최우선

[여유 모드일 때 — 황금비율]
- main 1개 (가장 중요)
- light 1개 (5분컷 쉬운 거)
- daily 1개 (샴푸 사기, 메일 답장 같은 일상)
- 도파민 충전용 가벼운 거 먼저 깰 수 있게

JSON 출력:
{
  "now3": [
    {"title": "세그포머 로직 1차 수정", "description": "지난번 디버깅 이어서", "weight": "main", "energy": "high"},
    {"title": "교수님 메일 답장", "description": null, "weight": "daily", "energy": "low"},
    {"title": "5분 산책", "description": "오후 2시쯤", "weight": "light", "energy": "low"}
  ],
  "drawer": [
    {"title": "샴푸 사기", "weight": "daily"},
    {"title": "방 청소", "weight": "daily"}
  ]
}

규칙:
- 사용자가 적은 거 그대로 쓰지 마. 살짝 다듬어. ("아 맞다 샴푸 사야 함" → "샴푸 사기")
- 추측 X. 사용자가 적은 항목만 사용.
- 비슷한 거 묶지 마. 별개 항목.
- JSON만 출력. 다른 설명 X.`;

    // 사용자 요청 2026-04-30: 뇌 풀기 = 분류·정리 task → sonnet 4.6.
    const resp = await callAnthropic({ _endpoint: 'brain_dump', model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] });
    if (!resp.ok) throw new Error('API ' + resp.status);
    const data = await resp.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 파싱 실패');
    const result = JSON.parse(jsonMatch[0]);

    const todayKeyVal = todayKey();
    const now = new Date().toISOString();
    
    // V3.9: priority 자동 할당
    // 기존 task의 max priority 기준으로 시작 (now3가 먼저, drawer가 나중)
    const existingPriorities = [...(state.tasks || []), ...(state.memoryVault || [])]
      .map(x => typeof x.priority === 'number' ? x.priority : 0);
    const basePriority = existingPriorities.length > 0 ? Math.max(...existingPriorities) + 1 : 0;
    let pIdx = 0;

    (result.now3 || []).slice(0, 3).forEach(card => {
      state.tasks.push({
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: card.title || '(제목 없음)',
        description: card.description || null,
        status: 'active',
        slot: 'now3',
        date: todayKeyVal,
        weight: card.weight || 'daily',
        energy: card.energy || 'medium',
        priority: basePriority + (pIdx++),
        source: 'brain_dump',
        execMode: _execMode,
        createdAt: now
      });
    });

    (result.drawer || []).forEach(card => {
      state.tasks.push({
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: card.title || '(제목 없음)',
        status: 'drawer',
        slot: 'drawer',
        date: todayKeyVal,
        weight: card.weight || 'daily',
        energy: 'medium',
        priority: basePriority + (pIdx++),
        source: 'brain_dump',
        createdAt: now
      });
    });

    saveState();
    closeBrainDump();
    submitBtn.disabled = false;
    submitBtn.textContent = '고동에게 맡기기 ✦';
    renderExecute();
    showToast(`카드 ${(result.now3 || []).length}장 발급됨 ✦`);
  } catch (e) {
    console.error(e);
    submitBtn.disabled = false;
    submitBtn.textContent = '고동에게 맡기기 ✦';
    showToast('오류: ' + e.message);
  }
}

// === ADD MANUAL TASK ===
async function addManualTask() {
  const title = await showInputModal({
    title: '할 일 추가 ✦',
    placeholder: '예: 카톡 답장',
    okLabel: '추가'
  });
  if (!title || !title.trim()) return;
  const todayKeyVal = todayKey();
  const now3Count = (state.tasks || []).filter(t => t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done').length;
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    status: now3Count < 3 ? 'active' : 'drawer',
    slot: now3Count < 3 ? 'now3' : 'drawer',
    date: todayKeyVal,
    weight: 'daily',
    energy: 'medium',
    priority: nextPriority(),
    source: 'manual',
    createdAt: new Date().toISOString()
  };
  state.tasks.push(newTask);
  saveState();
  renderExecute();
  
  // 시작 약속 만들고 시작할지 묻기
  if (now3Count < 3) {
    const start = await showConfirmModal({
      title: `"${title.trim()}" 추가됐어 ✦`,
      message: '바로 시작할래?\n(시작 약속 만들기)',
      okLabel: '시작',
      cancelLabel: '나중에'
    });
    if (start) {
      startQuest(newTask.id);
    } else {
      showToast('오늘의 카드에 추가됨');
    }
  } else {
    showToast('서랍장에 추가됨');
  }
}

// === REROLL ===
async function rerollQuest(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const todayKeyVal = todayKey();
  const drawer = (state.tasks || []).filter(t => 
    t.slot === 'drawer' && t.date === todayKeyVal && t.status !== 'done'
  );
  if (drawer.length === 0) {
    const yes = await showConfirmModal({
      title: '서랍장이 비어있어',
      message: '이 카드를 그냥 서랍장으로 보낼까?',
      okLabel: '보내',
      cancelLabel: '취소'
    });
    if (yes) {
      task.slot = 'drawer';
      saveState();
      renderExecute();
      showToast('서랍장으로 이동');
    }
    return;
  }
  // Pick one from drawer
  const replacement = drawer[0];
  task.slot = 'drawer';
  replacement.slot = 'now3';
  replacement.status = 'active';
  saveState();
  renderExecute();
  showToast('새 카드 뽑힘 ↻');
}

// === COMPLETE ===
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
  // Returns {emoji, tier, points, label, rarity}
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
  // Today's card — by weight
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
  // Show what shell tier this task will give (no random choice yet)
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
        // Undo: task 되돌리고 shell 제거
        const t = state.tasks.find(x => x.id === taskId);
        if (t) { t.status = _undoSnapshot.status; t.completedAt = _undoSnapshot.completedAt; }
        if (_undoShellId) {
          state.shellCollection = state.shellCollection.filter(s => s._id !== _undoShellId);
        }
        saveState();
        renderExecute();
        renderShellBar();
      });
    }
    
    // Async: AI가 경험 텍스트 생성 (not blocking)
    if (_canAI() &&shell.tier !== 'light') {
      generateShellStory(shellIdx, task).catch(e => console.warn('story gen failed:', e));
    }
  }
  saveState();

  renderExecute();
  // Check if all Now 3 done — promote drawer if available
  const todayKeyVal = todayKey();
  const remaining = state.tasks.filter(t => t.date === todayKeyVal && t.slot === 'now3' && t.status !== 'done').length;
  if (remaining === 0) {
    setTimeout(() => promoteFromDrawer(), 1000);
  }
}

// AI generates short experience text for shell
