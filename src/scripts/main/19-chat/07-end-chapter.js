async function endChapter() {
  const validMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  if (validMsgs.length < 2) {
    showToast('대화가 너무 짧아 마무리할 게 없어');
    return;
  }
  const yes = await showConfirmModal({
    title: '이 대화 마무리할까?',
    message: '원본은 7일 뒤 자동으로 사라져.',
    okLabel: '마무리 ✦',
    cancelLabel: '취소'
  });
  if (!yes) return;
  const archived = _archiveCurrentChapter({ manual: true, minMessages: 2 });
  // V4 (v8 묶음 5): chapter_close_intro 시점 archive 핀 영구 + intakeArchiveId stash → 7일 cap 우회 (pruneOldChatArchive pinned=true 분기)
  if (archived && _isOnboardingStep('chapter_close_intro')) {
    archived.pinned = true;
    state._intakeArchiveId = archived.id;
    saveState();
  }
  // V4 (v8 묶음 16): 챕터 마무리 첫 사용 placeholder dismiss
  if (archived && typeof dismissPlaceholder === 'function') dismissPlaceholder('chapter');
  if (typeof renderChat === 'function') renderChat();
  showToast(archived ? '정리 됐어 ✦' : '대화가 짧아 정리 안 했어');
}

// V4-fix: chatArchive 7일 cap (잠깐 보관용)
// 사용자 요청 2026-04-29: pinned=true 항목은 영구 보관 (7일 cap 무시)
// V4 사용자 명시 2026-05-04: _deleted (휴지통) 항목도 7일 cap 면제 — 사용자 명시 영구 삭제 전까지 보관.
function pruneOldChatArchive() {
  if (!Array.isArray(state.chatArchive)) return;
  const cutoff = Date.now() - 7 * 86400000;
  const before = state.chatArchive.length;
  state.chatArchive = state.chatArchive.filter(a => {
    if (!a) return false;
    if (a.pinned) return true;  // 핀 꽂힌 거 영구 보관
    if (a._deleted) return true;  // 휴지통 항목 영구 보관 (사용자가 영구 삭제 전까지)
    if (!a.date) return false;
    const t = new Date(a.date + 'T12:00:00').getTime();
    return t >= cutoff;
  });
  if (state.chatArchive.length < before) saveState();
}

// 사용자 요청 2026-04-29: chatArchive 항목 핀 토글 — 영구 보관 / 7일 cap 복귀
function toggleArchivePin(date) {
  if (!Array.isArray(state.chatArchive)) return;
  const item = state.chatArchive.find(a => a && a.date === date);
  if (!item) return;
  item.pinned = !item.pinned;
  saveState();
  if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
  if (typeof showToast === 'function') {
    showToast(item.pinned ? '📌 영구 보관됨 — 7일 자동 삭제 안 돼' : '📌 핀 풀림 — 7일 cap 다시 적용');
  }
}

async function showDiaryTemplates() {
  const choice = await showOptionsModal({
    title: '📝 일기 템플릿',
    message: '클릭만 해도, 한 단어만 답해도 자동으로 완성!',
    options: DIARY_TEMPLATES.map(t => ({ label: t.label, value: t.id, desc: t.desc }))
  });
  if (!choice) return;
  const tpl = DIARY_TEMPLATES.find(t => t.id === choice);
  if (!tpl) return;
  // V4-fix v3 (사용자 요청): 테스터 모드 → placeholder 예시 자동 채움
  const isTester = !!(state.preferences && state.preferences.testerMode);
  const tplExamples = {
    'short':  '오늘 잘 지냄. 큰 일 X.',
    'good':   '카페에서 작업 잘 됨',
    'hard':   '집중 안 됨. 무력감.',
    'plan':   '보고서 한 단락',
    'feel':   '평온'
  };
  const answer = await showInputModal({
    title: tpl.label,
    message: tpl.prompt + ' (비워두고 OK 누르면 그냥 저장)',
    placeholder: tpl.placeholder,
    defaultValue: isTester ? (tplExamples[tpl.id] || '') : '',
    okLabel: '완성 ✦'
  });
  if (answer === null) return;  // 취소
  const completed = tpl.format((answer || '').trim());
  // chatInput에 set + 즉시 send
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = completed;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof sendChat === 'function') {
    setTimeout(() => sendChat(), 50);
  }
}

// V3.13.x: 메시지 ⋮ 메뉴 — 복사 / 수정 / 삭제
