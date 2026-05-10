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
      message: `${new Date(snap.ts).toLocaleString('ko-KR')}${snap.note ? '\n메모: ' + snap.note : ''}\n\n현재 데이터 사라지고 이 시점 상태로 돌아가.`,
      okLabel: '복원',
      cancelLabel: '취소'
    });
    if (!yes) return;
    state = { ...DEFAULT_STATE, ...snap.data };
    await saveToCloudNow();
    showToast('✦ 복원됨 — 새로고침 중...');
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
      message: `${new Date(snap.ts).toLocaleString('ko-KR')}\n\n현재 데이터 사라지고 이 시점 상태로 돌아가.`,
      okLabel: '복구',
      cancelLabel: '취소'
    });
    if (!yes) return;
    state = { ...DEFAULT_STATE, ...snap.data };
    // 사용자 보고 2026-05-10 (audit-billing 노랑): autoBackup snapshot = chatArchive messages 제외 + 큰 진주 dataURL 제외 (size fix).
    //   복원 후 도서관 일기·대화 chip 의 옛 챕터 클릭 시 messages 빈 화면. 사용자 알림 + main row sync 권장.
    const _excludedMsgs = (state.chatArchive || []).filter(a => a && a._msgsExcludedFromBackup).length;
    const _excludedMedia = (state.pearls || []).filter(p => p && (p._videoExcluded || p._photoExcluded)).length;
    if (_excludedMsgs > 0 || _excludedMedia > 0) {
      const _parts = [];
      if (_excludedMsgs > 0) _parts.push(`옛 챕터 messages ${_excludedMsgs}개`);
      if (_excludedMedia > 0) _parts.push(`진주 미디어 ${_excludedMedia}개`);
      setTimeout(() => alert(`📦 복원 완료 — 단 ${_parts.join(' / ')} 는 backup 미포함 (size 절약).\n\nmain cloud row 가 옛 데이터 보유 중이면 복원됨. 옛 데이터도 같이 사라졌으면 영구 손실.`), 100);
    }
    await saveToCloudNow();
    showToast('✦ 복구됨 — 새로고침 중...');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error('showAutoBackupList:', e);
    showToast('복구 실패: ' + (e.message || e));
  }
}

