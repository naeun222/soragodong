function renderV4TimetableHTML() {
  // 사용자 명시 2026-05-27 ultrathink (timeline ↔ 캘린더 sync): getTodaySchedulesDerivedView 사용 — state.schedules 오늘 + state.todaySchedule 합쳐서 양쪽 view 같은 데이터.
  const items = (typeof getTodaySchedulesDerivedView === 'function')
    ? getTodaySchedulesDerivedView()
    : (state.todaySchedule || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  // 사용자 명시 2026-05-06 (정정): 자정 (00:00) cutoff. _scheduleDateKey 가 helper.
  const todayK = (typeof _scheduleDateKey === 'function') ? _scheduleDateKey() : todayKey();
  const todayItems = items.filter(it => !it.date || it.date === todayK);

  // 사용자 명시 2026-05-27: 타임라인 06:00 ~ 24:00 고정. 범위 밖 항목 있으면 그만큼만 확장(숨김 방지).
  let startHour = 6, endHour = 24;
  if (todayItems.length > 0) {
    const hours = todayItems.flatMap(it => {
      const s = parseInt((it.start || '').split(':')[0]) || 0;
      const e = parseInt((it.end   || '').split(':')[0]) || 0;
      return [s, e];
    });
    startHour = Math.min(startHour, ...hours);
    endHour = Math.max(endHour, ...hours);
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
    // 사용자 명시 2026-05-27: 빈 시간대 탭 → 추가 시트(캘린더 데일리뷰와 동일). 시트 안에서 오늘 할 일/서랍장 pick.
    html += `<div class="v4-tt-hour-row" style="height:${HOUR_PX}px;" onclick="_v4ttSlotTap(${h})" title="이 시간에 추가">
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

// 사용자 명시 2026-05-27: 빈 시간대 탭 → 통합 추가 시트(openScheduleSheet). 옛 옵션모달 picker 폐기 —
//   오늘 할 일/서랍장 선택은 이제 시트 안 picker 가 담당 (캘린더 데일리뷰와 동일 UX).
function _v4ttSlotTap(hour) {
  const todayK = (typeof _scheduleDateKey === 'function') ? _scheduleDateKey() : todayKey();
  const start = Math.min(hour, 23) * 60;
  const end = Math.min(start + 60, 24 * 60);
  if (typeof openScheduleSheet === 'function') {
    openScheduleSheet({ type: 'schedule', date: todayK, startMin: start, endMin: end });
  }
}

