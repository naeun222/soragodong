# 소라고동 — Hook + 챗 placeholder 시스템 spec (2026-05-18)

> 사용자 일기/대화/진주/토픽 데이터에서 매일 1개 specific 디테일 추출. Hook (대화 trigger) + 고동 일기 (챗 placeholder) + 부재 후속 (며칠 만에 돌아옴 인사) 3 시스템. 모두 backend cron 일원화.

==================================================

## 1. 본질

**"고동이가 너 일기를 살짝 봤어 ✦ 거기 적힌 거 친구로서 묻는다."**

ChatGPT / Pi / Replika 절대 못 함 (지속 데이터 X). 본인 앱의 진짜 차별화 무기.

==================================================

## 2. Backend cron 일원화 정책 (확정)

**모든 4AM cutoff 작업을 backend Cloudflare Workers cron 으로 통일.** 기존 client-init trigger 폐기.

### 대상 작업 (모두 backend cron 으로 이동)
- daily_summary (기존 무한 retry 버그 → backend cron 으로 자연 해결)
- chapter extract (case formulation / topic 추출)
- godong diary generation
- godong hook generation
- weekly / monthly review generation
- forced analyze (4AM batch trait/value/pattern 갱신)
- RAG embedding backfill

### 핵심 가드 — *데이터 있는 사용자만 trigger*

⚠ **모든 cron 작업에 *대상 데이터 보유* 가드 필수.** joh752307 케이스 (활동 X 사용자 daily_summary 5번 발사) 방지.

```typescript
async function cronDailySummary(userId, env) {
  const state = await loadUserState(userId);
  const yesterday = getDayKey(Date.now() - 86400000);
  
  // 어제 데이터 있는지
  const yesterdayEntry = (state.entries || []).find(e => e.date === yesterday);
  const yesterdayChatMsgs = (state.chatMessages || []).filter(m => getDayKey(m.timestamp) === yesterday);
  const yesterdayArchive = (state.chatArchive || []).filter(a => a.date === yesterday);
  
  const hasData = yesterdayEntry || yesterdayChatMsgs.length >= 3 || yesterdayArchive.length > 0;
  if (!hasData) return { skipped: true, reason: 'no-data' };
  
  // 이미 처리됨 가드
  if (yesterdayEntry?.aiSummary) return { skipped: true, reason: 'already-done' };
  if (yesterdayEntry?._aiSummaryAttempts >= 3) return { skipped: true, reason: 'attempt-cap' };
  
  // 호출...
}
```

각 작업마다 *대상 데이터 가드* + *already-done 가드* + *attempt cap* 셋 필수.

### Cron 스케줄
- 4AM KST = UTC 19:00 전날: `0 19 * * *`
- 사용자 순회 — Cloudflare 동시 100 req limit → batch 50 명씩 sleep 1초
- 우선순위: chapter extract > daily_summary > review > diary > hook > forced_analyze > rag_embed

### 마이그레이션
1. Backend cron 먼저 enable
2. 1주일 dual run (client + backend)
3. Backend 안정 확인 후 client trigger 코드 제거

==================================================

## 3. 사용자 결정사항 — Hook 시스템

| # | 항목 | 결정 |
|---|---|---|
| 1 | 호출 위치 | Backend Cloudflare Workers cron |
| 2 | 윈도우 | 어제 ~ 14일 전 random + 최근 가중치 (3일 50% / 4-7일 30% / 8-14일 20%) + 풍부도 가중치 |
| 3 | Cold start gate | 가입 7일 + 챕터 ≥ 2 + 진주+일기 ≥ 3 통과 시만 |
| 4 | askedHooks log | 7일 cooldown, 답 안 한 hook 14일 |
| 5 | 클릭 흐름 | chat 탭 + first AI message 로 깔림 |
| 6 | 답 안 한 hook | 자연 대체 (reminder X) |
| 7 | Frequency | 매일 1회 default + "매일/격일/주 3회/필요 없어" |

==================================================

## 4. Hook 6 종류 (본인 카피 best)

| Type | 패턴 | 예시 (본인 작) |
|---|---|---|
| 1 | 체험/장소 후속 | "한강에서 먹었던 두바이설빙 그거 어때? 진짜 맛있어?" |
| 2 | 모르는 단어 호기심 | "있잖아 너 일기에 야르따끼마스 적어놨는데… 그거 뭔 말이야ㅋㅋ" |
| 3 | 세상 지식 + 일기 결합 | "시르미오네 처음 들어봤어. 코모는 영화에서 봤고 베로나는 로미오 줄리엣인데, 시르미오네는 뭐가 있어?" |
| 4 | 진행 상황 후속 | "이탈리아어 배운다 했는데 지금 어디까지 갔어?" |
| 5 | 감정/감상 후속 | "헤일메리 따뜻하다고 했잖아. 어떤 장면이 따뜻했어?" |
| 6 | 관계 호기심 | "진주에 송연이 자주 나와. 학교 친구야?" |

==================================================

## 5. 챗 탭 empty placeholder 시스템 (v2 — 핵심)

### 본질
챗 탭 empty state 자리에 *Hook* / *고동 일기* / *부재 후속* / *Default* 중 1개 표시. 사용자 메시지 입력 시 자연스럽게 위에 보존되며 대화 이어짐.

### 우선순위 표 (마스터)

| Trigger | 표시 |
|---|---|
| Push 클릭 / 홈 hook 카드 클릭 진입 | **Hook only** (first AI message) |
| 직접 챗 탭 + 챕터 마무리 직후 5분 안 | **Default placeholder** |
| 직접 챗 탭 + 일반 진입 + 일기 큐 unread 있음 | **일기 inline 카드** |
| 직접 챗 탭 + 일반 진입 + 일기 큐 빈 + 1일+ 부재 + 5일 cooldown 통과 | **부재 후속 placeholder** |
| 직접 챗 탭 + 일반 진입 + 그 외 | **Default placeholder** ("편하게 말해 보소") |

**핵심 — Hook 은 push/홈 클릭 진입 시만 활성.** 사용자가 직접 챗 탭 누름 = Hook entry X.

==================================================

## 6. 고동 일기 큐 시스템

### 생성
- **Backend cron 매일 4AM.** 데이터 있는 사용자만 generate. 데이터 가드 필수.
- 부재 무관. 데이터 있으면 generate.
- 매일 *1개 새 entry* 추가.

### Queue 구조
```js
state.godongDiaryQueue = [
  {
    id: 'gd_TIMESTAMP_random',
    body: '...',
    generatedAt: ISO,
    triggerDayK: '2026-05-09',
    readAt: null | ISO,
    dismissedAt: null | ISO,
  },
  // 최대 30개. FIFO prune.
]
```

### 표시
- 챗 탭 진입 시 unread (`readAt == null AND dismissedAt 1일 cooldown 통과`) 중 가장 오래된 1개.
- **Inline 카드** (입력창 위, top of chat). 모달 popup X.
- 텍스트 *주절주절 inline*. AI message 형식 X, *별도 카드*.
- 카드 안 작은 "못 본 척 하기" 버튼.

### 읽음 처리
- **챗 탭 진입 후 3초 머묾 = 자동 읽음.** `readAt = now`.
- 다음 진입 = 다음 unread 일기.
- 다 읽으면 = 다음 우선순위 fallback.

### "못 본 척 하기"
- 누르면 `dismissedAt = now`. **1일 cooldown (새벽 4시 cutoff).**
- 1일 후 다시 unread 로 부활 (사용자 *진짜 안 봤다* 함).

### 메시지 입력 시
- 일기 카드 *그대로* 위에 보존. 새 대화 그 아래 이어짐.
- 일기 카드 = 작은 시각 weight (사용자 메시지 < 일기 카드 weight).

### 한도
- **30개 cap.** FIFO. 영원히 따라잡지 못해도 오래된 거 자동 사라짐.

==================================================

## 7. 부재 후속 placeholder

### Trigger
- 사용자 1일 이상 부재 + 진입 시 (마지막 진입 24시간 이상 전)
- **5일 cooldown.** 5일 안 또 부재해도 trigger X.

### 우선순위
- **일기 큐 빈 경우만 fallback.** 일기 큐 unread 있으면 부재 후속 X.

### 표시
- *1회성*. 한 번 표시 후 자동 dismiss. 쌓이지 않음.
- Inline 카드 (일기와 같은 자리).
- 톤 — "보고 싶었어" / "어디 갔다 왔어" 류 (카피 본인 결정 필요).

### 메시지 입력 시
- 즉시 dismiss. 다음 진입 = 우선순위 흐름 normal.

==================================================

## 8. Hook 시스템

### Entry
- **Push 알림 클릭** (Android FCM / iOS native) 또는 **홈 hook 카드 클릭**.
- 사용자가 직접 챗 탭 누름 = Hook X.

### 표시
- 챗 탭 진입 + Hook 활성 시 → first AI message 로 깔림.
- 일반 AI message 형식.

### 사용자 응답
- 답하면 → askedHook.answered = true. 일반 chat 흐름 (RAG 활성).
- 답 안 함 → 14일 cooldown. 14일 후 다른 hook 발사.

### Frequency
- 매일 1회 default. 빈도 cooldown: daily 18h / every-other-day 36h / thrice-week 50h.
- "필요 없어" 선택 시 hook 영구 off.

### 클릭 흐름
```
push 클릭 / 홈 카드 클릭
  ↓ ?hookId=xxx deep link
챗 탭 redirect
  ↓
state.chatMessages 첫 줄에 inject:
  { role: 'assistant', content: hookBody, isHookMessage: true, hookId, ... }
  ↓
사용자 답 → 새 user message + hookAnswered 처리
```

==================================================

## 9. 챕터 마무리 후 처리

- 챕터 마무리 (✓ + "마무리" 확인) 직후 = **default placeholder 만.**
- 일기 / 부재 후속 / hook 모두 안 보임. *enough for now* 존중.
- *5분 안 재진입* = chat 그대로 (자연스러운 이어지기).
- *5분 이후 / 새로고침* = 우선순위 흐름 부활.

==================================================

## 10. State schema (v2)

```js
// 일기 큐
state.godongDiaryQueue = [...]  // 위 6번 구조

// 부재 후속
state.lastAbsenceAcknowledgedAt = ISO | null  // 5일 cooldown

// Hook
state.askedHooks = [
  {
    id, body, source, trigger_dayK, hook_type,
    askedAt, answered, answeredAt, delivered,
  },
  // 최대 50개. FIFO prune.
]

// User preferences
state.preferences.hookFrequency = 'daily' | 'every-other-day' | 'thrice-week' | 'off'
state.preferences.hookNotificationTime = '21:00'  // 24h HH:mm
state.preferences.lastChatTabEntryAt = ISO | null  // 부재 계산 + 마무리 5분 가드
```

==================================================

## 11. Substrate 수집 — `_bySource(dayK)` 재사용

위치: `src/scripts/main/10-home/03f-godong-diary-modal.js` 안.

Backend 에서 동일 로직 typescript 로 재구현. Backend = source of truth.

6 source:
- [A] 체크인 — vit/mood/sleep + dailyQuestion 답
- [B] 일기 — chatMessages user 발화 + entry.note (30자+)
- [C] 일기 요약 — chatArchive headline/summary
- [D] 진주 — state.pearls
- [E] 깨달음 — state.archive + state.insights
- [F] 대화 토픽 — state.topicCards

Hook 우선: [D] / [B] / [F] (디테일 풍부). [A] 체크인 단답은 약함.

==================================================

## 12. 호칭 받침 처리

```js
const _nameLast = userName[userName.length - 1];
const _nameLastCode = _nameLast ? _nameLast.charCodeAt(0) : 0;
const _hasJongseong = (_nameLastCode >= 0xAC00 && _nameLastCode <= 0xD7A3)
  ? ((_nameLastCode - 0xAC00) % 28) !== 0
  : false;

const _nameSubj  = _hasJongseong ? `${userName}이가` : `${userName}가`;
const _nameTo    = _hasJongseong ? `${userName}이한테` : `${userName}한테`;
const _nameAttr  = _hasJongseong ? `${userName}이` : userName;
const _nameTopic = _hasJongseong ? `${userName}이는` : `${userName}는`;
```

Backend `functions/api/_lib/name-helpers.ts` 로 옮김.

==================================================

## 13. Hook 시스템 프롬프트 (draft)

```typescript
function buildHookPrompt(args) {
  const { userName, substrateText, triggerDayK, askedHistory, activeModes } = args;
  const helpers = buildJongseongHelpers(userName);
  
  const systemPrompt = `너는 ${userName}의 친구. ${userName}이 일기/대화/진주/토픽/체크인에 적은 specific 디테일 1개 골라서 친구로서 직접 물어본다. 카톡 보내는 톤.

==================================================
[핵심 규칙 — 절대 위반 X]

**한 hook = 한 디테일 = 30~120자 / 1-2문장 / 끝에 ?**

⚠ ${userName}이 적은 specific 디테일 (장소/사물/이름/표현/단어) 그대로 인용.
⚠ 한 hook 안 명사 2개+ 혼재 X.
⚠ 끝에 *물음표 또는 답할 거리* 필수.
⚠ "도와드릴게요" / "~인 것이다" 어시스턴트 톤 절대 X.
⚠ 충고 / 진단 / "힘내" / "화이팅" 절대 X.

[Hook 종류 — substrate 보고 1개 자동 선택]
1. 체험/장소 후속 — "있잖아 ${userName} 한강에서 두바이설빙 먹었다 했는데, 그거 어때?"
2. 모르는 단어 호기심 — "있잖아 ${userName} 일기에 야르따끼마스 적어놨는데... 그거 뭔 말이야ㅋㅋ"
3. 세상 지식 + 일기 결합 — "${userName} 시르미오네 적어놨던데 거기 뭐 있어? 코모는 영화에서 봤고."
4. 진행 상황 후속 — "${helpers.nameAttr} 이탈리아어 배운다 했는데 어디까지 갔어?"
5. 감정/감상 후속 — "헤일메리 따뜻하다고 했잖아. 어떤 장면이 따뜻했어?"
6. 관계 호기심 — "진주에 송연이 자주 나와. ${helpers.nameTopic} 학교 친구야?"

[호칭 — 받침 ${helpers.hasJongseong ? '있음' : '없음'}]
- 주격: ${helpers.nameSubj} / 호칭: ${helpers.nameAttr} / 여격: ${helpers.nameTo} / 주제: ${helpers.nameTopic} / bare: ${userName}
- "너" / "네가" 절대 X.

[톤]
- 카톡 친구 말투. "있잖아", "~네", "~잖아", "~던데"
- ㅎㅎ / ㅋㅋ / ㅜㅜ / .. / ! / ? 자연.
- 모르는 척 + 호기심 OK.

[금지]
- "너" 호칭, 충고, 진단명, 분석 톤 ("관찰/패턴/성향"), 격식, 어시스턴트 톤, 이모지 (😊), "결", 명사 2개+ 혼재.
- 민감 디테일 (가족 갈등 / 트라우마 / 정신건강 진단) push 화면 잠금 노출 위험 — 일상/가벼운 디테일 우선.

[최근 7일 안 물어본 hook — 회피]
${askedHistory}

[활성 모드]
${activeModes}

[출력]
{"body": "...", "source": "pearl|diary|topic|insight|checkin", "trigger_dayK": "${triggerDayK}", "hook_type": 1-6}
JSON 1개. 마크다운 X.`;

  return { systemPrompt, userPrompt: `...` };
}
```

==================================================

## 14. Tone guard

```js
const hardGuards = {
  sycophancy: /힘내|화이팅|괜찮아질|잘하고 있어|대단해|멋져/,
  diagnosis: /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i,
  emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u,
  advice: /(?:해봐\b|하자\b|가\s*좋(?:아|을)|필요해|보면\s*좋|(?<![가-힣])해보자(?![가-힣]))/,
  youPronoun: /(?<![가-힣])너(?:가|는|랑|한테|를|의|에게|와)(?![가-힣])/,
  multiEventNouns: /(?:회사|학교|카페|한강|영화관|병원|...)|(?:엄마|아빠|친구|...)|(?:김치|커피|영화|...)/g,
  formal: /(?:인 것이다|라 할 수 있|로 추정|로 보인다|라는 점)/,
  meta: /(?:관찰\s*되|분석\s*[하되]|패턴이\s*나타|경향이\s*나타|성향이\s*보)/,
  assistant: /(?:도와드릴게요|알려드리겠|드릴게요|드리겠습니다)/,
  noQuestionMark: !/[?？]\s*$/,  // Hook 만 (일기는 X)
};

const softGuards = {
  banGyeol: /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/,
};

// hard → retry. 4회 실패 → skip. soft → warn 만.
```

==================================================

## 15. 카피 자리 (본인 결정 필요)

| # | 자리 | 톤 / 길이 / 조건 | 본인 카피 |
|---|---|---|---|
| 1 | 부재 후속 placeholder 본문 | 1줄. "며칠 만이네 / 보고 싶었어 / 어디 갔다 왔어" 류 |  |
| 2 | "못 본 척 하기" 버튼 label | 현재 한글 OK 또는 변경? |  |
| 3 | Default placeholder | 현재 "편하게 말해 보소" 유지? |  |
| 4 | 일기 카드 안 작은 헤더 (옵션) | "🤫 고동의 일기" / 또는 헤더 없음 |  |
| 5 | Push 알림 title | "🐚 고동이" 등 짧음 |  |
| 6 | 설정 화면 빈도 옵션 4개 | "매일 / 격일 / 주 3회 / 필요 없어" |  |
| 7 | 설정 화면 시간 prompt | "고동이가 너를 언제 찾는 게 편할까?" 등 |  |
| 8 | Onboarding 시간 prompt | 가입 후 hook 시간 묻는 한 줄 |  |
| 9 | 첫 hook 발사 후 toast | "마음에 안 들면 설정에서 끄기 가능" 류 |  |

본인 페이스로 채워나가기.

==================================================

## 16. 구현 우선순위

1. **Backend cron 일원화** (2번 정책) — 모든 4AM 작업 backend 로. daily_summary 무한 retry 자연 fix.
2. **챗 탭 empty placeholder v2 시스템** (5-7번) — 우선순위 표 + 일기 큐 + 부재 후속 + default
3. **Hook 시스템** (8번) — Backend prompt + cron + push delivery
4. **카피 정하기** — 15번 표

각 단계 끝나면 build + verify + commit.

==================================================

## 17. 위험 / 주의사항

1. **민감 디테일 push 노출** — 화면 잠금 노출 위험. Prompt guard 에 민감 키워드 회피 명시.
2. **부정확한 인용** — LLM 이 일기 단어 바꿔 인용 시 어색. 원문 발췌 verify 정규식 체크.
3. **마이그레이션 — client trigger 코드 제거 시점** 매끄러워야. Dual run 권장.
4. **iOS PWA push X** — 홈 카드 만 도달. iOS 사용자 push 권한 prompt X (실패 UX 회피).
5. **Edit 도구 truncation** — Cross-OS sync 이슈. 큰 파일 수정 후 *반드시* bash 검증.

==================================================

## 18. 파일 변경 list

### Backend (별도 repo / functions/)
- ✨ `functions/api/_lib/prompts/godong-hook.ts`
- ✨ `functions/api/_lib/prompts/godong-diary.ts` (frontend 에서 이동)
- ✨ `functions/api/_lib/godong-hook-runner.ts`
- ✨ `functions/api/_lib/godong-diary-runner.ts`
- ✨ `functions/api/_lib/name-helpers.ts`
- ✨ `functions/api/_lib/by-source.ts` (frontend _bySource 이동)
- ✨ Cron handler (daily_summary / extract / review / diary / hook / forced_analyze / rag_embed 통합)
- 🔧 `wrangler.toml` cron trigger
- ✨ Push delivery system (FCM Android, APNs iOS native)
- ✨ `POST /api/hook/generate` (수동 / 테스트)

### Frontend (src/)
- 🔧 `src/scripts/main/02-state.js` — godongDiaryQueue, askedHooks, hookFrequency, lastAbsenceAcknowledgedAt 등
- ✨ `src/scripts/main/19-chat/...` — empty placeholder 우선순위 라우터
- 🔧 `src/scripts/main/19-chat/02-render-message.js` — Hook first AI message 처리
- ✨ 일기 큐 inline 카드 컴포넌트
- ✨ 부재 후속 placeholder 컴포넌트
- 🔧 `src/scripts/main/31-settings.js` — Hook 빈도 + 시간 UI
- 🔧 `src/scripts/main/07-init/11-start-tutorial-v8.js` — onboarding 시간 prompt
- 🗑 옛 frontend cron trigger 제거 (runDiaryAutoSummaryIfNeeded, maybeRunDailyChapterExtract, etc.) — backend 로 이동 후

==================================================

## 끝

이 문서 = 진화하는 spec. 구현 시 *최종 카피 박힌 표* + 이 문서 같이 Claude Code 에 첨부.

다음 단계:
- 카피 채우기 (본인 페이스)
- Backend cron 인프라 확인
- 홈 재설계 추가 사항 (리뷰/체크인 우선순위) 별도 작업

변경 사항 있으면 여기 update.
