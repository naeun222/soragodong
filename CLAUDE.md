# 소라고동 (Soragodong) — V4

ADHD 자기관찰 PWA. 사용자 김나은 단독 개발 + 본인 사용 + 향후 다른 사용자.

- 김나은 (jade6679@naver.com / Supabase auth uid `4ba0a92e-7f79-45ec-8c48-b339d259382e`)
- 회사명: **Naeun Lab** — 사업자번호 **261-21-02592** (2026-04-30 등록, 일반과세, KSIC 722000 + 525101)
- 사업용 이메일: **soragodongapp@gmail.com**
- 도메인: **soragodong.com** (Cloudflare Registrar)
- 통신판매업 신고: ✅ 2026-04-30 (네이버 스마트스토어 무료 구매안전서비스 확인증 우회)

> ⚠️ **학습 (2026-04-30)**: SW 개발·공급업 (KSIC 722000) = 부가가치세법 시행령 §109에 의해 **간이과세 배제 업종**. 이전 메모에 "간이과세" 잘못 기록됐던 거 정정. 일반과세는 부가세 10% 받지만 매입세액 공제 가능 (Cloudflare/Anthropic/Supabase 세금계산서로 유리).

---

## 작업 원칙

- **한국어로 소통.** 영어 답변 X.
- **짧고 직관적.** 진단 → 수정 한 줄.
- 사용자 코드 안 읽음. 행동/결과로 검증.
- 캐주얼 톤이지만 가벼운 농담 X.
- **"박다" 동사 금지** (사용자 명시 2026-04-30, 강조 반복). 사용자·개발자 facing 어디서도 사용 X. 자연 동사로 (적용/추가/넣다/두다/들어가다/자리잡다/자리하다/위치/통합/완성 등). user-facing 모달은 자연 한국어 ("세워볼게" 등).
- "너의/네" 일괄 치환 X — 둘 다 가능.
- `console.error` 정상 (로깅 패턴).

## Push 정책 (사용자 명시 2026-04-30)

1. **main 단독** (v4-dev 폐기). soragodong.com / pages.dev 둘 다 main 배포.
2. **push 항상 허락** — 자동 OK. 옛 batch 10 commit 정책 무효.
3. commit 후 자연 push (한 작업 단위 마무리 후).
4. force push / 큰 reset 시에만 backup branch (`main-backup-YYYY-MM-DD`) 자동 생성. 일반 push 는 X.

## 작업 흐름

1. 변경 → 빌드 (`npm run build`) — 신택스 점검.
2. commit 메시지: `V4 [fix|feat|ui|chore] (사용자 [요청|보고|명시]): <짧은 설명>`
3. push.

---

## 신뢰도 정직 패턴 (2026-04-30 학습)

분야별 정확도 다름. 잘못된 안내 = 사용자 시간/비용 낭비. ⚠️ 라벨 + 공식 채널 재확인 권장.

| 분야 | 신뢰도 | 처리 |
|---|---|---|
| 코드/기술 | 🟢 높음 | 직접 검증 (빌드/typecheck/grep) |
| Anthropic/Cloudflare API | 🟡 중간 | 공식 문서 + 구현 검증 |
| 한국 법/세무/행정 (사업자/통판/PG) | 🔴 **낮음** | ⚠️ 라벨 + 공식 채널 (1357/1588-9779/구청) 권장 |
| 의료/심리/법률 자문 | ⚫ X | 절대 자문 형태 X — 전문가 |

**과거 오류 사례**: 간이과세 권장 (틀림 — SW 배제), 토스페이먼츠 가입비 무료 (틀림 — 33만원), 카카오페이 단독 무료 (틀림 — 에스크로 발급처 X). 한국 행정 일반화 위험.

---

## 파일 구조

```
soragodong-repo/
  index.html              ← 단일 HTML (~32k 줄, ~1.6MB). 거의 모든 코드.
  vite.config.* / package.json / tsconfig.json / vitest.config.ts
  CLAUDE.md / USER_TODO.md
  src/utils/date.ts        ← Phase A 점진 모듈 (현재 이거만)
  tests/                   ← Vitest
  supabase/migrations/
    0001_rls.sql           ✅ 실행 완료
    0002_billing_usage.sql ⏸️ 사용자 실행 대기
    0003_feedback.sql      ⏸️ 사용자 실행 대기
  functions/api/           ← Cloudflare Pages Functions (Phase C 활성)
    _lib/                  ← auth / billing / usage 헬퍼
    chat.ts                ← Anthropic 프록시
    usage.ts / feedback.ts / account/delete.ts
    billing/               ← charge / subscribe / refund / verify-toss-receipt
    admin/                 ← pending-charges / confirm-charge / feedback-list / feedback-reply
  legal_draft/             ← terms / privacy / refund / cross-border
  public/sw.js             ← Service Worker (오프라인 + 설치)
  .github/workflows/ci.yml ← build / typecheck / test
  api_draft/               ← 옛 Vercel 시절 (deprecated, 무시)
```

**빌드/테스트**: `npm run build` / `npm test` / `npm run typecheck`.
**배포**: Cloudflare Pages (Vercel X — Hobby 상업 금지로 마이그레이션 2026-04-30).

## 코드 찾기 (index.html grep 위주)

- 튜토리얼 step: `Grep "id: 'step_id'" index.html`
- `ONBOARDING_PHASES` (9개) / `ONBOARDING_STEPS` (line ~10376)
- 렌더링: `function renderXxx`
- 데이터 구조: `memory/reference_codebase.md`

## 시드 데이터 안전

- 사용자 V3 데이터 절대 X. **id-prefix `seed_` sweep 만 안전. signature sweep 금지.**
- 시드 항목 `_seed: timestamp` marker → init sweep 매칭 자동 제거.
- testerMode ON 시 cloud / localStorage 저장 차단 (격리).

---

## 핵심 시스템 — 한 줄씩

### 인증 / 데이터 / E2EE
- Supabase auth (이메일 OTP). JWT 만료 시 refresh.
- `state` → `soragodong_data` row (cloud) + localStorage. cloud 우선.
- Stage 1 RLS ✅ (0001_rls.sql).
- **Stage 2 E2EE** ✅ — 사용자 password (PBKDF2 1M). 분실 시 자동 백업 fallback. cloud `_e2eeRecovery` 자동 sync (새 device 복원 가능).
- 데이터 손실 방지: `location.reload` 직전 `await saveToCloudNow` 강제 (18곳 audit). E2EE 복원 race fix.

### Phase C — 백엔드 프록시 (활성)
- 모든 Anthropic 호출 = `/api/chat` 프록시. 클라이언트 fetch interceptor 자동 swap.
- 사용자 본인 API 키 모델 폐기 (`state.apiKey` 영구 wipe 마이그레이션).
- AI 호출 가능 헬퍼: `_canAI()` = `session.access_token` 기반 (30+ 곳 게이트 통일).
- 인터셉터 401 자동 refresh + retry (`_refreshSessionForApi()` + inflight guard).
- 결제: PG (포트원) 통합 — 키 박히면 즉시 활성. legacy 토스 수동 송금 + Sonnet vision 자동 인증 (`verify-toss-receipt`) endpoint 보존 (legacy 호환).
- chat.ts 에 `context.waitUntil()` — recordUsage / deductCost drop 방지 (사용자 보고 fix).
- SSE buffer 잔여 처리 — 마지막 message_delta 누락 fix (사용자 보고 critical).

### 결제 모델 — 2-tier 월정액 (사용자 명시 2026-04-30 ultrathink)
- **무료 토큰**: 2,000원 ($1.43) — 가입 시 1회 자동 (pure API cost / 마진 X). 차감은 Anthropic 가격 그대로.
- **Light** 8,900원/월 — cap $5 (~7,000원 어치). tagline "가볍게 매일 / 짧은 대화·간단 분석·매일 체크인 위주".
- **Premium** 25,000원/월 — cap $15 (~21,000원 어치). claude pro 동일 가격. tagline "깊게 자주 / 긴 대화·4단 분석·마법고동·주간/월간 회고 풀 활용".
- **추가팩** (cap 도달 시): Light 5,000원 = +$4 / Premium 7,000원 = +$5. 사용자 명시 **계속 결제 가능** (1회만 X).
- **자동 갱신 X** — 다음 달 명시 결제로만 연장.
- **tier 업그레이드 (Light→Premium)** — endpoint 살아있지만 UI 옵션 제거 (사용자 명시: 불필요). `/api/billing/upgrade-tier` 직접 호출만 가능.
- **충전 plan 폐기** (CHARGE_PLANS / openChargeModal / showTossChargeModal / verifyTossReceipt 등 frontend ~280줄 정리). 기존 charge 잔액 (`credit_balance_usd > 0`) 사용자: legacy 호환 — 그대로 차감, 0 도달 후 구독 안내.
- **cap 도달 모달** (claude-style): 추가팩 결제 (계속 가능) / 닫기 만. tier 업그레이드 / 다음 cycle 대기 옵션 X.
- **DB**: `monthly_quota_usd` 컬럼 (tier cap, USD) + `subscription_plan` CHECK ('light' | 'premium' | NULL) + `deduct_credit_atomic` RPC 갱신 (cap 도달 시 credit_balance_usd 로 fall-through).
- **migration 0004** ✅ 사용자 실행 완료.

### 결제 critical bug fix 이력 (2026-04-30)
- ✅ **잔액 race condition** — deductCost read-modify-write → `deduct_credit_atomic` RPC (FOR UPDATE row lock). 동시 chat 호출 시 차감 손실 fix.
- ✅ **새로고침 시 잔액 자동 충전** — `ensureBillingRow` 가 transient fetch 에러 시 INSERT 재시도하며 balance reset 되던 critical 버그. fix: `Prefer: ignore-duplicates` + 자동 grant X (잔액 0 INSERT). 환영 모달 '받기' click 만 trigger (POST `/api/billing/welcome-bonus` — 별도 endpoint 예정).
- ✅ **튜토리얼 끝 데이터 소실** — onbFinish 에서 `_testerModeBackupState` 메모리 backup null 시 cloud backup row (`me_v4_backup`) 폴백 + seed marker sweep 강제 (fallback 안전망).

### Admin 시스템 (jade6679@naver.com)
- env `ADMIN_USER_ID = 4ba0a92e-7f79-45ec-8c48-b339d259382e` 필수.
- `_isAdmin()` (client) — 개발자 도구 / admin 피드백 답변 UI 가드.
- 서버 admin endpoints — `env.ADMIN_USER_ID` 강제 검증 (403 차단).
- **admin 특혜 제거** (사용자 명시 2026-04-30, ea779a1) — 결제·사용량 일반 사용자와 동일. 답변 권한 등 *기능* 권한만 보존.

### 코어 튜토리얼 잠금
- `state.unlocked.{core1..core6, core8}` 7개.
- testerMode ON 또는 로그인 X → 잠금 우회.
- 코어 #1 = '하면서 익히기'. startId `welcome`.
- 풀 튜토리얼 = Settings → 가이드 → 별도 버튼.
- 코어 끝 = `help_button` ("시작! ✦") → onbFinish → testerMode backup restore + saveToCloudNow await.
- 업데이트 모달 dismiss 단위: `dismissedMajor` (V4). V5 등 새 메이저 시 재출현.

### 첫 진단 (코어 #1 chat_intake_entry — 인터랙티브 모달 풀 흐름)
- 옛 5문항 quiz 폐기 + dead code ~275줄 정리 (2026-04-30 ultrathink). 새 흐름 = 코어 #1 *대화탭 시작 시점* `chat_intake_entry` step 안 button → `runIntakeFlow()` 풀스크린 모달.
- **흐름 (Step1-6)**:
  1. textarea + 🎤 + 예시 chip 1개 랜덤 (한 줄)
  2. 짧음 detect (15자 미만) → AI deepening 응답
  3. textarea + 🎤 + AI 동적 long example chip
  4. paraphrase + "🔍 더 알고 싶어" button
  5. 차원 진단 + 작은 전략 (`_intakeAnalyze`)
  6. 마무리 — '나 탭' 자라기 시작 안내
- **데이터** = `state.intakeWorry` 별도 array. 분석 결과 traits/values/patterns 자동 합류 (`user_verified=false`, source='intake_core1').
- **튜토리얼 흐름 개선** (사용자 명시 2026-04-30): 모달 종료 → `_startIntakeFromTutorial` 가 분석 결과를 chatMessages 에 자동 4단 분석 형식으로 표시 (`fromDeeper:true` + `proposal:true`) + 친절 안내 메시지 + `_onbStep` 을 `click_strategy` 로 점프 (send_diary / click_deeper / await_deeper_response 생략 — intake 가 동일 분석을 만들었으므로 중복 회피).
- testerMode ON 경로 = backup restore 직전 intake 데이터 추출 → restore → inject (보존).
- 음성 = Web Speech API (한국어 80-90%, 무료). 튜토리얼에 음성 적극 권장 (`chat_mic_intro` step + intake step1 prompt nudge).
- 사용자당 ~$0.02 (Sonnet 3-4회 호출).

### 리뷰 (재설계 — Detective + Quotes + Seeds + One-word)
- weekly / monthly: `generateReview` — pattern (headline/evidence/condition) + quotes 5 + experiment + seeds + (monthly) one_word.
- quarterly: `generateQuarterlyReview` — + turning_point (변곡점).
- 이전 리뷰 seeds → 다음 리뷰 prompt 주입 → AI callback continuity.
- 첫 weekly review 는 first-touch watch_points 시작점.
- 모델 = 모두 Sonnet 4.6 (리뷰 = 데이터 요약 task).
- **시드 verify P1 fix** (5cdcb79) — archive=`savedAt` / insights=`discoveredAt` / chatArchive=`generatedAt|date` mismatch 해결. fallback chain. archive map = `headline+body`, chatArchive map = `date+summary`.

### 결과 체크 / defer
- 미션 'completed' + attemptStatus 없음 = follow-up 대상.
- defer 옵션: 내일 / 3일 / 1주 / 2주 / 한 달 / 📅 직접 고르기 (캘린더).
- defer 후 만기일까지 `_findPendingStrategyFollowup` skip. 만기일 도달 → 매일 prompt. daily gate (`_lastFollowupAt`) 로 same-day re-show 차단.
- 또 미루면 chain 가능. defer된 미션은 7일 룰 무시.
- `_followupAsked` 체크로 한 번만 묻기 — 답 없으면 양생방에서 직접 결과 체크.

### 4단 분석 디자인
- 라벨: 🔍 내가 본 것 / 💡 이게 뭐냐면 / 🌱 이럴 땐 이렇게 / ✦ 오늘의 제안 (gold accent CTA).
- bracket `[]` 제거 + 단계 사이 1px 부드러운 border-top.
- 카드 박스 / 그라디언트 / 큰 아이콘 X (과한 디자인 회피).

### Brand DNA — 마법의 소라고동 = 스폰지밥 Magic Conch 모티브 (사용자 명시 2026-04-30)
- 스폰지밥 Magic Conch = 큰 결정 묻는데 "no" / "maybe someday" 만 답하는 useless oracle (코미디).
- 우리 마법고동 = 14일 숙성 + WRAP / Pre-mortem / Odyssey 로 *실제 작동하는* 결정 도구.
- → **"the joke that became real"** — irony 자체가 brand identity. 의도된 패러디라 진지함 X 인 게 의도.
- 한국 + 영어권 millennial / gen-Z 양쪽에서 작동 (cross-cultural rare brand).
- 영어 출시 시점에 brand name "Conch" / "Magic Conch" 직접 차용 가능 — Viacom 상표 risk 변호사 검수 자리.
- 마법고동 / 결정 카피 / 톤 작성 시 이 모티브 의식 (playful + serious 의도된 mix).

### 인앱 피드백 (사용자 ↔ admin)
- 사용자: ✉️ → POST `/api/feedback` → soragodong_feedback table.
- inbox: `fetchMyFeedback` direct RLS SELECT — 미읽음 빨간 dot.
- admin: GET `/api/admin/feedback-list` → POST `/api/admin/feedback-reply` (service_role PATCH).
- admin 답변 버튼 = 개발자 도구 안 (`adminFeedbackBtnDev`).
- table 미존재 시 친화적 셋업 카드 (4단계 가이드 + SQL textarea).

### Settings UI (계층화 2026-04-30)
- 자주 보는 거 (프로필+한도, 결제) / 가끔 (가이드, 백업·복원, 피드백) / 보안+계정 / 위험 / 개발자 (admin) / 정보 (데이터 보호).
- `.settings-card` / `.settings-collapse` 일관 스타일.
- 위기 안내 카드 (정신건강복지법 §15-6) — 1393 / 1577-0199 / 119.
- **사업자정보 표시** = `<details>` collapsed + 폰트 9.5px + opacity 0.55 (사용자 명시 "잘 안 보이게 구석에"). `BUSINESS_INFO` 객체 기반 자동 표시 — 빈 필드 row 자동 숨김.

### 마법의 방 (코어 #8 — 큰 결정 14일 숙성)
- `state.decisions` array. 10단계 (situation → weight → state → widen → reality → distance → premortem → odyssey → values → decision). dayUnlock 0/0/0/3/7/10/12/14/14/14.
- magic-mode UI = 보라 (#d4b8ff/#b89fde). 숙고의 방 = 청록 (#7ec8e3/#4cafb4). `body.magic-mode` / `body.reflection-mode` 토글.
- 모티프 (0504007) — 14일 모래시계 SVG ring (보라 그라디언트, 14일 도달 시 glow) + 10단계 dot 진행도 (locked/unlocked/done). 홈 + screen-decisions 카드 둘 다.

### Hybrid Opus 토글
- 헤더 godongicon/🦉 토글 = `state.preferences.useOpus`. 4곳 헤더 통합 (메인 / 숙고 / 마법 / 돌연변이).
- 영향 범위 = `sendChat` (메인 대화) + 마법 helpChat + 숙고 reflection.
- **나머지 (forceAnalyze / generateReview / firstTouch / 돌연변이) 는 고정 Sonnet** — 분석/리뷰는 데이터 요약 task로 Sonnet 충분. 토글 의도 = "지금 대화 깊게" 의 dial.
- 누를 때 토스트 안내: "🦉 Opus — 5x 빠르게 차감".
- **코어 #1 Opus 체험 step** (`chat_opus_intro`) — 튜토리얼 진입 시 자동 useOpus=true + `_opusActivatedByTutorial` flag. onbFinish 끝 = 자동 sonnet 복원.

### 헤더 / 브랜드 아이콘 (사용자 명시 2026-04-30)
- 헤더 컴팩트화: top padding `52px` → `max(10px, env(safe-area-inset-top))` (iOS PWA notch 안전영역 보존). justify-content: flex-end (좌측 로고 제거).
- 좌측 로고 (`🐚 소라고동`) 제거 — 우측 sonnet 토글만 남김. sonnet 표시 = godongicon.png 이미지 (22px). Opus = 🦉 그대로.
- 대화탭 타이틀: "소라고동 🐚" → "고동이에게" + godong-icon (em 비례 1.25em).
- 마법고동 핵심 자리 4곳 (chip / screen-title / dm-icon / action-icon) 🧙‍♂️ → godongicon.
- 인라인 텍스트 (버튼 라벨 / 토스트 / AI prompt) 🧙‍♂️ 는 그대로 보존.

### 음성 인식 통합 (cbb0eae)
- 공용 헬퍼 `_toggleInputSpeech(taId, btnId)` — Web Speech API 무료, 한국어.
- 4곳 입력창 통합: 메인 chat (`chatInput`) / 숙고 (`reflectionInput`) / 마법 helpChat (`magicHelpInput`) / 돌연변이 (`mutationChatInput`).
- continuous + interimResults + 5초 침묵 자동 종료. ⏹/🎤 toggle + 빨간 펄스 box-shadow.
- 미지원 브라우저 (iOS Safari < 16.5 등) = button 항상 표시 + 누름 시 토스트 안내 ("예시 누르거나 직접 적어줘").
- 첫 사용 = privacy 안내 1회 (localStorage `soragodong_v4_speech_consent`).
- intake 모달 자리도 동일 패턴 (단 별도 _intakeMicToggle 함수 — _intakeState 격리).

### 일상 대화 티키타카 톤 (8d204ae)
- `sendChat` system prompt rule 13 변경: '물음표 자제' → '티키타카 권장'.
- 일상·감정·가벼운 얘기 → 자연 호기심 질문 1개 권장 ("오 진짜?", "그래서 어떻게 됐어?", "어땠어?").
- 분석/추궁/탐색 X 는 유지. 명시 도움 요청 ("어떡하지", "도와줘") 시에만 깊이 진입.

### 추적 그래프 (7885180)
- area gradient + 마지막 점 ring pulsing + 현재값 floating tag + grid 3줄 + 시작/끝 날짜 축 + 목표 도달 success 색조.
- preserveAspectRatio + aspect-ratio CSS (glyph stretch fix).

---

## 비용 / 인프라

### Heavy user API 비용 (Anthropic, prompt caching 기준)
- 매일 30분 대화 + 일기 + 양생방 + 마법 풀가동 → 월 $10-15 (~1.5-2만 원).
- 100명 = 월 $1500 (~200만 원) 원가.

### 1년차 1인 외부 비용
- Cloudflare Pages: free / Cloudflare Registrar (.com): ~$10/년 / Supabase: free tier
- Anthropic: monthly cap (사용자 결정)
- Google Play $25 1회 (사용자 결정 2026-04-30: PWA + Google Play 우선 출시)
- Apple $99/년 = 6-12개월 후 한국 검증 후 (Apple IAP 30% 마진 부담)
- ISMS / 보안 audit: 의무 X (1년차)

### 매출 시뮬레이션 (가중 마진 ~7,000원/sub, Light 70% / Premium 30%)
- 30 sub (베타): ~210K/월
- 100 sub: ~700K/월 (알바 부수입)
- 300 sub: ~2.1M/월 (1인 part-time 생계)
- 500 sub: ~3.5M/월 (직장인 신입)
- 1,000 sub: ~7M/월 (안정 1인 사업)
- 손익분기점: ~15 sub (Supabase Pro $25/월 + 도메인 등 cover)

### 출시 방향 (사용자 명시 2026-04-30)
- ✅ **Phase 1 (현재)**: PWA (Cloudflare Pages, soragodong.com)
- 🟢 **Phase 2**: Google Play (PWA → TWA, $25 일회성, Mac 불필요, 사용자 결정 OK)
- ⏸️ **Phase 3 (6-12개월 후)**: iOS App Store — 한국 사용자 base 검증 후. cloud Mac/build 서비스 + Apple IAP 30% 마진 직격
- ⏸️ **Phase 4 (1년+)**: 영어권 출시 — i18n 리팩터 + Claude agent 번역 + 영어 변호사 검수 + native review. brand name 후보 "Conch" / "Magic Conch" (Viacom 상표 검수 자리).

---

## 알려진 한계 / fragile

- index.html 1.6MB 단일 — Phase A 점진 분리 (현재 utils/date.ts만)
- testerMode race (saveToCloud 1초 debounce + 600ms reload) — functional 안전이지만 fragile
- 24시간 갭 자동 챕터 분리 vs ✓ 마무리 — 일관성 OK 단 점검 필요
- 새 device E2EE 복원 — cloud `_e2eeRecovery` 자리잡힌 후 가능. 옛 cloud 데이터는 same-device 만.

---

## 사업자 / 행정 진행

- ✅ 사업자등록 (Naeun Lab, 일반과세, 261-21-02592, 2026-04-30)
- ✅ 통신판매업 신고 (네이버 스마트스토어 우회 — 베타 단계 OK)
- 🟡 토스뱅크 사업자 통장 진행 (KB 다중 계좌 제한 → 토스뱅크 비대면)
- ⏸️ PG 결정 대기 — 토스페이먼츠 33만원 (가입 22만 + 연관리 11만) vs 다른 PG vs 보류

**네이버 우회 본질** (사용자 알기): 행정 절차 통과 OK. 자체 사이트 카드 결제 시작 시 → PG 추가 필요 (전상법 §13). 베타 단계 적발 risk = 매우 낮음.

---

## 다음 작업

### 🟢 이번 세션 완료 (2026-04-30)
- [x] **2-tier 월정액 시스템 구현** — DB 0004 + backend (subscribe / overage-pack / upgrade-tier) + frontend (충전 폐기 + 2 카드 구독 + cap 도달 모달)
- [x] **무료 토큰 1,400원 → 2,000원** ($1.0 → $1.43, pure API cost / 마진 X) — 정정 2026-05-01: agent audit 결과 코드 = $1.43 (FREE_INITIAL_CREDIT_USD = 1.43). 이전 메모 표기 ($2.86) stale, 정정.
- [x] **잔액 race condition fix** — deduct_credit_atomic RPC 활용
- [x] **recordUsage / deductCost waitUntil** — drop 방지
- [x] **SSE buffer 잔여 처리** — 마지막 message_delta 누락 fix (output_tokens 거의 0 record 되던 root cause)
- [x] **새로고침 잔액 자동 충전 fix** — ensureBillingRow ignore-duplicates + 자동 grant X
- [x] **튜토리얼 끝 데이터 소실 fix** — onbFinish cloud backup 폴백 + seed sweep
- [x] **튜토리얼 흐름 개선** — intake 종료 → 4단 분석 자동 + click_strategy 점프 + chat_mic_intro 새 step
- [x] **옛 5문항 quiz 완전 폐기** (~275줄)
- [x] **헤더 컴팩트화 + 로고 제거 + sonnet 토글 godongicon**
- [x] **마법고동 4 자리 godongicon** (chip / screen-title / dm-icon / action-icon)
- [x] **godongicon HEIC → PNG 변환** (heic-convert)
- [x] **환영 모달 인스타톤 + 카피 "한 달 쓰면 / 너 자신이 다르게 보일지도."**
- [x] **결제 모달 카피 정리** — 정량 KRW cap 표기 X / 추가팩 계속 결제 가능 / tier 업그레이드 + 다음 cycle 대기 옵션 제거
- [x] **Brand DNA 메모 저장** — 마법의 소라고동 = 스폰지밥 Magic Conch 모티브
- [x] **신규 가입자 빠른 추출** (사용자 명시 2026-05-01) — sendChat 안 사용자/고동 1 세트 × 3 마다 즉시 `extractChapterCaseAnalysis` trigger (10번까지). 11번째부터 = 매일 4AM 흐름 풀백. `state.chatPairsCount` / `state.newUserExtractTriggers` 누적.

### 🟡 코드 (대기)
- [ ] **/api/billing/welcome-bonus endpoint 신규** — 환영 모달 '받기' click 시 호출 → 서버 사이드 free credit grant. ensureBillingRow 자동 grant 폐기 후 명시적 trigger 필요.
- [ ] **24시간 갭 vs ✓ 마무리 일관성 점검 + 새벽 4시 cutoff 케이스** — 24시간 자동 챕터 분리 vs 새벽 4시 daily cutoff race 점검
- [ ] **Performance audit + Phase A 모듈 분리** (1.75MB 단일 HTML) — 측정 + 우선순위 매기고 점진 분리

### 🔴 사용자 직접 대기 (USER_TODO.md 참고)
- [ ] **Cloudflare env 박기** (P0-1) — ANTHROPIC / SUPABASE_* / ADMIN_USER_ID / PORTONE_*
- [ ] **Supabase migration 0002 / 0003 실행** (P0-2) — 0004 ✅ 완료
- [ ] **통신판매신고번호 발급 대기** (P1-5)
- [ ] **legal_draft 갱신 — 충전 → 구독 모델 변경 반영** (P1-10)
  - terms.md 결제 방식 / 자동 갱신 X / 추가팩 정책
  - refund.md 구독 잔여일 비례 / 추가팩 청약철회 30일 / legacy charge 잔액 처리
  - privacy.md PG 위탁자 명시 (포트원 가입 후)
- [ ] **토스뱅크 사업자 통장** (P1-6) → 정산 계좌
- [ ] **PG 결정** (P1-7) — 토스페이먼츠 33만원 vs 보류
- [ ] **Google Play 출시 준비** (P2-13) — Bubblewrap CLI 로 PWA → TWA, $25 일회성

### 대기 노트 (낮음 — 재현 시만)
- '더 깊은 나' 자동 채움 알림 (이미 동작 — 알림 추가만)
- 튜토리얼 중 첫 진단 401 (인터셉터 자동 refresh 후 재현 시 알리기)
- legacy charge 잔액 사용자 — 그대로 차감, 0 도달 후 구독 안내 (호환 유지)
