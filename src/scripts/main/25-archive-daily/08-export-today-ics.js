function exportTodayICS() {
  const items = (state.todaySchedule || []).filter(it => it.title && it.start && it.end);
  if (items.length === 0) {
    showToast('내보낼 일정 없어');
    return;
  }
  const todayK = todayKey();
  const targetItems = items.filter(it => !it.date || it.date === todayK);
  if (targetItems.length === 0) {
    showToast('오늘 일정 없어');
    return;
  }

  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//soragodong//V4//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  targetItems.forEach(it => {
    const date = it.date || todayK;
    const uid = it.id + '@soragodong';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${_icsLocalDateTime(date, it.start)}`,
      `DTEND:${_icsLocalDateTime(date, it.end)}`,
      `SUMMARY:${_icsEscape(it.title)}`,
      it.note ? `DESCRIPTION:${_icsEscape(it.note)}` : '',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const ics = lines.filter(Boolean).join('\r\n');

  // 파일 다운
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `소라고동_${todayK}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`📤 ${targetItems.length}개 일정 내보냄`);
}

// AI 스케줄러 함수 삭제 (사용자 요청 2026-04-28). UI 호출 없는 dead code였음. 일정은 채팅으로만 등록.

