// V4 (사용자 명시 2026-05-27 ultrathink — 구글식 통합 바닥 시트):
// 할 일 생성/편집은 18-schedule-sheet.js 의 바닥 시트로 통합. 이 파일은 호환 wrapper 만 유지.
//   openTaskEditModal(taskId, opts) — taskId null + opts.dueDate = create. 기존 호출처(캘린더 그날 모달/day view task 메뉴) 그대로 동작.

function _closeTaskEditModal() {
  if (typeof _closeSchedSheet === 'function') _closeSchedSheet();
}

function openTaskEditModal(taskId, opts) {
  opts = opts || {};
  if (typeof openScheduleSheet === 'function') {
    openScheduleSheet({ type: 'task', id: taskId || null, dueDate: opts.dueDate || null });
  }
}

try {
  window.openTaskEditModal = openTaskEditModal;
  window._closeTaskEditModal = _closeTaskEditModal;
} catch (e) {}
