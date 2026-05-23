// V4 (사용자 명시 2026-05-23 ultrathink): 직전 챕터 자동 inject — RAG retrieve 와 별개.
//   chatArchive[0] (가장 최근 마무리 챕터) 의 마지막 4 turn (user+AI 섞) raw inject.
//   anaphoric query ("끝났어", "그거 어떻게 됐어") 의 referent 보장.
//
// 정책:
//   - 게이트: session 존재 (게스트 제외). Plan 제한 X — embedding 비용 0 (단순 prompt addition).
//   - 시간 제한 X — 직전 1개 무조건. AI 가 시간 라벨 보고 가중치 판단.
//   - chatArchive[0] 이 시뮬/삭제/너무 짧음 (<2) 이면 다음 정상 entry 찾음.
//
// dedup:
//   - 20-system-prompt.js 가 이 함수의 return (archive id) 받아 _ragLastRetrieved 에서 제외.

function _recentChapterInject(perCall) {
  if (!Array.isArray(perCall)) return null;
  if (typeof session === 'undefined' || !session?.access_token) return null;  // 게스트 제외
  if (!Array.isArray(state.chatArchive)) return null;

  const recent = state.chatArchive.find(a =>
    a && a.id && !a._deleted && !a.isSimulation
    && Array.isArray(a.messages) && a.messages.length >= 2
  );
  if (!recent) return null;

  const msgs = recent.messages
    .filter(m => m && !m.typing && !m.error && !m.isSimulationContext)
    .slice(-4);
  if (msgs.length === 0) return null;

  const lastMsgTs = recent.messages[recent.messages.length - 1]?.timestamp;
  const delta = _formatTimeDelta(recent.generatedAt || lastMsgTs);

  const topicTitles = (state.topicCards || [])
    .filter(c => c && !c._deleted && c.sourceArchiveId === recent.id && c.category !== 'strategy')
    .slice(0, 3)
    .map(t => (t.title || '').trim())
    .filter(Boolean)
    .join(' · ');

  const lines = ['', '[방금 직전 챕터 — ' + (delta || '시점 불명') + ']'];
  lines.push(`- [${recent.date || ''}]${topicTitles ? ' ' + topicTitles : ''}`);
  lines.push('  마지막 흐름:');
  msgs.forEach(m => {
    const role = m.role === 'user' ? '나' : '소라';
    const text = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim().slice(0, 200);
    if (text) lines.push(`  ${role}: "${text}"`);
  });
  lines.push('  · 사용자가 anaphor ("그거", "끝났어" 류) 쓰면 이 챕터의 referent 일 가능성 ↑.');
  lines.push('');

  perCall.push(lines.join('\n'));
  return recent.id;
}

function _formatTimeDelta(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + '분 전 끝남';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + '시간 전 끝남';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + '일 전 끝남';
  return Math.floor(days / 7) + '주 전 끝남';
}
