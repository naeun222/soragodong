function renderV4TimetableHTML() {
  // 사용자 명시 2026-05-27 ultrathink (timeline ↔ 캘린더 sync): getTodaySchedulesDerivedView 사용 — state.schedules 오늘 + state.todaySchedule 합쳐서 양쪽 view 같은 데이터.
  const items = (typeof getTodaySchedulesDerivedView === 'function')
    ? getTodaySchedulesDerivedView()
    : (state.todaySchedule || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  // 사용자 명시 2026-05-06 (정정): 자정 (00:00) cutoff. _scheduleDateKey 가 helper.
  const todayK = (typeof _scheduleDateKey === 'function') ? _scheduleDateKey() : todayKey();
  const todayItems = items.filter(it => !it.date || it.date === todayK);

  // 사용 시간 범위: 항목 있으면 min~max, 없으면 8-22 default
  let startHour = 8, endHour = 22;
  if (todayItems.length > 0) {
    const hours = todayItems.flatMap(it => {
      const s = parseInt((it.start || '').split(':')[0]) || 0;
      const e = parseInt((it.end   || '').split(':')[0]) || 0;
      return [s, e];
    });
    startHour = Math.min(...hours, 8);
    endHour = Math.max(...hours, 22);
  }

  // 현재 시각
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 시간 grid (각 시간 60px / 분 1px)
  const HOUR_PX = 50;
  let html = `
    <div class="v4-timetable-section">
      <div class="v4-tt-header">
        <span class="v4-tt-label">📅 일정</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="v4-tt-add-btn" onclick="addV4ScheduleItem()">+ 추가</button>
          ${(state.todaySchedule || []).length > 0 ? `<button class="v4-tt-add-btn" onclick="exportToGoogleCalendar()" title="Google 캘린더에 일정 추가">📤 구글 캘린더</button>` : ''}
          <button class="v4-tt-add-btn" onclick="importFromGoogleCalendar()" title="Google 캘린더에서 일정 가져오기">📥 가져오기</button>
        </div>
      </div>
      <div class="v4-tt-grid" id="v4ttGrid">
  `;
  for (let h = startHour; h <= endHour; h++) {
    const hourLabel = String(h).padStart(2, '0') + ':00';
    // V4-fix: 빈 시간대 클릭 → task picker
    html += `<div class="v4-tt-hour-row" style="height:${HOUR_PX}px;" onclick="pickTaskForHour(${h})" title="이 시간에 할 일 적용하기">
      <span class="v4-tt-hour-label">${hourLabel}</span>
    </div>`;
  }
  // 항목들
  todayItems.forEach((it, idx) => {
    const sParts = (it.start || '').split(':');
    const eParts = (it.end   || '').split(':');
    const sMin = (parseInt(sParts[0]) || 0) * 60 + (parseInt(sParts[1]) || 0);
    const eMin = (parseInt(eParts[0]) || 0) * 60 + (parseInt(eParts[1]) || 0);
    const startTopMin = sMin - startHour * 60;
    const heightMin = Math.max(20, eMin - sMin);
    const top = (startTopMin / 60) * HOUR_PX;
    const height = (heightMin / 60) * HOUR_PX;
    const color = it.color || _V4_TT_COLORS[idx % _V4_TT_COLORS.length];
    const isPast = eMin < nowMin && !it._past;
    html += `
      <div class="v4-tt-item${isPast ? ' past' : ''}" style="top:${top}px; height:${height}px; background:${color}33; border-left:3px solid ${color};" onclick="openV4ScheduleItem('${it.id}')" title="${escapeHtml(it.title)} ${it.start}~${it.end}">
        <div class="v4-tt-item-time">${it.start}–${it.end}</div>
        <div class="v4-tt-item-title">${escapeHtml(it.title)}</div>
      </div>
    `;
  });
  // 현재 시각 라인
  if (nowMin >= startHour * 60 && nowMin <= endHour * 60) {
    const nowTopMin = nowMin - startHour * 60;
    const nowTop = (nowTopMin / 60) * HOUR_PX;
    html += `<div class="v4-tt-now-line" style="top:${nowTop}px;"><span class="v4-tt-now-dot"></span></div>`;
  }
  html += `</div>`;
  if (todayItems.length === 0) {
    html += `<div class="v4-tt-empty">오늘 일정 비어있어. <span style="color:var(--accent2);">+ 일정 추가</span>로 시작.</div>`;
  }
  html += `</div>`;
  return html;
}

// V4-fix: 시간 grid 빈 시간대 클릭 → 할 일 목록 picker (그 시간에 적용하기)
async function pickTaskForHour(hour) {
  // 아직 시간 안 적용된 오늘 할 일 (drawer + isToday=true). 사용자 명시 2026-05-27 ultrathink (re-iter): now3 폐기 → isToday 만 필터.
  const todayKeyVal = todayKey();
  const tasks = (state.tasks || []).filter(t =>
    t.status !== 'done' &&
    !t.scheduledStart &&
    t.date === todayKeyVal &&
    t.isToday
  );
  const options = tasks.map(t => {
    return { label: `📋 ${(t.title || '').slice(0, 35)}`, value: t.id };
  });
  options.push({ label: '+ 새 일정 직접 입력', value: '__new' });
  options.push({ label: '취소', value: 'cancel' });

  const action = await showOptionsModal({
    title: `${String(hour).padStart(2,'0')}:00 — 뭘 적용할까?`,
    message: tasks.length === 0 ? '적용할 할 일 없음 — 직접 입력 가능' : '오늘 할 일 중 골라.',
    options
  });
  if (!action || action === 'cancel') return;

  const startStr = `${String(hour).padStart(2,'0')}:00`;
  const endHour = (hour + 1) % 24;
  const endStr = `${String(endHour).padStart(2,'0')}:00`;
  // 사용자 명시 2026-05-06 (정정): 자정 cutoff helper.
  const todayK = (typeof _scheduleDateKey === 'function') ? _scheduleDateKey() : todayKey();

  if (action === '__new') {
    const title = await showInputModal({
      title: `📅 ${startStr} 새 일정`,
      placeholder: '뭐 할 거야?',
      maxLength: 60,
      okLabel: '적용하기'
    });
    if (!title || !title.trim()) return;
    // 시간 정확히 조정 picker
    const time = await showTimeRangePicker({
      title: title.trim(),
      startDefault: startStr,
      endDefault: endStr
    });
    if (!time) return;
    if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
    state.todaySchedule.push({
      id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      start: time.start,
      end: time.end,
      date: todayK,
      source: 'manual',
      taskId: null,
      color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
    });
    saveState();
    renderExecute();
    showToast(`📅 ${time.start} 적용됨`);
    return;
  }

  // 기존 task → schedule push
  const t = tasks.find(x => x.id === action);
  if (!t) return;
  // 시간 확인 picker (사용자가 1시간 default 변경 가능)
  const time = await showTimeRangePicker({
    title: `⏰ ${t.title}`,
    startDefault: startStr,
    endDefault: endStr
  });
  if (!time) return;
  if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
  state.todaySchedule.push({
    id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: t.title,
    start: time.start,
    end: time.end,
    date: todayK,
    source: 'task',
    taskId: t.id,
    color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
  });
  t.scheduledStart = time.start;
  t.scheduledEnd = time.end;
  saveState();
  renderExecute();
  showToast(`⏰ ${(t.title || '').slice(0, 20)} → ${time.start}`);
}

