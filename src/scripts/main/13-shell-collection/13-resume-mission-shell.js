function resumeMission(id) {
  const m = (state.missions || []).find(x => x.id === id);
  if (!m) return;
  m.status = 'pending';
  m.scheduledFor = todayKey();
  delete m.expiredAt;
  saveState();
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderBeach === 'function') renderBeach();
  showToast('⭐ 부름 다시 받음 — 홈에서 확인');
}

// Shell detail / story modal
function openShellStory(shellIdx) {
  const shell = state.shellCollection[shellIdx];
  if (!shell) return;

  // V4 (사용자 명시 2026-05-18 ultrathink): 체크인 소라 = 별도 layout (사진/음악 메인 + 데이터 chip).
  if (shell.source === 'checkin' && typeof _openCheckinShellStory === 'function') {
    return _openCheckinShellStory(shell);
  }

  const dateStr = new Date(shell.date).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  const timeStr = new Date(shell.date).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit'
  });
  const tierLabel = ({
    light: '가벼움', daily: '일상', main: '메인',
    golden: '황금', call: '소라의 부름', legend: '특별한 부름'
  })[shell.tier] || '소라';

  // 사용자 요청 2026-04-27: DNA 조각인지 확인 (어떤 strategy generation의 shells에 속함)
  // 사용자 보고 2026-05-04 (B14/B15): missionId 가 있으면 attemptStatus 'worked'/'meh' 일 때만 DNA 인정.
  // 'didnt' (실패) / 미해결 (attemptStatus 없음) → DNA 표시 X.
  let _missionGate = true;
  if (shell.missionId) {
    const _m = (state.missions || []).find(mm => mm.id === shell.missionId);
    if (_m && _m.attemptStatus !== 'worked' && _m.attemptStatus !== 'meh') _missionGate = false;
  }
  const dnaStrategy = _missionGate ? (state.topicCards || []).find(c =>
    c.category === 'strategy' && Array.isArray(c.generations) &&
    c.generations.some(g => Array.isArray(g.shells) && g.shells.includes(shell._id))
  ) : null;
  const isDnaPiece = !!dnaStrategy;

  const overlay = document.createElement('div');
  overlay.className = 'shell-story-overlay';
  // V4 fix (사용자 보고 2026-05-04): _close / _shellEscDetach 미선언 ReferenceError = 튜토리얼 step 'DNA 한 조각'에서
  // 닫기 버튼 누르면 ESC handler stale 채로 throw → 후속 step (예: 다음 step 의 onShow / 사용자 다른 click 등) 에서 코칭마크 사라짐.
  // fix: openDnaPearlStory 와 동일 패턴으로 함수 scope 안 _shellEscDetach + _close 명시 선언.
  let _shellEscDetach = null;
  const _close = () => {
    if (_shellEscDetach) { _shellEscDetach(); _shellEscDetach = null; }
    overlay.remove();
  };
  overlay.onclick = (e) => { if (e.target === overlay) _close(); };
  // V3.13: 인증샷이 있으면 thumbnail 표시
  const photoBlock = shell.photoThumb
    ? `<img src="${shell.photoThumb}" alt="인증샷" style="width:100%; max-width:200px; aspect-ratio:1; object-fit:cover; border-radius:12px; margin:12px auto; display:block; border: 2px solid rgba(201,169,110,0.3);">`
    : '';
  const dnaBadgeHtml = isDnaPiece
    ? `<div class="shell-story-dna-badge">🧬 <b>DNA 한 조각</b><br><span style="font-size:11px; color:var(--text-dim);">전략 「${escapeHtml(dnaStrategy.title)}」의 일부</span></div>`
    : '';
  const emojiHtml = isDnaPiece
    ? `<div class="shell-story-emoji" style="position:relative; display:inline-block;">${shell.type}<span style="position:absolute; top:-4px; right:-12px; font-size:24px; filter:drop-shadow(0 0 4px gold);">🧬</span></div>`
    : `<div class="shell-story-emoji">${shell.type}</div>`;
  overlay.innerHTML = `
    <div class="shell-story-card tier-${shell.tier}">
      ${emojiHtml}
      <div class="shell-story-tier">${tierLabel}</div>
      <div class="shell-story-date">${dateStr} · ${timeStr}</div>
      ${dnaBadgeHtml}
      ${photoBlock}
      <div class="shell-story-text">${escapeHtml(shell.story || '')}</div>
      <button class="btn-secondary" id="shellStoryCloseBtn" style="margin-top:18px; width:100%;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const _btn = overlay.querySelector('#shellStoryCloseBtn');
  if (_btn) _btn.addEventListener('click', _close);
  _shellEscDetach = _registerModalEsc(overlay, _close);
}

