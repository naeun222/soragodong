// Push subscription + 플랫폼 detection — _hook-system-spec.md Phase B.
// 사용자 명시 2026-05-17.
//
// VAPID public key — USER_TODO 참조 (Cloudflare env VAPID_PUBLIC_KEY + frontend window._VAPID_PUBLIC_KEY).
// 키 미설정 시 subscribe 흐름 silent skip — frontend dead code OK.

// ─────────────────────────────────────────────────────────────────────────────
// 플랫폼 detection
//   iOS PWA: standalone OR safari standalone fullscreen mode
//   Android PWA: standalone + Android UA
//   web-mobile / web-desktop = 나머지
// ─────────────────────────────────────────────────────────────────────────────
function detectPlatform() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) || (/mac/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  const isMobile = isIOS || isAndroid || /mobile|tablet/.test(ua);

  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator && 'standalone' in window.navigator && window.navigator.standalone === true);

  if (isIOS && isStandalone) return 'ios-pwa';
  if (isAndroid && isStandalone) return 'android-pwa';
  if (isMobile) return 'web-mobile';
  return 'web-desktop';
}

function pushSupportedOnPlatform() {
  // V4 fix (사용자 명시 2026-05-18 ultrathink): Capacitor 환경은 native push (FCM) → web Notification API 무관.
  if (_isCapacitorNative()) return true;
  // 그 외 web push: Notification + serviceWorker + PushManager 필요.
  if (typeof Notification === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  // iOS Safari (16.4+) PWA = ✓. 일반 브라우저 iOS = X. UA detection 으로 미세 가드.
  const platform = detectPlatform();
  if (platform === 'ios-pwa') {
    // iOS PWA 만 지원. Safari 일반 = 미지원.
    return true;
  }
  return true;  // 나머지 (android-pwa / web-*) 다 OK
}

// V4 (사용자 명시 2026-05-18 ultrathink): Capacitor native 환경 detect (Android / iOS app).
//   WebView 자체는 Notification / pushManager 미지원 → @capacitor/push-notifications plugin 사용.
function _isCapacitorNative() {
  if (typeof window === 'undefined' || !window.Capacitor) return false;
  if (typeof window.Capacitor.getPlatform !== 'function') return false;
  const _p = window.Capacitor.getPlatform();
  return _p === 'android' || _p === 'ios';
}

// ─────────────────────────────────────────────────────────────────────────────
// VAPID Base64URL → Uint8Array (PushManager applicationServerKey 형식)
// ─────────────────────────────────────────────────────────────────────────────
function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

// VAPID public key — USER_TODO 가 window._VAPID_PUBLIC_KEY 박음 (또는 config.js 안 직접 박음).
// 비어있으면 subscription silent skip.
function _getVapidPublicKey() {
  return (typeof window !== 'undefined' && window._VAPID_PUBLIC_KEY) || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription 등록 — 권한 prompt + subscribe + backend POST.
//   opts.silent = true 면 권한 prompt 띄움 X (이미 granted 인 경우만 처리).
//   opts.frequency / notificationTime 같이 전달 시 prefs 도 같이 upsert.
// ─────────────────────────────────────────────────────────────────────────────
async function ensurePushSubscription(opts) {
  opts = opts || {};
  // V4 (사용자 명시 2026-05-18 ultrathink): Capacitor 환경이면 native FCM 흐름. 별도 함수 위임.
  if (_isCapacitorNative()) {
    return await _ensureCapacitorPushSubscription(opts);
  }
  const vapidKey = _getVapidPublicKey();
  if (!vapidKey) {
    console.warn('[push] VAPID public key 미설정 — subscription skip');
    return { ok: false, reason: 'no-vapid-key' };
  }
  if (!pushSupportedOnPlatform()) {
    return { ok: false, reason: 'unsupported-platform' };
  }
  if (!('serviceWorker' in navigator)) {
    return { ok: false, reason: 'no-sw' };
  }

  // 1) 권한 체크 + prompt
  let perm = Notification.permission;
  if (perm === 'denied') return { ok: false, reason: 'permission-denied' };
  if (perm === 'default') {
    if (opts.silent) return { ok: false, reason: 'permission-not-granted' };
    try { perm = await Notification.requestPermission(); }
    catch (e) { return { ok: false, reason: 'permission-prompt-fail', error: String(e) }; }
    if (perm !== 'granted') return { ok: false, reason: 'permission-denied' };
  }

  // 2) Service Worker ready
  let reg;
  try { reg = await navigator.serviceWorker.ready; }
  catch (e) { return { ok: false, reason: 'sw-not-ready', error: String(e) }; }

  // 3) subscribe (이미 있으면 재사용)
  let sub;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(vapidKey)
      });
    }
  } catch (e) {
    console.warn('[push] subscribe fail:', e);
    return { ok: false, reason: 'subscribe-fail', error: String(e && e.message || e) };
  }

  // 4) backend 에 subscription + prefs upsert.
  const accessToken = (typeof session !== 'undefined' && session && session.access_token) || null;
  if (!accessToken) return { ok: false, reason: 'no-auth', subscription: sub };

  const prefsBody = {
    push_subscription: sub.toJSON ? sub.toJSON() : sub,
    platform: detectPlatform(),
    frequency: opts.frequency || (state.preferences && state.preferences.hookFrequency) || 'daily',
    notification_time: typeof opts.notificationTime === 'number'
      ? opts.notificationTime
      : (state.preferences && typeof state.preferences.hookNotificationTime === 'number' ? state.preferences.hookNotificationTime : 21),
    enabled: opts.enabled !== false,
  };

  try {
    const resp = await fetch('/api/hook/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify(prefsBody)
    });
    if (!resp.ok) {
      console.warn('[push] preferences PUT', resp.status);
      return { ok: false, reason: 'prefs-put-' + resp.status, subscription: sub };
    }
    // local state mirror
    state.preferences = state.preferences || {};
    state.preferences._pushSubscribedAt = new Date().toISOString();
    state.preferences._pushPlatform = prefsBody.platform;
    if (typeof saveState === 'function') saveState();
    return { ok: true, subscription: sub, platform: prefsBody.platform };
  } catch (e) {
    return { ok: false, reason: 'prefs-put-throw', error: String(e && e.message || e), subscription: sub };
  }
}

// V4 (사용자 명시 2026-05-18 ultrathink): Capacitor native push subscribe.
//   1) checkPermissions / requestPermissions — Android 13+ POST_NOTIFICATIONS prompt.
//   2) PushNotifications.register() → 'registration' event 로 FCM token.
//   3) backend /api/hook/preferences PUT — push_subscription.fcm_token + platform 'capacitor-<os>'.
//      backend 는 platform 분기 — web push (VAPID) 또는 FCM. 별도 backend 작업.
async function _ensureCapacitorPushSubscription(opts) {
  const _Push = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
  if (!_Push) {
    console.warn('[push] @capacitor/push-notifications plugin 미설치 — npm install + cap sync 필요');
    return { ok: false, reason: 'no-capacitor-plugin' };
  }
  // 1) 권한 — Android 13+ POST_NOTIFICATIONS / iOS APNS.
  let _perm;
  try { _perm = await _Push.checkPermissions(); }
  catch (e) { return { ok: false, reason: 'check-perm-fail', error: String(e) }; }
  if (_perm.receive === 'prompt' || _perm.receive === 'prompt-with-rationale') {
    if (opts.silent) return { ok: false, reason: 'permission-not-granted' };
    try { _perm = await _Push.requestPermissions(); }
    catch (e) { return { ok: false, reason: 'request-perm-fail', error: String(e) }; }
  }
  if (_perm.receive !== 'granted') return { ok: false, reason: 'permission-denied' };
  // 2) register — 'registration' event 비동기. Promise 로 wrap.
  let _fcmToken = null;
  let _regError = null;
  let _regListener, _errListener;
  try {
    await new Promise(async (resolve) => {
      let _done = false;
      const _resolveOnce = () => { if (!_done) { _done = true; resolve(); } };
      try {
        _regListener = await _Push.addListener('registration', (t) => {
          _fcmToken = t && t.value || null;
          _resolveOnce();
        });
      } catch {}
      try {
        _errListener = await _Push.addListener('registrationError', (err) => {
          _regError = err;
          _resolveOnce();
        });
      } catch {}
      try { await _Push.register(); } catch (e) { _regError = e; _resolveOnce(); }
      setTimeout(_resolveOnce, 12000); // safety timeout
    });
  } finally {
    try { _regListener && _regListener.remove && _regListener.remove(); } catch {}
    try { _errListener && _errListener.remove && _errListener.remove(); } catch {}
  }
  if (!_fcmToken) {
    console.warn('[push] capacitor register fail:', _regError);
    return { ok: false, reason: 'no-fcm-token', error: _regError ? String(_regError) : null };
  }
  // 3) backend 에 token + prefs.
  const _accessToken = (typeof session !== 'undefined' && session && session.access_token) || null;
  if (!_accessToken) return { ok: false, reason: 'no-auth', fcmToken: _fcmToken };
  const _os = window.Capacitor.getPlatform();
  const _platform = 'capacitor-' + _os;
  const _prefsBody = {
    push_subscription: { fcm_token: _fcmToken, platform: _platform },
    platform: _platform,
    frequency: opts.frequency || (state.preferences && state.preferences.hookFrequency) || 'daily',
    notification_time: typeof opts.notificationTime === 'number'
      ? opts.notificationTime
      : (state.preferences && typeof state.preferences.hookNotificationTime === 'number' ? state.preferences.hookNotificationTime : 21),
    enabled: opts.enabled !== false,
  };
  try {
    const resp = await fetch('/api/hook/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_accessToken}` },
      body: JSON.stringify(_prefsBody)
    });
    if (!resp.ok) {
      console.warn('[push capacitor] preferences PUT', resp.status);
      return { ok: false, reason: 'prefs-put-' + resp.status, fcmToken: _fcmToken };
    }
    state.preferences = state.preferences || {};
    state.preferences._pushSubscribedAt = new Date().toISOString();
    state.preferences._pushPlatform = _platform;
    state.preferences._pushFcmToken = _fcmToken;
    if (typeof saveState === 'function') saveState();
    return { ok: true, fcmToken: _fcmToken, platform: _platform };
  } catch (e) {
    return { ok: false, reason: 'prefs-put-throw', error: String(e && e.message || e), fcmToken: _fcmToken };
  }
}

// Unsubscribe — 사용자 명시 끄기 시 호출.
async function disablePushSubscription() {
  if (!('serviceWorker' in navigator)) return { ok: true };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe().catch(() => {});
    const accessToken = (typeof session !== 'undefined' && session && session.access_token) || null;
    if (accessToken) {
      await fetch('/api/hook/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ push_subscription: null, enabled: false })
      }).catch(() => {});
    }
    state.preferences = state.preferences || {};
    delete state.preferences._pushSubscribedAt;
    delete state.preferences._pushPlatform;
    if (typeof saveState === 'function') saveState();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'throw', error: String(e && e.message || e) };
  }
}
