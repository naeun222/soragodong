// ═══════════════════════════════════════════════════════════════
// V4 (사용자 명시 2026-05-27 ultrathink — re-iter): 일정 chip — '오늘의 카드' (now3 slot) 폐기. brain dump / 직접 추가 결과 모두 그냥 '오늘 할 일' (drawer slot + isToday=true) 로 통합.
//   변경 (이번 commit):
//     · renderExecute: 오늘의 카드 섹션 (✦ 큰 카드 + 셸 미리보기 + [시작][✓]) 제거.
//     · processBrainDump / addManualTask: 모든 신규 task → drawer + isToday=true. AI brain_dump 의 result.now3 + result.drawer 둘 다 합쳐서 같은 surface 로.
//     · completeQuest 셸 보상 게이트: `task.slot === 'now3' || task.source === 'ai_mission'` → `task.source === 'ai_mission'` 만. now3 자리 셸 보상 폐기 (사용자 명시: '지금 now3 셸 보상만 폐기' — AI 미션 보상은 유지).
//     · promoteFromDrawer setTimeout 자동 trigger 폐기 ('오늘의 카드 다 깼어 / 다음 3장 꺼낼까?' 모달).
//     · rerollQuest / toggleExecCardExpand / _expandedExecCards / previewShellForTask 폐기 — 옛 now3 카드 surface 전용.
//     · brain dump 모달 sub-text 에 'AI 호출 = 본인 plan 토큰 차감' 한 줄 추가 (사용자 명시: API 토큰 = 사용자 부담).
//   '🌧 시작' 버튼 제거 (사용자 명시 2026-05-27 — 백업: _emergency_backup/immerse-start-button-2026-05-27/). addManualTask 후 '바로 시작?' 확인 모달(→startQuest)은 별개 기능이라 유지.
//   shell helper (SHELL_POOLS / pickShellForTask / completeQuest 의 dedup + anti-recency + typeof guard) 유지.
// ═══════════════════════════════════════════════════════════════

let _execMode = 'balance';

// V4 (사용자 명시 2026-05-04 ultrathink): 실행 탭 redesign 상태
let _timetableExpanded = false;          // 타임테이블 strip 펼침 (세션 한정)

// 사용자 명시 2026-05-06 (정정): 실행탭 일정 = 자정 (00:00) cutoff. todayKey() 의 4AM cutoff X — 일반 자정 기준.
function _scheduleDateKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _renderTimetableStripHTML() {
  // 사용자 명시 2026-05-27 ultrathink (timeline ↔ 캘린더 sync): getTodaySchedulesDerivedView 사용 — state.schedules 오늘 + state.todaySchedule 합쳐서 양쪽 view 같은 데이터.
  const items = (typeof getTodaySchedulesDerivedView === 'function')
    ? getTodaySchedulesDerivedView()
    : (state.todaySchedule || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const todayK = _scheduleDateKey();
  const todayItems = items.filter(it => !it.date || it.date === todayK);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowLabel = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

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
  if (typeof liquidFlow === 'function') liquidFlow();

  const todayKeyVal = todayKey();

  // 사용자 보고 2026-05-09 ultrathink: 옛 promoteToToday (date 갱신 안 한 버그) 로 잃어버린 task 자동 복구.
  {
    let _resaved = false;
    (state.tasks || []).forEach(t => {
      if (t.slot === 'drawer' && t.isToday && t.date && t.date !== todayKeyVal && t.status !== 'done') {
        t.date = todayKeyVal;
        _resaved = true;
      }
    });
    // 사용자 명시 2026-05-27: dueDate 가 오늘인 서랍장 task → '오늘 할 일' 자동 승격 (하루 1회, _promotedFor 마킹).
    //   재승격 가드 — 승격 후 사용자가 서랍장으로 내리면 demoteFromToday 가 _promotedFor=오늘 박아서 그날은 다시 안 올라옴.
    (state.tasks || []).forEach(t => {
      if (t.slot === 'drawer' && !t.isToday && t.status !== 'done' &&
          t.dueDate === todayKeyVal && t._promotedFor !== todayKeyVal) {
        t.isToday = true;
        t.date = todayKeyVal;
        t._promotedFor = todayKeyVal;
        _resaved = true;
      }
    });
    if (_resaved) { try { saveState(); } catch {} }
  }

  const todayTasks = (state.tasks || []).filter(t => t.date === todayKeyVal);
  const completed = todayTasks.filter(t => t.status === 'done' && !t.isToday);

  let html = '';

  html += _renderTimetableStripHTML();
  if (_timetableExpanded && typeof renderV4TimetableHTML === 'function') {
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

  // 사용자 명시 2026-05-27: '🌧 시작' 버튼 제거 (백업: _emergency_backup/immerse-start-button-2026-05-27/).

  // 사용자 명시 2026-05-27 ultrathink (re-iter): '오늘의 카드' (now3 slot) 섹션 폐기. 옛 큰 카드 + 셸 미리보기 + [시작][✓] surface 모두 제거 — brain dump / 직접 추가 결과는 모두 아래 '오늘 할 일' 로 합류.

  // 오늘 할 일 (drawer 중 isToday=true) — 헤더에 + 추가 버튼
  const todayListAll = (state.tasks || [])
    .filter(t => t.slot === 'drawer' && t.isToday && t.date === todayKeyVal)
    // 사용자 명시 2026-05-27: 완료된 할 일은 항상 아래로. 그 안에서 수동 순서(todayOrder) 우선, 없으면 생성순.
    .sort((a, b) => {
      const ad = a.status === 'done' ? 1 : 0;
      const bd = b.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return ((a.todayOrder ?? Infinity) - (b.todayOrder ?? Infinity)) ||
             (new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    });
  const todayList = todayListAll.filter(t => t.status !== 'done');
  html += `<div class="exec-now-section">
    <div class="exec-section-label" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <span>📋 오늘 할 일${todayList.length > 0 ? ` · ${todayList.length}개` : ''}</span>
      <button onclick="addTodayTask()" style="font-size:11px; padding:4px 10px; background:var(--surface2); border:1px solid var(--border); color:var(--accent2); border-radius:8px; cursor:pointer; font-family:inherit; font-weight:500;">+ 추가</button>
    </div>`;
  if (todayListAll.length === 0) {
    html += `<div style="font-size:11px; color:var(--text-soft); padding:8px 4px 6px;">비어있어. + 추가로 시작.</div></div>`;
  } else {
    html += `<div class="todo-list" id="todayTodoList">`;
    todayListAll.forEach(task => {
      const isDone = task.status === 'done';
      const schedLabel = task.scheduledStart ? `<span class="todo-sched-label">⏰ ${task.scheduledStart}${task.scheduledEnd ? `–${task.scheduledEnd}` : ''}</span>` : '';
      // 사용자 명시 2026-05-27 ultrathink (3단계): task.dueDate 있으면 마감 라벨 표시.
      const dueLabel = task.dueDate ? `<span style="font-size:10px; color:#d8ac63; margin-left:6px; padding:1px 5px; background:#d8ac631f; border-radius:3px; white-space:nowrap;">📅 ${escapeHtml(task.dueDate)}${task.dueTime ? ' ' + escapeHtml(task.dueTime) : ''}</span>` : '';
      // 사용자 명시 2026-05-27: ⏰(일정 적용) 버튼 제거. demote 버튼 ↩ → ↓ (서랍장 ↑ 와 같은 css).
      // 사용자 명시 2026-05-27: 행 맨 왼쪽 ☰ 더보기 → 메뉴(수정/서랍장으로 내리기/삭제). 체크 동그라미는 맨 오른쪽.
      html += `
        <div class="todo-item${isDone ? ' completed' : ''}" data-task-id="${task.id}">
          <button class="todo-action todo-more" onclick="_todayTaskMenu('${task.id}')" title="더보기" aria-label="더보기">☰</button>
          <span class="todo-title">${escapeHtml(task.title)}${schedLabel}${dueLabel}</span>
          <button class="todo-check${isDone ? ' checked' : ''}" onclick="toggleQuestComplete('${task.id}')" aria-label="${isDone ? '되살리기' : '완료'}" title="${isDone ? '되살리기' : '완료'}">${isDone ? '✓' : ''}</button>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  // 서랍장 (drawer 중 !isToday)
  const drawerRaw = (state.tasks || [])
    .filter(t => t.slot === 'drawer' && !t.isToday && t.status !== 'done')
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
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
    const drawerExpanded = !!(state.preferences && state.preferences._drawerSectionExpanded);
    if (!drawerExpanded) {
      html += `
        <div class="exec-drawer-header-collapsed" onclick="toggleDrawerSection()">
          <span>📂 서랍장 · ${drawerTasks.length}개${dupCount > 0 ? ` <span style="color:var(--text-soft); font-size:11px;">(중복 ${dupCount} 숨김)</span>` : ''}</span>
          <span class="toggle-arrow">▸ 펼치기</span>
        </div>
      `;
    } else {
      html += `
        <div class="exec-now-section">
          <div class="exec-section-label" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span style="flex:1; min-width:0; cursor:pointer;" onclick="toggleDrawerSection()" title="탭하면 접기">📂 서랍장 · ${drawerTasks.length}개${dupCount > 0 ? ` <span style="color:var(--text-soft); font-size:10px;">(중복 ${dupCount}개 숨김)</span>` : ''} <span style="color:var(--text-soft); font-size:11px;">▾</span></span>
            <button onclick="toggleDrawerView()" title="자동 분류 / 시간순 토글" style="font-size:11px; padding:4px 10px; background:var(--surface2); border:1px solid var(--border); color:var(--text-dim); border-radius:8px; cursor:pointer; font-family:inherit; flex-shrink:0; white-space:nowrap;">${typeof _drawerView !== 'undefined' && _drawerView === 'auto' ? '🌅 자동' : '⏱ 시간순'}</button>
            <button onclick="mergeDuplicateTasks()" title="중복 합치기" style="font-size:12px; padding:5px 12px; background:var(--surface2); border:1px solid var(--border); color:var(--text); border-radius:8px; cursor:pointer; font-family:inherit; flex-shrink:0; white-space:nowrap; line-height:1.4; font-weight:500;">🔗 정리</button>
          </div>
      `;
      const renderDrawerRow = (task) => {
        const isAIMission = task.source === 'ai_mission';
        const tagEmoji = isAIMission ? '🐚' : task.weight === 'main' ? '⚡' : task.weight === 'light' ? '🍃' : '📌';
        // 사용자 명시 2026-05-27 ultrathink (3단계): drawer row 에도 dueDate 라벨.
        const dueLabel = task.dueDate ? `<span style="font-size:10px; color:#d8ac63; margin-left:4px; padding:1px 4px; background:#d8ac631f; border-radius:3px; white-space:nowrap;">📅 ${escapeHtml(task.dueDate)}${task.dueTime ? ' ' + escapeHtml(task.dueTime) : ''}</span>` : '';
        return `
          <div class="drawer-row" data-task-id="${task.id}">
            <span class="drawer-row-tag">${tagEmoji}</span>
            <span class="drawer-row-title" onclick="editTaskCard('${task.id}')" title="탭해서 수정">${escapeHtml(task.title)}${dueLabel}</span>
            <button class="drawer-row-action up" onclick="promoteToToday('${task.id}')" title="오늘로">↑</button>
            <button class="drawer-row-action del" onclick="deleteTask('${task.id}')" title="삭제">✕</button>
          </div>
        `;
      };
      if (typeof _drawerView !== 'undefined' && _drawerView === 'auto' && typeof classifyDrawerTask === 'function') {
        const groups = { now: [], later: [], idea: [], big: [] };
        drawerTasks.forEach(t => { groups[classifyDrawerTask(t)].push(t); });
        const groupOrder = [
          { key: 'now',   label: '🌅 지금 가능' },
          { key: 'big',   label: '🎯 큰 것' },
          { key: 'later', label: '📅 나중' },
          { key: 'idea',  label: '💭 아이디어' }
        ];
        if (!state.preferences) state.preferences = {};
        if (!state.preferences._drawerGroupCollapsed) {
          state.preferences._drawerGroupCollapsed = { now: false, big: false, later: true, idea: true };
        }
        const collapsed = state.preferences._drawerGroupCollapsed;
        groupOrder.forEach(({ key, label }) => {
          const items = groups[key];
          if (!items.length) return;
          const isCollapsed = !!collapsed[key];
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
        html += `<div class="drawer-row-list">`;
        drawerTasks.forEach(task => { html += renderDrawerRow(task); });
        html += `</div>`;
      }
      html += `</div>`;
    }
  }

  // Completed today
  if (completed.length > 0) {
    html += `
      <div class="exec-now-section">
        <div class="exec-section-label">✓ 오늘 클리어 · ${completed.length}장</div>
    `;
    completed.forEach(task => {
      const elapsed = (typeof getTaskElapsedTime === 'function') ? getTaskElapsedTime(task.id) : '';
      html += `
        <div class="exec-card completed" onclick="toggleQuestComplete('${task.id}')" style="cursor:pointer;" title="실수로 눌렀으면 다시 탭해서 되살릴 수 있어">
          <div class="exec-card-title">${escapeHtml(task.title)}</div>
          <div style="font-size:10px; color:var(--text-soft); margin-top:4px;">${elapsed ? `⏱ ${elapsed} · ` : ''}탭해서 되살리기 ↻</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  html += `
    <div class="exec-actions-row">
      <button onclick="openBrainDump()">🧠 고동에게 맡기기</button>
      <button onclick="addManualTask()">➕ 직접 추가</button>
    </div>
  `;

  // 사용자 명시 2026-05-27 ultrathink: 일정 lens 에서 트래커 (projectsSection / renderProjects) 제외.
  container.innerHTML = html;
  if (typeof _setupTodayReorder === 'function') _setupTodayReorder();
}

// === BRAIN DUMP ===
let _brainDumpEscDetach = null;
function openBrainDump() {
  const overlay = document.getElementById('brainDumpOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  if (_brainDumpEscDetach) _brainDumpEscDetach();
  if (typeof _registerModalEsc === 'function') {
    _brainDumpEscDetach = _registerModalEsc(overlay, () => closeBrainDump());
  }
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
  setTimeout(() => { const el = document.getElementById('brainDumpInput'); if (el) el.focus(); }, 100);
  selectExecMode('balance');
}

function closeBrainDump() {
  const overlay = document.getElementById('brainDumpOverlay');
  if (overlay) overlay.style.display = 'none';
  const input = document.getElementById('brainDumpInput');
  if (input) input.value = '';
  if (_brainDumpEscDetach) { _brainDumpEscDetach(); _brainDumpEscDetach = null; }
}

function selectExecMode(mode) {
  _execMode = mode;
  const f = document.getElementById('execModeFocus');
  const b = document.getElementById('execModeBalance');
  if (f) f.classList.toggle('selected', mode === 'focus');
  if (b) b.classList.toggle('selected', mode === 'balance');
}

async function processBrainDump() {
  const input = document.getElementById('brainDumpInput');
  const dump = (input && input.value || '').trim();
  if (!dump) { showToast('뭐든 좀 써볼래?'); return; }

  const submitBtn = document.getElementById('brainDumpSubmit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '고동이 정리 중... ✦'; }

  if (typeof _canAI !== 'function' || !_canAI()) {
    // Fallback: split by line, no AI. 모두 '오늘 할 일' (drawer + isToday=true) 로.
    const lines = dump.split('\n').filter(l => l.trim()).slice(0, 10);
    const todayKeyVal = todayKey();
    const basePriority = (typeof nextPriority === 'function') ? nextPriority() : 0;
    lines.forEach((line, i) => {
      state.tasks.push({
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: line.trim(),
        status: 'drawer',
        slot: 'drawer',
        isToday: true,
        date: todayKeyVal,
        weight: 'daily',
        energy: 'medium',
        priority: basePriority + i,
        source: 'manual',
        createdAt: new Date().toISOString()
      });
    });
    saveState();
    closeBrainDump();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '고동에게 맡기기 ✦'; }
    renderExecute();
    showToast(`정리 완료. 할 일 ${lines.length}개 추가됨 ✦`);
    return;
  }

  try {
    const traits = (state.traits || []).slice(0, 5).map(t => t.name).join(', ');
    const patterns = (state.patterns || []).slice(0, 5).map(p => p.name).join(', ');
    const activeModes = Object.keys(state.modes || {}).filter(k => state.modes[k]).join(', ');

    const resp = await callAnthropic({
      _endpoint: 'brain_dump',
      _vars: { traits, patterns, activeModes, execMode: _execMode, dump },
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: '' }]
    });
    if (!resp.ok) throw new Error('API ' + resp.status);
    const data = await resp.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 파싱 실패');
    const result = JSON.parse(jsonMatch[0]);

    const todayKeyVal = todayKey();
    const now = new Date().toISOString();

    const existingPriorities = [...(state.tasks || []), ...(state.memoryVault || [])]
      .map(x => typeof x.priority === 'number' ? x.priority : 0);
    const basePriority = existingPriorities.length > 0 ? Math.max(...existingPriorities) + 1 : 0;
    let pIdx = 0;

    // 사용자 명시 2026-05-27 ultrathink (re-iter): now3 / drawer 분기 폐기. AI 가 분류한 결과 두 배열 다 그냥 '오늘 할 일' (drawer + isToday=true) 로 합쳐 push.
    const merged = [...((result.now3 || [])), ...((result.drawer || []))];
    merged.forEach(card => {
      state.tasks.push({
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: card.title || '(제목 없음)',
        description: card.description || null,
        status: 'drawer',
        slot: 'drawer',
        isToday: true,
        date: todayKeyVal,
        weight: card.weight || 'daily',
        energy: card.energy || 'medium',
        priority: basePriority + (pIdx++),
        source: 'brain_dump',
        execMode: _execMode,
        createdAt: now
      });
    });

    saveState();
    closeBrainDump();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '고동에게 맡기기 ✦'; }
    renderExecute();
    showToast(`할 일 ${merged.length}개 추가됨 ✦`);
  } catch (e) {
    console.error(e);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '고동에게 맡기기 ✦'; }
    showToast('오류: ' + e.message);
  }
}

// === ADD MANUAL TASK ===
// 사용자 명시 2026-05-27: '직접 추가' 버튼 → 서랍장 (drawer, isToday=false) 으로 추가.
//   ('오늘 할 일' 직접 추가는 그 섹션 헤더의 '+ 추가' = addTodayTask.) '바로 시작?' 확인 모달 제거.
async function addManualTask() {
  const title = await showInputModal({
    title: '할 일 추가 ✦',
    placeholder: '',
    okLabel: '추가'
  });
  if (!title || !title.trim()) return;
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    status: 'drawer',
    slot: 'drawer',
    isToday: false,
    date: todayKey(),
    weight: 'daily',
    energy: 'medium',
    priority: (typeof nextPriority === 'function') ? nextPriority() : 0,
    source: 'manual',
    createdAt: new Date().toISOString()
  };
  state.tasks.push(newTask);
  saveState();
  renderExecute();
  showToast('서랍장에 추가됨 📂');
}

// === 오늘 할 일 long-press 드래그 순서변경 (사용자 명시 2026-05-27) ===
// 320ms 꾹 누르면 드래그 모드. 그 전에 5px 이상 움직이면 스크롤로 간주(드래그 취소). 완료 항목·버튼은 제외.
// 놓으면 새 DOM 순서를 todayOrder 에 저장 → 정렬 키.
let _todayDrag = null;

function _todayDragPointY(e) {
  if (e.touches && e.touches.length) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientY;
  return e.clientY;
}

function _setupTodayReorder() {
  const list = document.getElementById('todayTodoList');
  if (!list) return;
  list.querySelectorAll('.todo-item').forEach(el => {
    if (el.classList.contains('completed')) return;
    el.addEventListener('touchstart', _todayDragDown, { passive: true });
    el.addEventListener('mousedown', _todayDragDown);
  });
}

function _todayDragDown(e) {
  if (_todayDrag) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.target.closest('button')) return;  // 버튼 위 시작 → 버튼 동작 우선
  const el = e.currentTarget;
  const list = document.getElementById('todayTodoList');
  if (!list) return;
  _todayDrag = {
    el, list,
    taskId: el.dataset.taskId,
    isTouch: e.type === 'touchstart',
    startY: _todayDragPointY(e),
    active: false,
    moved: false,
    timer: null
  };
  _todayDrag.timer = setTimeout(() => {
    if (!_todayDrag) return;
    _todayDrag.active = true;
    // 활성화 순간 행 위치 측정 (드래그 중엔 원본 center 기준으로 슬롯 판정 — 형제는 transform 으로만 이동).
    const rowEls = [...list.querySelectorAll('.todo-item')];
    _todayDrag.rows = rowEls.map(rEl => {
      const r = rEl.getBoundingClientRect();
      return { el: rEl, center: r.top + r.height / 2 };
    });
    _todayDrag.fromIndex = rowEls.indexOf(el);
    _todayDrag.toIndex = _todayDrag.fromIndex;
    _todayDrag.slot = el.getBoundingClientRect().height + 6;  // 행 높이 + gap(6px)
    el.style.transition = 'none';  // 손가락 1:1 추종 (지연 X)
    el.classList.add('dragging');
    if (typeof _calHaptic === 'function') _calHaptic('impact');
  }, 320);
  if (_todayDrag.isTouch) {
    document.addEventListener('touchmove', _todayDragMove, { passive: false });
    document.addEventListener('touchend', _todayDragUp);
    document.addEventListener('touchcancel', _todayDragUp);
  } else {
    document.addEventListener('mousemove', _todayDragMove);
    document.addEventListener('mouseup', _todayDragUp);
  }
}

function _todayDragMove(e) {
  const d = _todayDrag;
  if (!d) return;
  const y = _todayDragPointY(e);
  if (!d.active) {
    if (Math.abs(y - d.startY) > 5) {  // 움직임 = 스크롤 → 드래그 취소
      d.moved = true;
      clearTimeout(d.timer);
      _todayDragCleanup();
    }
    return;
  }
  if (e.cancelable) e.preventDefault();  // 드래그 중 스크롤 차단
  const dy = y - d.startY;
  // 드래그 항목은 손가락을 그대로 따라옴 (transition none → 1:1).
  d.el.style.transform = `translateY(${dy}px) scale(1.03)`;
  // 원본 center 기준으로 어느 슬롯에 들어갈지 계산.
  const center = d.rows[d.fromIndex].center + dy;
  let toIndex = d.fromIndex;
  while (toIndex < d.rows.length - 1 && center > d.rows[toIndex + 1].center) toIndex++;
  while (toIndex > 0 && center < d.rows[toIndex - 1].center) toIndex--;
  if (toIndex !== d.toIndex) {
    d.toIndex = toIndex;
    if (typeof _calHaptic === 'function') _calHaptic('tick');
    // 형제들이 부드럽게 자리를 비켜줌 (CSS transform transition).
    for (let i = 0; i < d.rows.length; i++) {
      if (i === d.fromIndex) continue;
      let shift = 0;
      if (i > d.fromIndex && i <= toIndex) shift = -d.slot;       // 아래로 지나간 항목 → 위로
      else if (i < d.fromIndex && i >= toIndex) shift = d.slot;   // 위로 지나간 항목 → 아래로
      d.rows[i].el.style.transform = shift ? `translateY(${shift}px)` : '';
    }
  }
}

function _todayDragUp() {
  const d = _todayDrag;
  if (!d) return;
  clearTimeout(d.timer);
  _todayDragDetach(d);
  _todayDrag = null;
  if (!d.active) {
    // 꾹(드래그) 아닌 그냥 탭 → 더보기 메뉴 (사용자 명시 2026-05-27).
    if (!d.moved && typeof _todayTaskMenu === 'function') _todayTaskMenu(d.taskId);
    return;
  }
  // 드래그 항목의 드롭 직전 시각 위치 기억 (FLIP).
  const beforeTop = d.el.getBoundingClientRect().top;
  // 형제 transition 잠깐 끔 → 재정렬과 transform 제거가 상쇄돼 점프 없이 즉시 정착.
  d.rows.forEach(r => { if (r.el !== d.el) r.el.style.transition = 'none'; });
  // 최종 순서로 DOM 재정렬.
  const els = d.rows.map(r => r.el).filter(el => el !== d.el);
  els.splice(d.toIndex, 0, d.el);
  els.forEach(el => d.list.appendChild(el));
  d.rows.forEach(r => { if (r.el !== d.el) r.el.style.transform = ''; });
  // FLIP — 드래그 항목: 재정렬 후 위치에서 손가락이 있던 위치로 되돌렸다가 그 자리로 사뿐히 안착.
  d.el.classList.remove('dragging');
  d.el.style.transition = 'none';
  const afterTop = d.el.getBoundingClientRect().top;
  d.el.style.transform = `translateY(${beforeTop - afterTop}px) scale(1.03)`;
  // 강제 reflow 후 다음 프레임에 0 으로 transition → 떨어지는 애니메이션.
  void d.el.offsetHeight;
  requestAnimationFrame(() => {
    if (!d.el) return;
    d.el.style.transition = 'transform 0.18s cubic-bezier(0.2,0.8,0.3,1)';
    d.el.style.transform = '';
  });
  const draggedEl = d.el;
  const sibEls = d.rows.map(r => r.el);
  setTimeout(() => {
    sibEls.forEach(el => { if (el) el.style.transition = ''; });
    if (draggedEl) { draggedEl.style.transition = ''; draggedEl.style.transform = ''; }
  }, 240);
  // 새 DOM 순서 → todayOrder 저장. (renderExecute 는 호출 안 함 — 정착 애니메이션 flash 방지.)
  const ids = [...d.list.querySelectorAll('.todo-item')].map(el => el.dataset.taskId);
  ids.forEach((id, i) => {
    const t = (state.tasks || []).find(x => x.id === id);
    if (t) t.todayOrder = i;
  });
  saveState();
}

function _todayDragDetach(d) {
  if (!d) return;
  if (d.isTouch) {
    document.removeEventListener('touchmove', _todayDragMove);
    document.removeEventListener('touchend', _todayDragUp);
    document.removeEventListener('touchcancel', _todayDragUp);
  } else {
    document.removeEventListener('mousemove', _todayDragMove);
    document.removeEventListener('mouseup', _todayDragUp);
  }
}

function _todayDragCleanup() {
  const d = _todayDrag;
  _todayDrag = null;
  _todayDragDetach(d);
}

// === 오늘 할 일 ☰ 더보기 메뉴 (사용자 명시 2026-05-27) — 수정 / 서랍장으로 내리기 / 삭제 ===
function _todayTaskMenu(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  const isDone = task.status === 'done';
  const ex = document.getElementById('todayTaskMenuOverlay');
  if (ex) ex.remove();
  const btn = 'width:100%; padding:14px; border-radius:12px; font-size:14px; font-family:inherit; cursor:pointer; border:1px solid var(--border); background:var(--surface); color:var(--text); text-align:center; font-weight:500;';
  const dangerBtn = btn + ' color:var(--danger);';
  const softBtn = btn + ' color:var(--text-soft);';
  const actions = isDone
    ? `<button onclick="_todayTaskMenuAction('${taskId}','delete')" style="${dangerBtn}">🗑 삭제</button>`
    : `<button onclick="_todayTaskMenuAction('${taskId}','edit')" style="${btn}">✎ 수정</button>
       <button onclick="_todayTaskMenuAction('${taskId}','demote')" style="${btn}">↓ 서랍장으로 내리기</button>
       <button onclick="_todayTaskMenuAction('${taskId}','delete')" style="${dangerBtn}">🗑 삭제</button>`;
  const html = `
    <div id="todayTaskMenuOverlay" onclick="if(event.target===this) this.remove();" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10001; display:flex; align-items:flex-end; justify-content:center;">
      <div onclick="event.stopPropagation();" style="background:var(--bg); border-top-left-radius:18px; border-top-right-radius:18px; width:100%; max-width:520px; padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px)); box-sizing:border-box;">
        <div style="font-size:14px; font-weight:600; color:var(--text); margin-bottom:14px;${isDone ? ' text-decoration:line-through; opacity:0.6;' : ''}">${escapeHtml(task.title || '')}</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${actions}
          <button onclick="document.getElementById('todayTaskMenuOverlay').remove()" style="${softBtn}">닫기</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

function _todayTaskMenuAction(taskId, action) {
  const ov = document.getElementById('todayTaskMenuOverlay');
  if (ov) ov.remove();
  if (action === 'edit' && typeof editTaskCard === 'function') return editTaskCard(taskId);
  if (action === 'demote' && typeof demoteFromToday === 'function') return demoteFromToday(taskId);
  if (action === 'delete' && typeof deleteTask === 'function') return deleteTask(taskId);
}

// === SHELL REWARD SYSTEM (V3.1) ===
// 사용자 요청 2026-04-27: 특별/탑티어 소라 아이콘 다양화 — DNA 조각 후보가 더 예쁘게
// V4 (사용자 명시 2026-05-20 ultrathink): pool 간 emoji 중복 제거 — 각 emoji 한 tier 에만 속함.
//   옛 중복: 🪻(main/call/legendary), 🫧(daily/call/legendary), 🪷(daily/legendary), 🌺(golden/legendary),
//           🦚(golden/legendary), 🌸(golden/legendary), 🪐(golden/legendary), 🌷(main/legendary).
//   결정: 자연/꽃 톤 → 하위 tier 유지. 천체 톤 (🪐) → legendary. 빈 자리 새 unique 추가
//        (golden 🦈 / call 🧚 🪅 / legendary 🏆 🎊 🌅 💝 🩷).
//   tier 변별력 ↑ — emoji 보면 어느 tier 인지 즉시 식별.
const SHELL_POOLS = {
  light:    { emojis: ['🐚','🐌','🪸','🌱','🍃','🌾','🪺'],                                                 tier: 'light',   points: 1,  label: '가벼움' },
  daily:    { emojis: ['🌀','🐠','🪼','🐟','🪷','🫧','🐡','🐳'],                                            tier: 'daily',   points: 2,  label: '일상' },
  main:     { emojis: ['🐢','🐬','🦀','🦭','🦦','🪻','🦩','🌷'],                                            tier: 'main',    points: 5,  label: '메인' },
  golden:   { emojis: ['🦑','🐙','🦞','🐉','🦚','🌸','🌺','🦈'],                                            tier: 'golden',  points: 10, label: '황금' },
  call:     { emojis: ['⭐','🌟','💫','🌙','🪄','💎','🌠','🔮','💠','🎐','🪬','🌹','🧚','🪅'],                tier: 'call',    points: 20, label: '부름' },
  legendary:{ emojis: ['✨','🌈','🎆','🎇','🪩','🦄','🌌','🦋','💖','🎀','🩵','🪐','🦢','🏆','🎊','🌅','💝','🩷'], tier: 'legend',  points: 50, label: '특별' }
};

// V4 (사용자 명시 2026-05-20 ultrathink): anti-recency weighted pick — 최근 N 안 같은 tier 에서
//   등장한 emoji 가중치 0.3 으로 ↓. 작은 N small-sample 우연 편향 ('또 ⭐?' 체감) 해소.
//   recent window = state.shellCollection 의 마지막 12개 중 같은 tier 만 추출.
//   pool 1개 / recent 0개 면 uniform 그대로.
function _pickEmojiAntiRecency(emojis, tier) {
  if (!Array.isArray(emojis) || emojis.length === 0) return '';
  if (emojis.length === 1) return emojis[0];
  const recent = ((state && state.shellCollection) || [])
    .slice(-12)
    .filter(s => s && s.tier === tier)
    .map(s => s.type);
  if (recent.length === 0) {
    return emojis[Math.floor(Math.random() * emojis.length)];
  }
  const weights = emojis.map(e => recent.includes(e) ? 0.3 : 1.0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return emojis[Math.floor(Math.random() * emojis.length)];
  let r = Math.random() * total;
  for (let i = 0; i < emojis.length; i++) {
    r -= weights[i];
    if (r <= 0) return emojis[i];
  }
  return emojis[emojis.length - 1];
}

function pickShellForTask(task) {
  if (!task) return null;
  // 사용자 요청 2026-04-27: 특별 소라 어디서든 5% 등장 (오늘 카드/부름 모두)
  if (Math.random() < 0.05) {
    const pool = SHELL_POOLS.legendary;
    const emoji = _pickEmojiAntiRecency(pool.emojis, pool.tier);
    return { emoji, tier: pool.tier, points: pool.points, label: pool.label, rarity: 'legendary' };
  }
  if (task.source === 'ai_mission') {
    const pool = SHELL_POOLS.call;
    const emoji = _pickEmojiAntiRecency(pool.emojis, pool.tier);
    return { emoji, tier: pool.tier, points: pool.points, label: pool.label, rarity: 'rare' };
  }
  let pool;
  if (task.weight === 'main' && task.execMode === 'focus') pool = SHELL_POOLS.golden;
  else if (task.weight === 'main') pool = SHELL_POOLS.main;
  else if (task.weight === 'daily') pool = SHELL_POOLS.daily;
  else pool = SHELL_POOLS.light;
  const emoji = _pickEmojiAntiRecency(pool.emojis, pool.tier);
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

// 사용자 명시 2026-05-27 ultrathink (re-iter): previewShellForTask 폐기 — 옛 now3 카드 안 셸 미리보기 surface 전용이었음. 외부 callsite X.

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

  // 사용자 명시 2026-05-27 ultrathink (re-iter): now3 자리 셸 보상 폐기 → AI 미션 (소라의 부름) 만 셸 가챠.
  //   옛 게이트: `task.slot !== 'now3' && task.source !== 'ai_mission'` 면 셸 X.
  //   새 게이트: `task.source !== 'ai_mission'` 면 셸 X. 옛 데이터의 now3 task 도 자연 새 정책으로.
  if (task.source !== 'ai_mission') {
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
  // 사용자 명시 2026-05-27 ultrathink (re-iter): now3 폐기 → 자동 promoteFromDrawer setTimeout trigger 도 폐기 ('오늘의 카드 다 깼어 / 다음 3장 꺼낼까?' 모달).
}
