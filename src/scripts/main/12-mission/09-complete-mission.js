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
      const resp = await callAnthropic({
        _endpoint: 'shell_story',
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        messages: [{
          role: 'user',
          // 사용자 보고 2026-05-10: AI 가 미션 제목을 다른 말로 paraphrase 해서 컨텍스트 다른 메시지 생성하던 케이스 fix.
          // 미션 제목 그대로 인용 강제 + 다른 행동 / 다른 미션 인용 금지 명시.
          content: `사용자가 막 완료한 미션:\n"${mission.title}"${mission.description ? `\n(설명: ${mission.description})` : ''}\n\n친구처럼 짧게 (1-2문장) 축하 메시지를 써줘. 규칙:\n- 미션 제목의 핵심 단어를 *그대로* 인용 (paraphrase / 다른 말로 바꾸기 X — "${mission.title}" 의 단어 그대로).\n- 다른 행동 / 다른 미션 / 일반 충고 X — 이 미션 한정.\n- "잘했어!" 같은 판박이 평가 X. 과정·노력에 초점.\n- 반말. 이모지 최대 1개.`
        }]
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
