async function testForceExtract() {
  showToast('🧪 토픽 추출 시작 (가드 우회)...');
  const before = (state.topicCards || []).length;
  // V3.13.x: 가드 우회 — 마지막 메시지에 chapterStart=true 마커 넣어서 직전 챕터 강제 인식
  const validMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  if (validMsgs.length < 2) {
    showToast('⚠ 챕터 추출에 메시지가 너무 적어 (2개 이상 필요).');
    return;
  }
  // 가장 마지막 메시지에 chapterStart 마커 임시 적용하기 (testForceExtract만)
  const lastMsg = validMsgs[validMsgs.length - 1];
  const wasChapterStart = lastMsg.chapterStart;
  lastMsg.chapterStart = true;
  try {
    await extractPreviousChapterTopics();
    if (!wasChapterStart) delete lastMsg.chapterStart;  // 임시 마커 복원
    saveState();
    const after = (state.topicCards || []).length;
    const diff = after - before;
    if (diff > 0) {
      showToast(`✦ 토픽 ${diff}개 추출됨. 홈 → 📜 대화 렌즈에서 확인.`);
    } else {
      showToast('⚠ AI가 추출할 만한 토픽 못 찾음. 더 의미 있는 대화 후 시도.');
    }
  } catch (e) {
    if (!wasChapterStart) delete lastMsg.chapterStart;
    showToast('❌ 추출 실패: ' + e.message);
  }
}

async function testResetExecute() {
  const yes = await showConfirmModal({
    title: '일정 chip 초기화?',
    message: '오늘 할 일, 서랍장, 진행 중 task, dayPlan 다 지워.\n다른 데이터(체크인/대화/프로젝트 등)는 유지.',
    okLabel: '🗑 초기화', cancelLabel: '아니'
  });
  if (!yes) return;
  state.tasks = [];
  state.dayPlan = [];
  state.starts = [];
  saveState();
  if (typeof renderExecute === 'function') renderExecute();
  showToast('✦ 실행 탭 초기화 완료.');
}

