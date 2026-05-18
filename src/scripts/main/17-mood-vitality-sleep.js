// ═══════════════════════════════════════════════════════════════
// MOOD / VITALITY / SLEEP
// ═══════════════════════════════════════════════════════════════
function selectMood(btn, level) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  currentCheckin.mood = level;
  if (typeof _updateCheckinSubmitState === 'function') _updateCheckinSubmitState();
}

function selectVitality(btn, level) {
  document.querySelectorAll('.vitality-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  currentCheckin.vitality = level;
  if (typeof _updateCheckinSubmitState === 'function') _updateCheckinSubmitState();
}

// 사용자 명시 2026-05-06: 체크인 화면 — Quick Core + Smart Expand 토글 / validation 헬퍼
function toggleCheckinExtra() {
  const group = document.getElementById('checkinExtraGroup');
  const toggle = document.getElementById('checkinExtraToggle');
  if (!group || !toggle) return;
  const isOpen = group.style.display !== 'none' && group.style.display !== '';
  if (isOpen) {
    group.style.display = 'none';
    toggle.classList.remove('is-open');
  } else {
    group.style.display = 'block';
    toggle.classList.add('is-open');
  }
}

function _updateCheckinSubmitState() {
  const btn = document.getElementById('checkinSubmitBtn');
  const hint = document.getElementById('checkinProgressHint');
  const vDot = document.getElementById('vitalityNudgeDot');
  const mDot = document.getElementById('moodNudgeDot');
  // 수정 모드 판단: submit 버튼 텍스트 보고 결정 (prefillCheckinFromEntry 가 갱신)
  const isEdit = btn && btn.textContent && btn.textContent.indexOf('수정') !== -1;
  const hasV = !!currentCheckin.vitality;
  const hasM = !!currentCheckin.mood;
  if (vDot) vDot.classList.toggle('satisfied', hasV);
  if (mDot) mDot.classList.toggle('satisfied', hasM);
  if (!btn) return;
  if (isEdit) {
    btn.classList.remove('disabled');
    if (hint) hint.textContent = '';
    return;
  }
  const ready = hasV && hasM;
  btn.classList.toggle('disabled', !ready);
  if (hint) {
    const count = (hasV ? 1 : 0) + (hasM ? 1 : 0);
    if (ready) hint.textContent = '2/2 ✓ 준비 됐어';
    else if (count === 1) hint.textContent = '1/2 — 하나만 더';
    else hint.textContent = '0/2 — 두 개만 골라줘';
  }
}

function updateSleepDuration() {
  const startEl = document.getElementById('sleepStart');
  const endEl = document.getElementById('sleepEnd');
  if (!startEl || !endEl) return;
  const start = startEl.value;
  const end = endEl.value;
  if (!start || !end) return;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  document.getElementById('sleepDuration').textContent = `약 ${hours}시간 ${mins}분`;
}

// 사용자 명시 2026-04-30: 밤샘 토글 — 시간 입력 hide / 메시지 show.
function toggleAllNighter(checked) {
  const pair = document.getElementById('sleepTimePair');
  const msg = document.getElementById('allNighterMsg');
  const dur = document.getElementById('sleepDuration');
  if (pair) pair.style.display = checked ? 'none' : '';
  if (msg) msg.style.display = checked ? 'block' : 'none';
  if (dur) dur.style.display = checked ? 'none' : '';
}

function toggleOptional(key) {
  const toggle = document.querySelector(`[onclick="toggleOptional('${key}')"]`);
  const expand = document.getElementById('expand-' + key);
  const check = document.getElementById('check-' + key);
  const isOn = toggle.classList.toggle('on');
  expand.classList.toggle('show', isOn);
  check.textContent = isOn ? '✓' : '';
  if (!isOn) delete currentCheckin[key];
}

function selectQuick(btn, key, value) {
  const parent = btn.closest('.quick-row');
  parent.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  currentCheckin[key] = value;
}

async function submitCheckin() {
  // 사용자 명시 2026-05-06: vitality + mood validation (신규 작성 모드에서만)
  const _vmTodayK = todayKey();
  const _vmExisting = (state.entries || []).find(en => en.date === _vmTodayK);
  const _vmIsEdit = !!(_vmExisting && (_vmExisting.vitality || _vmExisting.mood));
  if (!_vmIsEdit && (!currentCheckin.vitality || !currentCheckin.mood)) {
    if (typeof showToast === 'function') showToast('⚡ 에너지랑 💭 기분 두 개만 골라줘');
    return;
  }
  const allNighter = !!document.getElementById('allNighterToggle')?.checked;
  const sleepStart = document.getElementById('sleepStart').value;
  const sleepEnd = document.getElementById('sleepEnd').value;
  const note = document.getElementById('checkinNote').value;
  // 사용자 명시 2026-05-01: 위기 신호 detect — 체크인 note 검사 (자살예방법 §15-6)
  if (note && typeof _detectCrisisSignal === 'function' && _detectCrisisSignal(note)) {
    if (typeof showCrisisCarousel === 'function') showCrisisCarousel('checkin_note');
  }
  const key = todayKey();
  let entry = state.entries.find(e => e.date === key);
  if (!entry) { entry = { date: key }; state.entries.push(entry); }
  // 사용자 명시 2026-04-30: 밤샘 시 sleepStart/End 비우고 allNighter flag 만 저장.
  if (allNighter) {
    entry.allNighter = true;
    entry.sleepStart = '';
    entry.sleepEnd = '';
  } else {
    entry.allNighter = false;
    entry.sleepStart = sleepStart;
    entry.sleepEnd = sleepEnd;
  }
  entry.vitality = currentCheckin.vitality;
  entry.mood = currentCheckin.mood;
  entry.note = note;
  entry.modes = { ...state.modes };
  entry.cyclePhase = getCyclePhase();
  // 사용자 명시 2026-05-03 ultrathink: 날씨 자동 fetch (fire-and-forget — 체크인 흐름에 latency X).
  // 첫 시점 = 동의 모달 1회 / granted 후 = 자동 / denied = skip.
  if (typeof _fetchCurrentWeather === 'function') {
    _fetchCurrentWeather().then(weather => {
      if (!weather) return;
      const todayK = todayKey();
      const e = (state.entries || []).find(en => en.date === todayK);
      if (e && !e.weather) {
        e.weather = weather;
        saveState();
      }
    }).catch(() => {});
  }
  // Capture today's question + answer
  if (_currentDailyQuestion) {
    entry.dailyQuestion = {
      id: _currentDailyQuestion.id,
      text: _currentDailyQuestion.text,
      category: _currentDailyQuestion.cat,
      answered: !!note.trim()
    };
    // Mark answered in history
    const todayKeyVal = todayKey();
    const histEntry = (state.questionHistory || []).find(h => h.shownDate === todayKeyVal);
    if (histEntry) histEntry.answered = !!note.trim();
  }
  ['meals', 'movement', 'focus', 'social', 'overwhelm'].forEach(k => {
    if (currentCheckin[k]) entry[k] = currentCheckin[k];
  });
  // V3.13.x: 음악 저장 / 제거
  let _autoPearlAdded = null;
  if (currentCheckin.music) {
    entry.music = currentCheckin.music;
    // V3.13.x: 같은 곡 5번 이상 체크인 → 자동 진주 저장 (이미 있으면 skip)
    const trackId = currentCheckin.music.id;
    if (trackId) {
      const sameCount = (state.entries || []).filter(e => e.music && e.music.id === trackId).length;
      const alreadyInPearls = (state.pearls || []).some(p => p.track && p.track.id === trackId);
      if (sameCount >= 5 && !alreadyInPearls) {
        if (!state.pearls) state.pearls = [];
        state.pearls.push({
          id: 'pearl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          category: '음악',
          track: currentCheckin.music,
          content: currentCheckin.music.title,
          note: `체크인 ${sameCount}번 등장 → 자동 보관`,
          autoAdded: true,
          type: 'pearl',
          createdAt: new Date().toISOString()
        });
        _autoPearlAdded = currentCheckin.music.title;
      }
    }
  } else {
    delete entry.music;
  }
  // V4-fix: 사진 저장 / 제거
  if (currentCheckin.photo) {
    entry.photo = currentCheckin.photo;
  } else {
    delete entry.photo;
  }
  entry.timestamp = new Date().toISOString();

  // V3.12.x: 추적 항목 값 캡처 → state.projects의 measurements에 push
  // V3.13.x: 체크형은 즉시 토글로 저장되므로 skip
  (state.projects || []).filter(p => p.status === 'active' && (p.kind || 'numeric') === 'numeric').forEach(p => {
    const inputEl = document.getElementById('track_' + p.id);
    if (!inputEl || inputEl.value === '') return;
    const val = parseFloat(inputEl.value);
    if (isNaN(val)) return;
    if (p.baseline === null || p.baseline === undefined) {
      // 첫 입력 → baseline으로 자동 설정
      p.baseline = val;
      p.startDate = entry.date;
    }
    p.measurements = p.measurements || [];
    p.measurements.push({ value: val, at: new Date().toISOString(), source: 'checkin' });
    // 목표 도달 시 자동 완료
    if (p.target !== null && p.target !== undefined) {
      const reached = (p.target > p.baseline && val >= p.target) || (p.target < p.baseline && val <= p.target);
      if (reached && p.status === 'active') p.status = 'done';
    }
    inputEl.value = '';
  });

  // V4 (사용자 명시 2026-05-18 ultrathink): 체크인 완료 = 소라 1개 (티어는 입력 양 따라).
  // 트래커 measurement push 후 호출 — _todayTrackerSuccesses 가 그날 데이터 검출.
  let _checkinShellResult = null;
  try {
    if (typeof addOrUpdateCheckinShell === 'function') {
      _checkinShellResult = addOrUpdateCheckinShell(entry);
    }
  } catch (e) { console.warn('[checkin-shell]', e); }

  saveState();

  // V3.13.x: 체크인은 순수 기록. AI 자동 응답 X. note + dailyQuestion 답변은
  // entry에 저장만 (시스템 prompt로 자연스럽게 컨텍스트). 사용자가 chat에서 능동적으로 말 걸 때
  // AI가 그 정보 참조해서 응답.
  currentCheckin = {};
  _currentDailyQuestion = null;
  updateCheckinSub();
  showScreen('home');
  // V4 (사용자 명시 2026-05-18 ultrathink): 소라 emerge + tier toast (단순 토스트 대체).
  if (_checkinShellResult && typeof showCheckinShellReward === 'function') {
    showCheckinShellReward(_checkinShellResult);
  } else {
    showToast(note.trim() ? '✦ 기록됐어' : '기록 고마워 🐚');
  }
  if (_autoPearlAdded) {
    setTimeout(() => showToast(`💎 자주 들은 곡이라 진주에 자동 저장 — ${_autoPearlAdded}`), 2700);
  }
  // 사용자 명시 2026-05-06 ultrathink: 첫 체크인 직후 PWA 설치 인라인 카드 (게스트 출신 X 일반 사용자만 — 게스트 출신은 비밀번호 설정 직후 별도 trigger).
  try {
    const _wasGuest = !!(state.preferences && state.preferences._wasGuestPromoted);
    if (!_wasGuest && Array.isArray(state.entries) && state.entries.length === 1
        && typeof renderPwaInstallInlineCard === 'function') {
      setTimeout(() => renderPwaInstallInlineCard({ target: 'home' }), 3000);
    }
  } catch (e) { console.warn('[pwa post-checkin]', e); }
}

function buildCheckinSummary(entry) {
  const parts = [];
  if (entry.sleepStart && entry.sleepEnd) parts.push(`수면 ${entry.sleepStart}~${entry.sleepEnd}`);
  if (entry.vitality) parts.push(`에너지 ${entry.vitality}/5`);
  if (entry.mood) parts.push(`기분 ${entry.mood}/5`);
  if (entry.meals) parts.push(`식사:${entry.meals}`);
  if (entry.movement) parts.push(`움직임:${entry.movement}`);
  if (entry.focus) parts.push(`집중:${entry.focus}`);
  if (entry.social) parts.push(`연결:${entry.social}`);
  if (entry.overwhelm) parts.push(`스트레스:${entry.overwhelm}`);
  if (entry.cyclePhase) parts.push(`주기:${entry.cyclePhase}`);
  if (entry.weather) parts.push(`날씨:${entry.weather.emoji}${entry.weather.label}`);
  const activeModes = Object.keys(entry.modes || {}).filter(k => entry.modes[k] && k !== 'period');
  if (activeModes.length) parts.push(`모드:${activeModes.join(',')}`);
  return parts.join(' | ');
}

