// 사용자 요청 2026-04-29: 수동 클라우드 백업 — 사용자가 명시적으로 적용하는 체크포인트 (rolling 10개)
// 사용자 명시 2026-05-01: opts.silentNote 지정 시 모달 skip — 헤더 sync-dot 빠른 체크포인트 (날짜·시각 자동) 용도.
let _lastManualBackupAt = 0;  // 사용자 요청 2026-05-02 cleanup B2: 30s rate-limit (연속 클릭 시 Supabase 부하 방지)
const _MANUAL_BACKUP_MIN_INTERVAL_MS = 30 * 1000;
async function manualCloudBackup(opts) {
  opts = opts || {};
  if (!authUserId) { showToast('로그인 필요'); return; }
  if (state.preferences && state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON — OFF 후 시도');
    return;
  }
  // 사용자 보고 2026-04-30 데이터 손실 P5 fix: pending recovery 중이면 빈 state snapshot 적용됨 차단.
  if (window._e2eePendingRecovery) {
    showToast('⚠️ 비밀번호 복원 후 다시 시도');
    return;
  }
  // 사용자 요청 2026-05-02 cleanup B2: 30s rate-limit (silentNote 자동 체크포인트는 통과 — 자동 trigger 의 일정 간격은 별도 보장).
  const _nowMs = Date.now();
  if (typeof opts.silentNote !== 'string' && _nowMs - _lastManualBackupAt < _MANUAL_BACKUP_MIN_INTERVAL_MS) {
    const wait = Math.ceil((_MANUAL_BACKUP_MIN_INTERVAL_MS - (_nowMs - _lastManualBackupAt)) / 1000);
    showToast(`잠깐 ${wait}초 후 다시 시도`);
    return;
  }
  _lastManualBackupAt = _nowMs;
  let note;
  if (typeof opts.silentNote === 'string') {
    note = opts.silentNote;
  } else {
    note = await showInputModal({
      title: '☁️ 클라우드 백업',
      message: '이 시점에 메모 남길래? (선택, 안 적어도 OK)\n나중에 복원할 때 어떤 시점인지 알아보기 쉬워.',
      placeholder: '예: 새 학기 시작 전',
      okLabel: '백업'
    });
    if (note === null) return;  // 취소
  }
  showToast('☁️ 클라우드 백업 중...');
  try {
    // 기존 snapshots 로드
    const { ok: _ok, rows } = await _backupRowFetch(V4_MANUAL_BACKUP_USER_ID, 'data,id');
    let snapshots = [];
    let existingId = null;
    if (_ok && rows.length > 0 && rows[0].data && Array.isArray(rows[0].data.snapshots)) {
      snapshots = rows[0].data.snapshots;
      existingId = rows[0].id;
    }
    // 사용자 명시 2026-05-01: 100+ 사용자 대비 효율 — 변경 없는 state 면 backup skip.
    // 1) same-hash skip — 직전 snapshot 의 _stateHash 와 동일하면 의미 없는 backup. 옛 snapshot rotate-out 도 차단.
    // 2) 30초 rate limit — 실수 더블 클릭 / 빠른 연타 차단.
    const stateHash = _computeStateHash(state);
    if (snapshots.length > 0) {
      const lastSnap = snapshots[snapshots.length - 1];
      if (stateHash && lastSnap._stateHash === stateHash) {
        showToast('✦ 변경 사항 없음 — 이미 백업됨');
        return;
      }
      if (lastSnap.ts) {
        const sinceMs = Date.now() - new Date(lastSnap.ts).getTime();
        if (sinceMs < 30 * 1000) {
          showToast('잠깐만 — 30초 후 다시 시도');
          return;
        }
      }
    }
    // V4 (사용자 명시 2026-05-20 ultrathink): Step 7 — schema v5.
    //   data 는 _cloudStateReplacer 사용 → _hasMessages 박힌 archive 의 messages 키 strip (chatMessages sub-array 가 처리).
    //   chatMessages = 별도 테이블 통째 export. 복원 시 _importChatMessagesFromBackup 이 별도 테이블 재구축.
    const sanitized = JSON.parse(JSON.stringify(state, _cloudStateReplacer));
    let _exportedChatMessages = {};
    try {
      if (typeof _exportChatMessagesForBackup === 'function') {
        _exportedChatMessages = await _exportChatMessagesForBackup();
      }
    } catch (e) { console.warn('[manualBackup] chat_messages export fail:', e); }
    snapshots.push({
      ts: new Date().toISOString(),
      note: (note || '').trim().slice(0, 80),
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      _stateHash: stateHash,
      _backupSchemaVersion: 'v5',
      data: sanitized,
      chatMessages: _exportedChatMessages
    });
    // rolling cap
    if (snapshots.length > MANUAL_BACKUP_KEEP_N) {
      snapshots = snapshots.slice(-MANUAL_BACKUP_KEEP_N);
    }
    await _backupRowUpsert(V4_MANUAL_BACKUP_USER_ID, { snapshots }, existingId);
    showToast(`☁️ 백업됨 (${snapshots.length}/${MANUAL_BACKUP_KEEP_N})`);
  } catch (e) {
    console.error('manualCloudBackup:', e);
    showToast('백업 실패: ' + (e.message || e));
  }
}

// 사용자 명시 2026-05-01: 헤더 sync-dot click → 빠른 체크포인트 (날짜·시각 자동 메모, 모달 X).
// 사용자 보고 2026-05-01: 진행 중 시각 피드백 (.checkpointing 띠) → 백업 끝나면 자동 제거.
async function quickCheckpointFromHeader() {
  // V4 (v8 묶음 18): 강제 저장 첫 사용 inline tip
  if (typeof _showInlineTip === 'function') _showInlineTip('syncDotClick');
  const pill = document.querySelector('.date-pill');
  const ts = new Date();
  const mm = String(ts.getMonth() + 1).padStart(2, '0');
  const dd = String(ts.getDate()).padStart(2, '0');
  const hh = String(ts.getHours()).padStart(2, '0');
  const mi = String(ts.getMinutes()).padStart(2, '0');
  const note = `${ts.getFullYear()}-${mm}-${dd} ${hh}:${mi}`;
  if (pill) pill.classList.add('checkpointing');
  try {
    await manualCloudBackup({ silentNote: note });
  } finally {
    if (pill) {
      pill.classList.remove('checkpointing');
      // hover/focus 잔재 띠 제거 — blur 로 keyboard focus 풀음
      try { pill.blur(); } catch {}
    }
  }
}

