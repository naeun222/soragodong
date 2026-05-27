// V4 (사용자 명시 2026-05-27 ultrathink — 캘린더 일정/할 일 4단계 — 로컬 알림):
// state.schedules + state.tasks 의 notifyMinutesBefore 따라 OS 알림 스케줄.
// Capacitor LocalNotifications (Android/iOS) + PWA Notification fallback.
// 메모 capacitor_plugin_call_pattern: ES module 금지 → window.Capacitor.Plugins.LocalNotifications 직호출.
//   plugin JS wrapper (registerPlugin) 가 단순 proxy — 인자 형식 그대로 native 전달.
//   schedule({ notifications: [...] }), cancel({ notifications: [{id}] }), requestPermissions() / checkPermissions() 인자 X.

const _NOTIF_LOG = '[notif-sched]';

// schedule.id (string) → Capacitor 정수 ID (Capacitor 가 number 요구). 32-bit hash, 양수.
function _notifIdFromString(s) {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  // 양수 + 31-bit 안 (Java int 호환)
  return Math.abs(h) % 2147483647;
}

function _getLocalNotifications() {
  if (typeof window === 'undefined') return null;
  if (!window.Capacitor || !window.Capacitor.Plugins) return null;
  return window.Capacitor.Plugins.LocalNotifications || null;
}

async function requestNotificationPermission() {
  const LN = _getLocalNotifications();
  if (LN) {
    try {
      const perm = await LN.requestPermissions();
      return !!(perm && perm.display === 'granted');
    } catch (e) {
      console.warn(_NOTIF_LOG, 'capacitor requestPermissions 실패', e);
      return false;
    }
  }
  // Web/PWA fallback
  if (typeof Notification !== 'undefined' && Notification.requestPermission) {
    try {
      const r = await Notification.requestPermission();
      return r === 'granted';
    } catch (e) {
      console.warn(_NOTIF_LOG, 'web requestPermission 실패', e);
      return false;
    }
  }
  return false;
}

async function checkNotificationPermission() {
  const LN = _getLocalNotifications();
  if (LN) {
    try {
      const perm = await LN.checkPermissions();
      return !!(perm && perm.display === 'granted');
    } catch (e) {
      return false;
    }
  }
  if (typeof Notification !== 'undefined') {
    return Notification.permission === 'granted';
  }
  return false;
}

// 일정 알림 schedule. notifyMinutesBefore null/undefined → cancel.
async function scheduleNotificationForSchedule(schedule) {
  if (!schedule || !schedule.id) return false;
  const notify = schedule.notifyMinutesBefore;
  if (notify === null || notify === undefined) {
    await cancelNotificationById(schedule.id);
    return false;
  }
  const startMs = new Date(schedule.startAt).getTime();
  if (isNaN(startMs)) {
    await cancelNotificationById(schedule.id);
    return false;
  }
  const triggerMs = startMs - (notify * 60 * 1000);
  if (triggerMs <= Date.now() + 5000) {
    // 이미 지난 시각 (또는 5초 여유 안) — schedule X
    await cancelNotificationById(schedule.id);
    return false;
  }
  const body = notify === 0
    ? '지금 시작'
    : (notify >= 1440 ? `${Math.round(notify / 1440)}일 전` : (notify >= 60 ? `${Math.round(notify / 60)}시간 전` : `${notify}분 전`));
  return _scheduleNative(schedule.id, schedule.title || '일정', body, new Date(triggerMs));
}

// task 알림 schedule.
async function scheduleNotificationForTask(task) {
  if (!task || !task.id) return false;
  if (task.status === 'done') {
    await cancelNotificationById(task.id);
    return false;
  }
  const notify = task.notifyMinutesBefore;
  if (notify === null || notify === undefined) {
    await cancelNotificationById(task.id);
    return false;
  }
  if (!task.dueDate) {
    await cancelNotificationById(task.id);
    return false;
  }
  const dueTime = task.dueTime || '23:59';
  const dueMs = new Date(`${task.dueDate}T${dueTime}`).getTime();
  if (isNaN(dueMs)) {
    await cancelNotificationById(task.id);
    return false;
  }
  const triggerMs = dueMs - (notify * 60 * 1000);
  if (triggerMs <= Date.now() + 5000) {
    await cancelNotificationById(task.id);
    return false;
  }
  const body = notify === 0
    ? '지금 마감'
    : (notify >= 1440 ? `${Math.round(notify / 1440)}일 전 마감` : (notify >= 60 ? `${Math.round(notify / 60)}시간 전 마감` : `${notify}분 전 마감`));
  return _scheduleNative(task.id, `✓ ${task.title || '할 일'}`, body, new Date(triggerMs));
}

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 명시 2026-05-27 ultrathink (서버 push): web/PWA 일정 알림을 hook 과 같은 서버 Web Push 큐에 등록.
//   iOS PWA 는 TimestampTrigger 미지원 + setTimeout 은 앱 켜져 있을 때만 → 서버 push 만이 진정한 백그라운드 알림.
//   push subscription (VAPID) 은 hook 시스템과 공유 (브라우저당 1개). 구독 없으면 silent subscribe 시도, 실패 시 local fallback.
// ─────────────────────────────────────────────────────────────────────────────
async function _webPushSubscriptionExists() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch (e) { return false; }
}

async function _ensureWebPushForSchedule() {
  if (await _webPushSubscriptionExists()) return true;
  if (typeof ensurePushSubscription !== 'function') return false;
  // permission 이미 granted 면 silent subscribe (prompt X). VAPID 미설정 / 권한 X 면 false → local fallback.
  try {
    const r = await ensurePushSubscription({ silent: true });
    return !!(r && r.ok);
  } catch (e) { return false; }
}

async function _enqueueSchedulePush(id, title, body, at) {
  const token = (typeof session !== 'undefined' && session && session.access_token) || null;
  if (!token) return false;
  if (!(await _ensureWebPushForSchedule())) return false;
  try {
    const resp = await fetch('/api/hook/schedule-queue', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ item_id: id, title, body, scheduled_at: at.toISOString() })
    });
    return resp.ok;
  } catch (e) { return false; }
}

async function _cancelSchedulePush(id) {
  const token = (typeof session !== 'undefined' && session && session.access_token) || null;
  if (!token) return;
  try {
    await fetch('/api/hook/schedule-queue?item_id=' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (e) {}
}

async function _scheduleNative(id, title, body, at) {
  const notifId = _notifIdFromString(id);
  const LN = _getLocalNotifications();
  if (LN) {
    try {
      // 같은 id 의 옛 알림 cancel 후 schedule (예약 갱신)
      try { await LN.cancel({ notifications: [{ id: notifId }] }); } catch (e) {}
      await LN.schedule({
        notifications: [{
          id: notifId,
          title: title,
          body: body,
          schedule: { at: at, allowWhileIdle: true },
          extra: { kind: 'schedule_notif', item_id: id }
        }]
      });
      return true;
    } catch (e) {
      console.warn(_NOTIF_LOG, 'capacitor schedule 실패', id, e);
      return false;
    }
  }
  // 사용자 명시 2026-05-27 ultrathink (서버 push 우선): web/PWA — 서버 push queue 에 등록.
  //   cron 이 시각 도달 시 Web Push / FCM 발사 → 브라우저 종료 후에도 OS 알림 fire (iOS PWA 백그라운드 cover).
  //   성공 시 여기서 종료 (TimestampTrigger / setTimeout 중복 방지).
  try {
    const enq = await _enqueueSchedulePush(id, title, body, at);
    if (enq) return true;
  } catch (e) {
    console.warn(_NOTIF_LOG, '서버 push enqueue 실패 → local fallback', e);
  }

  // 사용자 명시 2026-05-27 ultrathink (PWA push fallback):
  //   서버 push 불가 (구독 없음 / VAPID 미설정) — Notification Triggers API 의 TimestampTrigger.
  //   Chrome 86+ Android/desktop 지원. Safari/Firefox 미지원 → setTimeout fallback (앱 켜져 있을 때만).
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  const delayMs = at.getTime() - Date.now();
  if (delayMs <= 0) return false;

  // path 1 — TimestampTrigger (PWA push 정통)
  if (typeof TimestampTrigger !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        // 같은 tag 의 옛 알림 cancel (트리거 전 포함) — 재예약 보장.
        try {
          const existing = await reg.getNotifications({ tag: id, includeTriggered: true });
          for (const n of existing) { try { n.close(); } catch (e) {} }
        } catch (e) {}
        await reg.showNotification(title, {
          body,
          tag: id,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          showTrigger: new TimestampTrigger(at.getTime()),
          data: { kind: 'schedule_notif', item_id: id }
        });
        return true;
      }
    } catch (e) {
      console.warn(_NOTIF_LOG, 'TimestampTrigger 실패 → setTimeout fallback', e);
    }
  }

  // path 2 — setTimeout fallback (앱 켜져 있을 때만, 24h 안)
  if (delayMs > 24 * 3600 * 1000) return false;
  if (!window._pwaNotifTimers) window._pwaNotifTimers = {};
  if (window._pwaNotifTimers[id]) clearTimeout(window._pwaNotifTimers[id]);
  window._pwaNotifTimers[id] = setTimeout(() => {
    // sw.registration.showNotification 우선 (앱 아이콘 표시), 미지원 시 new Notification
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        return reg.showNotification(title, { body, tag: id, icon: '/icon-192.png', badge: '/icon-192.png', data: { kind: 'schedule_notif', item_id: id } });
      }).catch(() => {
        try { new Notification(title, { body, tag: id, data: { kind: 'schedule_notif', item_id: id } }); } catch (e) {}
      });
    } else {
      try { new Notification(title, { body, tag: id, data: { kind: 'schedule_notif', item_id: id } }); } catch (e) {}
    }
    delete window._pwaNotifTimers[id];
  }, delayMs);
  return true;
}

async function cancelNotificationById(id) {
  if (!id) return;
  const notifId = _notifIdFromString(id);
  const LN = _getLocalNotifications();
  if (LN) {
    try {
      await LN.cancel({ notifications: [{ id: notifId }] });
    } catch (e) {}
  }
  // 사용자 명시 2026-05-27 ultrathink (PWA push): TimestampTrigger 알림도 cancel — sw.registration.getNotifications + close.
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.getNotifications({ tag: id, includeTriggered: true });
      for (const n of existing) { try { n.close(); } catch (e) {} }
    } catch (e) {}
  }
  // PWA setTimeout 취소
  if (window._pwaNotifTimers && window._pwaNotifTimers[id]) {
    clearTimeout(window._pwaNotifTimers[id]);
    delete window._pwaNotifTimers[id];
  }
  // 사용자 명시 2026-05-27 ultrathink (서버 push): web 환경이면 서버 큐에서도 삭제 (Capacitor 는 큐에 등록 안 함).
  if (!LN) {
    try { await _cancelSchedulePush(id); } catch (e) {}
  }
}

// 권한 자동 요청 + 모든 schedules/tasks 알림 재예약 (앱 진입 시 호출 권장).
async function rescheduleAllNotifications() {
  const granted = await checkNotificationPermission();
  if (!granted) return;
  for (const s of (state.schedules || [])) {
    try { await scheduleNotificationForSchedule(s); } catch (e) {}
  }
  for (const t of (state.tasks || [])) {
    if (t.dueDate && t.notifyMinutesBefore !== null && t.notifyMinutesBefore !== undefined && t.status !== 'done') {
      try { await scheduleNotificationForTask(t); } catch (e) {}
    }
  }
}

// 첫 알림 설정 시 권한 prompt — notify 가 not null 인데 권한 X 면 자동 prompt.
async function _ensureNotifPermissionForSchedule(schedule) {
  if (!schedule || schedule.notifyMinutesBefore === null || schedule.notifyMinutesBefore === undefined) return true;
  const granted = await checkNotificationPermission();
  if (granted) return true;
  return await requestNotificationPermission();
}

try {
  window.requestNotificationPermission = requestNotificationPermission;
  window.checkNotificationPermission = checkNotificationPermission;
  window.scheduleNotificationForSchedule = scheduleNotificationForSchedule;
  window.scheduleNotificationForTask = scheduleNotificationForTask;
  window.cancelNotificationById = cancelNotificationById;
  window.rescheduleAllNotifications = rescheduleAllNotifications;
  window._ensureNotifPermissionForSchedule = _ensureNotifPermissionForSchedule;
} catch (e) {}

// 사용자 명시 2026-05-27 ultrathink (4단계 PWA 후속): self-init — 앱 첫 진입 / 탭 복귀 시 알림 자동 재예약.
//   PWA setTimeout 가 탭 hide 시 슬립 / 페이지 reload 후 사라짐 → 매번 알림 reset 보장.
//   Capacitor LocalNotifications 는 OS 가 관리 (재부팅 후 plugin 의 BOOT_COMPLETED receiver 자동 복원) — 그래도 idempotent 재예약 안전.

let _notifRescheduleTimer = null;
function _scheduleRescheduleAll(delayMs) {
  if (_notifRescheduleTimer) clearTimeout(_notifRescheduleTimer);
  _notifRescheduleTimer = setTimeout(() => {
    _notifRescheduleTimer = null;
    if (typeof state === 'undefined' || !state) return;
    if (!Array.isArray(state.schedules) && !Array.isArray(state.tasks)) return;
    rescheduleAllNotifications().catch(e => console.warn(_NOTIF_LOG, 'reschedule 실패', e));
  }, delayMs || 2000);
}

try {
  // 첫 진입 — state 로드 대기 2초 후 재예약
  if (document.readyState === 'complete') {
    _scheduleRescheduleAll(2000);
  } else {
    window.addEventListener('load', () => _scheduleRescheduleAll(2000), { once: true });
  }

  // 탭 visible 복귀 시 재예약 — 백그라운드 중 슬립 timer 복구
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _scheduleRescheduleAll(500);
    }
  });
} catch (e) {
  console.warn(_NOTIF_LOG, 'self-init 실패', e);
}

// 사용자 보고 2026-05-27 ultrathink: Capacitor 네이티브 알림 클릭 → 해당 일정/할 일 day view 이동.
//   localNotificationActionPerformed 이벤트의 notification.extra.item_id 로 _openScheduleFromNotif 호출.
try {
  const _LN = _getLocalNotifications();
  if (_LN && _LN.addListener && !window._schedNotifTapBound) {
    window._schedNotifTapBound = true;
    _LN.addListener('localNotificationActionPerformed', (ev) => {
      try {
        const extra = (ev && ev.notification && ev.notification.extra) || {};
        if (extra.kind === 'schedule_notif' && extra.item_id && typeof _openScheduleFromNotif === 'function') {
          // state 로드 대기 — cold start 대비 약간 지연.
          setTimeout(() => { try { _openScheduleFromNotif(extra.item_id); } catch (e) {} }, 600);
        }
      } catch (e) { console.warn(_NOTIF_LOG, 'notif tap 처리 실패', e); }
    });
  }
} catch (e) { console.warn(_NOTIF_LOG, 'notif tap listener 실패', e); }
