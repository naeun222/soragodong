// 사용자 요청 2026-04-28: 자동 백업 — 주 1회 + APP_VERSION 변경 시. 단일 row(me_v4_auto_backup) 내 snapshots[] 5개 rolling
async function runAutoBackupIfNeeded() {
  if (!authUserId) return;
  if (state.preferences && state.preferences.testerMode) return;  // 테스터 모드면 skip
  // 사용자 보고 2026-04-30 데이터 손실 P4 fix: pending recovery 중이면 빈 state가 snapshot에 적용되는 거 차단.
  if (window._e2eePendingRecovery) {
    console.warn('[autoBackup] E2EE 복원 대기 중 — snapshot 차단 (데이터 보호)');
    return;
  }
  if (!state.preferences) state.preferences = {};
  const now = Date.now();
  const lastTs = state.preferences._lastAutoBackupAt || 0;
  const lastVer = state.preferences._lastAutoBackupVersion || '';
  const verChanged = (typeof APP_VERSION !== 'undefined') && lastVer !== APP_VERSION;
  const weekly = (now - lastTs) >= AUTO_BACKUP_INTERVAL_MS;
  if (!weekly && !verChanged) return;
  const reason = verChanged ? `update_${APP_VERSION}` : 'weekly';
  try {
    // 기존 snapshots 로드
    const { ok: _ok, rows } = await _backupRowFetch(V4_AUTO_BACKUP_USER_ID, 'data,id');
    let snapshots = [];
    let existingId = null;
    if (_ok && rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
      snapshots = rows[0].data.snapshots;
      existingId = rows[0].id;
    }
    // 사용자 보고 2026-05-01 (profile 날아간 케이스): wipe detection — 직전 snapshot 비해 핵심 데이터 손실 시 skip.
    // crash 후폭풍·partial state·실수 reset 등으로 cloud 빈 데이터 들어가고 옛 snapshot 까지 rotate-out 되던 risk 차단.
    const stateHash = _computeStateHash(state);
    if (snapshots.length > 0) {
      const last = snapshots[snapshots.length - 1].data || {};
      const lastSnap = snapshots[snapshots.length - 1];
      // 사용자 명시 2026-05-01: 100+ 사용자 효율 — 변경 없는 state 면 snapshot 추가 skip + 다음 schedule 으로 미룸.
      if (stateHash && lastSnap._stateHash === stateHash) {
        console.log('[autoBackup] 변경 없음 — snapshot skip, lastAutoBackupAt 만 갱신.');
        state.preferences._lastAutoBackupAt = now;
        state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
        saveState();
        return;
      }
      const lastHasProfile = !!(last.profile && String(last.profile).trim());
      const currHasProfile = !!(state.profile && String(state.profile).trim());
      const lastEntries = Array.isArray(last.entries) ? last.entries.length : 0;
      const currEntries = Array.isArray(state.entries) ? state.entries.length : 0;
      const lastTraits = Array.isArray(last.traits) ? last.traits.length : 0;
      const currTraits = Array.isArray(state.traits) ? state.traits.length : 0;
      const profileWipe = lastHasProfile && !currHasProfile;
      const entriesShrink = lastEntries >= 5 && currEntries < lastEntries / 2;
      const traitsShrink = lastTraits >= 5 && currTraits < lastTraits / 2;
      // chatMessages 는 ✓ 마무리 시 0 으로 reset 되는 게 정상 → wipe 신호 X
      if (profileWipe || entriesShrink || traitsShrink) {
        console.warn('[autoBackup] wipe 감지 — snapshot 차단 (profile/entries/traits 손실 보호). 옛 snapshot 유지.', {
          profileWipe, entriesShrink, traitsShrink,
          lastEntries, currEntries, lastTraits, currTraits
        });
        return;
      }
    }
    // 새 snapshot 추가 (state에서 testerMode flag strip)
    const sanitized = JSON.parse(JSON.stringify(state));
    if (sanitized.preferences) delete sanitized.preferences.testerMode;
    // 사용자 보고 2026-05-10 (audit): backup row 너무 커서 Supabase statement timeout (500 'canceling statement due to statement timeout').
    //   chatArchive 의 messages = 가장 큼 (108/128 msgs archive 등). 옛 chat 복원은 main row (saveToCloudNow) 의 chatArchive 가 처리.
    //   autoBackup snapshot 은 핵심 (profile / entries / traits / values / patterns / cf / projects / pearls / decisions / topicCards / reviews) 만 보존.
    if (Array.isArray(sanitized.chatArchive)) {
      sanitized.chatArchive = sanitized.chatArchive.map(a => {
        if (!a) return a;
        const { messages, ...rest } = a;
        return { ...rest, _msgsExcludedFromBackup: true, messageCount: messages?.length || a.messageCount || 0 };
      });
    }
    // chatMessages 도 제외 (현재 활성 챕터, autoBackup 시점에 보통 비어있지만 안전).
    sanitized.chatMessages = [];
    // 큰 미디어 dataURL 도 제외 (진주 video / photo 큰 진주 등) — main row 의 sensitive body 가 처리.
    if (Array.isArray(sanitized.pearls)) {
      sanitized.pearls = sanitized.pearls.map(p => {
        if (!p) return p;
        const _trim = { ...p };
        // video / photo dataURL 가 1KB+ 면 metadata 만 보존
        if (typeof _trim.video === 'string' && _trim.video.length > 1024) { _trim._videoExcluded = true; delete _trim.video; }
        if (typeof _trim.videoThumbnail === 'string' && _trim.videoThumbnail.length > 4096) { _trim._videoThumbExcluded = true; delete _trim.videoThumbnail; }
        if (typeof _trim.photo === 'string' && _trim.photo.length > 4096) { _trim._photoExcluded = true; delete _trim.photo; }
        return _trim;
      });
    }
    snapshots.push({
      ts: new Date(now).toISOString(),
      reason,
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      _stateHash: stateHash,
      data: sanitized
    });
    // rolling 5개
    if (snapshots.length > AUTO_BACKUP_KEEP_N) {
      snapshots = snapshots.slice(-AUTO_BACKUP_KEEP_N);
    }
    await _backupRowUpsert(V4_AUTO_BACKUP_USER_ID, { snapshots }, existingId);
    state.preferences._lastAutoBackupAt = now;
    state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
    saveState();
    console.log(`[autoBackup] saved (${reason}). snapshots: ${snapshots.length}`);
  } catch (e) { console.warn('autoBackup:', e); }
}

