// V4 (사용자 명시 2026-05-18 ultrathink): Capacitor Background Fetch — chapter cleanup batch 백그라운드 정리.
//   plugin: @transistorsoft/capacitor-background-fetch (Apache 2.0). Android JobScheduler/AlarmManager + iOS BGAppRefreshTask.
//   E2EE 호환: client-side 처리 (master key client only) — 서버 cron 불가능한 케이스 보완.
//   non-Capacitor 환경 (PWA / browser) skip — plugin 미설치 환경 영향 X.
//
// V4 (사용자 명시 2026-05-25 ultrathink): 두 가지 trigger path.
//   1) configure 의 minimumFetchInterval=15 default task — OS 가 사용자 패턴 따라 fire (배터리 / 사용 빈도 조절).
//   2) scheduleTask 의 daily 4AM custom task — 디바이스 local time 04:00 fire. one-shot + callback 끝에 다음 4AM 까지 재등록 (drift 자동 보정).
//      Android: JobScheduler default (forceAlarmManager=false 면 SCHEDULE_EXACT_ALARM permission 불필요). 분 단위 drift 허용 — KPI = 사용자 자는 동안 fire.
//      iOS: scheduleTask 가 충전 중 + OS 패턴 만족 시 fire. 보장 X — default task 가 fallback.
//   가드: pending cleanup 있고 + 4AM cutoff 통과 + onb tutorial X + testerMode X + _canAI() → maybeRunChapterCleanup fire.
//
// V4 fix (사용자 보고 2026-05-25 ultrathink): Play Console 비정상 종료 100% — BackgroundFetchPlugin.buildConfig NPE.
//   root cause: ES module 금지 (인라인 onclick 526개) 라 plugin 의 JS wrapper (`import { BackgroundFetch } from ...`) 못 씀.
//     → window.Capacitor.Plugins.BackgroundFetch (= native proxy 그 자체) 를 직접 호출.
//     → JS wrapper 가 하던 `NativeModule.configure({ options: config })` 의 `{ options: ... }` 래핑 누락.
//     → native 의 `call.getObject("options")` → null → buildConfig 의 `options.has(...)` NPE → process crash.
//   fix: JS wrapper 가 한 일을 수동 재현 — `{ options: ... }` 래핑 + addListener('fetch') 로 콜백 (인자로는 무시됨).

(function _initBgFetch() {
  if (typeof window === 'undefined' || !window.Capacitor) return;
  if (typeof window.Capacitor.getPlatform !== 'function') return;
  const _platform = window.Capacitor.getPlatform();
  if (_platform !== 'android' && _platform !== 'ios') return;

  // plugin lazy reference — npx cap sync android 후 자동 register (Capacitor 7+ 표준).
  // 주의: 이건 native proxy (NativeModule). JS wrapper class 가 아님 — 호출 시 wrapping 직접.
  const BgFetch = window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundFetch;
  if (!BgFetch || typeof BgFetch.configure !== 'function') {
    console.warn('[bg-fetch] @transistorsoft/capacitor-background-fetch plugin 미설치 또는 register 실패');
    return;
  }

  const DAILY_4AM_TASK_ID = 'soragodong-daily-4am';

  // 디바이스 local time 다음 04:00 까지 ms 계산. 사용자가 한국 거주 가정 (memory: 한국어 only) — 디바이스 timezone == KST.
  // 해외 여행 시 디바이스 시간 변경 → local 04:00 따라감 (사용자 자는 시간 자연 매칭).
  const _msUntilNext4AMLocal = () => {
    const _now = new Date();
    const _next = new Date(_now);
    _next.setHours(4, 0, 0, 0);
    if (_next <= _now) _next.setDate(_next.getDate() + 1);
    return Math.max(60_000, _next.getTime() - _now.getTime());  // 최소 60s — plugin 안정성.
  };

  // daily 4AM custom task 재등록 — one-shot 끝 callback 안 자기 자신 재호출 (drift 자동 보정).
  // native proxy 직호출이므로 { options: { ... } } 으로 wrap — buildConfig 가 call.getObject("options") 로 꺼냄.
  const _scheduleNext4AM = async () => {
    try {
      const _delayMs = _msUntilNext4AMLocal();
      await BgFetch.scheduleTask({
        options: {
          taskId: DAILY_4AM_TASK_ID,
          delay: _delayMs,
          periodic: false,
          stopOnTerminate: false,
          startOnBoot: true,
          requiredNetworkType: 1,  // NETWORK_TYPE_ANY = 1 (JS wrapper const, native proxy 에는 없음).
        },
      });
      console.log('[bg-fetch] daily 4AM 다음 fire — delay:', Math.round(_delayMs / 60_000), 'min');
    } catch (e) {
      console.warn('[bg-fetch] scheduleTask fail:', e);
    }
  };

  const _runTask = async (taskId) => {
    const _tid = (taskId && taskId.taskId) || taskId || 'unknown';
    try {
      console.log('[bg-fetch] task fire:', _tid);
      // 1) pending cleanup 있는지 체크 — 데이터 있을 때만 발사 (새 마커 _pendingCleanup, msg>=3 — 옛 _pendingExtract>=6 폐기).
      const _pending = Array.isArray(state.chatArchive)
        ? state.chatArchive.filter(a => a && !a._deleted && (a._pendingCleanup || a._pendingExtract) && Array.isArray(a.messages) && a.messages.length >= 3)
        : [];
      // diary backfill 도 가능한지 체크 — 어제부터 7일 missing entries (aiSummary X) 가 있으면 발사.
      // V4 fix (사용자 명시 2026-05-26 ultrathink — bg-fetch 불필요 wake 제거): 오늘 entry 제외.
      //   _buildDiaryBatchRequests 가 dateKey ≠ todayKey cutoff 가드 (30-force-analyze.js:788) — 오늘 entry 는 batch 에 포함 안 됨.
      //   여기서 오늘 entry 까지 trigger 로 카운트하면 _pending 0 인데도 bg-fetch wake → maybeRunChapterCleanup() 가 결국 아무것도 안 함.
      const _todayDk = (typeof todayKey === 'function') ? todayKey() : '';
      const _hasMissingDiary = Array.isArray(state.entries) && state.entries.some(e =>
        e && !e.diary && !e.aiSummary && !e._aiSummaryFailed && e.date && e.date < _todayDk
      );
      if (_pending.length === 0 && !_hasMissingDiary) {
        console.log('[bg-fetch] no pending cleanup + no missing diary — skip');
        return;
      }
      // 2) 4AM cutoff 통과 체크 — 새 field lastChapterCleanupAt (옛 lastDailyChapterExtractAt 폐기).
      const _cutoffPassed = (typeof _shouldRunSchedule === 'function')
        && (typeof _lastDaily4amCutoff === 'function')
        && _shouldRunSchedule(state.lastChapterCleanupAt, _lastDaily4amCutoff());
      if (!_cutoffPassed) {
        console.log('[bg-fetch] 4AM cutoff 미통과 — skip');
        return;
      }
      // 3) 다른 가드 — onboarding tutorial / testerMode / _canAI.
      if (window._onbTutorialMode) { console.log('[bg-fetch] onb tutorial — skip'); return; }
      if (state.preferences && state.preferences.testerMode) { console.log('[bg-fetch] testerMode — skip'); return; }
      if (typeof _canAI === 'function' && !_canAI()) { console.log('[bg-fetch] _canAI false — skip'); return; }
      // 4) maybeRunChapterCleanup — step A 분리 + step B cleanup batch + step C review chain.
      if (typeof maybeRunChapterCleanup === 'function') {
        await maybeRunChapterCleanup();
        console.log('[bg-fetch] chapterCleanup 완료');
      }
    } catch (e) {
      console.warn('[bg-fetch] task error:', e);
    } finally {
      // OS 에 task 완료 신호 — 필수.
      try { BgFetch.finish({ taskId: _tid }); } catch (e) { console.warn('[bg-fetch] finish:', e); }
      // daily 4AM task 면 다음 4AM 재등록 — drift 자동 보정 (one-shot path).
      if (_tid === DAILY_4AM_TASK_ID) {
        _scheduleNext4AM();
      }
    }
  };

  const _timeoutTask = async (taskId) => {
    const _tid = (taskId && taskId.taskId) || taskId || 'unknown';
    console.warn('[bg-fetch] task timeout:', _tid);
    try { BgFetch.finish({ taskId: _tid }); } catch {}
    // timeout 도 daily 4AM 이면 재등록 — fire 자체는 일어났으니 cycle 유지.
    if (_tid === DAILY_4AM_TASK_ID) {
      _scheduleNext4AM();
    }
  };

  // configure 비동기. init 6초 후 — 다른 init 흐름 끝난 후 register.
  // native proxy 직호출이므로 { options: { ... } } wrap + 콜백은 addListener('fetch', ...) 로 등록 (인자 자리는 무시됨).
  // native 의 onFetch/onTimeout 가 listener event `{ taskId, timeout }` 으로 통지 — timeout flag 로 분기.
  setTimeout(async () => {
    try {
      await BgFetch.addListener('fetch', (event) => {
        const _tid = event && event.taskId;
        if (event && event.timeout) {
          _timeoutTask(_tid);
        } else {
          _runTask(_tid);
        }
      });
      await BgFetch.configure({
        options: {
          minimumFetchInterval: 15,  // default task: 15분 간격 (OS 가 조절)
          stopOnTerminate: false,    // 앱 종료 후도 동작 (Android)
          startOnBoot: true,         // 부팅 후 자동 시작 (Android)
        },
      });
      console.log('[bg-fetch] configured (15min default + daily 4AM)');
    } catch (e) {
      console.warn('[bg-fetch] configure fail:', e);
    }
  }, 6000);

  // daily 4AM custom task 첫 등록 — configure 후 충분히 settle 시간 두고.
  setTimeout(() => { _scheduleNext4AM(); }, 8000);
})();
