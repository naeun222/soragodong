// trigger: 'manual' (사용자 ✓ click) 또는 'cutoff_auto' (4AM cutoff 진행 중 mutation chat 자동).
async function _extractMutationInsight(opts) {
  opts = opts || {};
  const trigger = opts.trigger || 'manual';
  const stateChat = opts.mutationChatState || _mutationChatState;
  if (!stateChat || !Array.isArray(stateChat.messages) || stateChat.messages.length < 1) {
    if (trigger === 'manual' && typeof showToast === 'function') showToast('대화가 짧아 추출할 게 없어');
    return null;
  }
  // saveMsgAsInsight 와 동일 — 마지막 AI 메시지 1개 + 직전 user 메시지 (맥락)
  const msgs = stateChat.messages || [];
  let lastAiIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i] && msgs[i].role === 'assistant' && msgs[i].content && !msgs[i].typing) {
      lastAiIdx = i; break;
    }
  }
  const lastAi = lastAiIdx >= 0 ? msgs[lastAiIdx] : null;
  if (!lastAi) {
    if (trigger === 'manual' && typeof showToast === 'function') showToast('AI 응답이 없어 추출 X');
    return null;
  }
  let priorUserMsg = null;
  for (let i = lastAiIdx - 1; i >= 0; i--) {
    if (msgs[i]?.role === 'user' && !msgs[i].typing) { priorUserMsg = msgs[i]; break; }
  }
  const userQuestion = priorUserMsg?.content || '';
  if (trigger === 'manual' && typeof showToast === 'function') showToast('🧬 깨달음 추출 중...');
  // V4 (사용자 보고 2026-05-04 정정): 4 핸들러 (메인 chat / 마법 helpChat / 숙고 chat / 돌연변이) 통합 헬퍼 summarizeForArchive 사용.
  // magic save (19135) / reflection save (21819) 와 100% 동일 메커니즘. saveMsgAsInsight 는 옛 자리 (직접 prompt 잔재).
  const summary = (typeof summarizeForArchive === 'function')
    ? await summarizeForArchive(lastAi.content, userQuestion)
    : null;
  const headline = (summary && summary.headline) ? summary.headline : '';
  const body = (summary && summary.body) ? summary.body : (lastAi.content || '').slice(0, 200);
  if (!body && !headline) {
    if (trigger === 'manual' && typeof showToast === 'function') showToast('추출할 내용이 없어');
    return null;
  }
  // saveMsgAsInsight 와 동일 객체 구조 (28953~) — type 만 'mutation' (시각 구분)
  state.archive = state.archive || [];
  const _dayKey = (typeof todayKey === 'function') ? todayKey() : (typeof getDayKey === 'function' ? getDayKey() : new Date(Date.now() - 4 * 3600000).toISOString().split('T')[0]);
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const insight = headline ? `${headline} — ${body}` : body;
  const ins = {
    date, insight, headline, body,
    original: lastAi.content,
    question: userQuestion,
    source: '돌연변이 대화',
    savedAt: new Date().toISOString(),
    type: 'mutation',
    tags: []
  };
  state.archive.unshift(ins);
  saveState();
  if (trigger === 'manual' && typeof showToast === 'function') {
    showToast('깨달음✨에 저장됐어');
  }
  if (typeof renderLensArchive === 'function') { try { renderLensArchive(); } catch {} }
  return ins;
}

function closeMutationChat(skipSave) {
  // V4 (사용자 명시 2026-05-13): 돌연변이 임시대화창 닫으면 자동 요약/저장 X.
  //   옛: 사용자가 선택 X 일 때도 messages 보존 (evolutionChats.push, kept=false).
  //   새: 사용자가 ✓ 명시 클릭 시에만 _extractMutationInsight 진행. 닫기 = 그냥 닫기.
  _mutationChatState = null;
  const overlay = document.getElementById('mutationChatOverlay');
  if (overlay) overlay.remove();
}

