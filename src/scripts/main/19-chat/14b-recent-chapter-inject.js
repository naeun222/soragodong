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
  // V4 fix (사용자 명시 2026-05-27 ultrathink): 시간 라벨 강화 — calendar date + 요일 + 자연어 라벨 동시 표기.
  //   옛: "1일 전 끝남" → 모델이 "어제" 로 추측 박는 경우 발생 (실제는 그저께/3일 전일 수도). H2 룰 (system-persona.ts) 의 anchor.
  //   신: "1일 전 끝남 (2026-05-26 화, 어제)" — 모델이 그대로 인용하면 정확.
  const delta = _formatTimeDelta(recent.generatedAt || lastMsgTs);

  // V4 (사용자 명시 2026-05-25 ultrathink, 2 번째 묶음): topicCards 알맹이 inject + 윈도우 -4 → -12 확장.
  //   옛 slice(-4) = 챕터 마무리 잡담만 잡힘 → AI 가 알맹이 못 봄.
  const topics = (state.topicCards || [])
    .filter(c => c && !c._deleted && c.sourceArchiveId === recent.id && c.category !== 'strategy')
    .slice(0, 5);
  const topicTitles = topics.map(t => (t.title || '').trim()).filter(Boolean).join(' · ');

  const lines = ['', '[방금 직전 챕터 — ' + (delta || '시점 불명') + ']'];
  const _dateLabel = _formatChapterDateLabel(recent.date);
  lines.push(`- ${_dateLabel}${topicTitles ? ' ' + topicTitles : ''}`);

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
  // V4 fix (사용자 명시 2026-05-27 ultrathink): 시간 anchor hallucination 방지 (H2 룰).
  lines.push('  · ⚠️ 시간 단어 ("어제", "그저께", "지난주") 는 위 라벨 *그대로* 만 사용. 라벨 안에 명시 안 된 시간 단어 만들어내지 X.');
  lines.push('  · ⚠️ 위 마지막 흐름·토픽에 *없는* 사용자 발화 인용 X. 비슷한 거 추측해서 "너 ___ 라고 했지" 식 X (H1 룰).');
  lines.push('');

  perCall.push(lines.join('\n'));
  return recent.id;
}

// V4 fix (사용자 명시 2026-05-27 ultrathink): 시간 라벨 강화.
//   "1일 전 끝남" → "1일 전 끝남 (어제)" — calendar date 와 사용자 자연어 동시 제공.
//   H2 룰 (시간 anchor 정확성) 의 데이터 소스.
function _formatTimeDelta(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + '분 전 끝남';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + '시간 전 끝남';
  const days = Math.floor(hrs / 24);
  // 0~6일은 자연어 라벨 함께 (어제/그저께/N일 전).
  const natLabel = _naturalDayLabel(days);
  if (days < 7) return `${days}일 전 끝남${natLabel ? ' (' + natLabel + ')' : ''}`;
  return Math.floor(days / 7) + '주 전 끝남';
}

// V4 fix (사용자 명시 2026-05-27 ultrathink): 사용자 자연어 시간 라벨 매핑.
//   AI 가 "어제" / "그저께" / "N일 전" 시 *항상 이 라벨* 사용. 추측 X.
function _naturalDayLabel(days) {
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days === 2) return '그저께';
  if (days >= 3 && days <= 6) return days + '일 전';
  return '';
}

// V4 fix (사용자 명시 2026-05-27 ultrathink): chapter date 를 더 명시적 라벨로 (YYYY-MM-DD + 요일).
//   옛: "- [2026-05-26] ..." → 신: "- [2026-05-26 화요일] ..."
//   요일 박혀있으면 모델이 시간 anchor 만들 때 정확도 ↑.
function _formatChapterDateLabel(dateStr) {
  if (!dateStr) return '[날짜 불명]';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return `[${dateStr}]`;
    const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `[${dateStr} ${dow}요일]`;
  } catch {
    return `[${dateStr}]`;
  }
}
