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
      // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildShellMissionComplete 가 합성.
      const resp = await callAnthropic({
        _endpoint: 'shell_story',
        _userContentType: 'mission_complete',
        _vars: { missionTitle: mission.title, missionDescription: mission.description || '' },
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        messages: [{ role: 'user', content: '' }]
      });
      const data = await resp.json();
      mission.completionNote = data.content[0].text.trim();
      saveState();
    } catch (e) { console.error(e); }
  }

  setTimeout(() => {
    renderTodayMission();
    renderShellBar();
    // V4 fix (사용자 보고 2026-05-20 ultrathink): 홈/도서관 통합 후 (2026-05-17) 전략 카드와 미션 카드가
    //   같은 archive screen 안 공존. 미션 완료해도 양생방 전략 카드가 stale ('해볼게' 그대로) →
    //   _hasUnchecked 가 true 인데도 re-render 안 돼 '🔍 결과 체크' 미전환.
    //   fix: renderArchive() 호출 — renderLensStrategies + 회전카드 + 카운트 등 같이 갱신.
    if (typeof renderArchive === 'function') {
      try { renderArchive(); } catch (e) { console.warn('[completeMission renderArchive]', e); }
    }
  }, 1500);
}

// V3.13: 인증샷 캡처 + AI 검증 시스템
