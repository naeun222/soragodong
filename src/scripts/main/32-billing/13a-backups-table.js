// V4 (사용자 보고 2026-05-22 ultrathink): backup snapshot 별 row 헬퍼.
//   soragodong_backups 테이블 (0034_backups_table.sql) — snapshot 별 row.
//   INSERT 1 row + DELETE rotation (KEEP_N 보존). 큰 JSONB rewrite 패턴 폐기.
//   SQL 미실행 사용자 = 404 fallback (옛 path 그대로 — 14-manual-backup.js / 13-auto-backup.js / 15-manual-restore.js 가 시도 후 분기).
//
// 흐름 (manualCloudBackup / autoCloudBackup):
//   1) _backupsTableLastHash(type) — 옛 백업과 동일 _stateHash 면 skip.
//   2) _backupsTableInsert(type, snap) — 새 row 1개 INSERT.
//   3) _backupsTableRotate(type, KEEP_N) — KEEP_N 초과 옛 row DELETE.
//
// 흐름 (restoreFromCloudBackup):
//   1) _backupsTableList(type, limit, 'meta') — meta 만 fetch (가벼움).
//   2) 사용자 선택 후 _backupsTableFetchOne(id) — full data + chat_messages.
//   3) (dual-read) 옛 soragodong_data 의 snapshots[] 도 함께 list — 마이그 도중 옛 백업 보임.

// ─────────────────────────────────────────────────────────────────────────────
// INSERT — 새 snapshot 1 row.
// ─────────────────────────────────────────────────────────────────────────────
//   snap = { ts, note, _stateHash, appVersion, _backupSchemaVersion, data, chatMessages? }
//   return:
//     { ok: true, id }       — 성공
//     { ok: true, duplicate: true }  — 409 unique constraint (state_hash+ts 중복) idempotent
//     { ok: false, fallback: true }  — 404 (테이블 X / SQL 미실행) — 호출부가 옛 path 시도
//     { ok: false, error }   — 기타 fail
async function _backupsTableInsert(backupType, snap) {
  if (!authUserId || typeof session === 'undefined' || !session?.access_token) {
    return { ok: false, error: 'no auth' };
  }
  if (!snap || !snap.data) return { ok: false, error: 'snap.data 없음' };
  const body = {
    auth_user_id: authUserId,
    backup_type: backupType,
    ts: snap.ts || new Date().toISOString(),
    note: snap.note || null,
    state_hash: snap._stateHash || null,
    app_version: snap.appVersion || null,
    schema_version: snap._backupSchemaVersion || 'v6',
    data: snap.data,
    chat_messages: snap.chatMessages && Object.keys(snap.chatMessages).length > 0 ? snap.chatMessages : null
  };
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/soragodong_backups`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    });
    if (resp.status === 404 || resp.status === 406) {
      // 테이블 X (사용자 SQL 미실행) — fallback signal.
      return { ok: false, fallback: true };
    }
    if (resp.status === 409) {
      // unique constraint (state_hash + ts 중복) — 자동 마이그 retry / 같은 시점 race. idempotent skip.
      return { ok: true, duplicate: true };
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('[backupsTable] INSERT fail:', resp.status, txt);
      return { ok: false, error: `${resp.status}: ${txt.slice(0, 200)}` };
    }
    const rows = await resp.json();
    return { ok: true, id: rows && rows[0] && rows[0].id };
  } catch (e) {
    console.warn('[backupsTable] INSERT throw:', e);
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST — type 별 ts desc.
// ─────────────────────────────────────────────────────────────────────────────
//   selectFields:
//     'meta' — id, ts, note, state_hash, app_version, schema_version (가벼움, restore chooser 용)
//     'full' — 위 + data + chat_messages
//   return: { ok, rows, fallback? }
async function _backupsTableList(backupType, limit, selectFields) {
  if (!authUserId || typeof session === 'undefined' || !session?.access_token) {
    return { ok: false, rows: [] };
  }
  const sel = selectFields === 'full'
    ? 'id,ts,note,state_hash,app_version,schema_version,data,chat_messages'
    : 'id,ts,note,state_hash,app_version,schema_version';
  const lim = Math.max(1, Math.min(limit || 10, 50));
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_backups?auth_user_id=eq.${authUserId}&backup_type=eq.${backupType}&select=${sel}&order=ts.desc&limit=${lim}`,
      { headers: { ...authHeaders() } }
    );
    if (resp.status === 404 || resp.status === 406) {
      return { ok: false, fallback: true, rows: [] };
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('[backupsTable] LIST fail:', resp.status, txt);
      return { ok: false, rows: [], error: `${resp.status}` };
    }
    const rows = await resp.json();
    return { ok: true, rows };
  } catch (e) {
    console.warn('[backupsTable] LIST throw:', e);
    return { ok: false, rows: [], error: (e && e.message) || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH ONE — restore 시 선택된 snapshot 의 full data.
// ─────────────────────────────────────────────────────────────────────────────
async function _backupsTableFetchOne(id) {
  if (!authUserId || typeof session === 'undefined' || !session?.access_token) return { ok: false };
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_backups?id=eq.${encodeURIComponent(id)}&select=id,backup_type,ts,note,state_hash,app_version,schema_version,data,chat_messages`,
      { headers: { ...authHeaders() } }
    );
    if (!resp.ok) return { ok: false };
    const rows = await resp.json();
    if (!rows.length) return { ok: false };
    return { ok: true, row: rows[0] };
  } catch (e) {
    console.warn('[backupsTable] FETCH ONE throw:', e);
    return { ok: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAST HASH — 옛 백업과 동일 _stateHash skip 가드.
// ─────────────────────────────────────────────────────────────────────────────
async function _backupsTableLastHash(backupType) {
  const { ok, rows } = await _backupsTableList(backupType, 1, 'meta');
  if (!ok || rows.length === 0) return null;
  return rows[0].state_hash || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTATE — KEEP_N 보존, 옛 row DELETE.
// ─────────────────────────────────────────────────────────────────────────────
//   1) offset=KEEP_N limit=1 으로 cutoff ts 가져옴.
//   2) ts <= cutoffTs 인 row 모두 DELETE.
//   race 작음 — 사용자 본인 + 30s rate limit. atomic 보장 X 라도 다음 backup 시 추가 cleanup.
async function _backupsTableRotate(backupType, keepN) {
  if (!authUserId || typeof session === 'undefined' || !session?.access_token) return { ok: false };
  const k = Math.max(1, keepN || 3);
  try {
    const listResp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_backups?auth_user_id=eq.${authUserId}&backup_type=eq.${backupType}&select=ts&order=ts.desc&offset=${k}&limit=1`,
      { headers: { ...authHeaders() } }
    );
    if (!listResp.ok) return { ok: false };
    const rows = await listResp.json();
    if (!rows.length) return { ok: true, deleted: 0 };  // KEEP_N 미만 — 삭제 X
    const cutoffTs = rows[0].ts;
    const delResp = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_backups?auth_user_id=eq.${authUserId}&backup_type=eq.${backupType}&ts=lte.${encodeURIComponent(cutoffTs)}`,
      { method: 'DELETE', headers: { ...authHeaders(), 'Prefer': 'return=minimal' } }
    );
    if (!delResp.ok) {
      const txt = await delResp.text();
      console.warn('[backupsTable] DELETE fail:', delResp.status, txt);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[backupsTable] ROTATE throw:', e);
    return { ok: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1회 자동 마이그 — 옛 soragodong_data 의 snapshots[] → 새 테이블 INSERT N.
// ─────────────────────────────────────────────────────────────────────────────
//   state._backupSchemaV6Migrated flag 로 1회 보장. unique constraint (state_hash+ts) 가 중복 차단 → idempotent.
//   _truncated snapshot (A' cleanup 으로 data 비움) 은 skip.
//   부분 fail = flag set X → 다음 진입 재시도.
async function _backupsTableAutoMigrate() {
  if (!authUserId) return;
  if (state._backupSchemaV6Migrated) return;
  if (window._e2eePendingRecovery) return;
  if (state.preferences && state.preferences.testerMode) return;

  const targets = [
    { userIdKey: V4_MANUAL_BACKUP_USER_ID, backupType: 'manual' },
    { userIdKey: V4_AUTO_BACKUP_USER_ID, backupType: 'auto' }
  ];
  let totalMigrated = 0;
  let totalSkipped = 0;
  let anyFatal = false;

  for (const { userIdKey, backupType } of targets) {
    try {
      const { ok, rows } = await _backupRowFetch(userIdKey, 'data');
      if (!ok || !rows.length) continue;
      const snaps = (rows[0].data && rows[0].data.snapshots) || [];
      if (!snaps.length) continue;

      let migrated = 0;
      let skipped = 0;
      for (const s of snaps) {
        // _truncated snapshot (A' cleanup) — 마이그 의미 X.
        if (s._truncated || !s.data) { skipped++; continue; }
        const ins = await _backupsTableInsert(backupType, s);
        if (ins.ok) {
          if (!ins.duplicate) migrated++;
        } else if (ins.fallback) {
          // 테이블 X — SQL 미실행. flag set X, 다음 진입 재시도.
          console.warn('[backupsTable] migrate fallback — SQL 미실행 의심 (' + backupType + ')');
          anyFatal = true;
          break;
        } else {
          // 기타 fail — 다른 snapshot 시도 계속.
          console.warn('[backupsTable] migrate insert fail:', s.ts, ins.error);
        }
      }
      console.log(`[backupsTable] ${backupType} 마이그 ${migrated} 적용 / ${skipped} skip (truncated 등) / 총 ${snaps.length}`);
      totalMigrated += migrated;
      totalSkipped += skipped;
      if (anyFatal) break;
    } catch (e) {
      console.warn('[backupsTable] migrate fatal:', backupType, e);
      anyFatal = true;
    }
  }

  if (!anyFatal) {
    state._backupSchemaV6Migrated = true;
    try { saveState(); } catch (e) { console.warn('[backupsTable] saveState:', e); }
    if (totalMigrated > 0) {
      console.log(`[backupsTable] 마이그 완료 — 총 ${totalMigrated} snapshots (skip ${totalSkipped}).`);
    }
  }
}

// init 시 자동 마이그 — 9초 후 (다른 init 작업 + 4AM extract 시작 후).
window.addEventListener('load', () => {
  setTimeout(() => {
    _backupsTableAutoMigrate().catch(e => console.warn('[backupsTable] auto-migrate async:', e));
  }, 9000);
});
