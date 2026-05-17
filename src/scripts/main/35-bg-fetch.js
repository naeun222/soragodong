// V4 (사용자 명시 2026-05-18 ultrathink): Capacitor Android Background Fetch — chapter 추출 4AM cutoff 백그라운드 정리.
//   사용자 명시: "안드로이드 앱의 경우 cron 으로 백그라운드로 정리되게 하자 (단, 데이터 있을 때만)".
//   plugin: @transistorsoft/capacitor-background-fetch (Apache 2.0). Android WorkManager + iOS BGAppRefreshTask.
//   minimumFetchInterval: 15분 (OS 가 배터리 / 사용 패턴 따라 조절).
//   콜백 흐름:
//     1) pending archive 있는지 체크 (_pendingExtract + messages.length >= 6) — "데이터 있을 때만".
//     2) 4AM cutoff 통과 체크 (구독자 deferred 흐름과 동일 — _shouldRunSchedule + _lastDaily4amCutoff).
//     3) maybeRunDailyChapterExtract() 호출 — 내부 Batch API 호출 + 4단 분석 처리.
//     4) BackgroundFetch.finish(taskId) — OS 에 task 완료 신호 (필수).
//   E2EE 호환: client-side 처리 (master key client only) — 서버 cron 불가능한 케이스 보완.
//   non-Capacitor 환경 (PWA / browser) skip — plugin 미설치 환경 영향 X.

(function _initBgFetch() {
  if (typeof window === 'undefined' || !window.Capacitor) return;
  if (typeof window.Capacitor.getPlatform !== 'function') return;
  const _platform = window.Capacitor.getPlatform();
  if (_platform !== 'android' && _platform !== 'ios') return;

  // plugin lazy reference — npx cap sync android 후 자동 register (Capacitor 7+ 표준).
  const BgFetch = window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundFetch;
  if (!BgFetch || typeof BgFetch.configure !== 'function') {
    console.warn('[bg-fetch] @transistorsoft/capacitor-background-fetch plugin 미설치 또는 register 실패');
    return;
  }

  const _runTask = async (taskId) => {
    const _tid = (taskId && taskId.taskId) || taskId || 'unknown';
    try {
      console.log('[bg-fetch] task fire:', _tid);
      // 1) pending archive 있는지 체크 — 데이터 있을 때만 발사.
      const _pending = Array.isArray(state.chatArchive)
        ? state.chatArchive.filter(a => a && !a._deleted && a._pendingExtract && Array.isArray(a.messages) && a.messages.length >= 6)
        : [];
      if (_pending.length === 0) {
        console.log('[bg-fetch] no pending archive — skip');
        return;
      }
      // 2) 4AM cutoff 통과 체크.
      const _cutoffPassed = (typeof _shouldRunSchedule === 'function')
        && (typeof _lastDaily4amCutoff === 'function')
        && _shouldRunSchedule(state.lastDailyChapterExtractAt, _lastDaily4amCutoff());
      if (!_cutoffPassed) {
        console.log('[bg-fetch] 4AM cutoff 미통과 — skip');
        return;
      }
      // 3) 다른 가드 — onboarding tutorial / testerMode.
      if (window._onbTutorialMode) { console.log('[bg-fetch] onb tutorial — skip'); return; }
      if (state.preferences && state.preferences.testerMode) { console.log('[bg-fetch] testerMode — skip'); return; }
      if (typeof _canAI === 'function' && !_canAI()) { console.log('[bg-fetch] _canAI false — skip'); return; }
      // 4) maybeRunDailyChapterExtract — 내부 batch API + 4단 분석.
      if (typeof maybeRunDailyChapterExtract === 'function') {
        await maybeRunDailyChapterExtract();
        console.log('[bg-fetch] dailyChapterExtract 완료');
      }
    } catch (e) {
      console.warn('[bg-fetch] task error:', e);
    } finally {
      // OS 에 task 완료 신호 — 필수.
      try { BgFetch.finish({ taskId: _tid }); } catch (e) { console.warn('[bg-fetch] finish:', e); }
    }
  };

  const _timeoutTask = async (taskId) => {
    const _tid = (taskId && taskId.taskId) || taskId || 'unknown';
    console.warn('[bg-fetch] task timeout:', _tid);
    try { BgFetch.finish({ taskId: _tid }); } catch {}
  };

  // configure 비동기. init 6초 후 — 다른 init 흐름 끝난 후 register.
  setTimeout(async () => {
    try {
      await BgFetch.configure(
        {
          minimumFetchInterval: 15,  // 15분 간격 (OS 가 조절)
          stopOnTerminate: false,    // 앱 종료 후도 동작 (Android)
          startOnBoot: true,         // 부팅 후 자동 시작 (Android)
        },
        _runTask,
        _timeoutTask
      );
      console.log('[bg-fetch] configured (15min interval)');
    } catch (e) {
      console.warn('[bg-fetch] configure fail:', e);
    }
  }, 6000);
})();
