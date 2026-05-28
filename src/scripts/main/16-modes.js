// ═══════════════════════════════════════════════════════════════
// MODES
// ═══════════════════════════════════════════════════════════════
function toggleMode(mode) {
  state.modes[mode] = !state.modes[mode];
  // V4 (v8 묶음 18): 모드 첫 클릭 inline tip
  if (typeof _showInlineTip === 'function') _showInlineTip('modeFirstClick');
  if (mode === 'period' && state.modes.period && !state.periodStart) {
    state.periodStart = todayKey();
  } else if (mode === 'period' && !state.modes.period) {
    state.periodStart = null;
  }
  saveState();
  renderModes();
}

function renderModes() {
  document.querySelectorAll('.mode-chip').forEach(chip => {
    chip.classList.toggle('active', !!state.modes[chip.dataset.mode]);
  });
}

// V3.13.x: 체크인 화면 진입 시 오늘 entry 있으면 prefill (수정 모드)
function prefillCheckinFromEntry() {
  const todayKeyVal = todayKey();
  const entry = (state.entries || []).find(e => e.date === todayKeyVal);
  // currentCheckin 초기화
  currentCheckin = {};
  // submit 버튼 텍스트 + 화면 부제목
  const submitBtn = document.querySelector('button[onclick="submitCheckin()"]');
  const subtitle = document.querySelector('#screen-checkin .screen-sub');
  // mood/vitality/sleep/note input들 모두 초기화
  document.querySelectorAll('#screen-checkin .mood-btn, #screen-checkin .vitality-btn, #screen-checkin .quick-btn').forEach(b => b.classList.remove('selected'));
  const startEl0 = document.getElementById('sleepStart');
  const endEl0 = document.getElementById('sleepEnd');
  const noteEl0 = document.getElementById('checkinNote');
  if (startEl0) startEl0.value = '';
  if (endEl0) endEl0.value = '';
  if (noteEl0) noteEl0.value = '';
  // 사용자 명시 2026-04-30: 밤샘 토글 reset
  const allNighterReset = document.getElementById('allNighterToggle');
  if (allNighterReset) {
    allNighterReset.checked = false;
    if (typeof toggleAllNighter === 'function') toggleAllNighter(false);
  }

  const _entryHasPhoto = !!(entry && (entry.photo || (Array.isArray(entry.photos) && entry.photos.length > 0)));
  // V4 fix (사용자 명시 2026-05-27 ultrathink): vitality && mood = 체크인 entry 필수 요소. 둘 다 있어야 '수정 모드'.
  //   sleep/note/diary/music/photo 만 있는 entry (4-18시 인라인 sleep widget 단독 저장 등) = 미완료 → 새 작성 모드.
  //   side-field 는 _hasAnySideField 일 때 prefill 만 해주고 submit 버튼은 '기록 완료'.
  const _hasAnySideField = !!(entry && (entry.note || entry.diary || entry.sleepStart || entry.allNighter || entry.music || _entryHasPhoto));
  const _isFullEntry = !!(entry && entry.vitality && entry.mood);
  if (!entry || (!_isFullEntry && !_hasAnySideField)) {
    // 오늘 체크인 안 함 — 새로 작성 모드
    if (submitBtn) submitBtn.textContent = '기록 완료 ✦';
    if (subtitle) subtitle.textContent = '';
    renderCheckinMusicSlot();
    if (typeof renderCheckinPhotoSlot === 'function') renderCheckinPhotoSlot();
    // 사용자 명시 2026-05-06: Extra 접힘 + submit 상태 reset (신규 작성)
    const _extraG = document.getElementById('checkinExtraGroup');
    const _extraT = document.getElementById('checkinExtraToggle');
    if (_extraG) _extraG.style.display = 'none';
    if (_extraT) _extraT.classList.remove('is-open');
    if (typeof _updateCheckinSubmitState === 'function') _updateCheckinSubmitState();
    return;
  }
  // 오늘 entry 있음 — vitality+mood 둘 다 있으면 '수정 완료', 아니면 (side-field 만) '기록 완료'.
  // 사용자 명시 2026-05-27 ultrathink: vitality/mood 필수. side-field (sleep / note 등) 만 있는 entry = 미완료.
  if (submitBtn) submitBtn.textContent = _isFullEntry ? '수정 완료 ✦' : '기록 완료 ✦';
  // V4 fix (사용자 명시 2026-05-18) — subtitle 문구 삭제. 옛: '오늘 이미 기록한 거. 바꿀 거 있으면 고쳐.'
  if (subtitle) subtitle.textContent = '';

  // mood
  if (entry.mood != null) {
    currentCheckin.mood = entry.mood;
    const moodBtns = document.querySelectorAll('#screen-checkin .mood-btn');
    if (moodBtns[entry.mood - 1]) moodBtns[entry.mood - 1].classList.add('selected');
  }
  // vitality
  if (entry.vitality != null) {
    currentCheckin.vitality = entry.vitality;
    const vitBtns = document.querySelectorAll('#screen-checkin .vitality-btn');
    if (vitBtns[entry.vitality - 1]) vitBtns[entry.vitality - 1].classList.add('selected');
  }
  // sleep — 사용자 명시 2026-04-30: 밤샘 토글 상태 복원 (entry.allNighter)
  const allNighterEl = document.getElementById('allNighterToggle');
  if (allNighterEl) {
    allNighterEl.checked = !!entry.allNighter;
    if (typeof toggleAllNighter === 'function') toggleAllNighter(!!entry.allNighter);
  }
  if (startEl0 && entry.sleepStart) startEl0.value = entry.sleepStart;
  if (endEl0 && entry.sleepEnd) endEl0.value = entry.sleepEnd;
  // note
  // V4 fix (사용자 보고 2026-05-20 ultrathink): entry.diary 도 textarea 복원 — 일기 path 단독 entry 가 빈 textarea 로 보이던 버그.
  //   note + diary 둘 다 있으면 note 우선 (일반 path 가 정상 흐름). diary 만 있으면 '일기: ' prefix 로 복원 + 일기 모드 진입.
  // V4 fix (사용자 명시 2026-05-22 ultrathink): entry.diary 의 가장 최근 block 만 textarea 에 set + edit mode flag.
  //   옛: entry.diary 전체 (multi-block) 보여줘 submit 시 또 append → 중복.
  //   새: 마지막 timestamp header 이후 부분 = latest block 만 textarea. submitCheckin 가 _checkinDiaryEditMode true 일 때 in-place replace.
  //   block format = "block1\n\n— HH:MM —\nblock2\n\n— HH:MM —\nblock3". timestamp 없는 첫 block 만이면 entry.diary 그대로.
  if (noteEl0) {
    if (entry.note) {
      noteEl0.value = entry.note;
    } else if (entry.diary) {
      const _diaryStr = entry.diary;
      const _headerRe = /\n\n— \d{2}:\d{2} —\n/g;
      let _lastHeaderEnd = 0;
      let _m;
      while ((_m = _headerRe.exec(_diaryStr))) _lastHeaderEnd = _m.index + _m[0].length;
      const _latestBlock = _lastHeaderEnd > 0 ? _diaryStr.slice(_lastHeaderEnd) : _diaryStr;
      noteEl0.value = '일기: ' + _latestBlock;
      if (typeof enterCheckinDiaryMode === 'function') {
        try { enterCheckinDiaryMode(); } catch (e) { console.warn('[prefill diary mode]', e); }
      }
      window._checkinDiaryEditMode = true;
    }
  }
  // optional fields — 사용자 보고 2026-05-03: state 만 복원 + UI .selected class 누락 = 다시 진입 시 click 사라짐 버그.
  // V4 fix (사용자 보고 2026-05-04): 속성 selector 가 onclick 문자열 normalization 차이로 매칭 못 하던 케이스 (한글 / 따옴표 escape 등) — 더 안전한 onclick parse 방식으로 교체.
  const _quickBtns = document.querySelectorAll('#screen-checkin .quick-btn');
  ['meals','movement','focus','social','overwhelm'].forEach(k => {
    if (entry[k]) {
      currentCheckin[k] = entry[k];
      _quickBtns.forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        // selectQuick(this, 'meals', '규칙적') 같은 패턴에서 key, value 추출
        const m = oc.match(/selectQuick\(\s*this\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
        if (m && m[1] === k && m[2] === entry[k]) {
          btn.classList.add('selected');
        }
      });
    }
  });
  // V3.13.x: 음악 prefill
  if (entry.music) currentCheckin.music = entry.music;
  renderCheckinMusicSlot();
  // V4-fix: 사진 prefill — photos[] 우선, legacy photo fallback.
  if (Array.isArray(entry.photos) && entry.photos.length > 0) {
    currentCheckin.photos = entry.photos.slice(0, 3);
    currentCheckin.photo = entry.photos[0];
  } else if (entry.photo) {
    currentCheckin.photos = [entry.photo];
    currentCheckin.photo = entry.photo;
  }
  // V4 (Phase 1E Step 4): Storage path 도 prefill (있으면) — 미수정 사진은 storageKey 보존.
  if (Array.isArray(entry.photoStorageKeys) && entry.photoStorageKeys.length > 0) {
    currentCheckin.photoStorageKeys = entry.photoStorageKeys.slice(0, 3);
  }
  if (typeof renderCheckinPhotoSlot === 'function') renderCheckinPhotoSlot();
  // sleep duration 다시 계산
  if (typeof updateSleepDuration === 'function') updateSleepDuration();
  // 사용자 명시 2026-05-06: Extra 값 있으면 자동 펼침 (수정 모드)
  const _hasExtraVal = !!(entry.meals || entry.movement || entry.focus ||
    entry.social || entry.overwhelm || entry.music || _entryHasPhoto ||
    entry.sleepStart || entry.allNighter ||
    (entry.modes && Object.values(entry.modes).some(Boolean)));
  const _extraG2 = document.getElementById('checkinExtraGroup');
  const _extraT2 = document.getElementById('checkinExtraToggle');
  if (_extraG2 && _extraT2) {
    if (_hasExtraVal) {
      _extraG2.style.display = 'block';
      _extraT2.classList.add('is-open');
    } else {
      _extraG2.style.display = 'none';
      _extraT2.classList.remove('is-open');
    }
  }
  if (typeof _updateCheckinSubmitState === 'function') _updateCheckinSubmitState();
}

function getCyclePhase() {
  if (!state.modes.period || !state.periodStart) return null;
  const days = Math.floor((new Date() - new Date(state.periodStart)) / 86400000);
  if (days < 5) return '월경기';
  if (days < 14) return '난포기';
  if (days < 16) return '배란기';
  if (days < 28) return '황체기';
  return null;
}

// 사용자 명시 2026-05-03 ultrathink: 날씨 자동 detect — Open-Meteo + Geolocation API.
// privacy: lat/lon 0.01° 반올림 (~1km 정확도) — 집 주소 추적 X. 결과 weather 만 entry 에 저장.
// 권한 = 한 번 grant 후 자동 (모달 X). 거부 후 재요청 X (Settings 의 toggle reset 자리).
function _weatherCodeToInfo(code) {
  if (code === 0) return { label: '맑음', emoji: '☀️' };
  if (code <= 3) return { label: '구름', emoji: '☁️' };
  if (code <= 49) return { label: '안개', emoji: '🌫️' };
  if (code <= 67) return { label: '비', emoji: '🌧️' };
  if (code <= 77) return { label: '눈', emoji: '❄️' };
  if (code <= 82) return { label: '소나기', emoji: '🌦️' };
  if (code <= 99) return { label: '천둥', emoji: '⛈️' };
  return { label: '알 수 없음', emoji: '🌥️' };
}

async function _showWeatherConsentModal() {
  return new Promise(resolve => {
    if (document.getElementById('weatherConsentOverlay')) { resolve(false); return; }
    const overlay = document.createElement('div');
    overlay.id = 'weatherConsentOverlay';
    overlay.className = 'input-modal-overlay show';
    overlay.style.zIndex = '10003';
    overlay.innerHTML = `
      <div class="input-modal" style="max-width:380px; padding:24px;">
        <div style="font-size:28px; text-align:center; margin-bottom:8px;">🌤</div>
        <div style="font-size:16px; font-weight:700; color:var(--text); text-align:center; margin-bottom:8px;">날씨 자동 인식</div>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
          체크인 날씨 — 인사이트 분석에 위치 권한이 필요해.<br>
          다른 용도 X. 약속할게 (말이랑 다르면 위치정보법 위반).
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary" id="weatherConsentYes" style="flex:1;">응</button>
          <button class="btn-secondary" id="weatherConsentNo" style="flex:1;">안 할래</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('weatherConsentYes').onclick = () => {
      overlay.remove();
      resolve(true);
    };
    document.getElementById('weatherConsentNo').onclick = () => {
      overlay.remove();
      state.preferences = state.preferences || {};
      state.preferences._weatherPermission = 'denied';
      saveState();
      resolve(false);
    };
  });
}

// 사용자 명시 2026-05-03 ultrathink: Settings 의 toggle — 권한 결정 변경 자리.
function setWeatherPermission(value) {
  state.preferences = state.preferences || {};
  if (value === 'granted') {
    // 재요청 = undecided 으로 reset → 다음 체크인 시 동의 모달 + 권한 prompt
    state.preferences._weatherPermission = null;
    if (typeof showToast === 'function') showToast('🌤 다음 체크인 때 다시 물어볼게');
  } else if (value === 'denied') {
    state.preferences._weatherPermission = 'denied';
    if (typeof showToast === 'function') showToast('🚫 날씨 자동 인식 X');
  }
  saveState();
  if (typeof refreshWeatherToggleStatus === 'function') refreshWeatherToggleStatus();
}

function refreshWeatherToggleStatus() {
  const el = document.getElementById('weatherToggleStatus');
  if (!el) return;
  const v = state.preferences?._weatherPermission;
  const labels = {
    granted: '✓ 사용 중 (체크인 시점 자동 fetch)',
    denied: '✕ 사용 안 함',
  };
  el.textContent = labels[v] || '🟡 아직 결정 X (다음 체크인 시 묻기)';
}

// 사용자 명시 2026-05-29: 날씨 허용(+위치 통과) 직후 알림 권한도 이어서 요청 — *처음 1회만*.
//   _notifAskedAfterWeather flag 로 1회 보장 (이후 체크인에선 재요청 X).
//   ensurePushSubscription 이 OS 알림 권한 prompt + 구독 (settings 와 동일 정식 opt-in). 이미 결정/구독이면 prompt 안 뜸.
//   존중: hookFrequency='off'(명시 거부) 또는 이미 구독됨이면 prompt skip (flag 만 set).
function _maybePromptNotifAfterWeather() {
  try {
    state.preferences = state.preferences || {};
    if (state.preferences._notifAskedAfterWeather) return;
    state.preferences._notifAskedAfterWeather = true;
    saveState();
    if (state.preferences.hookFrequency === 'off') return;
    if (state.preferences._pushSubscribedAt) return;
    setTimeout(() => {
      try {
        if (typeof ensurePushSubscription === 'function') {
          ensurePushSubscription().catch(e => console.warn('[notif-after-weather]', e));
        }
      } catch (e) { console.warn('[notif-after-weather]', e); }
    }, 800);
  } catch (e) { console.warn('[notif-after-weather]', e); }
}

async function _fetchCurrentWeather() {
  state.preferences = state.preferences || {};
  // 거부 history → skip
  if (state.preferences._weatherPermission === 'denied') return null;
  // 첫 시점 = 동의 모달 1회
  if (state.preferences._weatherPermission == null) {
    const consent = await _showWeatherConsentModal();
    if (!consent) return null;
  }
  // V4 fix (사용자 보고 2026-05-18 ultrathink): Capacitor native 환경 (갤럭시 등) = @capacitor/geolocation 우선.
  //   옛 navigator.geolocation 는 Capacitor WebView 에서 OS permission 안 잡혀 silent fail → _weatherPermission='denied' 영구 set 버그.
  //   web (브라우저) = 기존 navigator.geolocation 그대로 (PWA 흐름 변경 X).
  const _isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  let pos = null;
  if (_isNative) {
    try {
      const Geo = window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
      if (Geo) {
        // requestPermissions 는 처음 호출 시 OS 권한 모달 (갤럭시 위치 prompt) 트리거. denied 면 throw.
        try {
          const perm = await Geo.checkPermissions();
          if (perm && perm.location !== 'granted') {
            const req = await Geo.requestPermissions({ permissions: ['location'] });
            if (!req || req.location !== 'granted') {
              state.preferences._weatherPermission = 'denied';
              saveState();
              return null;
            }
          }
        } catch (permE) { console.warn('[weather native perm]', permE); }
        const p = await Geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 });
        if (p && p.coords) pos = p;
      }
    } catch (e) {
      console.warn('[weather native geo]', e);
    }
  }
  if (!pos) {
    pos = await new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Geolocation X'));
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 30 * 60 * 1000 });
    }).catch(() => null);
  }
  if (!pos) {
    state.preferences._weatherPermission = 'denied';
    saveState();
    return null;
  }
  state.preferences._weatherPermission = 'granted';
  saveState();
  // 사용자 명시 2026-05-29: 날씨 허용·위치 통과 직후 (처음 1회만) 알림 권한 이어서 요청.
  _maybePromptNotifAfterWeather();
  // Open-Meteo fetch (lat/lon 0.01° 반올림 — privacy)
  try {
    const lat = pos.coords.latitude.toFixed(2);
    const lon = pos.coords.longitude.toFixed(2);
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code&timezone=Asia%2FSeoul`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const code = data?.current?.weather_code;
    if (code == null) return null;
    const info = _weatherCodeToInfo(code);
    return { code, label: info.label, emoji: info.emoji, fetchedAt: new Date().toISOString() };
  } catch (e) {
    console.warn('[weather] fetch fail:', e);
    return null;
  }
}

