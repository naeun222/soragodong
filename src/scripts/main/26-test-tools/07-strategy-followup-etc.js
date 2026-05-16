// V4-fix v3 (사용자 요청): 전략 팔로업 풀 흐름 — showAttemptResultModal부터 진짜 흐름
// 4 옵션 (worked/meh/didnt/skipped) 다 검증 가능. yes/no 분기도 다 작동.
async function testForceStrategyFollowup() {
  if (!state.preferences || !state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON 후 사용');
    return;
  }
  // 첫 active strategy 카드 (관찰 시드 제외, embodied 제외)
  const card = (state.topicCards || []).find(c =>
    c.category === 'strategy' && !c._isDiagnosticSeed && c.embodimentStatus !== 'embodied'
  );
  if (!card) {
    showToast('⚠️ 시도 가능한 가닥 X — 시드 적용한 후');
    return;
  }
  // pending mission 찾거나 임시 생성
  let mission = (state.missions || []).find(m => m.strategyId === card.id && m.status === 'pending');
  if (!mission) {
    const gen = card.generations && card.generations[card.generations.length - 1];
    const action = gen?.action || card.actionStrategy || card.title;
    if (typeof createMission === 'function') {
      mission = createMission(action, card.title, {
        strategyId: card.id,
        generationIdx: Math.max(0, (card.generations?.length || 1) - 1),
        linkedStrategy: card.title
      });
    }
  }
  if (!mission) {
    showToast('⚠️ 미션 생성 실패');
    return;
  }

  // V4 비전 6.2: 진짜 결과 체크 흐름 — showAttemptResultModal 호출 (사용자 4 옵션 선택)
  if (typeof showAttemptResultModal !== 'function') {
    showToast('⚠️ showAttemptResultModal 함수 X');
    return;
  }
  // V4 (v8 묶음 1): 객체 시그너처 — situation/missionTitle 전달 (테스터 강제 trigger)
  const status = await showAttemptResultModal({
    strategyName: card.title,
    situation: mission.situation || '',
    missionTitle: mission.title || ''
  });
  if (!status) {
    showToast('취소됨 — 미션 그대로 pending');
    return;
  }

  // 결과 기록 (4 분기 공통)
  mission.status = 'completed';
  mission.completedDate = todayKey();
  mission.completedAt = new Date().toISOString();
  mission.attemptStatus = status;
  if (typeof recordStrategyAttempt === 'function') {
    try { recordStrategyAttempt(card.id, status, mission.id); } catch (e) { console.warn('recordStrategyAttempt:', e); }
  }

  // V4 비전 5.4 + 5.9 분기 흐름 — 결과별 다른 톤/액션
  if (status === 'didnt') {
    saveState({ force: true });
    showToast(`👎 "${card.title}" 안 통함 — 돌연변이 흐름 자동 시작`);
    if (typeof openMutationChat === 'function') {
      setTimeout(() => openMutationChat(card.id, mission.title), 400);
    }
  } else if (status === 'meh') {
    saveState({ force: true });
    // 'meh' → 돌연변이 yes/no confirm
    const yes = await showConfirmModal({
      title: '🌫 그저 그랬어',
      message: `"${card.title}" 이 도구가 너에게 충분히 안 맞은 듯.\n다른 차원에서 시도해볼래?`,
      okLabel: '🧬 돌연변이 해볼게',
      cancelLabel: '아직 그대로'
    });
    if (yes) {
      showToast(`🧬 돌연변이 흐름 시작`);
      if (typeof openMutationChat === 'function') {
        setTimeout(() => openMutationChat(card.id, mission.title), 400);
      }
    } else {
      showToast(`🌫 그대로 — 더 시도하기로 결정. 가닥엔 meh 흔적 적용됨`);
    }
  } else if (status === 'worked') {
    saveState({ force: true });
    const workedCount = (typeof countWorkedAttempts === 'function') ? countWorkedAttempts(card) : 0;
    showToast(`👍 "${card.title}" 작동! 가닥에 흔적 적용됨 (worked ${workedCount}/5)${workedCount >= 5 ? ' — 결정화 prompt 곧 등장' : ''}`);
    // V4-fix v3 (사용자 요청): worked → 홈 이동 + DNA 조각 연결 모션
    if (typeof showScreen === 'function') showScreen('home');
    setTimeout(() => {
      if (typeof showDnaConnectAnimation === 'function') {
        try { showDnaConnectAnimation(card.id, mission.id); } catch (e) { console.warn('dnaConnect:', e); }
      }
    }, 500);
  } else if (status === 'skipped') {
    saveState({ force: true });
    showToast(`😅 못 시도 — 자책 X. 다음 기회.`);
  }

  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderArchive === 'function') renderArchive();
}

async function testForceCrystallize() {
  const card = (state.topicCards || []).find(c => c.category === 'strategy' && c.embodimentStatus !== 'embodied');
  if (!card) {
    showToast('⚠️ 결정화 가능한 strategy 카드 X');
    return;
  }
  // worked 5회 강제 적용하기
  if (!Array.isArray(card.generations) || !card.generations.length) {
    showToast('⚠️ generations 데이터 X');
    return;
  }
  const gen = card.generations[card.generations.length - 1];
  if (!Array.isArray(gen.attempts)) gen.attempts = [];
  // 현재 worked 수 부족하면 채움
  const currentWorked = gen.attempts.filter(a => a.status === 'worked').length;
  for (let i = currentWorked; i < 5; i++) {
    gen.attempts.push({ status: 'worked', at: new Date().toISOString(), missionId: null });
  }
  // _crystallizePromptShown reset
  card._crystallizePromptShown = false;
  saveState({ force: true });
  showToast(`🧬 "${card.title}" worked 5회 — 결정화 의식 호출`);
  await promptCrystallize(card);
}

async function testForceMutation() {
  const card = (state.topicCards || []).find(c => c.category === 'strategy' && c.embodimentStatus !== 'embodied');
  if (!card) {
    showToast('⚠️ 진화 가능한 strategy 카드 X');
    return;
  }
  showToast(`🪦 "${card.title}" 돌연변이 진화 호출`);
  await openMutationChat(card.id, '시드 미션 (테스트)');
}

function testForcePearlSuggestion() {
  // 마지막 user 메시지에 pearlSuggestion 강제
  let lastUserIdx = -1;
  for (let i = (state.chatMessages || []).length - 1; i >= 0; i--) {
    if (state.chatMessages[i]?.role === 'user') { lastUserIdx = i; break; }
  }
  if (lastUserIdx < 0) {
    showToast('⚠️ user 메시지 X — 대화 후 시도');
    return;
  }
  state.chatMessages[lastUserIdx].pearlSuggestion = true;
  delete state.chatMessages[lastUserIdx].pearlSaved;
  saveState({ force: true });
  if (typeof renderChat === 'function') renderChat();
  showToast('🔮 마지막 user 메시지에 진주 제안 칩 적용됨 — 채팅 탭 확인');
}

function testForceMissionExpire() {
  const m = (state.missions || []).find(x => x.status === 'pending');
  if (!m) {
    showToast('⚠️ pending 미션 X');
    return;
  }
  m.scheduledFor = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
  saveState({ force: true });
  if (typeof expireOldMissions === 'function') expireOldMissions();
  if (typeof renderTodayMission === 'function') renderTodayMission();
  showToast(`⏰ "${m.title}" 5일 전으로 — expire 처리됨`);
}

async function testForceQuarterlyStories() {
  const review = (state.quarterlyReviews || [])[0];
  if (!review) {
    showToast('⚠️ 분기 리뷰 X — 시드 적용하거나 강제 생성 후 시도');
    return;
  }
  await openQuarterlyStories(review.id);
}

// 음악 5번 → 자동 진주 발동 시각
async function testForceMusicAutoPearl() {
  if (!state.preferences || !state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON 후 사용');
    return;
  }
  const today = new Date();
  const trackId = 'auto_test_track';
  const track = { id: trackId, title: 'Vanilla Days', artist: 'LNGSHOT', artworkUrl: '' };
  // entries 5개에 같은 트랙 넣어 자동 진주 발동
  let pushed = 0;
  for (let i = 0; i < (state.entries || []).length && pushed < 5; i++) {
    if (!state.entries[i].music) {
      state.entries[i].music = track;
      pushed++;
    }
  }
  if (pushed < 5) {
    for (let i = pushed; i < 5; i++) {
      const d = new Date(today.getTime() - (i + 100) * 86400000);
      state.entries.push({
        date: d.toISOString().split('T')[0],
        mood: 4, vitality: 4,
        timestamp: d.toISOString(),
        music: track
      });
    }
  }
  // 같은 곡 이미 진주에 있으면 제거
  state.pearls = (state.pearls || []).filter(p => !p.track || p.track.id !== trackId);
  // 자동 진주 추가
  state.pearls.push({
    id: 'pearl_auto_' + Date.now(),
    category: '음악',
    content: `${track.title} - ${track.artist}`,
    track,
    type: 'pearl',
    autoAdded: true,
    createdAt: new Date().toISOString()
  });
  saveState({ force: true });
  showToast(`🎵 "${track.title}" 5번 등장 → 자동 진주 적용됨. 도서관 → 진주에서 확인.`);
}


