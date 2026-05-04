// ═══════════════════════════════════════════════════════════════
// INSIGHT SAVING
// ═══════════════════════════════════════════════════════════════
async function saveMsgAsInsight(idx) {
  const msg = state.chatMessages[idx];
  if (!msg || msg.saved) return;

  // V4-fix #8: 직전 user 메시지(질문) 같이 저장
  let priorUserMsg = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (state.chatMessages[i]?.role === 'user' && !state.chatMessages[i].typing) {
      priorUserMsg = state.chatMessages[i];
      break;
    }
  }
  const userQuestion = priorUserMsg?.content || '';

  let headline = '';
  let body = '';
  if (msg.insightCandidate) {
    body = msg.insightCandidate;
  } else {
    // V4 (사용자 보고 2026-05-04): summarizeForArchive 통합 (4 핸들러 일관 — 메인 chat / 마법 / 숙고 / 돌연변이).
    // 옛 'pearl_extract' endpoint key 잔재 (legacy — 진주 추출은 LLM X 사용자 직접 입력) → 'archive_summary' 통일.
    // [좋은 예] 3개 + [규칙] '지혜 추출' 정의 한 줄 = summarizeForArchive 에 보강해 통일.
    const summary = (typeof summarizeForArchive === 'function' && _canAI())
      ? await summarizeForArchive(msg.content, userQuestion)
      : null;
    if (summary) {
      headline = summary.headline || '';
      body = summary.body || '';
    }
  }
  if (!body && !headline) body = msg.content.slice(0, 150);
  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const insight = headline ? `${headline} — ${body}` : body;
  state.archive.unshift({
    date, insight, headline, body,
    original: msg.content,
    question: userQuestion,  // V4-fix #8: 직전 user 메시지 같이 저장
    source: '대화',
    savedAt: new Date().toISOString(),
    type: 'scrap',
    tags: []
  });
  msg.saved = true;
  saveState();
  renderChat();
  showToast('깨달음 도서관에 저장됐어 ✦');
}

