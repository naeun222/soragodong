// V4 (사용자 명시 2026-05-20 ultrathink): Phase 1E Step 6 — 옛 일기 사진 dataURL → Storage 일괄 마이그.
//
//   배경: state.entries[*].photos[] (dataURL) + .photo (legacy single) 가 row JSONB 안 박힘.
//     누적 → 50-150MB row → 8MB hard cap. Phase 1E §1 의 비용/안정 모델.
//   flow:
//     1) dry-run — entries 순회 → dataURL 가진 slot count + bytes 추정.
//     2) apply — 한 entry 씩 upload + storageKey 추가 + dataURL slot 삭제 (null 자리 보존).
//        매 5 entry 마다 saveToCloud — 부분 손실 회피.
//     3) 모든 slot 이 migrated 면 entry.photos / entry.photo 자체 delete.
//
//   가드:
//     - _canUseDiaryStorage() false (master key 없음 / testerMode / guest) → 마이그 차단.
//     - window._diaryMigrationInProgress lock (중복 트리거 X).
//     - 이미 storageKey 있는 slot 은 skip (idempotent).
//
//   pearl Phase 1B 의 02-pearl-migration.js 패턴 그대로 — 일기 slot index 가 array 라 차이.

window._diaryMigrationInProgress = false;

function _diaryMigDryRun() {
  const eligible = [];  // { date, slots: [idx, ...], bytes }
  let totalBytes = 0;
  const entries = (state.entries || []);
  let touched = 0;
  for (const entry of entries) {
    if (!entry || !entry.date) continue;
    const slots = [];
    let entryBytes = 0;
    // entry.photos[] dataURL.
    if (Array.isArray(entry.photos)) {
      for (let i = 0; i < entry.photos.length && i < 3; i++) {
        const p = entry.photos[i];
        if (typeof p !== 'string' || !p.startsWith('data:')) continue;
        // 이미 같은 idx 에 storageKey 있으면 skip (idempotent).
        if (Array.isArray(entry.photoStorageKeys) && entry.photoStorageKeys[i]) continue;
        slots.push(i);
        entryBytes += Math.round((p.length - (p.indexOf(',') + 1)) * 0.75);
      }
    } else if (typeof entry.photo === 'string' && entry.photo.startsWith('data:')) {
      // legacy single — treat as slot 0.
      if (!(Array.isArray(entry.photoStorageKeys) && entry.photoStorageKeys[0])) {
        slots.push(0);
        entryBytes += Math.round((entry.photo.length - (entry.photo.indexOf(',') + 1)) * 0.75);
      }
    }
    if (slots.length > 0) {
      eligible.push({ date: entry.date, slots, bytes: entryBytes });
      totalBytes += entryBytes;
    }
    touched++;
  }
  return { totalEntries: touched, eligible, totalBytes };
}

// 단일 entry 의 명시된 slots 마이그 — upload + storageKey 추가 + dataURL slot 삭제.
//   부분 실패 시 fail kind 만 failed 에 push. 나머지 slot 은 계속 진행.
async function _migrateOneDiaryEntry(entry, slotsToMig) {
  const failed = [];
  if (!Array.isArray(entry.photoStorageKeys)) entry.photoStorageKeys = [];
  for (const idx of slotsToMig) {
    let dataUrl;
    if (Array.isArray(entry.photos) && typeof entry.photos[idx] === 'string' && entry.photos[idx].startsWith('data:')) {
      dataUrl = entry.photos[idx];
    } else if (idx === 0 && typeof entry.photo === 'string' && entry.photo.startsWith('data:')) {
      dataUrl = entry.photo;
    }
    if (!dataUrl) continue;
    try {
      const conv = _dataUrlToBytes(dataUrl);
      if (!conv) throw new Error('dataURL 파싱 실패');
      const seq = _diaryNextPhotoSeq(entry);
      const result = await _uploadDiaryPhoto(entry.date, seq, conv.bytes, _e2eeMasterKey);
      // photoStorageKeys 슬롯 — idx 까지 pad 후 set.
      while (entry.photoStorageKeys.length <= idx) entry.photoStorageKeys.push(null);
      entry.photoStorageKeys[idx] = result.path;
      // dataURL slot 삭제 — null 자리 보존 (entry.photos 정렬은 storageKeys 와 같이 유지).
      if (Array.isArray(entry.photos) && typeof entry.photos[idx] === 'string') {
        entry.photos[idx] = null;
      }
      if (idx === 0 && typeof entry.photo === 'string' && entry.photo.startsWith('data:')) {
        delete entry.photo;
      }
    } catch (e) {
      failed.push({ idx, reason: (e && e.message) || String(e) });
    }
  }
  // entry.photos 가 모두 null/non-data 면 정리. 한 개라도 살아있으면 array 유지.
  if (Array.isArray(entry.photos)) {
    const anyReal = entry.photos.some(p => typeof p === 'string' && p);
    if (!anyReal) {
      delete entry.photos;
    } else {
      // first 비-null 을 entry.photo (legacy mirror) 로.
      const first = entry.photos.find(p => typeof p === 'string' && p);
      if (first) entry.photo = first;
      else if (entry.photo) delete entry.photo;
    }
  }
  return failed;
}

// 일괄 apply.
async function _diaryMigApply(eligible, progressFn) {
  const migrated = [];
  const failed = [];
  const skipped = [];
  if (!eligible || !eligible.length) return { migrated, failed, skipped };
  const total = eligible.length;
  for (let i = 0; i < total; i++) {
    const item = eligible[i];
    const entry = (state.entries || []).find(e => e.date === item.date);
    if (!entry) { skipped.push(item.date); continue; }
    if (typeof progressFn === 'function') progressFn(i, total, entry.date);
    const failsForThis = await _migrateOneDiaryEntry(entry, item.slots);
    if (failsForThis.length === 0) {
      migrated.push(entry.date);
    } else {
      for (const f of failsForThis) failed.push({ date: entry.date, idx: f.idx, reason: f.reason });
      if (failsForThis.length < item.slots.length) migrated.push(entry.date);  // 일부 성공도 migrated.
    }
    // 매 5 entry 마다 saveToCloud — 부분 손실 회피.
    if ((i + 1) % 5 === 0) {
      try {
        if (typeof saveState === 'function') saveState();
        if (typeof saveToCloudNow === 'function') await saveToCloudNow();
      } catch (e) { console.warn('[diaryMigApply] partial save fail:', e); }
    }
  }
  try {
    if (typeof saveState === 'function') saveState();
    if (typeof saveToCloudNow === 'function') await saveToCloudNow();
  } catch (e) { console.warn('[diaryMigApply] final save fail:', e); }
  if (typeof progressFn === 'function') progressFn(total, total, null);
  return { migrated, failed, skipped };
}

// V4 (Phase 1E Step 6): 자동 백그라운드 마이그 — load 5초 후 silent.
//   master key 확보 polling (5초 x 60회 = 5분 한도) → eligible > 0 면 silent 시작.
//   시작 + 완료 toast 한 번씩. 부분 실패 시 다음 세션 재시도 (auto-start 매 세션 1회).
async function _diaryMigAutoStart() {
  // master key + 가드 polling.
  for (let i = 0; i < 60; i++) {
    if (typeof _canUseDiaryStorage === 'function' && _canUseDiaryStorage()) break;
    await new Promise(r => setTimeout(r, 5000));
  }
  if (typeof _canUseDiaryStorage !== 'function' || !_canUseDiaryStorage()) return;
  if (window._diaryMigrationInProgress) return;
  // pearl 마이그 진행 중이면 양보 — 같은 시간 동시 run 피함 (둘 다 Storage POST 라 throttle 회피).
  if (window._pearlMigrationInProgress) {
    // 5분 후 재시도.
    await new Promise(r => setTimeout(r, 5 * 60 * 1000));
    if (window._pearlMigrationInProgress) return;
  }

  const dry = _diaryMigDryRun();
  if (!dry.eligible || dry.eligible.length === 0) return;  // 이미 다 마이그됨 — silent skip.

  const mbStr = (dry.totalBytes / 1e6).toFixed(1);
  if (typeof showToast === 'function') {
    showToast(`📔 옛 일기 사진 ${dry.eligible.length}일치 (~${mbStr}MB) 안전한 곳으로 옮기는 중...`);
  }

  window._diaryMigrationInProgress = true;
  try {
    const result = await _diaryMigApply(dry.eligible, null);
    if (typeof showToast === 'function') {
      if (result.failed.length === 0) {
        showToast(`✦ 일기 사진 ${result.migrated.length}일치 이동 완료`);
      } else {
        showToast(`일기 사진 ${result.migrated.length}일 완료 · ${result.failed.length} 실패 — 다음 세션 재시도`);
      }
    }
    // refresh — 도서관/타임라인 etc.
    if (typeof renderLensTimeline === 'function') renderLensTimeline();
    if (typeof renderCalendarGrid === 'function') renderCalendarGrid();
    if (typeof renderBeach === 'function') renderBeach();
  } catch (e) {
    console.warn('[diaryMigAutoStart] fatal:', e);
  } finally {
    window._diaryMigrationInProgress = false;
  }
}

// 앱 init 후 자동 시작 — load 이벤트 + 5초 idle 후.
//   pearl 마이그 와 같은 패턴 — 한 세션 1회 호출. dry-run 으로 이미 끝난 사용자 silent skip.
window.addEventListener('load', () => {
  setTimeout(() => {
    _diaryMigAutoStart().catch(e => console.warn('[diaryMigAutoStart] async:', e));
  }, 7000);  // pearl (5초) 이후 ~2초 늦게 — Storage POST 동시 분산.
});
