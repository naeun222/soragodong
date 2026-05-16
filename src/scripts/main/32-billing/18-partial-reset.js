// V3.13.x: 부분 초기화 헬퍼들 — 잘못 테스트 입력한 데이터 정리용
async function _confirmAndReset(label, count, doReset, rerender) {
  if (count === 0) { showToast(`${label} 이미 비어있어`); return; }
  const yes = await showConfirmModal({
    title: `${label} 초기화`,
    message: `${label} ${count}개가 모두 삭제돼.\n다른 데이터는 그대로.\n되돌릴 수 없어.`,
    okLabel: '삭제', cancelLabel: '취소'
  });
  if (!yes) return;
  doReset();
  saveState();
  if (rerender) try { rerender(); } catch (e) {}
  showToast(`✦ ${label} ${count}개 초기화 완료`);
}
async function resetChatMessages() {
  const c = (state.chatMessages || []).length;
  await _confirmAndReset('대화 메시지', c, () => { state.chatMessages = []; }, () => {
    if (typeof renderChat === 'function') renderChat();
  });
}
async function resetEntries() {
  const c = (state.entries || []).length;
  await _confirmAndReset('체크인 entries', c, () => { state.entries = []; }, () => {
    const cur = document.querySelector('.screen.active');
    if (cur && cur.id === 'screen-archive') {
      if (typeof renderArchive === 'function') renderArchive();
      if (typeof renderTodayMission === 'function') renderTodayMission();
    }
  });
}
async function resetTopicCards() {
  const c = (state.topicCards || []).length;
  await _confirmAndReset('토픽 카드 + 전략 카드', c, () => { state.topicCards = []; }, () => {
    if (typeof renderArchive === 'function') renderArchive();
  });
}
async function resetMissions() {
  const c = (state.missions || []).length;
  await _confirmAndReset('미션', c, () => { state.missions = []; }, () => {
    if (typeof renderTodayMission === 'function') renderTodayMission();
  });
}
async function resetArchive() {
  const c = (state.archive || []).length;
  await _confirmAndReset('도서관 깨달음', c, () => { state.archive = []; }, () => {
    if (typeof renderArchive === 'function') renderArchive();
  });
}
async function resetPearls() {
  const c = (state.pearls || []).length;
  await _confirmAndReset('진주', c, () => { state.pearls = []; }, () => {
    if (typeof renderArchive === 'function') renderArchive();
  });
}
async function resetTasks() {
  const c = (state.tasks || []).length;
  await _confirmAndReset('할 일(서랍장)', c, () => { state.tasks = []; }, () => {
    if (typeof renderExecute === 'function') renderExecute();
  });
}

