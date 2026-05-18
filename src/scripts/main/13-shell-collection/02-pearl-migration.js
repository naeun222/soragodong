// V4 (사용자 명시 2026-05-18 ultrathink): Phase 1B — 옛 진주 미디어 일괄 Storage 마이그 tool.
//
//   배경: Phase 1A (Storage 인프라) + 1D (render 양쪽 path) + 1C (캡처 신 path) 깔린 후,
//     옛 진주 (state.pearls 안 dataURL 가진) 들을 일괄 Storage 로 backfill.
//   flow:
//     1) dry-run — state.pearls 순회 → dataURL 가진 진주 count + bytes 추정 → 모달 표시.
//     2) apply — 순차 (1 진주씩) upload + storageKey 추가 + 옛 field 삭제. 매 5 진주마다 saveToCloud.
//     3) partial fail list — 재시도 button.
//
//   가드:
//     - _canUsePearlStorage() false (master key 없음 / testerMode / guest) → button disabled.
//     - window._pearlMigrationInProgress lock (중복 트리거 차단).
//     - 이미 storageKey 있는 진주 skip (idempotent).
//
//   dryRun 결과 shape:
//     { totalPearls, eligible: [{pearlId, kinds: ['photo','video',...], bytes}], totalBytes }
//
//   apply 결과 shape:
//     { migrated: [pearlId], failed: [{pearlId, kind, reason}], skipped: [pearlId] }

window._pearlMigrationInProgress = false;

function _pearlMigDryRun() {
  const eligible = [];
  let totalBytes = 0;
  const pearls = (state.pearls || []);
  for (const pearl of pearls) {
    if (!pearl || !pearl.id) continue;
    const kinds = [];
    let pearlBytes = 0;
    if (typeof pearl.photo === 'string' && pearl.photo.startsWith('data:')) {
      kinds.push('photo');
      pearlBytes += Math.round((pearl.photo.length - (pearl.photo.indexOf(',') + 1)) * 0.75);
    }
    if (typeof pearl.video === 'string' && pearl.video.startsWith('data:')) {
      kinds.push('video');
      pearlBytes += Math.round((pearl.video.length - (pearl.video.indexOf(',') + 1)) * 0.75);
    }
    if (typeof pearl.videoThumbnail === 'string' && pearl.videoThumbnail.startsWith('data:')) {
      kinds.push('videoThumbnail');
      pearlBytes += Math.round((pearl.videoThumbnail.length - (pearl.videoThumbnail.indexOf(',') + 1)) * 0.75);
    }
    if (kinds.length > 0) {
      eligible.push({ pearlId: pearl.id, kinds, bytes: pearlBytes });
      totalBytes += pearlBytes;
    }
  }
  return { totalPearls: pearls.length, eligible, totalBytes };
}

// 단일 진주의 모든 옛 dataURL kind 마이그 — upload + storageKey 추가 + 옛 field 삭제.
//   실패 kind 는 failed array 에 추가, 나머지 kind 는 계속 진행.
async function _migrateOnePearl(pearl, kindsToMig) {
  const failed = [];
  for (const kind of kindsToMig) {
    const dataUrl = (kind === 'photo') ? pearl.photo
                  : (kind === 'video') ? pearl.video
                  : (kind === 'videoThumbnail') ? pearl.videoThumbnail
                  : null;
    if (!dataUrl) continue;
    try {
      const conv = _dataUrlToBytes(dataUrl);
      if (!conv) throw new Error('dataURL 파싱 실패');
      const result = await _uploadPearlMedia(pearl.id, kind, conv.bytes, _e2eeMasterKey);
      pearl.storageKey = pearl.storageKey || {};
      pearl.storageKey[kind] = result.path;
      // 옛 field 삭제 — main row 가벼워짐.
      if (kind === 'photo') delete pearl.photo;
      else if (kind === 'video') delete pearl.video;
      else if (kind === 'videoThumbnail') delete pearl.videoThumbnail;
    } catch (e) {
      failed.push({ kind, reason: (e && e.message) || String(e) });
    }
  }
  return failed;
}

// 일괄 apply — dryRun.eligible 순회. 매 진주마다 _migrateOnePearl.
//   progressFn(done, total, currentPearlId) — 매 진주마다 호출.
async function _pearlMigApply(eligible, progressFn) {
  const migrated = [];
  const failed = [];
  const skipped = [];
  if (!eligible || !eligible.length) return { migrated, failed, skipped };
  const total = eligible.length;
  for (let i = 0; i < total; i++) {
    const item = eligible[i];
    const pearl = (state.pearls || []).find(p => p.id === item.pearlId);
    if (!pearl) { skipped.push(item.pearlId); continue; }
    if (typeof progressFn === 'function') progressFn(i, total, pearl.id);
    const failsForThis = await _migrateOnePearl(pearl, item.kinds);
    if (failsForThis.length === 0) {
      migrated.push(pearl.id);
    } else {
      for (const f of failsForThis) failed.push({ pearlId: pearl.id, kind: f.kind, reason: f.reason });
      if (failsForThis.length < item.kinds.length) migrated.push(pearl.id);  // 일부 kind 성공도 migrated 카운트
    }
    // 매 5 진주마다 saveToCloud — 부분 손실 회피.
    if ((i + 1) % 5 === 0) {
      try {
        saveState();
        if (typeof saveToCloudNow === 'function') await saveToCloudNow();
      } catch (e) { console.warn('[pearlMigApply] partial save fail:', e); }
    }
  }
  // 마지막 saveToCloud.
  try {
    saveState();
    if (typeof saveToCloudNow === 'function') await saveToCloudNow();
  } catch (e) { console.warn('[pearlMigApply] final save fail:', e); }
  if (typeof progressFn === 'function') progressFn(total, total, null);
  return { migrated, failed, skipped };
}

// Settings 에서 호출 — 모달 띄움 → dry-run → 사용자 OK → apply → 결과 모달.
async function openPearlMediaMigrationModal() {
  if (window._pearlMigrationInProgress) {
    showToast('이미 마이그 진행 중');
    return;
  }
  if (!_canUsePearlStorage()) {
    let reason = '알 수 없음';
    if (typeof _e2eeMasterKey === 'undefined' || !_e2eeMasterKey) reason = 'E2EE 비밀번호 미설정 또는 복원 필요';
    else if (state && state.preferences && state.preferences.testerMode) reason = '테스터 모드 활성 (cloud sync 차단)';
    else if (state && state.isGuest) reason = '게스트 모드 (cloud sync 차단)';
    else if (typeof authUserId === 'undefined' || !authUserId) reason = '로그인 필요';
    await showConfirmModal({
      title: '🐚 진주 미디어 이동',
      message: `이동할 수 없어 — ${reason}.\n\nE2EE 비밀번호 활성화 후 다시 시도해줘.`,
      okLabel: '확인',
      cancelLabel: ''
    });
    return;
  }

  // dry-run.
  const dry = _pearlMigDryRun();
  if (dry.eligible.length === 0) {
    await showConfirmModal({
      title: '🐚 진주 미디어 이동',
      message: '옮길 사진/영상이 없어. 진주 미디어 모두 이미 Storage 에 있거나 미디어 없는 진주만 있어.',
      okLabel: '확인',
      cancelLabel: ''
    });
    return;
  }

  const mbStr = (dry.totalBytes / 1e6).toFixed(1);
  const fileCount = dry.eligible.reduce((sum, e) => sum + e.kinds.length, 0);
  const ok = await showConfirmModal({
    title: '🐚 진주 미디어 Storage 로 이동',
    message: `옛 진주 ${dry.eligible.length}개 (사진/영상 ${fileCount}개, ~${mbStr}MB) 이동.\n\n동기화 안정성 ↑. 한 번 시작하면 끝까지 진행 — 잠시 동안 다른 작업 X.\n\n진행할래?`,
    okLabel: '진행',
    cancelLabel: '취소'
  });
  if (!ok) return;

  // apply.
  window._pearlMigrationInProgress = true;
  let progressModal = null;
  try {
    progressModal = _pearlMigShowProgressModal(dry.eligible.length);
    const result = await _pearlMigApply(dry.eligible, (done, total, currentId) => {
      _pearlMigUpdateProgress(progressModal, done, total, currentId);
    });
    _pearlMigCloseProgressModal(progressModal);
    // 결과 모달.
    if (result.failed.length === 0) {
      await showConfirmModal({
        title: '✦ 완료',
        message: `진주 ${result.migrated.length}개 이동 완료. main row 가 가벼워져 동기화 안정성이 좋아졌어.`,
        okLabel: '확인',
        cancelLabel: ''
      });
    } else {
      const failedSummary = result.failed.slice(0, 5).map(f => `· ${f.pearlId.slice(-6)} (${f.kind}): ${f.reason.slice(0, 60)}`).join('\n');
      const more = result.failed.length > 5 ? `\n... 외 ${result.failed.length - 5}개` : '';
      const retry = await showConfirmModal({
        title: '⚠️ 일부 실패',
        message: `완료: ${result.migrated.length}개\n실패: ${result.failed.length}개\n\n${failedSummary}${more}\n\n다시 시도할까?`,
        okLabel: '재시도',
        cancelLabel: '나중에'
      });
      if (retry) {
        // 실패한 진주 → 다시 dry-run + apply.
        window._pearlMigrationInProgress = false;
        return openPearlMediaMigrationModal();
      }
    }
    // refresh — render 갱신.
    if (typeof renderLensPearls === 'function') renderLensPearls();
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
  } catch (e) {
    console.error('[pearlMigApply] fatal:', e);
    if (progressModal) _pearlMigCloseProgressModal(progressModal);
    await showConfirmModal({
      title: '⚠️ 오류',
      message: '마이그 중 오류 발생: ' + ((e && e.message) || '') + '\n\n일부 진주만 이동됐을 수 있어. 다시 시도하면 남은 것만 처리됨.',
      okLabel: '확인',
      cancelLabel: ''
    });
  } finally {
    window._pearlMigrationInProgress = false;
  }
}

// 진행률 모달 — 단순 progress bar + 텍스트.
function _pearlMigShowProgressModal(total) {
  const overlay = document.createElement('div');
  overlay.id = 'pearlMigProgressOverlay';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10002; display:flex; align-items:center; justify-content:center; padding:20px;';
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface,#1a1828); border:1px solid var(--border); border-radius:14px; max-width:380px; width:100%; padding:22px; box-shadow:0 16px 48px rgba(0,0,0,0.5); color:var(--text); text-align:center;';
  card.innerHTML = `
    <div style="font-size:14px; font-weight:600; color:var(--accent); margin-bottom:14px;">🐚 진주 미디어 이동 중...</div>
    <div id="pearlMigProgressText" style="font-size:12.5px; color:var(--text-soft); margin-bottom:12px; line-height:1.6;">0 / ${total}</div>
    <div style="height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
      <div id="pearlMigProgressBar" style="height:100%; width:0%; background:var(--accent); transition:width 0.3s ease;"></div>
    </div>
    <div style="font-size:11px; color:var(--text-soft); margin-top:14px; opacity:0.7;">한 진주씩 안전하게 이동. 잠시 기다려줘.</div>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return overlay;
}

function _pearlMigUpdateProgress(overlay, done, total, currentId) {
  if (!overlay) return;
  const text = overlay.querySelector('#pearlMigProgressText');
  const bar = overlay.querySelector('#pearlMigProgressBar');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  if (text) text.textContent = `${done} / ${total} (${pct}%)` + (currentId ? ` — ${currentId.slice(-6)}` : '');
  if (bar) bar.style.width = pct + '%';
}

function _pearlMigCloseProgressModal(overlay) {
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

// V4 (사용자 명시 2026-05-18 ultrathink): 자동 백그라운드 마이그.
//   master key 확보 대기 (5초 polling, 5분 한도) → eligible > 0 면 silent 시작.
//   시작 + 완료 toast 한 번씩. 부분 실패 시 Settings 안내. lock flag 로 중복 X.
//   매 세션 1회 호출 — idempotent (이미 마이그된 진주 dry-run 에서 자동 skip).
async function _pearlMigAutoStart() {
  // master key + 가드 polling — init / E2EE 복원 끝나기 기다림.
  for (let i = 0; i < 60; i++) {
    if (_canUsePearlStorage()) break;
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!_canUsePearlStorage()) return;  // 5분 지나도 master key 없음 → 사용자 액션 필요 (Settings button).
  if (window._pearlMigrationInProgress) return;

  // dry-run.
  const dry = _pearlMigDryRun();
  if (!dry.eligible || dry.eligible.length === 0) return;  // 이미 다 마이그됨 — silent skip.

  const mbStr = (dry.totalBytes / 1e6).toFixed(1);
  if (typeof showToast === 'function') {
    showToast(`🐚 옛 진주 ${dry.eligible.length}개 (~${mbStr}MB) 안전한 곳으로 옮기는 중...`);
  }

  window._pearlMigrationInProgress = true;
  try {
    const result = await _pearlMigApply(dry.eligible, null);  // silent (progress modal X).
    if (typeof showToast === 'function') {
      if (result.failed.length === 0) {
        showToast(`✦ 진주 ${result.migrated.length}개 안전한 곳으로 이동 완료`);
      } else {
        showToast(`진주 ${result.migrated.length}개 완료 · ${result.failed.length}개 실패 — Settings → 🐚 에서 재시도`);
      }
    }
    if (typeof renderLensPearls === 'function') renderLensPearls();
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
  } catch (e) {
    console.warn('[pearlMigAutoStart] fatal:', e);
  } finally {
    window._pearlMigrationInProgress = false;
  }
}

// 앱 init 후 자동 시작 — load 이벤트 + 5초 idle 후 (master key 대기 polling 내장).
//   load 이벤트는 PWA 환경에서도 fire (페이지 onload). 한 세션 1회.
window.addEventListener('load', () => {
  setTimeout(() => {
    _pearlMigAutoStart().catch(e => console.warn('[pearlMigAutoStart] async:', e));
  }, 5000);
});

// Settings 상태 box 갱신 — Settings 열 때 호출.
function refreshPearlMigrationStatus() {
  const el = document.getElementById('pearlMigrationStatus');
  if (!el) return;
  if (!_canUsePearlStorage()) {
    let reason = '비활성';
    if (typeof _e2eeMasterKey === 'undefined' || !_e2eeMasterKey) reason = 'E2EE 비밀번호 활성화 필요';
    else if (state && state.preferences && state.preferences.testerMode) reason = '테스터 모드 (cloud sync X)';
    else if (state && state.isGuest) reason = '게스트 (cloud sync X)';
    el.innerHTML = `<div style="color:var(--text-soft);">⏸ ${reason}</div>`;
    const btn = document.getElementById('pearlMigBtn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    return;
  }
  const dry = _pearlMigDryRun();
  if (dry.eligible.length === 0) {
    el.innerHTML = `<div style="color:var(--text-soft);">✦ 모든 진주 미디어 이미 Storage 에 있어.</div>`;
    const btn = document.getElementById('pearlMigBtn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  } else {
    const mbStr = (dry.totalBytes / 1e6).toFixed(1);
    el.innerHTML = `<div>옛 진주 <b>${dry.eligible.length}개</b> (~${mbStr}MB) 이동 가능</div>`;
    const btn = document.getElementById('pearlMigBtn');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}
