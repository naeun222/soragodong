async function endChapter() {
  const validMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  // V4 fix (사용자 보고 2026-05-17 ultrathink): 튜토리얼 안전망 — firstHomeTutorial 진행 중엔 minMessages=1 (가드 우회).
  //   옛: validMsgs.length < 2 → '너무 짧다' 토스트. 튜토에서 시드 챗 + 일기 1개 = OK 인 케이스가 race 로 fail.
  const _minLen = window._firstHomeTutorialActive ? 1 : 2;
  if (validMsgs.length < _minLen) {
    showToast('대화가 너무 짧아 마무리할 게 없어');
    return;
  }
  const yes = await showConfirmModal({
    title: '이 대화 마무리할까?',
    okLabel: '마무리 ✦',
    cancelLabel: '취소'
  });
  if (!yes) return;
  const archived = _archiveCurrentChapter({ manual: true, minMessages: _minLen });
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

// V4 (사용자 명시 2026-05-20 ultrathink): Step 6 — 일반 archive 7일 cap 제거. 영구 보관.
//   옛 root cause: main row JSONB 안 messages 통째 박아 PATCH cascade — 7일 cap 으로 사이즈 묶음.
//   Step 3-5 = messages 별도 테이블 + main row 메타만 → cap 불필요. 사용자 데이터 영구 보존.
//   휴지통 (_deleted + _deletedAt) 의 7일 hard delete 는 그대로 유지 — 명시적 삭제 = 사용자 의도, 7일 grace 후 영구 cascade.
//   pinned 분기도 더 이상 의미 없음 (모든 archive 영구) — 옛 핀 데이터는 그대로 두고 신규 핀 UI 만 폐기 (Step 8 카피).
function pruneOldChatArchive() {
  if (!Array.isArray(state.chatArchive)) return;
  const cutoff = Date.now() - 7 * 86400000;
  const before = state.chatArchive.length;
  // 휴지통 _deletedAt+7일 경과 항목 = hard delete + cascade (_purgeArchive 가 chatArchive 에서도 제거 + chat_messages 별도 테이블 cascade).
  const trashIdsToPurge = [];
  state.chatArchive.forEach(a => {
    if (!a || !a._deleted) return;
    const deletedAt = a._deletedAt ? new Date(a._deletedAt).getTime() : 0;
    // _deletedAt 없으면 (옛 휴지통) = 보수적 보관 유지.
    if (deletedAt > 0 && deletedAt < cutoff) {
      trashIdsToPurge.push(a.id || a.date);
    }
  });
  if (trashIdsToPurge.length && typeof _purgeArchive === 'function') {
    trashIdsToPurge.forEach(id => { try { _purgeArchive(id); } catch (e) { console.warn('[pruneTrash] purge fail:', e); } });
  }
  if (state.chatArchive.length < before || trashIdsToPurge.length > 0) saveState();
}

// V4 (사용자 명시 2026-05-20 ultrathink): Step 8 — 일반 archive 영구 보관 후 핀 = 목록 정렬용 (위로 고정).
//   옛 의미 (영구 보관 vs 7일 cap) 폐기. 옛 pinned 데이터 그대로 보존 — UI 동작만 단순화.
function toggleArchivePin(date) {
  if (!Array.isArray(state.chatArchive)) return;
  const item = state.chatArchive.find(a => a && a.date === date);
  if (!item) return;
  item.pinned = !item.pinned;
  saveState();
  if (typeof renderChatArchiveModal === 'function') renderChatArchiveModal();
  if (typeof showToast === 'function') {
    showToast(item.pinned ? '📌 위로 고정됨' : '📌 핀 풀림');
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
