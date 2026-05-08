// 사용자 명시 2026-05-08 ultrathink: 25턴+ 대화 압축 — sliding window + 누적 요약 hybrid.
// 옛 부분(최근 20턴 이전)을 Haiku 한 단락 요약으로 누적 + 최근 20턴 raw messages → AI memory 보완.
// 5-10턴마다 자동 background update (fire-and-forget). cache hit 안 되면 raw 20턴만 (1턴 latency 후 cache hit).

const _ROLLING_SUMMARY_RECENT_CAP = 20;
const _ROLLING_SUMMARY_THRESHOLD = 25;        // 이만큼 넘어야 압축 활성화
const _ROLLING_SUMMARY_STALE_TOLERANCE = 10;  // cache 와 oldPart 차이 N턴까지는 hit 으로 인정

function _rollingSummaryCacheKey(fromChapterMsgs) {
  const first = fromChapterMsgs && fromChapterMsgs[0];
  return (first && first.timestamp) ? first.timestamp : 'chapter';
}

async function _maybeBuildRollingSummary(oldMessages, cacheKey) {
  if (!oldMessages || oldMessages.length < 5) return;
  if (typeof _canAI !== 'function' || !_canAI()) return;
  if (window._onbTutorialMode) return;
  if (state.preferences && state.preferences.testerMode) return;

  if (!state.preferences) state.preferences = {};
  if (!state.preferences._chatRollingSummary) state.preferences._chatRollingSummary = {};
  if (!state.preferences._chatRollingSummaryCount) state.preferences._chatRollingSummaryCount = {};

  const _cachedCount = state.preferences._chatRollingSummaryCount[cacheKey] || 0;
  if (_cachedCount === oldMessages.length && state.preferences._chatRollingSummary[cacheKey]) return;

  if (window._buildingRollingSummary === cacheKey) return;
  window._buildingRollingSummary = cacheKey;

  try {
    const chatLog = oldMessages.map(m => {
      const role = m.role === 'user' ? '나' : '소라';
      let content = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim();
      content = content.replace(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)[\s\S]*\}\s*$/g, '').trim();
      return `${role}: ${content}`;
    }).join('\n\n');

    const _existing = state.preferences._chatRollingSummary[cacheKey] || '';
    const prompt = _existing
      ? `사용자(나)와 AI(소라)의 같은 챕터 대화 흐름이 길어져서 누적 요약을 update.

[기존 요약]
${_existing}

[추가된 대화 + 누적]
${chatLog.slice(0, 7000)}

[너의 일]
한 단락 (4-6 문장) 요약. 대화 핵심 흐름 + 사용자가 무엇을 가지고 있었는지 + 어디까지 풀렸는지 + 최근 변화. 한국어, 친구 톤. 마크다운 X. 이 요약은 다음 응답에서 옛 대화 대신 prompt 에 들어감 — 대화 맥락 잃지 않게 핵심 보존.`
      : `사용자(나)와 AI(소라)의 한 챕터 대화 (옛 부분).

[대화 원문]
${chatLog.slice(0, 7000)}

[너의 일]
한 단락 (4-6 문장) 요약. 대화 핵심 흐름 + 사용자가 무엇을 가지고 있었는지 + 어디까지 풀렸는지. 한국어, 친구 톤. 마크다운 X. 이 요약은 다음 응답에서 옛 대화 대신 prompt 에 들어감 — 대화 맥락 잃지 않게 핵심 보존.`;

    const resp = await callAnthropic({
      _endpoint: 'chat_rolling_summary',
      model: 'claude-haiku-4-5',
      max_tokens: 280,
      messages: [{ role: 'user', content: prompt }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const text = (data?.content?.[0]?.text || '').trim();
    if (text) {
      state.preferences._chatRollingSummary[cacheKey] = text.slice(0, 1200);
      state.preferences._chatRollingSummaryCount[cacheKey] = oldMessages.length;
      saveState();
    }
  } catch (e) {
    console.warn('[rolling summary]', e);
  } finally {
    delete window._buildingRollingSummary;
  }
}

// chapter 분리 시 cache 정리 — 옛 chapter cache 제거 (cache key 가 첫 메시지 timestamp 라서 자연스럽게 새 chapter 는 다른 key. 단 메모리 누적 방지).
function _pruneRollingSummaryCache() {
  if (!state.preferences || !state.preferences._chatRollingSummary) return;
  const _validKeys = new Set();
  // 현재 chatMessages 의 chapter 첫 메시지 timestamp
  const _validMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  let _chapterStart = 0;
  for (let i = _validMsgs.length - 1; i >= 0; i--) {
    if (_validMsgs[i].chapterStart) { _chapterStart = i; break; }
  }
  const _first = _validMsgs[_chapterStart];
  if (_first && _first.timestamp) _validKeys.add(_first.timestamp);
  // 옛 key 모두 제거
  Object.keys(state.preferences._chatRollingSummary).forEach(k => {
    if (!_validKeys.has(k) && k !== 'chapter') {
      delete state.preferences._chatRollingSummary[k];
      delete state.preferences._chatRollingSummaryCount[k];
    }
  });
}
