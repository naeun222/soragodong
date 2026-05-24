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

  const allMsgs = recent.messages
    .filter(m => m && !m.typing && !m.error && !m.isSimulationContext);
  if (allMsgs.length === 0) return null;

  const lastMsgTs = recent.messages[recent.messages.length - 1]?.timestamp;
  const delta = _formatTimeDelta(recent.generatedAt || lastMsgTs);

  // V4 (사용자 명시 2026-05-25 ultrathink, 2 번째 묶음): topicCards 알맹이 inject + 윈도우 -4 → -12 확장.
  //   옛 slice(-4) = 챕터 마무리 잡담만 잡힘 → AI 가 알맹이 못 봄.
  const topics = (state.topicCards || [])
    .filter(c => c && !c._deleted && c.sourceArchiveId === recent.id && c.category !== 'strategy')
    .slice(0, 5);
  const topicTitles = topics.map(t => (t.title || '').trim()).filter(Boolean).join(' · ');

  const lines = ['', '[방금 직전 챕터 — ' + (delta || '시점 불명') + ']'];
  lines.push(`- [${recent.date || ''}]${topicTitles ? ' ' + topicTitles : ''}`);

  // topicCards 있으면 summary 직접 inject, 없으면 길이 상위 user msg 3 개 fallback.
  if (topics.length > 0) {
    lines.push('  토픽:');
    topics.forEach(t => {
      const ttl = (t.title || '').trim();
      const sum = (t.summary || '').trim();
      if (ttl) lines.push(`  · ${ttl}${sum ? ' — ' + sum.slice(0, 200) : ''}`);
    });
  } else {
    const userMsgs = allMsgs
      .filter(m => m.role === 'user')
      .slice()
      .sort((a, b) => (b.content || '').length - (a.content || '').length)
      .slice(0, 3)
      .map(m => (m.content || '').slice(0, 200))
      .filter(Boolean);
    if (userMsgs.length > 0) {
      lines.push('  알맹이 (토픽 카드 추출 전 — 길이 상위 user 메시지):');
      userMsgs.forEach(u => lines.push(`  · "${u}"`));
    }
  }

  // last-12 turns (옛 slice(-4) 확장)
  const tailMsgs = allMsgs.slice(-12);
  lines.push('  마지막 흐름:');
  tailMsgs.forEach(m => {
    const role = m.role === 'user' ? '나' : '소라';
    const text = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim().slice(0, 200);
    if (text) lines.push(`  ${role}: "${text}"`);
  });

  lines.push('  · 사용자가 anaphor ("그거", "끝났어" 류) 쓰면 이 챕터의 referent 일 가능성 ↑.');
  lines.push('  · 위 토픽·마지막 흐름의 구체 내용 *직접 인용 OK* — 사용자가 옛 얘기 묻든 자기관찰 흐름이든 구분 X (사용자 명시 2026-05-25).');
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
