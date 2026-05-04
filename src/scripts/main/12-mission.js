// ═══════════════════════════════════════════════════════════════
// MISSION SYSTEM (Phase 2 core)
// ═══════════════════════════════════════════════════════════════
// V3.13.x: 한 번에 한 개만 보여주는 페이지 인덱스 (모듈 스코프)
let _currentMissionIdx = 0;

// V3.13.x: 'YYYY-MM-DD' 키 두 개의 일수 차이 (b - a, 양수 = b가 미래)
function daysBetweenKeys(a, b) {
  if (!a || !b) return 0;
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  return Math.round((db - da) / 86400000);
}

// V3.13.x: 3일 이상 지난 pending 부름 자동 만료. init/홈 진입 시 호출.
function expireOldMissions() {
  const today = todayKey();
  let changed = false;
  (state.missions || []).forEach(m => {
    if (m.status !== 'pending') return;
    if (!m.scheduledFor) return;
    const diff = daysBetweenKeys(m.scheduledFor, today);
    if (diff >= 3) {
      m.status = 'expired';
      m.expiredAt = new Date().toISOString();
      changed = true;
    }
  });
  // 사용자 명시 2026-05-01 (agent audit): completed + attemptStatus 없음 + scheduledFor 14일+ 지남 → 자동 unknown.
  // 이전 = scheduledFor 만기 후 영원히 prompt 노출 stale 자리.
  (state.missions || []).forEach(m => {
    if (m.status !== 'completed') return;
    if (m.attemptStatus) return;
    if (!m.scheduledFor) return;
    const diff = daysBetweenKeys(m.scheduledFor, today);
    if (diff >= 14) {
      m.attemptStatus = 'unknown';
      m.attemptCheckedAt = new Date().toISOString();
      m._autoExpired = true;
      changed = true;
    }
  });
  if (changed) saveState();
}

// V4-fix v3 (사용자 요청): 가닥 미션 팔로업 — 오늘~7일 내 결과 체크 필요 미션 1개 찾기
// 2026-04-28 수정: 'completed' + attemptStatus 없음 = 결과 체크 대상 (사용자 명세 — '소라의 부름' 해냈어 처리됐을 때)
function _findPendingStrategyFollowup() {
  const today = todayKey();
  return (state.missions || []).find(m => {
    if (m.status !== 'completed') return false;
    if (m.attemptStatus) return false;  // 이미 result check 끝남 (worked/didnt/meh)
    if (!m.strategyId) return false;
    // 사용자 보고 2026-04-30 ultrathink-2: defer/일반 둘 다 한 번 prompt → 그 뒤 양생방에서만.
    // _followupAsked=true → skip. defer 시점에는 reset (만기일에 한 번 더).
    if (m._followupAsked) return false;
    if (m.scheduledFor && daysBetweenKeys(today, m.scheduledFor) > 0) return false;
    // defer된 미션 (scheduledFor 있음)은 7일 룰 무시 — 사용자 명시적 날짜 우선.
    if (m.scheduledFor) return true;
    // 일반 미션 (자동 follow-up) — 완료 후 7일 window
    // 사용자 보고 2026-04-30 ultrathink: completedAt fallback 시 .toISOString()(UTC) 대신 getDayKey (KST 4am cutoff) — 04:00-09:00 KST 윈도우 1일 off 버그 fix.
    const dateKey = m.completedDate || (m.completedAt ? getDayKey(m.completedAt) : null);
    if (!dateKey) return false;
    const diff = daysBetweenKeys(dateKey, today);
    // V4 (사용자 보고 2026-05-03): 같은 날 (diff=0, cutoff 안 지남) 자동 trigger 차단 → 다음날부터 (diff>=1).
    // 의도: 미션 완료 직후 결과 체크 모달 X. 4시 cutoff 지나야 자동 prompt.
    if (!(diff >= 1 && diff <= 7)) return false;
    // V4 (사용자 보고 2026-05-04 VB024): cutoff 직후 깨움 edge case 추가 차단.
    // 예) 23:30 완료 → 다음날 04:30 진입 시 diff=1 통과되지만 실제 5h 만 경과 → "하루 안 지났다" 사용자 체감.
    // 추가 가드: completedAt 으로부터 최소 12h 경과 (체감상 "하루" 으로 인식 가능 임계).
    if (m.completedAt) {
      const _now = (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now());
      const _elapsed = _now - new Date(m.completedAt).getTime();
      if (_elapsed < 12 * 3600000) return false;
    }
    return true;
  });
}

// V4 비전 6.2: 결과 체크 (체크인/채팅 진입 시 자동 팔로업)
// 사용자 요청 2026-04-27: 다음날 자동만, '⏸ 아직 결과 안 나왔어' 미루기, meh→돌연변이 confirm
async function offerStrategyFollowup() {
  // 튜토리얼 모드에선 자동 팔로업 X (사용자 요청 — 흐름 방해)
  if (window._onbTutorialMode) return;
  if (!state.preferences) state.preferences = {};
  const todayK = todayKey();
  const isTester = !!(state.preferences && state.preferences.testerMode);
  // 하루 한 번 가드 (테스터 모드는 매번 — 검증용)
  if (!isTester && state.preferences._lastFollowupAt === todayK) return;
  const mission = _findPendingStrategyFollowup();
  if (!mission) return;
  // 사용자 보고 2026-04-30 ultrathink: mission._followupAsked 제거.
  // 답 안 하고 dismiss시 다음날 또 나오게. daily gate (_lastFollowupAt) 만으로 same-day re-show 차단.
  state.preferences._lastFollowupAt = todayK;
  saveState();
  setTimeout(() => triggerAttemptResultFlow(mission), 600);
}

// 결과 체크 흐름 단일화 — followup / DNA 카드 버튼 / 튜토리얼 모두 같은 흐름
async function triggerAttemptResultFlow(mission) {
  if (!mission || typeof showAttemptResultModal !== 'function') return;
  const todayK = todayKey();
  // 사용자 보고 2026-04-30 ultrathink-2: 자동 prompt는 한 번만. dismiss/응답 모두 _followupAsked=true.
  // 결과 답 안 해도 다시 자동 prompt 안 함 → 양생방(execute)에서 사용자가 직접 결과 체크.
  if (mission && !mission.attemptStatus) {
    mission._followupAsked = true;
    saveState();
  }
  const card = (state.topicCards || []).find(c => c.id === mission.strategyId);
  const cardTitle = card ? card.title : mission.title;
  // V4 (v8 묶음 1): 객체 시그너처 — situation/missionTitle 전달
  const status = await showAttemptResultModal({
    strategyName: cardTitle,
    situation: mission.situation || '',
    missionTitle: mission.title || ''
  });
  if (!status) return;
  // ⏸ 미루기 — 날짜 picker → mission.scheduledFor 갱신, 결과 답 안 함. 만기일에 한 번 더 prompt.
  if (status === 'defer') {
    const dateChoice = await showDeferDatePicker();
    if (dateChoice) {
      mission.scheduledFor = dateChoice;
      // 사용자 보고 2026-04-30 ultrathink-2: defer 누르면 _followupAsked reset → 만기일에 한 번 더 prompt
      mission._followupAsked = false;
      saveState({ force: true });
      const formattedDate = new Date(dateChoice + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      showToast(`⏸ ${formattedDate}에 다시 물어볼게`);
      if (typeof renderTodayMission === 'function') renderTodayMission();
      if (typeof renderArchive === 'function') renderArchive();
    }
    return;
  }
  // 일반 결과 기록
  mission.status = 'completed';
  mission.completedDate = todayK;
  mission.completedAt = new Date().toISOString();
  mission.attemptStatus = status;
  if (typeof recordStrategyAttempt === 'function') {
    try { recordStrategyAttempt(mission.strategyId, status, mission.id); } catch (e) { console.warn('recordStrategyAttempt:', e); }
  }
  saveState({ force: true });
  // 작동했어 → DNA 적용되는 효과 재생 (사용자 요청 2026-04-27)
  if (status === 'worked' && typeof playDnaInsertionEffect === 'function') {
    try { playDnaInsertionEffect(); } catch (e) {}
  }
  // 사용자 요청 2026-04-27: 돌연변이 confirm 분기
  // - 첫 번째 'didnt' → confirm ("한 번 더 해볼래 vs 진화")
  // - 두 번째 이상 'didnt' → 자동 돌연변이 (확실한 signal)
  if (status === 'didnt' && typeof openMutationChat === 'function') {
    const card = (state.topicCards || []).find(c => c.id === mission.strategyId);
    const didntCount = (card && Array.isArray(card.generations))
      ? card.generations.flatMap(g => g.attempts || []).filter(a => a.status === 'didnt').length
      : 0;
    if (didntCount <= 1) {
      // 첫 번째 didnt — 사용자에게 선택권
      const yes = await showConfirmModal({
        title: '🤔 안 통했네',
        message: '첫 시도라 우연일 수도 있어.\n\n다른 가지에서 시도해볼래?\n(아니면 한 번 더 해보자)',
        okLabel: '🧬 진화해볼게',
        cancelLabel: '한 번 더'
      });
      if (yes) {
        // V4 (v8 묶음 10): Core 3-B 첫 경험 → mutation_intro step → onAdvance _afterMutationIntro 가 openMutationChat 자동
        if (state.tutorialShown && !state.tutorialShown.core3b && typeof startCore3B === 'function') {
          startCore3B(mission.strategyId, mission.title);
        } else {
          try { openMutationChat(mission.strategyId, mission.title); } catch (e) { console.warn('openMutationChat:', e); }
        }
      }
    } else {
      // 두 번째 이상 didnt — 자동 진화
      setTimeout(() => {
        if (state.tutorialShown && !state.tutorialShown.core3b && typeof startCore3B === 'function') {
          startCore3B(mission.strategyId, mission.title);
        } else {
          openMutationChat(mission.strategyId, mission.title);
        }
      }, 300);
    }
  } else if (status === 'meh' && typeof openMutationChat === 'function') {
    // 사용자 명시 2026-05-01 ultrathink: 'meh' 도 didnt 와 같은 카운트 가드. 첫 번째 = confirm / 두 번째 이상 = 자동 진화.
    const card = (state.topicCards || []).find(c => c.id === mission.strategyId);
    const mehCount = (card && Array.isArray(card.generations))
      ? card.generations.flatMap(g => g.attempts || []).filter(a => a.status === 'meh').length
      : 0;
    if (mehCount <= 1) {
      const yes = await showConfirmModal({
        title: '🌫 그저 그랬어',
        message: '이 도구가 너에게 충분히 안 맞은 듯.\n다른 가지에서 시도해볼까?',
        okLabel: '🧬 진화해볼게',
        cancelLabel: '한 번 더'
      });
      if (yes) {
        // V4 (v8 묶음 10): Core 3-B 첫 경험 → mutation_intro step → onAdvance _afterMutationIntro 가 openMutationChat 자동
        if (state.tutorialShown && !state.tutorialShown.core3b && typeof startCore3B === 'function') {
          startCore3B(mission.strategyId, mission.title);
        } else {
          try { openMutationChat(mission.strategyId, mission.title); } catch (e) { console.warn('openMutationChat:', e); }
        }
      }
    } else {
      // 두 번째 이상 meh — 자동 진화
      setTimeout(() => {
        if (state.tutorialShown && !state.tutorialShown.core3b && typeof startCore3B === 'function') {
          startCore3B(mission.strategyId, mission.title);
        } else {
          openMutationChat(mission.strategyId, mission.title);
        }
      }, 300);
    }
  } else {
    showToast(`✦ "${mission.title}" 결과 기록됨`);
  }
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderArchive === 'function') renderArchive();
  // V4 (v8 묶음 10): worked 첫 경험 → Core 3-A 트리거 (모래사장 자동 진입 + DNA 소라 안내)
  if (status === 'worked' && state.tutorialShown && !state.tutorialShown.core3a && typeof startCore3A === 'function') {
    setTimeout(() => startCore3A(mission), 700);
  }
}

// 미루기 날짜 picker — 1·3·7일 후 또는 직접
async function showDeferDatePicker() {
  const choice = await showOptionsModal({
    title: '⏸ 언제 다시 물어볼까?',
    message: '결과가 나올 만한 날 골라줘.',
    options: [
      { label: '내일',     value: 1 },
      { label: '3일 후',   value: 3 },
      { label: '1주일 후', value: 7 },
      { label: '2주일 후', value: 14 },
      { label: '한 달 후', value: 30 },
      { label: '📅 직접 고르기', value: 'custom' }
    ]
  });
  if (!choice) return null;
  // 사용자 요청 2026-04-30: '직접 고르기' = 캘린더 picker
  if (choice === 'custom') {
    return await _showCustomDatePicker();
  }
  // 사용자 요청 2026-04-28: 서버 시간 기반 (디바이스 시계 잘못돼도 정확)
  const today = (typeof getServerNow === 'function') ? getServerNow() : new Date();
  // 사용자 보고 2026-04-30: showOptionsModal이 onclick HTML로 value 직렬화하면서 string 변환됨.
  // `30 + "7"` = "307" → setDate(307) = 2027-02-01 같은 정신나간 날짜. Number 강제.
  today.setDate(today.getDate() + Number(choice));
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function _showCustomDatePicker() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay show';
    overlay.style.zIndex = '10001';
    const today = (typeof getServerNow === 'function') ? getServerNow() : new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const maxDate = new Date(today.getTime() + 365 * 86400000);
    const maxStr = maxDate.toISOString().split('T')[0];
    overlay.innerHTML = `
      <div class="input-modal" style="max-width:340px; padding:24px;">
        <div style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:8px;">📅 날짜 고르기</div>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:14px;">결과 나올 만한 날 골라줘.</div>
        <input type="date" id="customDeferDate" min="${tomorrowStr}" max="${maxStr}" value="${tomorrowStr}" style="width:100%; padding:10px 12px; font-size:14px; border-radius:10px; background:var(--surface); border:1px solid var(--border); color:var(--text); color-scheme: dark;">
        <div style="display:flex; gap:8px; margin-top:14px;">
          <button class="btn-primary" id="customDeferOk" style="flex:1;">고르기 ✦</button>
          <button class="btn-secondary" id="customDeferCancel" style="flex:1;">취소</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('customDeferOk').onclick = () => {
      const val = document.getElementById('customDeferDate').value;
      overlay.remove();
      resolve(val || null);
    };
    document.getElementById('customDeferCancel').onclick = () => {
      overlay.remove();
      resolve(null);
    };
  });
}

// 미션 해냈어 → 얻은 소라 화려한 효과 (사용자 요청 2026-04-28)
function playMissionRewardEffect(shell) {
  if (!shell) return;
  const isLegendary = shell.rarity === 'legendary' || shell.tier === 'legend';
  const overlay = document.createElement('div');
  overlay.className = 'mission-reward-overlay';
  overlay.innerHTML = `
    <div class="mission-reward-shell${isLegendary ? ' legendary' : ''}">${shell.emoji || shell.type || '⭐'}</div>
    <div class="mission-reward-label">${isLegendary ? '✨ 특별한 부름!' : '🐚 새 소라 획득!'}</div>
    <div class="mission-reward-tier">${shell.label || shell.tier || ''}</div>
  `;
  document.body.appendChild(overlay);
  // 입자 burst
  const particles = isLegendary
    ? ['🌈','✨','🦄','🌌','💫','🦋','🌸','🪐','💖','🎀']
    : ['⭐','✨','🌟','💫','🪐','🐚','🌙'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const count = isLegendary ? 16 : 10;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'mission-reward-particle';
    p.textContent = particles[i % particles.length];
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 160 + Math.random() * 80;
    const ex = Math.cos(angle) * dist;
    const ey = Math.sin(angle) * dist - 30;
    p.style.setProperty('--mr-end', `translate(${ex}px, ${ey}px)`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2100);
  }
  setTimeout(() => overlay.remove(), 2700);
}

// 사용자 요청 2026-04-28: DNA 진주 3종 슬라이더 모달 (튜토리얼)
let _dnaPearlTypesIdx = 0;
function showDnaPearlTypesModal() {
  const types = [
    {
      path: 'one-shot',
      emoji: '🌱',
      label: '빠른 발견',
      color: '#8fc88f',
      description: '한 가지에서 바로 통한 전략.\n시도 = 첫 번째에 통함. 너 자신을 잘 알아서 빠르게 찾았어.',
      shells: ['⭐', '🌟', '✨', '💫', '🌙']
    },
    {
      path: 'quick-discovery',
      emoji: '🌳',
      label: '성장의 길',
      color: '#ffd93d',
      description: '한 가지에서 반복 시도로 도달.\n같은 방향 끈질기게 — 7번 8번 시도해서 성장했어.',
      shells: ['⭐', '⭐', '🌟', '✨', '💫', '⭐', '🌟']
    },
    {
      path: 'evolved',
      emoji: '🧬',
      label: '진화한 길',
      color: 'gradient',
      description: '여러 가지 거쳐 진화로 도달.\n안 통한 가지 → 다른 가지 시도 → 결국 너에게 맞는 모양.',
      shells: ['⭐', '🌟', '🦄', '✨', '💎', '🌌']
    }
  ];
  _dnaPearlTypesIdx = 0;
  let overlay = document.getElementById('dnaPearlTypesOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'dnaPearlTypesOverlay';
  overlay.className = 'dna-pearl-types-overlay';
  overlay.innerHTML = `
    <div class="dna-pearl-types-modal" onclick="event.stopPropagation()">
      <button class="dna-pearl-types-close" onclick="closeDnaPearlTypesModal()">✕</button>
      <div class="dna-pearl-types-slide" id="dnaPearlTypesSlide"></div>
      <div class="dna-pearl-types-nav">
        <button class="dna-pearl-types-arrow" onclick="navDnaPearlTypes(-1)">‹</button>
        <div class="dna-pearl-types-dots" id="dnaPearlTypesDots"></div>
        <button class="dna-pearl-types-arrow" onclick="navDnaPearlTypes(1)">›</button>
      </div>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeDnaPearlTypesModal(); };
  document.body.appendChild(overlay);
  window._dnaPearlTypesData = types;
  _renderDnaPearlTypesSlide();
}
function _renderDnaPearlTypesSlide() {
  const types = window._dnaPearlTypesData || [];
  const t = types[_dnaPearlTypesIdx];
  if (!t) return;
  const slideEl = document.getElementById('dnaPearlTypesSlide');
  const dotsEl = document.getElementById('dnaPearlTypesDots');
  if (!slideEl || !dotsEl) return;
  // 미니 진주 SVG (간단 + path별 색)
  const colorFill = t.color === 'gradient' ? 'url(#dpt-rainbow)' : t.color;
  const shellsRing = t.shells.map((emoji, i) => {
    const angle = (i / t.shells.length) * 360 - 90;
    const cx = 100 + 70 * Math.cos(angle * Math.PI / 180);
    const cy = 100 + 70 * Math.sin(angle * Math.PI / 180);
    return `<text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle" font-size="18" style="filter:drop-shadow(0 0 3px gold);">${emoji}</text>`;
  }).join('');
  slideEl.innerHTML = `
    <svg viewBox="0 0 200 200" width="220" height="220" style="display:block; margin: 0 auto;">
      <defs>
        <radialGradient id="dpt-pearl-${t.path}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
          <stop offset="60%" stop-color="${t.color === 'gradient' ? '#ffd93d' : t.color}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${t.color === 'gradient' ? '#5fcfba' : t.color}" stop-opacity="0.4"/>
        </radialGradient>
        <linearGradient id="dpt-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff6b6b"/>
          <stop offset="33%" stop-color="#ffd93d"/>
          <stop offset="66%" stop-color="#5fcfba"/>
          <stop offset="100%" stop-color="#8b7ec4"/>
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="38" fill="url(#dpt-pearl-${t.path})" stroke="${t.color === 'gradient' ? '#ffd93d' : t.color}" stroke-width="2" opacity="0.9"/>
      <text x="100" y="115" text-anchor="middle" font-size="40">${t.emoji}</text>
      ${shellsRing}
    </svg>
    <div class="dna-pearl-types-label">${t.emoji} ${t.label}</div>
    <div class="dna-pearl-types-desc">${escapeHtml(t.description).replace(/\n/g, '<br>')}</div>
    <div class="dna-pearl-types-counter">${_dnaPearlTypesIdx + 1} / ${types.length}</div>
  `;
  dotsEl.innerHTML = types.map((_, i) =>
    `<span class="dpt-dot${i === _dnaPearlTypesIdx ? ' active' : ''}" onclick="_jumpDnaPearlTypes(${i})"></span>`
  ).join('');
}
function navDnaPearlTypes(delta) {
  const types = window._dnaPearlTypesData || [];
  _dnaPearlTypesIdx = (_dnaPearlTypesIdx + delta + types.length) % types.length;
  _renderDnaPearlTypesSlide();
}
function _jumpDnaPearlTypes(idx) {
  _dnaPearlTypesIdx = idx;
  _renderDnaPearlTypesSlide();
}
function closeDnaPearlTypesModal() {
  const overlay = document.getElementById('dnaPearlTypesOverlay');
  if (overlay) overlay.remove();
  window._dnaPearlTypesData = null;
}

// DNA 적용되는 효과 — 가닥에 worked 흔적 적용될 때 시각 피드백 (사용자 요청 2026-04-27, 전체 적용)
function playDnaInsertionEffect() {
  const main = document.createElement('div');
  main.className = 'dna-insert-fx';
  main.textContent = '🧬';
  document.body.appendChild(main);
  // 주변 입자 (소라 + 진주)
  const particles = ['🐚','✨','⭐','💫','🪐','🌟'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    p.className = 'dna-insert-particle';
    p.textContent = particles[i % particles.length];
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    const angle = (i / 8) * Math.PI * 2;
    const dist = 120 + Math.random() * 40;
    const ex = Math.cos(angle) * dist;
    const ey = Math.sin(angle) * dist;
    p.style.setProperty('--end-transform', `translate(${ex}px, ${ey}px)`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }
  setTimeout(() => main.remove(), 1700);
}

// 양생방 DNA 카드에서 결과 체크 버튼 → 같은 흐름 호출
// 사용자 명세 2026-04-28: 결과 체크 대상 = 미션 'completed' + attemptStatus 없음
// 사용자 보고 2026-04-28: 가끔 다른 전략 표시 — 가장 최근 completedAt mission 우선 (defensive)
async function triggerAttemptResultFromCard(strategyId) {
  const candidates = (state.missions || []).filter(m =>
    m.strategyId === strategyId && m.status === 'completed' && !m.attemptStatus
  );
  if (candidates.length === 0) {
    showToast('결과 체크 대기 중인 미션이 없어');
    return;
  }
  // 가장 최근 completedAt 우선 (혹시 여러 개 있으면 최신)
  candidates.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  await triggerAttemptResultFlow(candidates[0]);
}

// V3.13.x: 오늘 list = 오늘 + 1·2일 전 pending. 0일 먼저 정렬. 없으면 오늘 완료 1개.
function getTodayMissions() {
  const today = todayKey();
  const pending = (state.missions || []).filter(m => {
    if (m.status !== 'pending' || !m.scheduledFor) return false;
    const diff = daysBetweenKeys(m.scheduledFor, today);
    return diff >= 0 && diff <= 2;
  });
  if (pending.length > 0) {
    pending.sort((a, b) => daysBetweenKeys(a.scheduledFor, today) - daysBetweenKeys(b.scheduledFor, today));
    return pending;
  }
  const lastCompleted = (state.missions || []).filter(m => m.completedDate === today).slice(-1);
  return lastCompleted;
}

// 하위호환 (다른 곳에서 단일 미션 참조용)
function getTodayMission() {
  return getTodayMissions()[0];
}

function hasActivePendingMission() {
  const key = todayKey();
  return (state.missions || []).some(m => m.scheduledFor === key && m.status === 'pending');
}

// 사용자 명시 2026-04-30 ultrathink: 어제 체크인 있을 때 홈 카드 1회 표시. 클릭 → 도서관 캘린더 어제 modal.
// 사용자 보고 2026-05-01: 옛 = getDayKey(now-24h) — 4AM cutoff 적용해서 새벽 시간대 / 캘린더 mental 사용자에게 '그저께' 반환 버그.
// fix = 캘린더 어제 (now 의 calendar 날짜 - 1일). entry.date 는 todayKey() 로 저장되지만 normal 사용자 entries 는 캘린더 어제와 일치.
function _calendarYesterdayKey() {
  const nowMs = (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now());
  const d = new Date(nowMs);
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`;
}
// 사용자 명시 2026-05-02: 어제 entry 가 있어도 hollow (체크인/일기/관찰 모두 비었으면) 카드 X.
// "새로운 데이터" = 의미 있는 field 한 개 이상. 이전엔 entry 자체 존재만으로 카드 표시 → 빈 record 도 카드 노출.
// 사용자 명시 2026-05-02 ultrathink (추가): aiSummary 도 검사 — diary batch path 의 hollow entry 에 summary 들어간 후 카드 표시 보장.
function _hasYesterdayContent(entry) {
  if (!entry) return false;
  return !!(
    (entry.diary && entry.diary.trim()) ||
    (entry.aiSummary && entry.aiSummary.trim()) ||
    (entry.note && entry.note.trim()) ||
    entry.vitality != null ||
    entry.mood != null ||
    entry.sleepStart ||
    entry.music ||
    entry.photo ||
    (entry.dailyQuestionAnswer && entry.dailyQuestionAnswer.trim())
  );
}

function renderYesterdayCard() {
  const container = document.getElementById('yesterdayCardContainer');
  if (!container) return;
  const yesterdayK = _calendarYesterdayKey();
  const yesterdayEntry = (state.entries || []).find(e => e.date === yesterdayK);
  if (!_hasYesterdayContent(yesterdayEntry)) { container.innerHTML = ''; return; }
  // 사용자 명시 2026-05-02 ultrathink: batch API 도입 — 4AM batch 처리 중 (state.pendingBatch != null) 이면 카드 X.
  // 이유: 카드 click → openDayModal → chapter analysis 자리. batch 결과 미완 시 분석 빈 상태 → 의미 없음.
  // batch 끝 (또는 12h timeout fallback) 시 자동 노출. _resumePendingBatch 가 maybeRunDailyChapterExtract 안에서 처리.
  if (state.pendingBatch && state.pendingBatch.batch_id) { container.innerHTML = ''; return; }
  const seen = state.preferences && state.preferences._yesterdayCardSeen === yesterdayK;
  if (seen) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="yesterday-card" onclick="openYesterdayPage('${yesterdayK}')">
      <div class="yc-icon">🌙</div>
      <div class="yc-content">
        <div class="yc-title">어제의 기록 볼래?</div>
        <div class="yc-sub">어제 적어둔 거 다시 보기 →</div>
      </div>
    </div>
  `;
}

function openYesterdayPage(dateKey) {
  if (!state.preferences) state.preferences = {};
  state.preferences._yesterdayCardSeen = dateKey;
  if (typeof saveState === 'function') saveState();
  const container = document.getElementById('yesterdayCardContainer');
  if (container) container.innerHTML = '';
  if (typeof showScreen === 'function') showScreen('archive');
  setTimeout(() => {
    if (typeof openDayModal === 'function') openDayModal(dateKey);
  }, 350);
}

// 사용자 명시 2026-04-30 ultrathink: 개발자 도구 — 어제 카드 강제 표시 (어제 entry 없어도 표시).
function devForceYesterdayCard() {
  // seen flag reset
  if (state.preferences) delete state.preferences._yesterdayCardSeen;
  if (typeof saveState === 'function') saveState();
  // 홈으로 이동
  if (typeof showScreen === 'function') showScreen('home');
  setTimeout(() => {
    const container = document.getElementById('yesterdayCardContainer');
    if (!container) { showToast('홈 컨테이너 X'); return; }
    const yesterdayK = _calendarYesterdayKey();
    const realEntry = (state.entries || []).find(e => e.date === yesterdayK);
    // 어제 entry 있으면 정상 카드 / 없어도 강제 표시 (개발 테스트용 mock)
    const dateForClick = realEntry ? yesterdayK : yesterdayK;  // 어제 날짜 그대로 사용 — modal 자체는 entry 없으면 토스트
    const noteSuffix = realEntry ? '' : ' (개발: 어제 entry X — 클릭 시 토스트만)';
    container.innerHTML = `
      <div class="yesterday-card" onclick="openYesterdayPage('${dateForClick}')">
        <div class="yc-icon">🌙</div>
        <div class="yc-content">
          <div class="yc-title">어제의 기록 볼래?</div>
          <div class="yc-sub">어제 적어둔 거 다시 보기 →${noteSuffix}</div>
        </div>
      </div>
    `;
    showToast('🌙 어제 카드 강제 표시 — 홈에서 확인');
  }, 200);
}

// 사용자 명시 2026-05-02 ultrathink: 결과 체크 모달 미리보기 — admin devTools. mission mock + 결과 toast 만 (실제 mission 의 attemptStatus 건드리지 X).
async function devPreviewAttemptResult() {
  if (typeof showAttemptResultModal !== 'function') {
    if (typeof showToast === 'function') showToast('showAttemptResultModal 함수 X');
    return;
  }
  const sampleStrategy = '11시 전 자기';
  try {
    const status = await showAttemptResultModal(sampleStrategy);
    const labelMap = {
      worked: '👍 해결 됐어',
      meh: '🤔 그저 그래',
      didnt: '👎 안 통했어',
      skipped: '😅 못 시도했어',
      defer: '⏸ 아직 결과 안 나왔어',
      cancel: '✕ 취소'
    };
    const label = labelMap[status] || status || '✕ 닫음';
    if (typeof showToast === 'function') showToast(`🔍 미리보기 결과: ${label} (실제 mission 의 attemptStatus 건드리지 X)`);
  } catch (e) {
    console.warn('[dev preview attempt result]', e);
    if (typeof showToast === 'function') showToast('미리보기 실패: ' + (e?.message || e));
  }
}

function renderTodayMission() {
  const container = document.getElementById('missionContainer');
  if (!container) return;
  const list = getTodayMissions();

  // V4: render 후 잠금 시각 갱신
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 0);

  if (list.length === 0) {
    container.innerHTML = '';
    return;
  }

  // 인덱스 범위 보정
  if (_currentMissionIdx >= list.length) _currentMissionIdx = 0;
  if (_currentMissionIdx < 0) _currentMissionIdx = list.length - 1;
  const mission = list[_currentMissionIdx];
  const total = list.length;

  const navHtml = total > 1 ? `
    <div class="mission-nav">
      <button class="mission-nav-btn" onclick="prevMission()" aria-label="이전 부름">‹</button>
      <span class="mission-nav-pos">${_currentMissionIdx + 1} / ${total}</span>
      <button class="mission-nav-btn" onclick="nextMission()" aria-label="다음 부름">›</button>
    </div>
  ` : '';

  // V3.13.x: 어제·그제 받은 부름 라벨
  const today = todayKey();
  const ageDiff = mission.scheduledFor ? -daysBetweenKeys(mission.scheduledFor, today) : 0;
  const ageLabel = ageDiff === 1 ? ' · 어제 받은 부름' : ageDiff === 2 ? ' · 그제 받은 부름' : '';

  if (mission.status === 'completed') {
    container.innerHTML = `
      <div class="mission-card completed">
        <div class="mission-label">🐚 소라의 부름 · 완료 ✦</div>
        <div class="mission-title">${escapeHtml(mission.title)}</div>
        ${mission.completionNote ? `<div class="mission-completion-msg">${escapeHtml(mission.completionNote)}</div>` : ''}
        ${navHtml}
      </div>
    `;
  } else {
    const rewardEmoji = '⭐';
    container.innerHTML = `
      <div class="mission-card sora-call${ageLabel ? ' carryover' : ''}">
        <div class="mission-label">🐚 소라의 부름${ageLabel}</div>
        <div class="mission-call-reward" title="이거 깨면 빛나는 소라 (가끔 ✨ 특별한 부름)">${rewardEmoji}</div>
        <div class="mission-title">${escapeHtml(mission.title)}</div>
        ${mission.description ? `<div class="mission-desc">${escapeHtml(mission.description)}</div>` : ''}
        <div class="mission-actions">
          <button class="mission-btn complete" onclick="completeMission('${mission.id}')">✓ 해냈어</button>
          <button class="mission-btn skip" onclick="skipMission('${mission.id}')">오늘은 패스</button>
        </div>
        ${navHtml}
      </div>
    `;
  }
}

function nextMission() {
  _currentMissionIdx += 1;
  renderTodayMission();
}
function prevMission() {
  _currentMissionIdx -= 1;
  renderTodayMission();
}

function createMission(title, description, options = {}) {
  // 사용자 요청 2026-04-30: 같은 strategy 여러 미션 OK. 단 동일 title pending 중복은 차단 (anti-double-click).
  const titleNorm = (title || '').trim();
  if (titleNorm) {
    const dupe = (state.missions || []).find(m =>
      m.status === 'pending' && (m.title || '').trim() === titleNorm
    );
    if (dupe) {
      showToast('이미 같은 부름이 등록되어 있어 🐚');
      return dupe;
    }
  }
  const mission = {
    id: 'mis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: titleNorm,
    description: description || '',
    createdAt: new Date().toISOString(),
    scheduledFor: options.scheduledFor || todayKey(),
    status: 'pending',
    sourceMessageIdx: options.sourceMessageIdx,
    linkedStrategy: options.linkedStrategy,
    strategyId: options.strategyId || null,
    generationIdx: options.generationIdx ?? null,
    // V4 (v8 묶음 2): mission 의 *원래 문제* 기록 → 결과 체크 모달 📌 원래 문제 박스 표시
    situation: options.situation || '',
    _situationSource: options._situationSource || null  // 'user_input' | 'llm_extracted' | null
  };
  state.missions.push(mission);
  saveState();
  return mission;
}

async function completeMission(missionId) {
  const mission = state.missions.find(m => m.id === missionId);
  if (!mission) return;

  // V3.13: 인증샷 필수 — 단, 튜토리얼 모드에선 우회 (실제 사진 X)
  let photo;
  if (window._onbTutorialMode) {
    photo = { thumb: '', verification: { verified: true, reason: '튜토리얼 — 인증샷 우회.' } };
  } else {
    photo = await captureAndVerifyMissionPhoto(mission);
    if (!photo) return;
  }

  mission.status = 'completed';
  mission.completedDate = todayKey();
  mission.completedAt = new Date().toISOString();
  mission.photoThumb = photo.thumb;
  mission.aiVerification = photo.verification.reason;

  // 결과 체크는 '다음날 자동' (offerStrategyFollowup)으로 통일 — 즉시 트리거 X.
  // 사용자 요청 2026-04-27: 즉시 모달 띄우지 말고, 다음날부터 followup만.

  // V3.13: 부름은 항상 call/legend 티어 (pickShellForTask 사용 — 5% legendary 가챠)
  const shell = pickShellForTask({ source: 'ai_mission', title: mission.title });
  if (shell) {
    state.shellCollection.push({
      type: shell.emoji,
      tier: shell.tier,
      points: shell.points,
      label: shell.label,
      rarity: shell.rarity,
      date: new Date().toISOString(),
      missionId: mission.id,
      title: mission.title,
      story: `소라의 부름 — "${mission.title}"`,
      photoThumb: photo.thumb,
      _id: 'shell_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    });
  }
  saveState();

  // 사용자 요청 2026-04-28: 화려한 효과 — 얻은 소라 큰 아이콘 + 입자 burst
  if (shell && typeof playMissionRewardEffect === 'function') {
    try { playMissionRewardEffect(shell); } catch (e) { console.warn('reward effect:', e); }
  } else if (shell?.rarity === 'legendary') {
    showCelebration('🌈', '특별한 부름이 왔어!', shell.emoji);
  } else {
    showCelebration('✨', '해냈다!', shell?.emoji || '⭐');
  }
  // V4 (v8 묶음 18): legendary 첫 획득 inline tip
  if (shell?.rarity === 'legendary' && typeof _showInlineTip === 'function') {
    setTimeout(() => _showInlineTip('specialShell'), 1500);
  }

  // Request AI brief encouragement
  if (_canAI()) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: _anthropicHeaders(),
        body: JSON.stringify({
          _endpoint: 'shell_story',
          model: 'claude-haiku-4-5',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `사용자가 "${mission.title}" 미션을 완료했어. 친구처럼 짧게 (1-2문장) 축하 메시지를 써줘. 과정이나 노력에 초점. 판에 적용된 "잘했어!" 금지. 구체적으로 진심으로. 반말. 이모지 최대 1개.`
          }]
        })
      });
      const data = await resp.json();
      mission.completionNote = data.content[0].text.trim();
      saveState();
    } catch (e) { console.error(e); }
  }

  setTimeout(() => {
    renderTodayMission();
    renderShellBar();
  }, 1500);
}

// V3.13: 인증샷 캡처 + AI 검증 시스템
async function captureAndVerifyMissionPhoto(mission) {
  const file = await pickPhotoFile();
  if (!file) return null;

  showFullscreenLoader('사진 확인 중... 🐚');
  try {
    const resized = await fileToResizedDataUrl(file, 1024);
    const thumb = await makeSquareThumb(resized, 200);
    const verification = await verifyMissionPhoto(mission, resized);
    hideFullscreenLoader();

    if (verification.verified) {
      // 인증 성공 → 짧은 succes 토스트 후 진행
      showToast('✓ 인증됨 — ' + verification.reason);
      return { thumb, verification };
    }
    // 실패 → 재시도 또는 취소
    const retry = await showConfirmModal({
      title: '⚠ 확인 안 됐어',
      message: verification.reason + '\n\n다시 찍어볼까?',
      okLabel: '📷 다시', cancelLabel: '취소'
    });
    if (retry) return captureAndVerifyMissionPhoto(mission);
    return null;
  } catch (err) {
    hideFullscreenLoader();
    // API 에러 시 fallback — 통과시켜 ADHD 사용자가 좌절 안 하도록
    const fallback = { verified: true, reason: '검증 못 했어. 통과시킬게.' };
    showToast('⚠ 검증 안 돼서 통과 처리.');
    try {
      const resized = await fileToResizedDataUrl(file, 1024);
      const thumb = await makeSquareThumb(resized, 200);
      return { thumb, verification: fallback };
    } catch {
      return { thumb: '', verification: fallback };
    }
  }
}

function pickPhotoFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // V3.13.x: capture 속성 제거 — iOS는 자동으로 '사진 촬영 / 사진 보관함 선택' action sheet 띄움
    // 알람 캡처 같은 스크린샷 미션도 갤러리에서 선택 가능
    input.style.display = 'none';
    document.body.appendChild(input);
    let resolved = false;
    input.addEventListener('change', () => {
      if (resolved) return; resolved = true;
      const file = input.files[0] || null;
      input.remove();
      resolve(file);
    });
    // Detect cancel via focus loss + empty files
    setTimeout(() => {
      window.addEventListener('focus', function once() {
        window.removeEventListener('focus', once);
        setTimeout(() => {
          if (resolved) return;
          if (!input.files || input.files.length === 0) {
            resolved = true;
            input.remove();
            resolve(null);
          }
        }, 400);
      }, { once: true });
    }, 100);
    input.click();
  });
}

// V4-fix: 사진 화질/용량 균형 (다른 앱들 수준) — quality 0.65 (용량 절약 우선)
async function fileToResizedDataUrl(file, maxSize = 1024, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// V4 fix v5 (사용자 명시 2026-05-04): 영상 진주 제목 = 이모티콘 prefix X.
// 옛 진주 / chat 추출 진주 등이 leading emoji 붙여 저장된 케이스 → 표시 시 strip.
// (음식/장소/순간 카테고리 icon prefix 는 사진 진주에서만 표시 — 영상은 bare content.)
function _stripLeadingEmoji(s) {
  if (!s) return s;
  // unicode emoji + variation selectors + skin tone + ZWJ sequences 까지 leading 부분만 제거.
  // 안전하게: 첫 character 가 letter/digit 가 아니고 emoji property 가지면 strip.
  try {
    return s.replace(/^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}️‍]+\s*)+/u, '').trimStart();
  } catch(_) {
    return s;
  }
}

// V4: 진주 동영상 picker — 갤러리/카메라 양쪽 가능
function pickVideoFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    let resolved = false;
    input.addEventListener('change', () => {
      if (resolved) return; resolved = true;
      const file = input.files[0] || null;
      input.remove();
      resolve(file);
    });
    setTimeout(() => {
      window.addEventListener('focus', function once() {
        window.removeEventListener('focus', once);
        setTimeout(() => {
          if (resolved) return;
          if (!input.files || input.files.length === 0) {
            resolved = true;
            input.remove();
            resolve(null);
          }
        }, 400);
      }, { once: true });
    }, 100);
    input.click();
  });
}

// V4 fix v2 (사용자 보고: 압축본 안 보이고 재생 X): 압축 폐기 → 원본 그대로 + 길이/사이즈 가드.
// MediaRecorder 인코딩 broken 의심 + iOS Safari video data: URI 부분지원 의심 둘 다 우회.
// 원본 mp4 (H.264) = 모든 디바이스 native 디코딩 OK. 렌더는 blob URL 로.
async function _getVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    v.onloadedmetadata = () => {
      const d = v.duration || 0;
      try { URL.revokeObjectURL(url); } catch(_) {}
      resolve(d);
    };
    v.onerror = () => {
      try { URL.revokeObjectURL(url); } catch(_) {}
      resolve(-1);
    };
    setTimeout(() => resolve(-1), 5000);
  });
}

async function _fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}

// V4 fix v2: 진주 동영상 hydration — state 의 dataURL 을 blob URL 로 변환해 video src 적용하기.
// iOS Safari `<video>` data: URI 부분지원 회피. cache 로 1회 발급 후 재사용.
const _pearlVideoBlobCache = new Map(); // pearlId -> blobUrl
function hydratePearlVideos() {
  try {
    document.querySelectorAll('video[data-pearl-vid]').forEach(v => {
      // 사용자 보고 2026-05-02 ultrathink: 영상 진주 소리 X 버그 — video element 의 muted 강제 X 명시.
      // iOS Safari 일부 케이스 default muted 적용 가능성 차단 (Web Audio session conflict 등).
      v.muted = false;
      v.volume = 1.0;
      if (v.dataset.hydrated === '1' && v.src) return;
      const id = v.dataset.pearlVid;
      const cached = _pearlVideoBlobCache.get(id);
      if (cached) {
        v.src = cached;
        v.dataset.hydrated = '1';
        return;
      }
      const pearl = (state.pearls || []).find(p => p.id === id);
      if (!pearl || !pearl.video) return;
      // V4 fix v5 (사용자 보고 2026-05-04): blob 변환 실패 시 data URL 직접 세팅 fallback (재생 불가 회피).
      fetch(pearl.video).then(r => r.blob()).then(b => {
        const url = URL.createObjectURL(b);
        _pearlVideoBlobCache.set(id, url);
        v.src = url;
        v.dataset.hydrated = '1';
      }).catch(e => {
        console.warn('video hydrate blob fail, data URL fallback:', e);
        try {
          v.src = pearl.video;
          v.dataset.hydrated = '1';
        } catch(_) {}
      });
    });
  } catch(_) {}
}

// 진주 삭제 시 cache cleanup
function _revokePearlVideoCache(pearlId) {
  const url = _pearlVideoBlobCache.get(pearlId);
  if (url) {
    try { URL.revokeObjectURL(url); } catch(_) {}
    _pearlVideoBlobCache.delete(pearlId);
  }
}

// 사용자 명시 2026-05-03: 영상 5초 limit + trim UI (Twitter/Instagram 스타일).
// thumbnail = 8 frame strip + start/end handle drag + selected range max maxSec sec.
// resolve: { startTime, endTime } 또는 null (cancel).
let _vtmState = null;

async function _generateVideoThumbnails(video, count) {
  const thumbs = [];
  const W = 80, H = 50;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const dur = video.duration;
  for (let i = 0; i < count; i++) {
    const t = (dur / count) * i + (dur / count) * 0.5;  // 중앙 시점
    await new Promise((res) => {
      let done = false;
      const onSeeked = () => {
        if (done) return; done = true;
        video.removeEventListener('seeked', onSeeked);
        res();
      };
      video.addEventListener('seeked', onSeeked);
      try { video.currentTime = Math.min(t, dur - 0.01); } catch(_) { onSeeked(); }
      setTimeout(() => { if (!done) onSeeked(); }, 1500);
    });
    try { ctx.drawImage(video, 0, 0, W, H); thumbs.push(canvas.toDataURL('image/jpeg', 0.5)); }
    catch(_) { thumbs.push(''); }
  }
  try { video.currentTime = 0; } catch(_) {}
  return thumbs;
}

function pickVideoTrimRange(file, maxSec) {
  maxSec = maxSec || 5;
  return new Promise((resolve) => {
    // V4 fix v5 (사용자 보고 2026-05-04): trim modal 안 열리는 케이스 — 기존 _vtmState 잔여 race 방지.
    _vtmState = null;
    // 기존 overlay 잔존 시 제거 (재호출 race)
    document.querySelectorAll('.vtm-overlay').forEach(o => { try { o.remove(); } catch(_) {} });
    const overlay = document.createElement('div');
    overlay.className = 'vtm-overlay';
    overlay.innerHTML = `
      <div class="vtm-card">
        <div class="vtm-title">영상 자르기 (최대 ${maxSec}초)</div>
        <div class="vtm-sub">손잡이 끌어서 ${maxSec}초 구간 골라</div>
        <div class="vtm-video-wrap"><video class="vtm-video" muted playsinline></video></div>
        <div class="vtm-strip"><div class="vtm-strip-loading">미리보기 만드는 중...</div></div>
        <div class="vtm-track">
          <div class="vtm-selection"></div>
          <div class="vtm-handle vtm-handle-start"></div>
          <div class="vtm-handle vtm-handle-end"></div>
        </div>
        <div class="vtm-meta">
          <span class="vtm-meta-start">0.0s</span>
          <span class="vtm-meta-dur">0.0s</span>
          <span class="vtm-meta-end">0.0s</span>
        </div>
        <div class="vtm-actions">
          <button class="vtm-btn vtm-btn-cancel">취소</button>
          <button class="vtm-btn primary vtm-btn-ok">자르기 ✦</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const url = URL.createObjectURL(file);
    const v = overlay.querySelector('.vtm-video');
    v.src = url;

    let cleaned = false;
    const cleanup = (result) => {
      if (cleaned) return; cleaned = true;
      try { v.pause(); } catch(_) {}
      try { URL.revokeObjectURL(url); } catch(_) {}
      overlay.classList.remove('show');
      setTimeout(() => { try { overlay.remove(); } catch(_) {} _vtmState = null; resolve(result); }, 180);
    };

    v.onloadedmetadata = async () => {
      const dur = v.duration;
      // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): dur 이 Infinity (live HLS / 일부 Safari mov) 또는 0 / NaN 케이스 가드.
      // 그대로 진행하면 handle 위치 NaN% / 0% → 사용자가 trim 못 함 → modal 멈춤 신고.
      if (!Number.isFinite(dur) || dur <= 0.05) {
        try { showToast('영상 길이 읽기 실패 — 다른 영상 시도'); } catch(_) {}
        cleanup(null);
        return;
      }
      _vtmState = { dur, start: 0, end: Math.min(maxSec, dur), maxSec, v, overlay };
      const minSel = Math.min(0.5, dur);  // 최소 0.5초

      const sel = overlay.querySelector('.vtm-selection');
      const hStart = overlay.querySelector('.vtm-handle-start');
      const hEnd = overlay.querySelector('.vtm-handle-end');
      const track = overlay.querySelector('.vtm-track');
      const lblS = overlay.querySelector('.vtm-meta-start');
      const lblE = overlay.querySelector('.vtm-meta-end');
      const lblD = overlay.querySelector('.vtm-meta-dur');
      const strip = overlay.querySelector('.vtm-strip');

      const render = () => {
        const sP = (_vtmState.start / dur) * 100;
        const eP = (_vtmState.end / dur) * 100;
        sel.style.left = sP + '%';
        sel.style.width = (eP - sP) + '%';
        hStart.style.left = sP + '%';
        hEnd.style.left = eP + '%';
        lblS.textContent = _vtmState.start.toFixed(1) + 's';
        lblE.textContent = _vtmState.end.toFixed(1) + 's';
        lblD.textContent = (_vtmState.end - _vtmState.start).toFixed(1) + 's';
      };

      const previewSeek = (() => {
        let pendingTime = null;
        let seeking = false;
        const flush = () => {
          if (pendingTime == null) { seeking = false; return; }
          const t = pendingTime; pendingTime = null;
          seeking = true;
          const onDone = () => { v.removeEventListener('seeked', onDone); flush(); };
          v.addEventListener('seeked', onDone);
          try { v.currentTime = t; } catch(_) { v.removeEventListener('seeked', onDone); seeking = false; }
        };
        return (t) => { pendingTime = t; if (!seeking) flush(); };
      })();

      const dragHandle = (handle, isStart) => {
        const onDown = (e) => {
          e.preventDefault();
          const onMove = (ev) => {
            const rect = track.getBoundingClientRect();
            const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
            const pct = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
            const t = pct * dur;
            if (isStart) {
              _vtmState.start = Math.min(t, _vtmState.end - minSel);
              if (_vtmState.start < 0) _vtmState.start = 0;
              if (_vtmState.end - _vtmState.start > maxSec) _vtmState.end = _vtmState.start + maxSec;
              previewSeek(_vtmState.start);
            } else {
              _vtmState.end = Math.max(t, _vtmState.start + minSel);
              if (_vtmState.end > dur) _vtmState.end = dur;
              if (_vtmState.end - _vtmState.start > maxSec) _vtmState.start = _vtmState.end - maxSec;
              previewSeek(_vtmState.end - 0.1);
            }
            render();
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
          document.addEventListener('touchmove', onMove, { passive: false });
          document.addEventListener('touchend', onUp);
        };
        handle.addEventListener('mousedown', onDown);
        handle.addEventListener('touchstart', onDown, { passive: false });
      };
      dragHandle(hStart, true);
      dragHandle(hEnd, false);

      render();
      // thumbnail strip 생성 (8 frame, async)
      try {
        const thumbs = await _generateVideoThumbnails(v, 8);
        strip.innerHTML = thumbs.map(t => t ? `<img src="${t}" />` : '<div></div>').join('');
      } catch(_) {
        strip.innerHTML = '<div class="vtm-strip-loading">미리보기 없음</div>';
      }
      // preview seek = start
      try { v.currentTime = 0; } catch(_) {}

      overlay.querySelector('.vtm-btn-ok').onclick = () => {
        cleanup({ startTime: _vtmState.start, endTime: _vtmState.end });
      };
      overlay.querySelector('.vtm-btn-cancel').onclick = () => cleanup(null);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(null);
      });
    };
    v.onerror = () => {
      // V4 fix v5 (사용자 보고 2026-05-04): metadata 로드 실패 (Safari .mov / 미지원 코덱) — 사용자 안내.
      try { showToast('영상 미리보기 못 만듦 — 다른 영상 시도'); } catch(_) {}
      cleanup(null);
    };
    // metadata timeout safety — 8초 안에 onloadedmetadata 안 fire 시 cancel.
    setTimeout(() => {
      if (!_vtmState && !cleaned) {
        try { showToast('영상 로드 timeout — 다시 시도'); } catch(_) {}
        cleanup(null);
      }
    }, 8000);
    setTimeout(() => overlay.classList.add('show'), 10);
  });
}

// 사용자 명시 2026-05-03: .mov / iOS Safari decodeAudioData 미지원 fallback.
// video element captureStream + AudioContext.createMediaStreamSource + ScriptProcessor 로 capture.
// 5초 영상 = real-time 5초 처리 — UX 는 fullscreen loader 표시로 OK.
async function _captureAudioFromVideo(file, startSec, endSec, sampleRate) {
  return new Promise(async (resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.src = url;
    v.muted = false;
    v.volume = 1.0;
    v.playsInline = true;
    v.preload = 'auto';
    v.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(v);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; cleaned = true;
      try { v.pause(); } catch(_) {}
      try { v.remove(); } catch(_) {}
      try { URL.revokeObjectURL(url); } catch(_) {}
    };

    try {
      await new Promise((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = () => rej(new Error('비디오 로드 실패'));
        setTimeout(() => rej(new Error('비디오 로드 timeout')), 8000);
      });

      // 사용자 보고 2026-05-03 ultrathink: iOS Safari 의 captureStream 미지원 → createMediaElementSource fallback path 추가.
      // path A (Chrome / Firefox / Edge): v.captureStream() → MediaStreamSource → ScriptProcessor
      // path B (iOS Safari 14+): createMediaElementSource(v) → ScriptProcessor → gain(0) → destination
      const hasCaptureStream = typeof v.captureStream === 'function';
      let usePathB = !hasCaptureStream;

      // startSec seek (path A/B 공통)
      if (startSec > 0) {
        await new Promise((res) => {
          let done = false;
          const onSeeked = () => { if (done) return; done = true; v.removeEventListener('seeked', onSeeked); res(); };
          v.addEventListener('seeked', onSeeked);
          try { v.currentTime = startSec; } catch(_) { onSeeked(); }
          setTimeout(() => { if (!done) onSeeked(); }, 2000);
        });
      }

      // path A 시도 (지원 시) — audio track 없으면 path B 로 fallback
      let stream = null;
      if (!usePathB) {
        try {
          stream = v.captureStream();
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length === 0) {
            try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
            stream = null;
            usePathB = true;
          }
        } catch (_) {
          stream = null;
          usePathB = true;
        }
      }

      const AC = window.AudioContext || window.webkitAudioContext;
      let ctx;
      // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): path B (createMediaElementSource = iOS Safari 17.4 이하 fallback) 는
      // source 의 native sampleRate 와 ctx.sampleRate 가 일치해야 throw 안 함. ctx 에 강제 sampleRate 옵션 주면 mismatch → throw.
      // → path B 시 인자 없이 default 로 만들어 system 매칭. path A (captureStream) 는 createMediaStreamSource 가 자동 resample 이라 OK.
      if (usePathB) {
        try { ctx = new AC(); } catch(e) {
          cleanup();
          return reject(new Error('AudioContext 생성 실패: ' + (e?.message || e)));
        }
      } else {
        try { ctx = new AC({ sampleRate }); } catch(_) { ctx = new AC(); }
      }
      // iOS Safari = AudioContext suspended start. 명시적 resume 필요.
      try { if (ctx.state === 'suspended') await ctx.resume(); } catch(_) {}
      const actualSR = ctx.sampleRate;

      const BUFFER = 4096;
      const numCh = 2;
      const captured = [[], []];

      let source = null;
      let processor = null;
      let gain = null;

      const onProcess = (e) => {
        const ib = e.inputBuffer;
        const ch0 = ib.getChannelData(0);
        const ch1 = ib.numberOfChannels > 1 ? ib.getChannelData(1) : ch0;
        captured[0].push(new Float32Array(ch0));
        captured[1].push(new Float32Array(ch1));
      };

      if (usePathB) {
        // path B: createMediaElementSource — iOS Safari fallback
        try {
          source = ctx.createMediaElementSource(v);
        } catch (e) {
          try { ctx.close(); } catch(_) {}
          cleanup();
          return reject(new Error('createMediaElementSource 실패: ' + (e?.message || e)));
        }
        // ScriptProcessor onaudioprocess trigger 위해 destination 연결 필요 + 사용자 무음 = gain 0
        gain = ctx.createGain();
        gain.gain.value = 0;
        processor = ctx.createScriptProcessor(BUFFER, numCh, numCh);
        processor.onaudioprocess = onProcess;
        source.connect(processor);
        processor.connect(gain);
        gain.connect(ctx.destination);
      } else {
        // path A: captureStream
        source = ctx.createMediaStreamSource(stream);
        processor = ctx.createScriptProcessor(BUFFER, numCh, numCh);
        processor.onaudioprocess = onProcess;
        source.connect(processor);
        processor.connect(ctx.destination);
      }

      let stopped = false;
      const finish = (err) => {
        if (stopped) return; stopped = true;
        try { v.pause(); } catch(_) {}
        try { if (processor) processor.disconnect(); } catch(_) {}
        try { if (source) source.disconnect(); } catch(_) {}
        try { if (gain) gain.disconnect(); } catch(_) {}
        try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch(_) {}
        if (err) {
          try { ctx.close(); } catch(_) {}
          cleanup();
          return reject(err);
        }
        const totalLen = captured[0].reduce((a, c) => a + c.length, 0);
        if (totalLen === 0) {
          try { ctx.close(); } catch(_) {}
          cleanup();
          return resolve(null);
        }
        const buf = ctx.createBuffer(numCh, totalLen, actualSR);
        let off0 = 0, off1 = 0;
        for (const chunk of captured[0]) { buf.copyToChannel(chunk, 0, off0); off0 += chunk.length; }
        for (const chunk of captured[1]) { buf.copyToChannel(chunk, 1, off1); off1 += chunk.length; }
        try { ctx.close(); } catch(_) {}
        cleanup();
        resolve(buf);
      };

      try {
        await v.play();
      } catch (e) {
        return finish(new Error('비디오 재생 실패: ' + (e?.message || e)));
      }

      const durSec = endSec - startSec;
      const watchT = setInterval(() => {
        const cur = v.currentTime;
        if (cur >= endSec || v.ended) {
          clearInterval(watchT);
          finish(null);
        }
      }, 50);
      // safety timeout = duration * 2 + 5초
      setTimeout(() => { clearInterval(watchT); finish(null); }, durSec * 1000 * 2 + 5000);

    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

// V4 fix v3 (사용자 명시 ultrathink): WebCodecs API 동영상 압축 — 4K → 720p 다운스케일 + H.264 mp4.
// mp4-muxer CDN dynamic import (~30KB, 첫 사용 시만 fetch). iOS 17+ / Chrome 94+ 지원.
// V4 fix v4 (사용자 보고): 오디오 트랙 추가 — AudioEncoder(AAC) + decodeAudioData. 무음이던 진주 동영상 소리 복구.
// 직전 MediaRecorder broken 의심 우회.
async function compressVideoWebCodecs(file, opts = {}) {
  // 사용자 명시 2026-05-03: trim UI = startTime opt 추가. startTime ~ startTime+maxSec 구간만 인코딩.
  const { maxSec = 5, targetHeight = 720, bitrate = 1_500_000, fps = 30, audioBitrate = 96_000, startTime = 0 } = opts;

  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('이 브라우저 동영상 압축 미지원 — iOS 17+ / Chrome 94+ 필요');
  }

  // public/mp4-muxer.mjs (npm 5.2.2 ESM, same-origin) — vite-plugin-html bare specifier 회피.
  // 변수 import URL = vite static analysis skip.
  let Muxer, ArrayBufferTarget;
  try {
    const muxerUrl = '/mp4-muxer.mjs';
    const mod = await import(/* @vite-ignore */ muxerUrl);
    Muxer = mod.Muxer;
    ArrayBufferTarget = mod.ArrayBufferTarget;
    if (typeof Muxer !== 'function' || typeof ArrayBufferTarget !== 'function') {
      throw new Error('export 구조 X (M=' + typeof Muxer + ', T=' + typeof ArrayBufferTarget + ')');
    }
  } catch (e) {
    console.error('mp4-muxer import error:', e, e && e.stack);
    throw new Error('압축 라이브러리 로드 실패: ' + (e.message || e.toString()).slice(0, 80));
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);

  const cleanup = () => {
    try { URL.revokeObjectURL(url); } catch(_) {}
    try { video.remove(); } catch(_) {}
  };

  try {
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('비디오 로드 실패'));
      setTimeout(() => rej(new Error('비디오 로드 timeout')), 10000);
    });

    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) throw new Error('비디오 사이즈 읽기 실패');
    const scale = Math.min(1, targetHeight / h);
    const cw = Math.max(2, Math.round((w * scale) / 2) * 2);
    const ch = Math.max(2, Math.round((h * scale) / 2) * 2);

    if (video.readyState < 2) {
      await new Promise((res) => {
        video.addEventListener('canplay', res, { once: true });
        setTimeout(res, 3000);
      });
    }

    const codecCandidates = ['avc1.42001f', 'avc1.42E01E', 'avc1.4D401F'];
    let chosenCodec = '';
    for (const c of codecCandidates) {
      try {
        const sup = await VideoEncoder.isConfigSupported({
          codec: c, width: cw, height: ch, bitrate, framerate: fps
        });
        if (sup && sup.supported) { chosenCodec = c; break; }
      } catch(_) {}
    }
    if (!chosenCodec) throw new Error('H.264 인코더 미지원');

    // V4 fix v4: 오디오 트랙 디코드 시도 (실패해도 무음 fallback). decodeAudioData 는 file 전체 디코드.
    let audioBuffer = null;
    let audioSampleRate = 0;
    let audioChannels = 0;
    let audioCodec = '';
    // 사용자 명시 2026-05-03: decode path = full file → audio encode = startTime 부터 trim.
    // captureStream fallback path = relative (0 부터 maxSec 까지만) → encode = 0 부터 trim.
    let _audioStartOffset = startTime;
    try {
      if (typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const ab = await file.arrayBuffer();
          const tmpCtx = new AC();
          // Safari 호환 — promise + callback 혼용 가드
          audioBuffer = await new Promise((res, rej) => {
            // 사용자 보고 2026-05-03: Safari 의 옛 callback API 가 errorCallback 을 null/undefined 인자로 빈 호출하는 케이스 (e=null = 정보 X).
            // wrap → 의미 있는 Error 객체로 변환. audio track 없음 / 미지원 / corrupt 셋 다 가능.
            const _safeReject = (err) => {
              if (err == null) {
                rej(new Error('audio track 없음 또는 Safari decodeAudioData 의 빈 errorCallback (Codec 미지원 가능)'));
              } else {
                rej(err);
              }
            };
            try {
              const p = tmpCtx.decodeAudioData(ab.slice(0), res, _safeReject);
              if (p && typeof p.then === 'function') p.then(res, _safeReject);
            } catch (e) { _safeReject(e); }
          });
          try { tmpCtx.close(); } catch(_) {}
          if (audioBuffer && audioBuffer.numberOfChannels > 0 && audioBuffer.length > 0) {
            audioSampleRate = audioBuffer.sampleRate;
            audioChannels = Math.min(2, audioBuffer.numberOfChannels);
            // AAC-LC codec string
            const aacCandidates = ['mp4a.40.2'];
            for (const c of aacCandidates) {
              try {
                const sup = await AudioEncoder.isConfigSupported({
                  codec: c, sampleRate: audioSampleRate, numberOfChannels: audioChannels, bitrate: audioBitrate
                });
                if (sup && sup.supported) { audioCodec = c; break; }
              } catch(_) {}
            }
            if (!audioCodec) audioBuffer = null; // 인코더 미지원 — 무음 fallback
          } else {
            audioBuffer = null;
          }
        }
      }
    } catch (e) {
      // 사용자 명시 2026-05-03: decodeAudioData 실패 시 (.mov / iOS Safari 호환) → captureStream fallback 시도.
      console.warn('[video] decodeAudioData fail, captureStream fallback 시도:', e?.message);
      try {
        const captured = await _captureAudioFromVideo(file, startTime, startTime + maxSec, 48000);
        if (captured && captured.numberOfChannels > 0 && captured.length > 0) {
          audioBuffer = captured;
          audioSampleRate = captured.sampleRate;
          audioChannels = Math.min(2, captured.numberOfChannels);
          // AAC codec resolve
          const aacCandidates = ['mp4a.40.2'];
          for (const c of aacCandidates) {
            try {
              const sup = await AudioEncoder.isConfigSupported({
                codec: c, sampleRate: audioSampleRate, numberOfChannels: audioChannels, bitrate: audioBitrate
              });
              if (sup && sup.supported) { audioCodec = c; break; }
            } catch(_) {}
          }
          if (!audioCodec) audioBuffer = null;
          // capture path = relative (0 ~ maxSec) → encode startSample = 0
          _audioStartOffset = 0;
          console.log('[video] captureStream fallback 성공, sr=' + audioSampleRate + ' ch=' + audioChannels);
        } else {
          audioBuffer = null;
        }
      } catch (captureFail) {
        // 둘 다 fail = 오류 모달 + 무음
        console.error('[video compress] audio decode + capture 둘 다 fail:', e, captureFail);
        const _fileInfo = `type: ${file?.type || '?'}\nsize: ${(file?.size || 0).toLocaleString()} bytes`;
        const _decodeErr = e == null ? '(error 정보 X)' : `${e?.name || 'Error'}: ${e?.message || String(e)}`;
        const _captureErr = captureFail == null ? '(error 정보 X)' : `${captureFail?.name || 'Error'}: ${captureFail?.message || String(captureFail)}`;
        if (typeof _reportErrorToAdmin === 'function') {
          _reportErrorToAdmin('영상 진주 audio 둘 다 fail', `${_fileInfo}\n\n[decodeAudioData]\n${_decodeErr}\n\n[captureStream]\n${_captureErr}\n\n${captureFail?.stack || '(no stack)'}`).catch(() => {});
        }
        if (typeof showErrorDetailModal === 'function') {
          const msg = `[file]\n${_fileInfo}\n\n[decodeAudioData]\n${_decodeErr}\n\n[captureStream fallback]\n${_captureErr}`;
          showErrorDetailModal('영상 소리 추출 실패 — 무음 저장됨', msg);
        }
        audioBuffer = null;
      }
    }

    const muxerOpts = {
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: cw, height: ch, frameRate: fps },
      fastStart: 'in-memory',
      // 사용자 보고 2026-05-02 (자동 오류 보고): iOS Safari 의 첫 chunk DTS != 0 (예: 0.174322) 케이스.
      // 원인: Safari 가 frame timestamp 를 document age 기준 계산 → mp4-muxer strict 검증 reject.
      // fix: firstTimestampBehavior: 'offset' = 첫 chunk timestamp 를 0 으로 자동 보정.
      firstTimestampBehavior: 'offset'
    };
    if (audioBuffer) {
      muxerOpts.audio = { codec: 'aac', numberOfChannels: audioChannels, sampleRate: audioSampleRate };
    }
    const muxer = new Muxer(muxerOpts);

    let encoderError = null;
    // V4 fix v5 (사용자 보고 2026-05-04): mp4-muxer v5 가 track.info.decoderConfig.colorSpace 의 4 필드 모두 필요.
    // partial colorSpace (예: { primaries: undefined } 만 있는 케이스) 도 fail. 항상 4필드 force-merge.
    const _DEFAULT_CS = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          let safeMeta = meta;
          if (meta && meta.decoderConfig) {
            const cs = meta.decoderConfig.colorSpace || {};
            safeMeta = {
              ...meta,
              decoderConfig: {
                ...meta.decoderConfig,
                colorSpace: {
                  primaries: cs.primaries || _DEFAULT_CS.primaries,
                  transfer: cs.transfer || _DEFAULT_CS.transfer,
                  matrix: cs.matrix || _DEFAULT_CS.matrix,
                  fullRange: typeof cs.fullRange === 'boolean' ? cs.fullRange : _DEFAULT_CS.fullRange
                }
              }
            };
          }
          // chunk.duration null 가드 — Safari WebCodec 일부 케이스 chunk.duration null → addVideoChunkRaw fail.
          // mp4-muxer 4번째 인자 = explicit duration override (microseconds).
          const dur = (chunk && typeof chunk.duration === 'number' && chunk.duration >= 0)
            ? chunk.duration
            : Math.round(1e6 / fps);
          muxer.addVideoChunk(chunk, safeMeta, undefined, dur);
        } catch (err) {
          encoderError = err || new Error('addVideoChunk fail (err empty)');
        }
      },
      // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): Safari 가 error callback 을 null/undefined 인자로 호출하는 케이스 → encoderError = null → infinite loop.
      // 의미 있는 Error 로 wrap.
      error: (e) => { encoderError = e || new Error('VideoEncoder error (empty callback)'); }
    });
    encoder.configure({ codec: chosenCodec, width: cw, height: ch, bitrate, framerate: fps });

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    // 사용자 명시 2026-05-03: trim UI = startTime set + seeked await. play() = startTime 부터 시작.
    if (startTime > 0) {
      await new Promise((res) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res(); };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = startTime;
        setTimeout(res, 2000);  // safety timeout
      });
    }

    try {
      await video.play();
    } catch (e) {
      throw new Error('동영상 재생 시작 실패');
    }

    let frameIdx = 0;
    let firstFrameThumb = null;
    const startCt = video.currentTime;
    const frameDurationUs = Math.round(1e6 / fps);
    // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): rAF fallback (Safari 17.4 미만 = requestVideoFrameCallback X) 또는
    // video stalled 케이스 무한 루프 방지 — frame count safety cap.
    const maxFrames = Math.ceil(maxSec * fps) + 4;

    await new Promise((resolveLoop, rejectLoop) => {
      const onFrame = () => {
        try {
          if (encoderError) return rejectLoop(encoderError);
          const wallTs = video.currentTime - startCt;
          // V4 fix v6: wallTs > maxSec 또는 video.ended 또는 maxFrames 도달 → 종료.
          if (wallTs > maxSec || video.ended || frameIdx >= maxFrames) return resolveLoop();
          // V4 fix v6: wallTs >= 0 가드 — Safari 일부 케이스 currentTime 이 startCt 보다 살짝 작게 진동 → 음수 wallTs.
          // 음수 timestamp 는 mp4-muxer 가 reject ("must be non-negative") + VideoFrame 자체도 throw. → frame skip, 다음 callback 대기.
          if (video.readyState >= 2 && wallTs >= 0) {
            ctx.drawImage(video, 0, 0, cw, ch);
            // V4 (사용자 명시): 첫 frame 으로 썸네일 추출 (사진처럼 표시)
            if (frameIdx === 0) {
              try { firstFrameThumb = canvas.toDataURL('image/jpeg', 0.7); } catch(_) {}
            }
            // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): timestamp = frameIdx * frameDurationUs (단조 증가 + 음수 X 보장).
            // 직전 wallTs * 1e6 직접 사용 시 Safari currentTime 비단조 케이스 → mp4-muxer reject ("DTS must be monotonic" / "non-negative").
            // duration 명시 — mp4-muxer v5 가 chunk.duration null 거부
            const frame = new VideoFrame(canvas, {
              timestamp: frameIdx * frameDurationUs,
              duration: frameDurationUs
            });
            encoder.encode(frame, { keyFrame: frameIdx % (fps * 2) === 0 });
            frame.close();
            frameIdx++;
          }
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(onFrame);
          } else {
            requestAnimationFrame(onFrame);
          }
        } catch (e) {
          rejectLoop(e);
        }
      };
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(onFrame);
      } else {
        requestAnimationFrame(onFrame);
      }
      setTimeout(() => resolveLoop(), (maxSec + 3) * 1000);
    });

    try { video.pause(); } catch(_) {}
    if (frameIdx === 0) throw new Error('녹화된 frame 없음');

    await encoder.flush();
    encoder.close();

    // V4 fix v4: 오디오 인코딩 (있을 때만). maxSec 만큼만 잘라 인코딩.
    if (audioBuffer) {
      try {
        let audioErr = null;
        // V4 fix v5 (사용자 보고 2026-05-04): Safari AudioEncoder 가 chunk.duration null/0 emit 가능 → addAudioChunkRaw fail.
        // 명시적 duration override (samples / sampleRate * 1e6 microseconds).
        const aenc = new AudioEncoder({
          output: (chunk, meta) => {
            try {
              const dur = (chunk && typeof chunk.duration === 'number' && chunk.duration > 0)
                ? chunk.duration
                : Math.round((1024 / audioSampleRate) * 1e6);
              muxer.addAudioChunk(chunk, meta, undefined, dur);
            } catch (err) { audioErr = err || new Error('addAudioChunk fail (err empty)'); }
          },
          // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): Safari empty error callback 가드 — null audioErr 면 catch 못 함.
          error: (e) => { audioErr = e || new Error('AudioEncoder error (empty callback)'); }
        });
        aenc.configure({
          codec: audioCodec,
          sampleRate: audioSampleRate,
          numberOfChannels: audioChannels,
          bitrate: audioBitrate
        });

        // 사용자 명시 2026-05-03: trim UI = startSample 추가. _audioStartOffset 부터 maxSec 만큼 인코딩.
        // decode path = full file → _audioStartOffset = startTime / capture fallback = relative → _audioStartOffset = 0.
        const startSample = Math.max(0, Math.round(_audioStartOffset * audioSampleRate));
        const endSample = Math.min(audioBuffer.length, startSample + Math.round(maxSec * audioSampleRate));
        const totalSamples = endSample - startSample;
        // 채널 인터리브 (planar f32 → interleaved f32)
        const ch0 = audioBuffer.getChannelData(0);
        const ch1 = audioChannels > 1 ? audioBuffer.getChannelData(1) : null;
        // 1024 샘플씩 chunk (AAC frame 크기 ≈)
        const CHUNK = 1024;
        for (let rel = 0; rel < totalSamples; rel += CHUNK) {
          if (audioErr) throw audioErr;
          const len = Math.min(CHUNK, totalSamples - rel);
          const off = startSample + rel;
          const interleaved = new Float32Array(len * audioChannels);
          if (audioChannels === 1) {
            interleaved.set(ch0.subarray(off, off + len));
          } else {
            for (let i = 0; i < len; i++) {
              interleaved[i * 2] = ch0[off + i];
              interleaved[i * 2 + 1] = ch1[off + i];
            }
          }
          const ad = new AudioData({
            format: 'f32',
            sampleRate: audioSampleRate,
            numberOfFrames: len,
            numberOfChannels: audioChannels,
            timestamp: Math.round((rel / audioSampleRate) * 1e6),
            data: interleaved
          });
          aenc.encode(ad);
          ad.close();
        }
        await aenc.flush();
        aenc.close();
        if (audioErr) throw audioErr;
      } catch (audioFail) {
        // 사용자 명시 2026-05-03: toast → 오류 모달 + audioFail null 케이스에 의미 있는 메시지.
        console.error('[video compress] audio encode 실패 (무음으로 진행):', audioFail, audioFail?.stack);
        const _cfgInfo = `codec=${audioCodec || '?'} sr=${audioSampleRate} ch=${audioChannels} bitrate=${audioBitrate}`;
        const _errInfo = audioFail == null
          ? '(error 정보 X — encoder 의 빈 error callback)'
          : `${audioFail?.name || 'Error'}: ${audioFail?.message || String(audioFail)}`;
        if (typeof _reportErrorToAdmin === 'function') {
          _reportErrorToAdmin('영상 진주 audio encode 실패', `${_cfgInfo}\n\n${_errInfo}\n\n${audioFail?.stack || '(no stack)'}`).catch(() => {});
        }
        if (typeof showErrorDetailModal === 'function') {
          const msg = `[config]\n${_cfgInfo}\n\n[error]\n${_errInfo}\n\n[stack]\n${(audioFail?.stack || '(no stack)').slice(0, 500)}`;
          showErrorDetailModal('영상 소리 인코딩 실패 — 무음 저장됨', msg);
        }
      }
    }

    muxer.finalize();

    const buffer = muxer.target.buffer;
    if (!buffer || buffer.byteLength < 1000) throw new Error('압축 결과 너무 작음');

    const blob = new Blob([buffer], { type: 'video/mp4' });
    const dataUrl = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(new Error('dataURL 변환 실패'));
      reader.readAsDataURL(blob);
    });

    // V4 (사용자 명시): 썸네일 — 사진처럼 정사각 600px JPEG q=0.7 (사진과 동일 형식)
    let thumbnail = null;
    if (firstFrameThumb && typeof makeSquareThumb === 'function') {
      try { thumbnail = await makeSquareThumb(firstFrameThumb, 600, 0.7); } catch(_) {}
    }

    cleanup();
    // 사용자 보고 2026-05-02 ultrathink: hasAudio 메타 넣음 — 옛 진주 (audio fix 전 encoded = audio track X) vs 새 진주 (audio O) 구분.
    // 사용자 진주 click 시 무음 확정 시 시각 안내 ("이 영상은 무음으로 저장됨").
    return { videoUrl: dataUrl, thumbnail, hasAudio: !!audioBuffer };
  } catch (e) {
    cleanup();
    throw e;
  }
}

// V4-fix: 정사각 thumb (용량 절약 우선, 인증샷 검증용은 작은 size로 호출됨)
async function makeSquareThumb(dataUrl, size = 200, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const _settle = (v) => { if (done) return; done = true; resolve(v); };
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const m = Math.min(img.width, img.height);
        const sx = (img.width - m) / 2;
        const sy = (img.height - m) / 2;
        ctx.drawImage(img, sx, sy, m, m, 0, 0, size, size);
        _settle(canvas.toDataURL('image/jpeg', quality));
      } catch(_) { _settle(null); }
    };
    // V4 fix v5 (사용자 보고 2026-05-04): img decode fail 시 promise hang 방지 — null resolve.
    img.onerror = () => _settle(null);
    setTimeout(() => _settle(null), 5000);
    img.src = dataUrl;
  });
}

async function verifyMissionPhoto(mission, photoBase64) {
  if (!_canAI()) {
    return { verified: true, reason: 'API 키가 없어서 통과.' };
  }
  const base64 = photoBase64.split(',')[1];
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: _anthropicHeaders(),
    body: JSON.stringify({
      _endpoint: 'mission_verify',
      // 사용자 요청 2026-04-30: 미션 사진 검증 = 단순 vision 분류 → haiku 4.5 (재시도 옵션 있어 안전).
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: `사용자가 "${mission.title}" 미션을 완료했다고 인증샷을 올렸어. 사진이 미션과 합리적으로 일치하는지 판단해줘.\n\n미션 설명: ${mission.description || '(없음)'}\n\n응답: JSON만 출력. 다른 설명 X.\n{ "verified": true 또는 false, "reason": "한 문장. 친근한 반말. 통과면 격려, 실패면 부드럽게." }\n\n판단 기준: 너무 엄격하지 X. 모호하면 통과. 명백히 무관하거나 빈 화면일 때만 거절. 안티-수치심 톤 — '검증' X '축하/안내'.` }
        ]
      }]
    })
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { verified: true, reason: '판단 어려워서 통과.' };
  try {
    const parsed = JSON.parse(match[0]);
    return { verified: !!parsed.verified, reason: parsed.reason || '통과.' };
  } catch {
    return { verified: true, reason: '파싱 실패라 통과.' };
  }
}

function showFullscreenLoader(text) {
  let el = document.getElementById('_fsLoader');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = '_fsLoader';
  el.style.cssText = 'position:fixed; inset:0; background:rgba(15,14,23,0.88); z-index:10000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:var(--text); backdrop-filter: blur(6px);';
  el.innerHTML = `<div style="font-size:14px; font-family: inherit;">${escapeHtml(text || '잠시만...')}</div><div class="ai-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  document.body.appendChild(el);
}

function hideFullscreenLoader() {
  const el = document.getElementById('_fsLoader');
  if (el) el.remove();
}

function skipMission(missionId) {
  const mission = state.missions.find(m => m.id === missionId);
  if (!mission) return;
  const _prevStatus = mission.status;
  const _prevSkippedAt = mission.skippedAt || null;
  mission.status = 'skipped';
  mission.skippedAt = new Date().toISOString();
  saveState();
  setTimeout(() => { renderTodayMission(); }, 300);
  // V3.7: undo
  showUndoToast('괜찮아, 그런 날도 있어 🌊', () => {
    mission.status = _prevStatus;
    mission.skippedAt = _prevSkippedAt;
    saveState();
    renderTodayMission();
  });
}

