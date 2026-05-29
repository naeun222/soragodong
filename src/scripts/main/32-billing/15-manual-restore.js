// V4 (사용자 명시 2026-05-20 ultrathink): cron snap row → restorable snap 변환.
//   cron-snapshot.ts 가 row.data = { snap_at, main_updated_at, data: <main row raw> } 박음.
//   raw = gzip wrapper 또는 _encryptedBody E2EE 또는 평문. unpack + decrypt → 평문 state-like 객체.
//   E2EE 마스터키 미준비 시 ok:false — 사용자에게 비밀번호 복원 안내.
async function _convertCronSnapToRestorable(cronRow) {
  if (!cronRow || !cronRow.data) return { ok: false, reason: 'cron row 데이터 X' };
  const rawMainData = cronRow.data.data;
  if (!rawMainData) return { ok: false, reason: 'main row 데이터 X' };
  let unpacked;
  try {
    unpacked = await _unpackStateFromCloud(rawMainData);
  } catch (e) {
    return { ok: false, reason: 'gzip 압축 풀기 실패: ' + (e.message || e) };
  }
  if (unpacked && unpacked._encryptedBody && unpacked._encryptedBody._e2ee) {
    // E2EE 사용자 — 메인 흐름과 동일하게 마스터 키로 decrypt.
    if (!_e2eeMasterKey) {
      return { ok: false, reason: '비밀번호 복원 후 다시 시도 (E2EE 마스터키 미준비)' };
    }
    let decryptedJson;
    try {
      decryptedJson = await _e2eeDecrypt(unpacked._encryptedBody, _e2eeMasterKey);
    } catch (e) {
      return { ok: false, reason: '복호화 throw: ' + (e.message || e) };
    }
    if (decryptedJson === null) return { ok: false, reason: '복호화 실패 (마스터키 불일치)' };
    let decryptedBody;
    try { decryptedBody = JSON.parse(decryptedJson); }
    catch (e) { return { ok: false, reason: 'decrypted JSON parse 실패: ' + (e.message || e) }; }
    const { _encryptedBody, ...metaPart } = unpacked;
    return { ok: true, snap: { ts: cronRow.data.snap_at, data: { ...metaPart, ...decryptedBody } } };
  }
  // 평문 사용자.
  return { ok: true, snap: { ts: cronRow.data.snap_at, data: unpacked } };
}

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
// V4 (사용자 명시 2026-05-22 ultrathink): C step 4 — dual-read. 옛 snapshots[] + 새 soragodong_backups 테이블 합쳐서 chooser.
//   마이그 도중 옛 백업도 보임. 선택 시 _kind 분기 (old=옛, new=새) 후 snap 객체 통일.
async function restoreFromCloudBackup() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 클라우드 백업 검색 중...');
  try {
    // 1) 옛 path — _backupRowFetch(V4_MANUAL_BACKUP_USER_ID).data.snapshots[].
    let oldSnaps = [];
    try {
      const { ok, rows } = await _backupRowFetch(V4_MANUAL_BACKUP_USER_ID, 'data');
      if (ok && rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
        oldSnaps = rows[0].data.snapshots;
      }
    } catch (e) { console.warn('[restoreFromCloudBackup] old path fetch:', e); }

    // 2) 새 path — soragodong_backups 테이블 (meta only — 가벼움).
    let newRows = [];
    try {
      if (typeof _backupsTableList === 'function') {
        const r = await _backupsTableList('manual', MANUAL_BACKUP_KEEP_N, 'meta');
        if (r.ok) newRows = r.rows;
      }
    } catch (e) { console.warn('[restoreFromCloudBackup] new path list:', e); }

    // 3) 통합 — { _kind, ts, ... }.
    const items = [];
    oldSnaps.forEach(s => {
      if (!s || !s.ts) return;
      items.push({ _kind: 'old', _snap: s, ts: s.ts, note: s.note || '', truncated: !!s._truncated });
    });
    newRows.forEach(r => {
      if (!r || !r.ts) return;
      items.push({ _kind: 'new', _row: r, ts: r.ts, note: r.note || '', truncated: false });
    });
    if (items.length === 0) {
      showToast('클라우드 백업 없음 — "☁️ 클라우드 백업"으로 먼저 넣어둬');
      return;
    }
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    // V4 fix (사용자 보고 2026-05-22 ultrathink): _truncated snapshot (옛 cleanup 으로 ts/note 만 보존, data 비움) 라벨 노출 + 복원 시 가드.
    //   root cause: row size 7MB+ → Postgres statement_timeout. 사용자 컨펌으로 옛 snapshots 의 data 비움. ts/note 만 reference.
    const opts = items.map((it, i) => {
      const dt = new Date(it.ts).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const noteLabel = it.note ? ` · ${it.note}` : '';
      const truncatedLabel = it.truncated ? ' 🗑 (정리됨)' : '';
      return { label: `${dt}${noteLabel}${truncatedLabel}`, value: String(i) };
    });
    const choice = await showOptionsModal({
      title: '☁️ 클라우드 복원',
      message: `${items.length}개 백업 중 선택. 복원하면 현재 데이터는 사라져.`,
      options: opts
    });
    if (!choice) return;
    const idx = parseInt(choice, 10);
    const pick = items[idx];
    if (pick && pick.truncated) { showToast('🗑 이 시점 백업은 정리돼서 데이터 X — 다른 시점 골라줘'); return; }
    if (!pick) { showToast('백업 데이터 X'); return; }

    // 4) snap 객체 통일 — _kind 별 분기.
    let snap;
    if (pick._kind === 'old') {
      snap = pick._snap;
    } else {
      // 새 path — full row fetch.
      const fr = await _backupsTableFetchOne(pick._row.id);
      if (!fr.ok || !fr.row) { showToast('백업 데이터 fetch 실패'); return; }
      snap = {
        ts: fr.row.ts,
        note: fr.row.note,
        appVersion: fr.row.app_version,
        _stateHash: fr.row.state_hash,
        _backupSchemaVersion: fr.row.schema_version,
        data: fr.row.data,
        chatMessages: fr.row.chat_messages
      };
    }
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
    // V4 fix (사용자 명시 2026-05-30 — Disk IO): 백업 snap (cloud/cron/평문 전부) embedding 'f32b64:' 압축 → number[] 복원.
    if (typeof _restoreEmbeddingsInState === 'function') _restoreEmbeddingsInState(state);
    // V4 fix (사용자 명시 2026-05-26 ultrathink — restore 후 V7 strict 필드 보강): manual-restore + loadFromCloud 양쪽 동일 helper 사용.
    if (typeof _ensureV7Schema === 'function') _ensureV7Schema();
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
// V4 (사용자 명시 2026-05-20 ultrathink): 클라이언트 weekly/update auto + 서버 cron snap (새벽 4시, 30일치) 통합 리스트.
//   - client auto (옛 path) = `me_v4_auto_backup` row 안 snapshots[] (sanitized 평문 / messages-stripped).
//   - new auto (새 path) = soragodong_backups 테이블 backup_type='auto' (snapshot 별 row).
//   - cron snap = `cron_snap_YYYY-MM-DD` row 들 (functions/api/backup/cron-snapshot.ts). data = main row raw (E2EE blob 가능).
//   사용자 선택 시 _kind 에 따라 복원 흐름 분기.
// V4 (사용자 명시 2026-05-22 ultrathink): C step 4 — 새 path 통합 (옛 client snapshots[] 와 합쳐서 chooser).
async function showAutoBackupList() {
  if (!authUserId) { showToast('로그인 필요'); return; }
  showToast('🔍 자동 백업 검색 중...');
  try {
    // 1. 옛 path client auto backup (주간 + 업데이트 시 rolling 5개).
    let clientSnaps = [];
    try {
      const { ok, rows } = await _backupRowFetch(V4_AUTO_BACKUP_USER_ID, 'data');
      if (ok && rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
        clientSnaps = rows[0].data.snapshots;
      }
    } catch (e) { console.warn('[showAutoBackupList] client auto fetch:', e); }

    // 2. 새 path auto (soragodong_backups, snapshot 별 row).
    let newAutoRows = [];
    try {
      if (typeof _backupsTableList === 'function') {
        const r = await _backupsTableList('auto', AUTO_BACKUP_KEEP_N, 'meta');
        if (r.ok) newAutoRows = r.rows;
      }
    } catch (e) { console.warn('[showAutoBackupList] new path list:', e); }

    // 3. 서버 cron snap (새벽 4시, user_id LIKE 'cron_snap_%', 30일 retention).
    let cronRows = [];
    try {
      const url = `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}`
        + `&user_id=like.${encodeURIComponent('cron_snap_%')}&select=user_id,data&order=user_id.desc&limit=30`;
      const resp = await fetch(url, { headers: authHeaders() });
      if (resp.ok) cronRows = await resp.json();
    } catch (e) { console.warn('[showAutoBackupList] cron snap fetch:', e); }

    // 4. 통합 옵션 — ts 기준 최신 정렬.
    const items = [];
    clientSnaps.forEach(s => {
      if (!s || !s.ts) return;
      items.push({ _kind: 'client', _snap: s, ts: s.ts, reason: s.reason || '' });
    });
    newAutoRows.forEach(r => {
      if (!r || !r.ts) return;
      items.push({ _kind: 'newAuto', _row: r, ts: r.ts, reason: r.note || '' });
    });
    cronRows.forEach(r => {
      if (!r || !r.data) return;
      // user_id = 'cron_snap_YYYY-MM-DD'. snap_at = ISO (cron fire 시각).
      const ts = r.data.snap_at || (r.user_id.replace('cron_snap_', '') + 'T19:00:00Z');
      items.push({ _kind: 'cron', _row: r, ts, dateKey: r.user_id.replace('cron_snap_', '') });
    });
    if (items.length === 0) {
      showToast('자동 백업 없음 (새벽 4시 자동 + 주 1회 / 업데이트 시)');
      return;
    }
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    const opts = items.map((it, i) => {
      const dt = new Date(it.ts).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      let label;
      if (it._kind === 'cron') {
        label = `🌙 ${dt} · 새벽 4시 자동`;
      } else {
        const r = it.reason;
        const reasonLabel = r === 'weekly' ? '🗓 주간' : (r && r.startsWith('update_')) ? `🔄 업데이트 ${r.replace('update_', '')}` : (r || '자동');
        label = `${dt} · ${reasonLabel}`;
      }
      return { label, value: String(i) };
    });
    const choice = await showOptionsModal({
      title: '🕰 자동 백업에서 복원',
      message: `최근 ${items.length}개 중 선택 (새벽 4시 ${cronRows.length}개 + 앱 ${clientSnaps.length + newAutoRows.length}개). 복구하면 현재 데이터는 사라져.`,
      options: opts
    });
    if (!choice) return;
    const idx = parseInt(choice, 10);
    const pick = items[idx];
    if (!pick) { showToast('잘못된 선택'); return; }

    // 5. snap 객체 통일 — _kind 별 분기.
    //    cron = main row raw 블롭 → unpack + (E2EE) decrypt → state-like 객체.
    //    newAuto = 새 path full row fetch → snap-like 객체.
    //    client = 이미 평문 sanitized snap.data → 기존 흐름.
    let snap;  // { ts, data, _backupSchemaVersion?, chatMessages? } 형태로 통일.
    if (pick._kind === 'cron') {
      const _converted = await _convertCronSnapToRestorable(pick._row);
      if (!_converted.ok) {
        showToast('새벽 4시 백업 복원 실패: ' + _converted.reason);
        return;
      }
      snap = _converted.snap;
    } else if (pick._kind === 'newAuto') {
      const fr = await _backupsTableFetchOne(pick._row.id);
      if (!fr.ok || !fr.row) { showToast('새 백업 데이터 fetch 실패'); return; }
      snap = {
        ts: fr.row.ts,
        note: fr.row.note,
        appVersion: fr.row.app_version,
        _stateHash: fr.row.state_hash,
        _backupSchemaVersion: fr.row.schema_version,
        data: fr.row.data,
        chatMessages: fr.row.chat_messages
      };
    } else {
      snap = pick._snap;
    }
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
    // V4 fix (사용자 명시 2026-05-30 — Disk IO): 백업 snap (cloud/cron/평문 전부) embedding 'f32b64:' 압축 → number[] 복원.
    if (typeof _restoreEmbeddingsInState === 'function') _restoreEmbeddingsInState(state);
    // V4 fix (사용자 명시 2026-05-26 ultrathink — restore 후 V7 strict 필드 보강): manual-restore + loadFromCloud 양쪽 동일 helper 사용.
    if (typeof _ensureV7Schema === 'function') _ensureV7Schema();
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

