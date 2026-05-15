// V4 (사용자 명시 2026-05-16 cowork): generate-push unit test.
//   실행: node --test functions/api/__tests__/generate-push.test.mjs
//   pure logic 검증 (clamp / validate / buildUserPrompt / pickFallback). 3 tier mock input + 금지 표현 / 길이 / truncate assert.
//   real Sonnet call test 는 별도 manual (deploy 후 curl, README 참고).
//   추가 dependency X — Node 22+ 내장 node:test runner + node:assert.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clampPushMessage,
  validatePushMessage,
  buildUserPrompt,
  pickFallback,
} from '../_lib/push-logic.mjs';

// push-persona.ts (TS) 의 BANNED_PHRASES / FALLBACKS sync — test 안 hardcode.
// push-persona.ts 변경 시 여기도 함께 변경 (push-persona.ts 헤더 주석에 표기).
const BANNED_PHRASES = [
  '오늘 어땠어', '안녕!', 'AI', '분석', '리포트', '힘내', '화이팅', '괜찮아질', '치료', '관리',
];
const FALLBACKS = {
  1: ['잠깐, 그거 어떻게 됐어?', '아 맞다, 어제 그건 잘 풀렸어?', '문득 생각나서 — 어떻게 돼가?'],
  2: ['문득 너 생각났어 🐚', '오늘 너 떠올라서 들렀어.', '잠깐, 너 한 가지 알게 됐어.'],
  3: ['심심해서 너 생각났어.', '잘 지내?', '문득 너 생각났어 🐚'],
};

// ─────────────── clampPushMessage ───────────────
test('clampPushMessage: 40자 hard cap', () => {
  const long = '이것은 사십자를 훨씬 넘는 매우 긴 문장입니다 친구야 진짜 너무 길어 정말 너무너무';
  const out = clampPushMessage(long);
  assert.ok(out.length <= 40, `length=${out.length}`);
});

test('clampPushMessage: 앞뒤 따옴표 제거', () => {
  assert.equal(clampPushMessage('"잠깐, 어떻게 됐어?"'), '잠깐, 어떻게 됐어?');
  assert.equal(clampPushMessage("'문득 생각났어'"), '문득 생각났어');
  assert.equal(clampPushMessage('「오 뭐해」'), '오 뭐해');
});

test('clampPushMessage: 한 줄만 — 첫 줄 추출', () => {
  assert.equal(clampPushMessage('첫 줄\n두 번째 줄\n세 번째 줄'), '첫 줄');
});

test('clampPushMessage: 빈 / non-string → 빈 string', () => {
  assert.equal(clampPushMessage(''), '');
  assert.equal(clampPushMessage(null), '');
  assert.equal(clampPushMessage(undefined), '');
  assert.equal(clampPushMessage(123), '');
});

// ─────────────── validatePushMessage ───────────────
test('validatePushMessage: 정상 통과', () => {
  assert.deepEqual(validatePushMessage('잠깐, 그거 어떻게 됐어?', BANNED_PHRASES), { ok: true });
});

test('validatePushMessage: 빈 string reject', () => {
  assert.equal(validatePushMessage('', BANNED_PHRASES).ok, false);
});

test('validatePushMessage: 41자 reject', () => {
  const s = '가'.repeat(41);
  const v = validatePushMessage(s, BANNED_PHRASES);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'too_long');
});

test('validatePushMessage: 금지 표현 — generic 질문', () => {
  const v = validatePushMessage('오늘 어땠어?', BANNED_PHRASES);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'banned');
  assert.equal(v.phrase, '오늘 어땠어');
});

test('validatePushMessage: 금지 표현 — 의료법·상투', () => {
  assert.equal(validatePushMessage('치료에 도움 돼', BANNED_PHRASES).ok, false);
  assert.equal(validatePushMessage('힘내!', BANNED_PHRASES).ok, false);
  assert.equal(validatePushMessage('화이팅 💪', BANNED_PHRASES).ok, false);
  assert.equal(validatePushMessage('곧 괜찮아질 거야', BANNED_PHRASES).ok, false);
});

test('validatePushMessage: 금지 표현 — case-insensitive', () => {
  assert.equal(validatePushMessage('ai 리포트 보내줘', BANNED_PHRASES).ok, false);
});

// ─────────────── buildUserPrompt ───────────────
test('buildUserPrompt: tier 1 — thread followup', () => {
  const out = buildUserPrompt({
    tier: 1,
    context: '어제 사용자가 마지막에 던진 미해결 thread',
    thread: '내일 발표인데 자료 하나도 없어',
    since: '1일 전',
  });
  const obj = JSON.parse(out);
  assert.equal(obj.tier, 1);
  assert.equal(obj.thread, '내일 발표인데 자료 하나도 없어');
  assert.equal(obj.since, '1일 전');
});

test('buildUserPrompt: tier 2 — new insight', () => {
  const out = buildUserPrompt({
    tier: 2,
    context: '어제 batch 분석이 새로 추출한 사용자 특성',
    insight_type: 'trait',
    insight: '결정 어려울 때 일단 글로 쓰는 사람',
  });
  const obj = JSON.parse(out);
  assert.equal(obj.tier, 2);
  assert.equal(obj.insight_type, 'trait');
  assert.equal(obj.insight, '결정 어려울 때 일단 글로 쓰는 사람');
});

test('buildUserPrompt: tier 3 — casual', () => {
  const out = buildUserPrompt({
    tier: 3,
    context: '특별한 thread / insight 없음. 친구로서 안부.',
    days_since_last_chat: 2,
    recent_mood: '보통',
  });
  const obj = JSON.parse(out);
  assert.equal(obj.tier, 3);
  assert.equal(obj.days_since_last_chat, 2);
  assert.equal(obj.recent_mood, '보통');
});

test('buildUserPrompt: invalid tier reject', () => {
  assert.throws(() => buildUserPrompt({ tier: 5, context: 'x' }));
  assert.throws(() => buildUserPrompt({ tier: 0, context: 'x' }));
  assert.throws(() => buildUserPrompt({ context: 'x' }));
  assert.throws(() => buildUserPrompt(null));
});

test('buildUserPrompt: input field 200자 truncate', () => {
  const longThread = '가'.repeat(300);
  const out = buildUserPrompt({ tier: 1, context: '컨텍스트', thread: longThread, since: '1일' });
  const obj = JSON.parse(out);
  assert.equal(obj.thread.length, 200);
});

test('buildUserPrompt: days_since_last_chat clamp', () => {
  const out1 = buildUserPrompt({ tier: 3, context: 'c', days_since_last_chat: -10, recent_mood: '보통' });
  assert.equal(JSON.parse(out1).days_since_last_chat, 0);
  const out2 = buildUserPrompt({ tier: 3, context: 'c', days_since_last_chat: 9999, recent_mood: '보통' });
  assert.equal(JSON.parse(out2).days_since_last_chat, 999);
});

// ─────────────── pickFallback ───────────────
test('pickFallback: tier 1 — 비어있지 않음, array 내 매치', () => {
  const f = pickFallback(FALLBACKS, 1);
  assert.ok(FALLBACKS[1].includes(f));
});

test('pickFallback: tier 2 / 3 — array 내 매치', () => {
  const f2 = pickFallback(FALLBACKS, 2);
  assert.ok(FALLBACKS[2].includes(f2));
  const f3 = pickFallback(FALLBACKS, 3);
  assert.ok(FALLBACKS[3].includes(f3));
});

test('pickFallback: 빈 array → generic', () => {
  assert.equal(pickFallback({ 1: [], 2: [], 3: [] }, 1), '잘 지내?');
});

test('pickFallback: 누락 tier → generic', () => {
  assert.equal(pickFallback({}, 1), '잘 지내?');
});

// ─────────────── 통합: fallback 들 자체가 자체 validate 통과 ──────────
test('PUSH_FALLBACKS: 모든 fallback 이 40자 이내 + 금지 표현 없음', () => {
  for (const tier of [1, 2, 3]) {
    for (const msg of FALLBACKS[tier]) {
      const v = validatePushMessage(msg, BANNED_PHRASES);
      assert.ok(v.ok, `tier ${tier} fallback "${msg}" failed: ${v.reason}${v.phrase ? ' ('+v.phrase+')' : ''}`);
    }
  }
});
