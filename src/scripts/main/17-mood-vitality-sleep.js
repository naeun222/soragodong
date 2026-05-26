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
  // V4 fix (사용자 보고 2026-05-20 ultrathink): 일기 path 통합. 옛 코드 = 일기 분기 early return 후 sleep / note / weather / dailyQuestion answered / meals / movement / focus / social / overwhelm / music / photos / projects measurements 전부 skip → side-field 손실.
  //   새 path = 일기 감지 후 일반 흐름 통과. 끝부분 entry processing 에서 _isDiaryPath 면 entry.diary append + dailySource. vitality/mood 우회 (validation 건너뜀), note 칸 raw 박지 X.
  // V4 fix (사용자 보고 2026-05-20 ultrathink): 명시 칩 (_checkinDiaryMode) 만 일기 path 진입.
  //   옛: '일기:' 접두어 자동 감지 → 사용자가 의도 없이 '일기:'로 시작하는 일반 메모 적으면 entry.diary 로 잘못 분류 + entry.note 손실.
  //   새: 칩 누른 의도만 trigger. 칩 누르면 textarea 에 '일기: ' prefix 자동 (enterCheckinDiaryMode) — submit 시 그 prefix strip.
  const _rawNote = (document.getElementById('checkinNote')?.value || '').trim();
  const _isDiaryPath = (typeof _checkinDiaryMode !== 'undefined' && !!_checkinDiaryMode);
  const _diaryStripMatch = _isDiaryPath ? _rawNote.match(/^일기[:：]\s*([\s\S]+)$/) : null;
  const _diaryContent = _isDiaryPath
    ? (_diaryStripMatch ? _diaryStripMatch[1].trim() : _rawNote.trim())
    : '';
  if (_isDiaryPath && !_diaryContent) {
    if (typeof showToast === 'function') showToast('일기 내용을 입력해줘');
    return;
  }
  // 사용자 명시 2026-05-06: vitality + mood validation (신규 작성 모드에서만). 일기 모드면 우회.
  const _vmTodayK = todayKey();
  const _vmExisting = (state.entries || []).find(en => en.date === _vmTodayK);
  const _vmIsEdit = !!(_vmExisting && (_vmExisting.vitality || _vmExisting.mood || _vmExisting.diary));
  if (!_isDiaryPath && !_vmIsEdit && (!currentCheckin.vitality || !currentCheckin.mood)) {
    if (typeof showToast === 'function') showToast('⚡ 에너지랑 💭 기분 두 개만 골라줘');
    return;
  }
  const allNighter = !!document.getElementById('allNighterToggle')?.checked;
  const sleepStart = document.getElementById('sleepStart').value;
  const sleepEnd = document.getElementById('sleepEnd').value;
  // 일기 모드면 note 칸 = '일기: ...' raw 라 entry.note 에 박지 X. 일반 모드면 그대로.
  const note = _isDiaryPath ? '' : document.getElementById('checkinNote').value;
  // 사용자 명시 2026-05-01: 위기 신호 detect — 일기 모드면 diaryContent 검사, 아니면 note (자살예방법 §15-6).
  const _crisisText = _isDiaryPath ? _diaryContent : note;
  if (_crisisText && typeof _detectCrisisSignal === 'function' && _detectCrisisSignal(_crisisText)) {
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
  // 일기 모드 + vitality/mood 안 골랐으면 entry 기존 값 보존. 골랐으면 update.
  if (currentCheckin.vitality) entry.vitality = currentCheckin.vitality;
  if (currentCheckin.mood) entry.mood = currentCheckin.mood;
  entry.note = note;
  // V4 fix (사용자 보고 2026-05-20 ultrathink): 일기 path 도 일반 흐름 통과. entry.diary append + dailySource 만 추가.
  // V4 fix (사용자 명시 2026-05-22 ultrathink): edit mode (_checkinDiaryEditMode) 면 entry.diary 의 가장 최근 block 만 in-place replace.
  //   16-modes.js renderCheckinFromExisting 이 entry.diary 있을 때 latestBlock 만 textarea 에 set + flag true.
  //   효과: 사용자가 본 그 latestBlock 의 content 만 갱신. 옛 block 들 (다른 timestamp) 그대로 보존. 새 block append X.
  //   edit mode X (= 새 첫 일기 또는 새 추가 path) → 기존 흐름 (entry.diary 없으면 첫 block / 있으면 timestamp append).
  if (_isDiaryPath) {
    const _isDiaryEdit = !!window._checkinDiaryEditMode;
    if (_isDiaryEdit && entry.diary) {
      const _diaryStr = entry.diary;
      const _headerRe = /\n\n— \d{2}:\d{2} —\n/g;
      let _lastHeaderEnd = 0;
      let _m;
      while ((_m = _headerRe.exec(_diaryStr))) _lastHeaderEnd = _m.index + _m[0].length;
      if (_lastHeaderEnd > 0) {
        entry.diary = _diaryStr.slice(0, _lastHeaderEnd) + _diaryContent;
      } else {
        entry.diary = _diaryContent;
      }
    } else if (entry.diary && entry.diary.trim()) {
      const t = new Date();
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      entry.diary += '\n\n— ' + hh + ':' + mm + ' —\n' + _diaryContent;
    } else {
      entry.diary = _diaryContent;
    }
    entry.dailySource = 'diary';
    // V4 fix (사용자 명시 2026-05-26 ultrathink — diary marker race): 사용자가 직접 diary 작성 → batch sentinel strip.
    //   옛 entry 에 _aiSummaryFailed 박혀있으면 _buildDiaryBatchRequests 가 영구 skip → 새 diary 가 들어와도 aiSummary 재공급 권리 X.
    //   diary 손수 작성 = 권리 회복 신호.
    delete entry._aiSummaryFailed;
    delete entry._aiSummaryFailReason;
    if (window._checkinDiaryEditMode) delete window._checkinDiaryEditMode;
  }
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
  // Capture today's question + answer — 일기 모드면 _diaryContent 가 답.
  const _answeredText = _isDiaryPath ? _diaryContent : note;
  if (_currentDailyQuestion) {
    entry.dailyQuestion = {
      id: _currentDailyQuestion.id,
      text: _currentDailyQuestion.text,
      category: _currentDailyQuestion.cat,
      answered: !!_answeredText.trim()
    };
    // Mark answered in history
    const todayKeyVal = todayKey();
    const histEntry = (state.questionHistory || []).find(h => h.shownDate === todayKeyVal);
    if (histEntry) histEntry.answered = !!_answeredText.trim();
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
  // V4 (사용자 명시 2026-05-20 ultrathink): 사진 multi 저장 — photos[] (max 3) + legacy entry.photo 미러.
  // V4 fix (사용자 보고 2026-05-20 ultrathink Phase 1E Step 7 조기): Storage 분리된 사진은 dataURL 안 박기 — localStorage 폭증 직격 차단.
  //   조건: _ciPhotos 모든 idx 에 currentCheckin.photoStorageKeys[idx] 가 있으면 Storage-only path (entry.photos / entry.photo wipe).
  //   reader (06c-diary-photo-storage.js / day-modal / timeline-lens) 는 entry.photoStorageKeys 우선 hydrate. dataURL 옛 데이터는 fallback.
  //   Storage 일부 실패 / E2EE 미설정 사용자 = 옛 fallback path (entry.photos = dataURL).
  const _ciPhotos = Array.isArray(currentCheckin.photos)
    ? currentCheckin.photos.filter(Boolean).slice(0, 3)
    : (currentCheckin.photo ? [currentCheckin.photo] : []);
  if (_ciPhotos.length > 0) {
    const _storageKeys = Array.isArray(currentCheckin.photoStorageKeys)
      ? currentCheckin.photoStorageKeys.slice(0, 3)
      : [];
    const _allStorage = _storageKeys.length === _ciPhotos.length && _storageKeys.every(Boolean);
    if (_allStorage) {
      // Storage-only — localStorage 폭증 차단.
      entry.photoStorageKeys = _storageKeys;
      delete entry.photos;
      delete entry.photo;
    } else {
      // 옛 fallback — Storage 일부 실패 or E2EE 미설정.
      entry.photos = _ciPhotos;
      entry.photo = _ciPhotos[0];
      if (_storageKeys.some(Boolean)) entry.photoStorageKeys = _storageKeys;
      else delete entry.photoStorageKeys;
    }
  } else {
    delete entry.photos;
    delete entry.photo;
    delete entry.photoStorageKeys;
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

  // V4 fix (사용자 보고 2026-05-20 ultrathink): saveState(true) force — _flushLocalSave + saveToCloud 즉시 fire.
  //   옛 saveState() = 400ms debounce + 1s cloud debounce → showScreen 직후 사용자 빠른 동작 시 race 손실.
  saveState(true);

  // V3.13.x: 체크인은 순수 기록. AI 자동 응답 X. note + dailyQuestion 답변은
  // entry에 저장만 (시스템 prompt로 자연스럽게 컨텍스트). 사용자가 chat에서 능동적으로 말 걸 때
  // AI가 그 정보 참조해서 응답.
  if (_isDiaryPath && typeof _resetCheckinDiaryMode === 'function') _resetCheckinDiaryMode();
  currentCheckin = {};
  _currentDailyQuestion = null;
  updateCheckinSub();
  showScreen('home');
  // V4 (사용자 명시 2026-05-18 ultrathink): 소라 emerge + tier toast (단순 토스트 대체).
  // V4 fix (사용자 명시 2026-05-22 ultrathink): 첫 체크인 (isFirst) OR 티어 진화 (isUpgrade) 시에만 효과/토스트 노출.
  //   같은 티어 + 변동 없는 수정 = 무반응 (소라 효과 X, 변경 X, 체크인 완료 토스트 X). UX 호들갑 회피.
  //   효과 표시 시 '체크인 완료!' 토스트 같이 (소라 emerge + 명시 완료 신호).
  const _shellShouldNotify = !!(_checkinShellResult && (_checkinShellResult.isFirst || _checkinShellResult.isUpgrade));
  if (_shellShouldNotify && typeof showCheckinShellReward === 'function') {
    showCheckinShellReward(_checkinShellResult);
    if (typeof showToast === 'function') showToast('체크인 완료!');
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

// 사용자 명시 2026-05-27 ultrathink: 홈 인라인 sleep widget — 4-18시 동안 큰 체크인 카드 자리에 노출.
//   onchange 즉시 자동 저장 (제출 버튼 X). vitality/mood 는 안 건드림 → entry 는 여전히 미완료.
//   "오늘 체크인" mini-link 누르면 큰 체크인 화면 진입 + sleep 값 prefill.
function onHomeSleepTimeChange() {
  _updateHomeSleepDuration();
  const sEl = document.getElementById('homeSleepStart');
  const eEl = document.getElementById('homeSleepEnd');
  if (!sEl || !eEl) return;
  const sVal = sEl.value;
  const eVal = eEl.value;
  // 둘 다 있을 때만 저장 — 사용자가 하나만 set 한 중간 상태에선 보류.
  if (!sVal || !eVal) return;
  _saveSleepInline({ allNighter: false, sleepStart: sVal, sleepEnd: eVal });
}

function onHomeSleepAllNighterChange(checked) {
  // UI 인라인 swap
  const pair = document.getElementById('homeSleepTimePair');
  const msg = document.getElementById('homeSleepAllNighterMsg');
  const dur = document.getElementById('homeSleepDuration');
  if (pair) pair.style.display = checked ? 'none' : '';
  if (msg) msg.style.display = checked ? '' : 'none';
  if (dur) dur.textContent = '';
  _saveSleepInline({ allNighter: !!checked });
}

function _saveSleepInline(opts) {
  try {
    const key = (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0, 10);
    state.entries = state.entries || [];
    let entry = state.entries.find(e => e.date === key);
    if (!entry) { entry = { date: key }; state.entries.push(entry); }
    if (opts.allNighter) {
      entry.allNighter = true;
      entry.sleepStart = '';
      entry.sleepEnd = '';
    } else {
      entry.allNighter = false;
      entry.sleepStart = opts.sleepStart || '';
      entry.sleepEnd = opts.sleepEnd || '';
    }
    entry.timestamp = new Date().toISOString();
    if (typeof saveState === 'function') saveState();
  } catch (e) { console.warn('[saveSleepInline]', e); }
}

function _updateHomeSleepDuration() {
  const sEl = document.getElementById('homeSleepStart');
  const eEl = document.getElementById('homeSleepEnd');
  const dEl = document.getElementById('homeSleepDuration');
  if (!sEl || !eEl || !dEl) return;
  if (!sEl.value || !eEl.value) { dEl.textContent = ''; return; }
  const [sh, sm] = sEl.value.split(':').map(Number);
  const [eh, em] = eEl.value.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  dEl.textContent = `약 ${hours}시간 ${mins}분`;
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

