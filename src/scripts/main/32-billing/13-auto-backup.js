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
    // V4 (사용자 보고 2026-05-10 audit): autoBackup snapshot = 핵심 (profile / entries / traits / values / patterns / cf / projects / pearls / decisions / topicCards / reviews) 만 보존.
    //   chatArchive.messages 통째 strip (main row 의 chatArchive 가 처리). 큰 진주 dataURL 도 strip.
    const sanitized = JSON.parse(JSON.stringify(state));
    if (sanitized.preferences) delete sanitized.preferences.testerMode;
    if (Array.isArray(sanitized.chatArchive)) {
      sanitized.chatArchive = sanitized.chatArchive.map(a => {
        if (!a) return a;
        const { messages, ...rest } = a;
        return { ...rest, _msgsExcludedFromBackup: true, messageCount: messages?.length || a.messageCount || 0 };
      });
    }
    sanitized.chatMessages = [];
    if (Array.isArray(sanitized.pearls)) {
      sanitized.pearls = sanitized.pearls.map(p => {
        if (!p) return p;
        const _trim = { ...p };
        if (typeof _trim.video === 'string' && _trim.video.length > 1024) { _trim._videoExcluded = true; delete _trim.video; }
        if (typeof _trim.videoThumbnail === 'string' && _trim.videoThumbnail.length > 4096) { _trim._videoThumbExcluded = true; delete _trim.videoThumbnail; }
        if (typeof _trim.photo === 'string' && _trim.photo.length > 4096) { _trim._photoExcluded = true; delete _trim.photo; }
        return _trim;
      });
    }
    const stateHash = _computeStateHash(state);
    const newSnap = {
      ts: new Date(now).toISOString(),
      reason,
      note: reason,
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      _stateHash: stateHash,
      _backupSchemaVersion: 'v6',
      data: sanitized
    };

    // wipe detection helper — 직전 snapshot 비해 핵심 데이터 손실 시 차단.
    //   crash / partial state / 실수 reset 으로 빈 데이터가 backup 들어가고 옛 snapshot rotate-out 되던 risk.
    const _checkWipe = (lastData) => {
      if (!lastData) return false;
      const lastHasProfile = !!(lastData.profile && String(lastData.profile).trim());
      const currHasProfile = !!(state.profile && String(state.profile).trim());
      const lastEntries = Array.isArray(lastData.entries) ? lastData.entries.length : 0;
      const currEntries = Array.isArray(state.entries) ? state.entries.length : 0;
      const lastTraits = Array.isArray(lastData.traits) ? lastData.traits.length : 0;
      const currTraits = Array.isArray(state.traits) ? state.traits.length : 0;
      const profileWipe = lastHasProfile && !currHasProfile;
      const entriesShrink = lastEntries >= 5 && currEntries < lastEntries / 2;
      const traitsShrink = lastTraits >= 5 && currTraits < lastTraits / 2;
      if (profileWipe || entriesShrink || traitsShrink) {
        console.warn('[autoBackup] wipe 감지 — snapshot 차단.', {
          profileWipe, entriesShrink, traitsShrink, lastEntries, currEntries, lastTraits, currTraits
        });
        return true;
      }
      return false;
    };

    // V4 fix (사용자 보고 2026-05-22 ultrathink): 새 path (snapshot 별 row, 0034_backups_table) 우선.
    //   404 fallback 시 옛 path — SQL 미실행 호환.
    if (typeof _backupsTableInsert === 'function') {
      const lastHash = (typeof _backupsTableLastHash === 'function') ? await _backupsTableLastHash('auto') : null;
      if (lastHash && stateHash && lastHash === stateHash) {
        console.log('[autoBackup] 변경 없음 — snapshot skip, lastAutoBackupAt 만 갱신.');
        state.preferences._lastAutoBackupAt = now;
        state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
        saveState();
        return;
      }
      // wipe detection — 새 path 의 last full row 비교.
      const lastList = (typeof _backupsTableList === 'function') ? await _backupsTableList('auto', 1, 'full') : { ok: false, rows: [] };
      if (lastList.ok && lastList.rows.length > 0) {
        if (_checkWipe(lastList.rows[0].data || {})) return;
      }
      const ins = await _backupsTableInsert('auto', newSnap);
      if (ins.ok) {
        if (typeof _backupsTableRotate === 'function') {
          try { await _backupsTableRotate('auto', AUTO_BACKUP_KEEP_N); } catch (e) { console.warn('[autoBackup] rotate:', e); }
        }
        state.preferences._lastAutoBackupAt = now;
        state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
        saveState();
        console.log(`[autoBackup] saved (new path, ${reason}).`);
        return;
      }
      if (!ins.fallback) {
        console.warn('[autoBackup] new path fail:', ins.error);
        return;
      }
      console.warn('[autoBackup] new path 404 — 옛 path fallback');
    }

    // 옛 path (legacy single-row snapshots[]) — SQL 미실행 호환.
    const { ok: _ok, rows } = await _backupRowFetch(V4_AUTO_BACKUP_USER_ID, 'data,id');
    let snapshots = [];
    let existingId = null;
    if (_ok && rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
      snapshots = rows[0].data.snapshots;
      existingId = rows[0].id;
    }
    // 사용자 보고 2026-05-10 (batch 10 root cause): 옛 snapshots 가 옛 schema (chatArchive messages 통째 포함) → row 여전히 큼.
    //   옛 snapshots 도 lazy sanitize. _shrunkV2 마커 없으면 처음 한 번 strip.
    snapshots = snapshots.map(snap => {
      if (!snap || snap._shrunkV2) return snap;
      const _data = snap.data || {};
      if (Array.isArray(_data.chatArchive)) {
        _data.chatArchive = _data.chatArchive.map(a => {
          if (!a) return a;
          const { messages, ...rest } = a;
          return { ...rest, _msgsExcludedFromBackup: true, messageCount: messages?.length || a.messageCount || 0 };
        });
      }
      _data.chatMessages = [];
      if (Array.isArray(_data.pearls)) {
        _data.pearls = _data.pearls.map(p => {
          if (!p) return p;
          const _trim = { ...p };
          if (typeof _trim.video === 'string' && _trim.video.length > 1024) { _trim._videoExcluded = true; delete _trim.video; }
          if (typeof _trim.videoThumbnail === 'string' && _trim.videoThumbnail.length > 4096) { _trim._videoThumbExcluded = true; delete _trim.videoThumbnail; }
          if (typeof _trim.photo === 'string' && _trim.photo.length > 4096) { _trim._photoExcluded = true; delete _trim.photo; }
          return _trim;
        });
      }
      return { ...snap, data: _data, _shrunkV2: true };
    });
    if (snapshots.length > 0) {
      const lastSnap = snapshots[snapshots.length - 1];
      if (stateHash && lastSnap._stateHash === stateHash) {
        console.log('[autoBackup] 변경 없음 — snapshot skip, lastAutoBackupAt 만 갱신.');
        state.preferences._lastAutoBackupAt = now;
        state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
        saveState();
        return;
      }
      if (_checkWipe(lastSnap.data || {})) return;
    }
    snapshots.push(newSnap);
    if (snapshots.length > AUTO_BACKUP_KEEP_N) {
      snapshots = snapshots.slice(-AUTO_BACKUP_KEEP_N);
    }
    await _backupRowUpsert(V4_AUTO_BACKUP_USER_ID, { snapshots }, existingId);
    state.preferences._lastAutoBackupAt = now;
    state.preferences._lastAutoBackupVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';
    saveState();
    console.log(`[autoBackup] saved (legacy ${reason}). snapshots: ${snapshots.length}`);
  } catch (e) { console.warn('autoBackup:', e); }
}

