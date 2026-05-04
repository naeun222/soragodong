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
