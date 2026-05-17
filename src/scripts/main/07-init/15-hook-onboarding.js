// Hook 온보딩 시간 prompt — _hook-system-spec.md Section 19.1
// 트리거: app session 2회째 (가입 후 앱 껐다 다시 켤 때).
//   state.preferences._hookInitCount 증가 (init 호출마다). 2회째에 모달 1회 노출.
//   _hookOnboardingShown=true 박힘 → 다시 안 뜸.
// "응, 그 시간에 줘" → hookNotificationTime + hookFrequency='daily' 저장.
// "필요 없어" → hookFrequency='off' 영구. 사용자가 마음 바뀌면 설정에서 다시 켜야 함.

function _hookOnbBumpInitCount() {
  if (!state) return;
  state.preferences = state.preferences || {};
  const cur = state.preferences._hookInitCount || 0;
  if (cur < 10) {
    state.preferences._hookInitCount = cur + 1;
    try { saveState(); } catch {}
  }
}

function _hookOnbShouldShow() {
  if (!state || !state.preferences) return false;
  if (state.preferences._hookOnboardingShown) return false;
  // hookFrequency 가 명시 set 됐으면 (사용자가 이미 선택) skip.
  // default 'daily' 인데 _hookOnboardingShown 이 false 면 첫 노출 후보.
  if (state.preferences.hookFrequency === 'off') return false;  // 이미 끔
  if ((state.preferences._hookInitCount || 0) < 2) return false;
  // 게스트 / 튜토리얼 모드 / cold start 진행 중 = skip
  if (state.isGuest) return false;
  if (window._onbTutorialMode) return false;
  if (window._initialDataLoading) return false;
  // V4 fix (사용자 보고 2026-05-18 ultrathink): userName 가드 완화 — 모달 line 55 fallback ('있잖아 ✦') 이미 존재.
  //   옛 의도: userName 채우는 별도 prompt 가 잡음. 그러나 카카오 OAuth 는 onboarding 모달 우회 → state.userName='' 영구 → 푸시 prompt 영구 skip.
  //   매핑 fix (14-deeplink) 는 best-effort 호명 시도. 매핑 fail 케이스도 푸시 prompt 자체는 떠야 정상.
  return true;
}

function _hookOnbNameCall(userName) {
  if (!userName) return '';
  const last = userName[userName.length - 1];
  const code = last ? last.charCodeAt(0) : 0;
  const hasJongseong = (code >= 0xAC00 && code <= 0xD7A3)
    ? ((code - 0xAC00) % 28) !== 0
    : false;
  return hasJongseong ? `${userName}아` : `${userName}야`;
}

function maybeShowHookOnboarding() {
  if (!_hookOnbShouldShow()) return;
  showHookOnboardingModal();
}

function showHookOnboardingModal() {
  // 중복 방지
  if (document.getElementById('hookOnbOverlay')) return;
  const userName = (state.userName || '').trim();
  const nameCall = _hookOnbNameCall(userName);
  const header = userName ? `있잖아 ${nameCall} ✦` : '있잖아 ✦';

  const overlay = document.createElement('div');
  overlay.id = 'hookOnbOverlay';
  overlay.className = 'hook-onb-overlay';
  overlay.innerHTML = `
    <div class="hook-onb-card" onclick="event.stopPropagation()">
      <div class="hook-onb-header">${escapeHtml(header)}</div>
      <div class="hook-onb-q">매일 한 번씩 뭐 물어봐도 돼?</div>
      <div class="hook-onb-q-sub">몇 시쯤이 좋아?</div>
      <div class="hook-onb-times" id="hookOnbTimes">
        <button class="hook-onb-time-btn" type="button" data-hour="8"  onclick="_hookOnbPickTime(8)">아침 (8시)</button>
        <button class="hook-onb-time-btn" type="button" data-hour="12" onclick="_hookOnbPickTime(12)">점심 (12시)</button>
        <button class="hook-onb-time-btn is-default" type="button" data-hour="21" onclick="_hookOnbPickTime(21)">저녁 (21시)</button>
        <button class="hook-onb-time-btn" type="button" data-hour="23" onclick="_hookOnbPickTime(23)">자기 전 (23시)</button>
        <button class="hook-onb-time-btn" type="button" onclick="_hookOnbPickCustom()">직접 정하기</button>
      </div>
      <div class="hook-onb-actions">
        <button class="hook-onb-confirm" type="button" onclick="_hookOnbConfirm()">응, 그 시간에 줘</button>
        <button class="hook-onb-decline" type="button" onclick="_hookOnbDecline()">필요 없어</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // default 21시 선택 시각화
  window._hookOnbPickedHour = 21;
  setTimeout(() => overlay.classList.add('show'), 30);
}

function _hookOnbPickTime(hour) {
  window._hookOnbPickedHour = hour;
  const btns = document.querySelectorAll('#hookOnbTimes .hook-onb-time-btn');
  btns.forEach(b => {
    const h = b.getAttribute('data-hour');
    b.classList.toggle('is-default', h !== null && Number(h) === hour);
  });
}

async function _hookOnbPickCustom() {
  if (typeof showInputModal !== 'function') return;
  const v = await showInputModal({
    title: '몇 시?',
    message: '0~23 사이 숫자로.',
    placeholder: '예: 19',
    defaultValue: String(window._hookOnbPickedHour || 21),
    okLabel: '저장'
  });
  if (v === null || v === undefined) return;
  const n = parseInt(String(v).trim(), 10);
  if (isNaN(n) || n < 0 || n > 23) {
    if (typeof showToast === 'function') showToast('0~23 사이 숫자로 적어줘');
    return;
  }
  window._hookOnbPickedHour = n;
  // preset 4개 active 해제, 마지막 (직접 정하기) 만 active
  document.querySelectorAll('#hookOnbTimes .hook-onb-time-btn').forEach(b => b.classList.remove('is-default'));
  const customBtn = document.querySelector('#hookOnbTimes .hook-onb-time-btn:last-child');
  if (customBtn) {
    customBtn.classList.add('is-default');
    customBtn.textContent = `직접 정하기 (${n}시)`;
  }
}

function _hookOnbConfirm() {
  const hour = window._hookOnbPickedHour || 21;
  state.preferences = state.preferences || {};
  state.preferences.hookNotificationTime = hour;
  state.preferences.hookFrequency = 'daily';
  state.preferences._hookOnboardingShown = true;
  try { saveState(); } catch {}
  _hookOnbClose();
  // Phase B: push 권한 prompt + subscription 등록 (모달 닫힌 직후 살짝 delay — 같은 모달 row 안 prompt 겹침 회피).
  if (typeof ensurePushSubscription === 'function') {
    setTimeout(() => {
      ensurePushSubscription({ frequency: 'daily', notificationTime: hour })
        .then(r => {
          if (r && r.ok) {
            if (typeof showToast === 'function') showToast('🔔 알림 켜졌어 — 매일 ' + hour + '시쯤 뭐 하나 물어볼게');
          } else if (r && r.reason === 'permission-denied') {
            // 권한 거부 = silent — 사용자가 명시적으로 거부했으니 압박 X.
          } else if (r && r.reason === 'no-vapid-key') {
            console.warn('[hookOnb] push skip — VAPID 미설정');
          } else {
            console.warn('[hookOnb] push subscribe fail:', r && r.reason);
          }
        })
        .catch(e => console.warn('[hookOnb push]', e));
    }, 600);
  }
}

function _hookOnbDecline() {
  state.preferences = state.preferences || {};
  state.preferences.hookFrequency = 'off';
  state.preferences._hookOnboardingShown = true;
  try { saveState(); } catch {}
  _hookOnbClose();
}

function _hookOnbClose() {
  const overlay = document.getElementById('hookOnbOverlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 200);
  delete window._hookOnbPickedHour;
}
