function _icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function _icsLocalDateTime(dateStr, timeStr) {
  // dateStr 'YYYY-MM-DD' + timeStr 'HH:MM' → '20260427T140000' (local time, no Z)
  const [Y, M, D] = dateStr.split('-');
  const [h, m] = timeStr.split(':');
  return `${Y}${M}${D}T${(h || '00').padStart(2,'0')}${(m || '00').padStart(2,'0')}00`;
}

function _icsUnescape(s) {
  return String(s || '').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

// ICS 텍스트 → VEVENT 배열 파싱 (단순 파서, RFC 5545 부분 지원)
function parseICS(text) {
  const events = [];
  // line-fold (next line starts with space) 합치기
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      // KEY[;PARAM]:VALUE
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const keyPart = line.slice(0, colon);
      const val = line.slice(colon + 1);
      const key = keyPart.split(';')[0].toUpperCase();
      if (key === 'SUMMARY') current.summary = _icsUnescape(val);
      else if (key === 'DESCRIPTION') current.description = _icsUnescape(val);
      else if (key === 'DTSTART') current.dtstart = val;
      else if (key === 'DTEND') current.dtend = val;
      else if (key === 'UID') current.uid = val;
    }
  }
  return events;
}

// ICS DTSTART 'YYYYMMDDTHHMMSS' (또는 Z) → { date:'YYYY-MM-DD', time:'HH:MM' }
function _parseICSDate(dt) {
  if (!dt) return null;
  const m = dt.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

async function importICSFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ics,text/calendar';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files && input.files[0];
    document.body.removeChild(input);
    if (!file) return;
    showToast('📥 가져오는 중...');
    try {
      const text = await file.text();
      const events = parseICS(text);
      if (events.length === 0) {
        showToast('이벤트 없는 파일');
        return;
      }
      const todayK = todayKey();
      const todayEvents = events.filter(ev => {
        const s = _parseICSDate(ev.dtstart);
        return s && s.date === todayK;
      });
      const importTarget = todayEvents.length > 0
        ? todayEvents
        : await (async () => {
            const yes = await showConfirmModal({
              title: '오늘 일정 없음',
              message: `${events.length}개 이벤트 중 오늘 항목 없어. 모든 날짜 가져올까?`,
              okLabel: '전부',
              cancelLabel: '취소'
            });
            return yes ? events : [];
          })();
      if (!importTarget.length) return;

      if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
      let added = 0;
      importTarget.forEach((ev, i) => {
        const s = _parseICSDate(ev.dtstart);
        const e = _parseICSDate(ev.dtend) || s;
        if (!s || !ev.summary) return;
        // dedupe: 같은 uid 또는 같은 (date, start, summary)
        const dupe = state.todaySchedule.some(x =>
          (ev.uid && x.icsUid === ev.uid) ||
          (x.date === s.date && x.start === s.time && x.title === ev.summary)
        );
        if (dupe) return;
        state.todaySchedule.push({
          id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          title: ev.summary.slice(0, 60),
          start: s.time,
          end: (e && e.time) || s.time,
          date: s.date,
          source: 'gcal',
          taskId: null,
          note: ev.description ? ev.description.slice(0, 100) : '',
          color: _V4_TT_COLORS[i % _V4_TT_COLORS.length],
          icsUid: ev.uid || null
        });
        added++;
      });
      saveState();
      renderExecute();
      showToast(`📥 ${added}개 일정 가져옴${added < importTarget.length ? ` (${importTarget.length - added}개 중복 skip)` : ''}`);
    } catch (e) {
      console.warn('ICS import failed:', e);
      showToast('가져오기 실패. .ics 파일인지 확인.');
    }
  };
  input.click();
}

// V4-fix: Google 캘린더 연동 (단방향, OAuth X — V5+로 양방향)
// export: 옵션 picker → (a) 각 일정 개별 Google quick-add URL / (b) .ics 파일
// import: 옵션 picker → (a) Google에서 .ics export 안내 / (b) 파일 업로드
async function exportToGoogleCalendar() {
  const items = (state.todaySchedule || []).filter(it => it.title && it.start && it.end);
  if (items.length === 0) {
    showToast('내보낼 일정 없어');
    return;
  }
  const action = await showOptionsModal({
    title: '📤 구글 캘린더로',
    message: `오늘 ${items.length}개 일정 내보내기`,
    options: [
      { label: '🔗 일정별 Google에 추가 (한 개씩)', value: 'gcal_url' },
      { label: '📁 .ics 파일 다운 (Google 캘린더 import)', value: 'ics' },
      { label: '취소', value: 'cancel' }
    ]
  });
  if (action === 'gcal_url') {
    // 각 일정마다 Google quick-add URL 생성 → 새 탭 열기
    const todayK = todayKey();
    const targetItems = items.filter(it => !it.date || it.date === todayK);
    let opened = 0;
    targetItems.forEach((it, i) => {
      setTimeout(() => {
        const url = buildGoogleCalendarURL(it);
        window.open(url, '_blank');
      }, i * 200); // 차례로 열기 (브라우저 팝업 차단 회피)
      opened++;
    });
    showToast(`🔗 ${opened}개 Google 새 탭 열림`);
  } else if (action === 'ics') {
    exportTodayICS();
  }
}

function buildGoogleCalendarURL(it) {
  const date = it.date || todayKey();
  const start = _icsLocalDateTime(date, it.start);  // YYYYMMDDTHHMMSS
  const end = _icsLocalDateTime(date, it.end);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: it.title,
    dates: `${start}/${end}`,
    ...(it.note ? { details: it.note } : {})
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function importFromGoogleCalendar() {
  const action = await showOptionsModal({
    title: '📥 구글 캘린더에서',
    message: '어떻게 가져올까?',
    options: [
      { label: '📁 .ics 파일 가져오기', value: 'ics' },
      { label: '❓ Google에서 .ics 받는 법', value: 'help' },
      { label: '취소', value: 'cancel' }
    ]
  });
  if (action === 'ics') {
    importICSFile();
  } else if (action === 'help') {
    await showConfirmModal({
      title: '❓ Google에서 .ics 받기',
      message: 'Google 캘린더 → 설정 → 캘린더 가져오기/내보내기 → 내보내기 → .zip 다운 → 압축 풀어 .ics 파일 → 여기서 "가져오기".',
      okLabel: '알았어',
      cancelLabel: ''
    });
  }
}

