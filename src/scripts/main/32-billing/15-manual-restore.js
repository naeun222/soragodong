// V4 (사용자 명시 2026-05-17 ultrathink): merge helper — snapshot 복원 시 현재 state 의 messages/media 보존.
//   root cause: 자동백업 sanitize 가 chatArchive.messages / pearl.video|photo 통째 strip
//     → snapshot 복원 시 메인 state 도 그 형태로 덮어쓰여 영구 손실 (cloud 메인 row 도 saveToCloudNow 로 변형).
//   fix: snap.data 의 chatArchive / pearls 와 현재 state 의 같은 id 항목 비교 — 현재가 더 full 이면 현재 우선.
//   비-파괴적: snap 에 새로 추가된 항목은 그대로 받고, 옛 부분만 현재 살린 데이터로 replace.
//   사용자가 snap 시점으로 돌아가고 싶다는 의도 = snap 의 메타 (pinned/deleted 등) 우선, messages/media 만 current 에서 채움.

function _mergeArchivesPreservingMessages(currentArr, snapArr) {
  const cur = Array.isArray(currentArr) ? currentArr : [];
  const snap = Array.isArray(snapArr) ? snapArr : [];
  const curById = new Map();
  cur.forEach(a => {
    if (!a) return;
    const id = a.id || a.date;
    if (id) curById.set(id, a);
  });
  return snap.map(s => {
    if (!s) return s;
    const id = s.id || s.date;
    if (!id) return s;
    const curMatch = curById.get(id);
    if (!curMatch) return s;
    const snapHasMsgs = Array.isArray(s.messages) && s.messages.length > 0;
    const curHasMsgs = Array.isArray(curMatch.messages) && curMatch.messages.length > 0;
    if (!snapHasMsgs && curHasMsgs) {
      const merged = { ...s, messages: curMatch.messages, _msgsRestoredFromCurrent: true };
      // _msgsExcludedFromBackup 마커도 제거 (이제 messages 있음)
      delete merged._msgsExcludedFromBackup;
      return merged;
    }
    return s;
  });
}

function _mergePearlsPreservingMedia(currentArr, snapArr) {
  const cur = Array.isArray(currentArr) ? currentArr : [];
  const snap = Array.isArray(snapArr) ? snapArr : [];
  const curById = new Map();
  cur.forEach(p => { if (p && p.id) curById.set(p.id, p); });
  return snap.map(s => {
    if (!s || !s.id) return s;
    const curMatch = curById.get(s.id);
    if (!curMatch) return s;
    const restored = { ...s };
    let changed = false;
    if (s._videoExcluded && (curMatch.video || curMatch.videoThumbnail)) {
      if (curMatch.video) restored.video = curMatch.video;
      if (curMatch.videoThumbnail) restored.videoThumbnail = curMatch.videoThumbnail;
      if (typeof curMatch.videoHasAudio !== 'undefined') restored.videoHasAudio = curMatch.videoHasAudio;
      delete restored._videoExcluded;
      restored._mediaRestoredFromCurrent = true;
      changed = true;
    }
    if (s._videoThumbExcluded && curMatch.videoThumbnail) {
      restored.videoThumbnail = curMatch.videoThumbnail;
      delete restored._videoThumbExcluded;
      restored._mediaRestoredFromCurrent = true;
      changed = true;
    }
    if (s._photoExcluded && curMatch.photo) {
      restored.photo = curMatch.photo;
      delete restored._photoExcluded;
      restored._mediaRestoredFromCurrent = true;
      changed = true;
    }
    return changed ? restored : s;
  });
}

// 사용자 요청 2026-04-29: 수동 클라우드 복원 — 백업 목록에서 선택해서 복원
async function restoreFromCloudBackup() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 클라우드 백업 검색 중...');
  try {
    const { ok, rows } = await _backupRowFetch(V4_MANUAL_BACKUP_USER_ID, 'data');
    if (!ok) { showToast('백업 검색 실패'); return; }
    if (rows.length === 0 || !rows[0].data || !Array.isArray(rows[0].data.snapshots) || rows[0].data.snapshots.length === 0) {
      showToast('클라우드 백업 없음 — "☁️ 클라우드 백업"으로 먼저 넣어둬');
      return;
    }
    const snapshots = rows[0].data.snapshots.slice().reverse();  // 최신 먼저
    const opts = snapshots.map((s, i) => {
      const dt = new Date(s.ts).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const noteLabel = s.note ? ` · ${s.note}` : '';
      return { label: `${dt}${noteLabel}`, value: String(i) };
    });
    const choice = await showOptionsModal({
      title: '☁️ 클라우드 복원',
      message: `${snapshots.length}개 백업 중 선택. 복원하면 현재 데이터는 사라져.`,
      options: opts
    });
    if (!choice) return;
    const idx = parseInt(choice, 10);
    const snap = snapshots[idx];
    if (!snap || !snap.data) { showToast('백업 데이터 X'); return; }
    const yes = await showConfirmModal({
      title: '복원 확정?',
      message: `${new Date(snap.ts).toLocaleString('ko-KR')}${snap.note ? '\n메모: ' + snap.note : ''}\n\n현재 데이터 사라지고 이 시점 상태로 돌아가.\n\n📦 안전 정책: 현재 데이터의 메시지/미디어는 자동 보존 (덮어쓰지 X).`,
      okLabel: '복원',
      cancelLabel: '취소'
    });
    if (!yes) return;
    // V4 fix (사용자 명시 2026-05-17 ultrathink): 현재 state 의 messages/media 캐시 → snap.data 와 merge.
    const _curArchive = state.chatArchive;
    const _curPearls = state.pearls;
    state = { ...DEFAULT_STATE, ...snap.data };
    state.chatArchive = _mergeArchivesPreservingMessages(_curArchive, state.chatArchive);
    state.pearls = _mergePearlsPreservingMedia(_curPearls, state.pearls);
    // V4 (사용자 명시 2026-05-20 ultrathink): Step 7 — schema v5 snapshot 의 chatMessages sub-array → 별도 테이블 재구축.
    //   schema v4 (옛, chatMessages 필드 X) = 옛 path 그대로 (in-memory archive.messages 가 _mergeArchivesPreservingMessages 로 보존).
    //   schema v5 = manualBackup 시점 chat_messages 통째 보존됨 → 휴지통 hard delete 됐어도 복원 가능.
    let _chatMessagesImportRes = null;
    if (snap._backupSchemaVersion === 'v5' && snap.chatMessages
        && typeof _importChatMessagesFromBackup === 'function') {
      try {
        _chatMessagesImportRes = await _importChatMessagesFromBackup(snap.chatMessages);
        console.log('[restoreFromCloudBackup] chat_messages import:', _chatMessagesImportRes);
      } catch (e) { console.warn('[restoreFromCloudBackup] chat_messages import fail:', e); }
    }
    // 알림 — 복원/누락 카운트.
    const _restoredMsgs = (state.chatArchive || []).filter(a => a && a._msgsRestoredFromCurrent).length;
    const _restoredMedia = (state.pearls || []).filter(p => p && p._mediaRestoredFromCurrent).length;
    if (_restoredMsgs > 0 || _restoredMedia > 0) {
      const _parts = [];
      if (_restoredMsgs > 0) _parts.push(`옛 챕터 messages ${_restoredMsgs}개`);
      if (_restoredMedia > 0) _parts.push(`진주 미디어 ${_restoredMedia}개`);
      console.log('[restoreFromCloudBackup] 자동 보존:', _parts.join(' / '));
    }
    await saveToCloudNow();
    const _chatMsgsLine = _chatMessagesImportRes && _chatMessagesImportRes.count > 0
      ? ` + 별도 테이블 ${_chatMessagesImportRes.count} 메시지 재구축`
      : '';
    showToast(`✦ 복원됨${_restoredMsgs + _restoredMedia > 0 ? ` (현재 데이터 ${_restoredMsgs + _restoredMedia}개 자동 보존)` : ''}${_chatMsgsLine} — 새로고침 중...`);
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    console.error('restoreFromCloudBackup:', e);
    showToast('복원 실패: ' + (e.message || e));
  }
}

// 자동 백업 목록 → modal로 보여주고 선택 복구
async function showAutoBackupList() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 자동 백업 검색 중...');
  try {
    const { ok, rows } = await _backupRowFetch(V4_AUTO_BACKUP_USER_ID, 'data');
    if (!ok) { showToast('백업 검색 실패'); return; }
    if (rows.length === 0 || !rows[0].data || !Array.isArray(rows[0].data.snapshots) || rows[0].data.snapshots.length === 0) {
      showToast('자동 백업 없음 (주 1회 + 업데이트 시 자동 생성됨)');
      return;
    }
    const snapshots = rows[0].data.snapshots.slice().reverse(); // 최신 먼저
    const opts = snapshots.map((s, i) => {
      const dt = new Date(s.ts).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const reasonLabel = s.reason === 'weekly' ? '🗓 주간' : s.reason.startsWith('update_') ? '🔄 업데이트 ' + s.reason.replace('update_', '') : s.reason;
      return { label: `${dt} · ${reasonLabel}`, value: String(i) };
    });
    const choice = await showOptionsModal({
      title: '🕰 자동 백업에서 복원',
      message: `최근 ${snapshots.length}개 중 선택. 복구하면 현재 데이터는 사라져.`,
      options: opts
    });
    if (!choice) return;
    const idx = parseInt(choice, 10);
    const snap = snapshots[idx];
    if (!snap || !snap.data) { showToast('snapshot 데이터 X'); return; }
    const yes = await showConfirmModal({
      title: '복구 확정?',
      message: `${new Date(snap.ts).toLocaleString('ko-KR')}\n\n현재 데이터 사라지고 이 시점 상태로 돌아가.\n\n📦 안전 정책: 자동백업은 chatArchive 메시지/진주 미디어 제외 (size 절약).\n현재 데이터에 있는 메시지/미디어는 자동 보존 — 덮어쓰지 X.`,
      okLabel: '복구',
      cancelLabel: '취소'
    });
    if (!yes) return;
    // V4 fix (사용자 명시 2026-05-17 ultrathink): merge — 현재 state 의 messages/media 보존.
    //   옛: state = { ...DEFAULT_STATE, ...snap.data } → snap 의 messages 없는 archive 가 메인 state 덮음 → saveToCloudNow 로 cloud 메인 row 도 영구 손실.
    //   새: merge helper 가 snap.data 의 chatArchive/pearls 와 현재 state 의 같은 id 항목 비교 — 현재가 더 full 이면 현재 우선.
    const _curArchive = state.chatArchive;
    const _curPearls = state.pearls;
    state = { ...DEFAULT_STATE, ...snap.data };
    state.chatArchive = _mergeArchivesPreservingMessages(_curArchive, state.chatArchive);
    state.pearls = _mergePearlsPreservingMedia(_curPearls, state.pearls);
    // V4 (사용자 명시 2026-05-20 ultrathink): Step 7 — schema v5 chatMessages sub-array → 별도 테이블 재구축 (autoBackup 엔 보통 X, manual 만 박음).
    if (snap._backupSchemaVersion === 'v5' && snap.chatMessages
        && typeof _importChatMessagesFromBackup === 'function') {
      try {
        const _imp = await _importChatMessagesFromBackup(snap.chatMessages);
        console.log('[showAutoBackupList] chat_messages import:', _imp);
      } catch (e) { console.warn('[showAutoBackupList] chat_messages import fail:', e); }
    }
    // 알림 — 복원/누락 카운트.
    const _restoredMsgs = (state.chatArchive || []).filter(a => a && a._msgsRestoredFromCurrent).length;
    const _restoredMedia = (state.pearls || []).filter(p => p && p._mediaRestoredFromCurrent).length;
    const _excludedMsgs = (state.chatArchive || []).filter(a => a && a._msgsExcludedFromBackup && !a._msgsRestoredFromCurrent).length;
    const _excludedMedia = (state.pearls || []).filter(p => p && (p._videoExcluded || p._photoExcluded) && !p._mediaRestoredFromCurrent).length;
    if (_restoredMsgs > 0 || _restoredMedia > 0 || _excludedMsgs > 0 || _excludedMedia > 0) {
      const _lines = [];
      if (_restoredMsgs > 0) _lines.push(`✓ 옛 챕터 messages ${_restoredMsgs}개 자동 보존됨 (현재 데이터 우선)`);
      if (_restoredMedia > 0) _lines.push(`✓ 진주 미디어 ${_restoredMedia}개 자동 보존됨`);
      if (_excludedMsgs > 0) _lines.push(`⚠️ 옛 챕터 messages ${_excludedMsgs}개 복원 불가 (현재 데이터에도 없음)`);
      if (_excludedMedia > 0) _lines.push(`⚠️ 진주 미디어 ${_excludedMedia}개 복원 불가`);
      setTimeout(() => alert('📦 복구 완료\n\n' + _lines.join('\n')), 100);
    }
    await saveToCloudNow();
    showToast(`✦ 복구됨${_restoredMsgs + _restoredMedia > 0 ? ` (현재 데이터 ${_restoredMsgs + _restoredMedia}개 자동 보존)` : ''} — 새로고침 중...`);
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error('showAutoBackupList:', e);
    showToast('복구 실패: ' + (e.message || e));
  }
}

