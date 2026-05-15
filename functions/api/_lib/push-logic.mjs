// V4 (사용자 명시 2026-05-16 cowork): push 생성 pure logic — clamp / validate / build user prompt.
//   .mjs (ES module) 인 이유: functions/api/__tests__/generate-push.test.mjs 가 node --test 로 직접 import.
//   generate-push.ts 도 import (TS 가 .mjs import 가능). package.json 추가 dependency X.

// 40자 hard cap. char 단위 (utf-16 code unit). 한글도 1 char.
export function clampPushMessage(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  // 앞뒤 따옴표 제거 ("..." / '...' / 「...」 / 『...』)
  s = s.replace(/^["'「『]+/, '').replace(/["'」』]+$/, '').trim();
  // 한 줄만 — 첫 줄
  const firstLine = s.split(/\r?\n/)[0].trim();
  // 40자 hard cap
  return firstLine.length > 40 ? firstLine.slice(0, 40).trim() : firstLine;
}

// 응답 검증 — 길이 / 금지 표현 / 빈 string.
export function validatePushMessage(msg, bannedPhrases) {
  if (typeof msg !== 'string' || msg.length === 0) return { ok: false, reason: 'empty' };
  if (msg.length > 40) return { ok: false, reason: 'too_long' };
  const lower = msg.toLowerCase();
  for (const phrase of (bannedPhrases || [])) {
    if (!phrase) continue;
    if (msg.includes(phrase) || lower.includes(phrase.toLowerCase())) {
      return { ok: false, reason: 'banned', phrase };
    }
  }
  return { ok: true };
}

// 200 char field cap.
function _truncate(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.length > max ? v.slice(0, max) : v;
}

// tier 별 user prompt 합성. throws on invalid tier.
export function buildUserPrompt(input) {
  if (!input || typeof input !== 'object') throw new Error('invalid input');
  const tier = input.tier;
  if (![1, 2, 3].includes(tier)) throw new Error('tier must be 1, 2, or 3');
  const data = { tier, context: _truncate(input.context || '') };
  if (tier === 1) {
    data.thread = _truncate(input.thread || '');
    data.since = _truncate(input.since || '', 30);
  } else if (tier === 2) {
    data.insight_type = _truncate(input.insight_type || '', 30);
    data.insight = _truncate(input.insight || '');
  } else if (tier === 3) {
    if (typeof input.days_since_last_chat === 'number' && isFinite(input.days_since_last_chat)) {
      data.days_since_last_chat = Math.max(0, Math.min(999, Math.floor(input.days_since_last_chat)));
    }
    data.recent_mood = _truncate(input.recent_mood || '', 30);
  }
  return JSON.stringify(data, null, 2);
}

// random fallback pick. tier 누락 / 빈 array 시 generic.
export function pickFallback(fallbacks, tier) {
  const arr = fallbacks && fallbacks[tier];
  if (!Array.isArray(arr) || arr.length === 0) return '잘 지내?';
  return arr[Math.floor(Math.random() * arr.length)];
}
