// V4 (사용자 명시 2026-05-27 ultrathink — 캘린더 일정/할 일 1단계):
// state.schedules CRUD + state.tasks dueDate/dueTime/notifyMinutesBefore 헬퍼.
// 모든 시각은 UTC ISO 8601 (Date.prototype.toISOString) 저장. 표시 시 사용자 로컬로 변환.
// state.todaySchedule (오늘 시간표) 와 별개 store. todaySchedule 은 derive view 로 유지 (backward compat).

const _SCHEDULE_NOTIFY_DEFAULT_MINUTES = 15;

function _newScheduleId() {
  return 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function _coerceScheduleDate(val) {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ISO 8601 → 'YYYY-MM-DD' (사용자 로컬 시간대 기준 날짜 키)
function _isoToScheduleDayKey(iso) {
  const d = _coerceScheduleDate(iso);
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ISO 8601 → 'HH:MM' (사용자 로컬 시간대 기준 시각)
function _isoToScheduleTimeKey(iso) {
  const d = _coerceScheduleDate(iso);
  if (!d) return null;
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${HH}:${MM}`;
}

function _normNotifyMinutes(val, fallback) {
  if (val === null) return null;
  if (val === undefined) return (fallback === undefined ? _SCHEDULE_NOTIFY_DEFAULT_MINUTES : fallback);
  if (typeof val !== 'number' || !isFinite(val) || val < 0) return (fallback === undefined ? _SCHEDULE_NOTIFY_DEFAULT_MINUTES : fallback);
  return Math.floor(val);
}

// 일정 생성. opts: { title, description?, startAt, endAt, isAllDay?, notifyMinutesBefore? }
// startAt/endAt 은 Date 인스턴스 또는 ISO 8601 string. 자정 정렬 (isAllDay) 은 호출자가 책임.
function createSchedule(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('createSchedule: opts 필요');
  const title = String(opts.title || '').trim();
  if (!title) throw new Error('createSchedule: title 필요');

  const start = _coerceScheduleDate(opts.startAt);
  const end   = _coerceScheduleDate(opts.endAt);
  if (!start) throw new Error('createSchedule: startAt 형식 불가');
  if (!end)   throw new Error('createSchedule: endAt 형식 불가');
  if (end.getTime() < start.getTime()) throw new Error('createSchedule: endAt 이 startAt 보다 앞섬');

  const isAllDay = !!opts.isAllDay;
  const notify = _normNotifyMinutes(opts.notifyMinutesBefore);
  const nowISO = new Date().toISOString();

  const entry = {
    id: _newScheduleId(),
    title,
    description: opts.description ? String(opts.description) : null,
    startAt: start.toISOString(),
    endAt:   end.toISOString(),
    isAllDay,
    notifyMinutesBefore: notify,
    createdAt: nowISO,
    updatedAt: nowISO
  };

  if (!Array.isArray(state.schedules)) state.schedules = [];
  state.schedules.push(entry);
  if (typeof saveState === 'function') saveState();
  return entry;
}

// 일정 수정. patch 의 키만 갱신. id/createdAt 는 immutable.
function updateSchedule(id, patch) {
  if (!id || !patch || typeof patch !== 'object') return null;
  const list = Array.isArray(state.schedules) ? state.schedules : [];
  const entry = list.find(s => s.id === id);
  if (!entry) return null;

  if ('title' in patch) {
    const t = String(patch.title || '').trim();
    if (t) entry.title = t;
  }
  if ('description' in patch) entry.description = patch.description ? String(patch.description) : null;
  if ('startAt' in patch) {
    const d = _coerceScheduleDate(patch.startAt);
    if (d) entry.startAt = d.toISOString();
  }
  if ('endAt' in patch) {
    const d = _coerceScheduleDate(patch.endAt);
    if (d) entry.endAt = d.toISOString();
  }
  if ('isAllDay' in patch) entry.isAllDay = !!patch.isAllDay;
  if ('notifyMinutesBefore' in patch) {
    entry.notifyMinutesBefore = _normNotifyMinutes(patch.notifyMinutesBefore, entry.notifyMinutesBefore);
  }

  // endAt < startAt 가드 (patch 후 재검증)
  const s = _coerceScheduleDate(entry.startAt);
  const e = _coerceScheduleDate(entry.endAt);
  if (s && e && e.getTime() < s.getTime()) {
    // 자동 보정: endAt = startAt (사용자 입력 잘못이면 호출자에서 사전 검증 권장)
    entry.endAt = entry.startAt;
  }

  entry.updatedAt = new Date().toISOString();
  if (typeof saveState === 'function') saveState();
  return entry;
}

function deleteSchedule(id) {
  if (!id) return false;
  const list = Array.isArray(state.schedules) ? state.schedules : [];
  const before = list.length;
  state.schedules = list.filter(s => s.id !== id);
  const removed = state.schedules.length < before;
  if (removed && typeof saveState === 'function') saveState();
  return removed;
}

// 특정 날짜 (dateStr 'YYYY-MM-DD', 로컬) 에 시작하는 일정 전체.
// multi-day (startAt 다른 날, endAt 같은/다른 날) 는 startAt 기준만 표시 — 1단계 단순화.
function getSchedulesForDate(dateStr) {
  if (!dateStr) return [];
  const list = Array.isArray(state.schedules) ? state.schedules : [];
  return list.filter(s => _isoToScheduleDayKey(s.startAt) === dateStr);
}

// 특정 날짜에 마감되는 task (dueDate 매칭, 미완료 만).
function getTasksDueOnDate(dateStr) {
  if (!dateStr) return [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  return tasks.filter(t => t.dueDate === dateStr && t.status !== 'done');
}

// 오늘 timetable derive view — state.schedules 의 오늘 시작 entry + state.todaySchedule (옛 entry, backward compat) 를 todaySchedule 형태로 합쳐서 sort.
// 04-v4-timetable.js / 24-execute.js 의 timetable strip 이 이걸 호출하도록 단계적 마이그.
function getTodaySchedulesDerivedView() {
  const todayK = (typeof _scheduleDateKey === 'function') ? _scheduleDateKey() : null;
  if (!todayK) return Array.isArray(state.todaySchedule) ? state.todaySchedule.slice() : [];

  const out = [];

  // 1) state.schedules 의 오늘 시작 + 시간 일정 (종일 X) → todaySchedule entry 형태로 변환
  const schedules = Array.isArray(state.schedules) ? state.schedules : [];
  for (const s of schedules) {
    if (_isoToScheduleDayKey(s.startAt) !== todayK) continue;
    if (s.isAllDay) continue;
    const start = _isoToScheduleTimeKey(s.startAt);
    const end   = _isoToScheduleTimeKey(s.endAt);
    if (!start || !end) continue;
    out.push({
      id: s.id,
      title: s.title,
      start,
      end,
      date: todayK,
      source: 'schedule',
      scheduleId: s.id,
      color: null,
      _derived: true
    });
  }

  // 2) 기존 state.todaySchedule (ICS import / task 시간 적용 결과) — backward compat
  const legacy = Array.isArray(state.todaySchedule) ? state.todaySchedule : [];
  for (const it of legacy) {
    if (it.date && it.date !== todayK) continue;
    out.push(it);
  }

  out.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return out;
}

// task 마감 set. opts: { dueDate?, dueTime?, notifyMinutesBefore? }
// dueDate=null + dueTime=null → 마감 해제. dueTime=null + dueDate='YYYY-MM-DD' → 종일.
function setTaskDue(taskId, opts) {
  if (!taskId || !opts || typeof opts !== 'object') return null;
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return null;

  if ('dueDate' in opts) {
    const v = opts.dueDate;
    task.dueDate = (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
  }
  if ('dueTime' in opts) {
    const v = opts.dueTime;
    task.dueTime = (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)) ? v : null;
  }
  if ('notifyMinutesBefore' in opts) {
    task.notifyMinutesBefore = _normNotifyMinutes(opts.notifyMinutesBefore, task.notifyMinutesBefore);
  }

  if (typeof saveState === 'function') saveState();
  return task;
}

function clearTaskDue(taskId) {
  return setTaskDue(taskId, { dueDate: null, dueTime: null, notifyMinutesBefore: null });
}

try {
  window.createSchedule = createSchedule;
  window.updateSchedule = updateSchedule;
  window.deleteSchedule = deleteSchedule;
  window.getSchedulesForDate = getSchedulesForDate;
  window.getTasksDueOnDate = getTasksDueOnDate;
  window.getTodaySchedulesDerivedView = getTodaySchedulesDerivedView;
  window.setTaskDue = setTaskDue;
  window.clearTaskDue = clearTaskDue;
} catch (e) {}
