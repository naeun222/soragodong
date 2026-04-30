# 소라고동 (Soragodong) — V4

ADHD 자기관찰 PWA. 사용자 김나은 (jade6679@naver.com / Supabase auth uid `4ba0a92e-7f79-45ec-8c48-b339d259382e`) 단독 개발 + 본인 사용 + 향후 다른 사용자.

회사명: **Naeun Lab** (✅ 사업자등록 완료 2026-04-30, **일반과세**, 업종 722000 응용 소프트웨어 + 525101 전자상거래 소매업).
사업자등록번호: **261-21-02592**.
사업용 이메일: **soragodongapp@gmail.com**.
도메인: **soragodong.com** (Cloudflare Registrar).
통신판매업 신고: ✅ 완료 (2026-04-30, 네이버 스마트스토어 무료 구매안전서비스 확인증 우회).

> ⚠️ **중요 학습 (2026-04-30)**: 소프트웨어 개발·공급업 (KSIC 722000)은 **부가가치세법 시행령 §109에 따라 간이과세 배제 업종**. 이전 CLAUDE.md에 "간이과세 진행 중"이라 잘못 박힌 거 정정. 일반과세 = 부가세 10% 받지만 매입세액 공제 가능 (Cloudflare/Anthropic/Supabase 세금계산서 발행 시 유리).

## 기본 원칙

- **한국어로 소통.** 영어 답변 금지.
- **짧고 직관적.** 진단 → 수정 한 줄.
- 사용자가 코드 안 읽음(보통). 행동/결과로 검증.
- 캐주얼 톤이지만 가벼운 농담 X.
- **"박다" 동사 금지** (사용자 요청 2026-04-30). 사용자·개발자 facing 어디서도 X — 적용/추가/넣다/두다/쓰다 등 자연 동사. user-facing 모달/안내는 당연히 자연 한국어 ("세워볼게" 등).

## 신뢰도 정직 패턴 (2026-04-30 학습)

분야별 정확도 다름. 잘못된 안내로 사용자 시간/비용 낭비 가능. 안내 시 ⚠️ 라벨 + 공식 채널 재확인 권장:

| 분야 | 신뢰도 | 처리 |
|---|---|---|
| 코드/기술 | 🟢 높음 | 직접 검증 (빌드/typecheck/grep) |
| Anthropic/Cloudflare/Vercel API | 🟡 중간 | 공식 문서 + 구현 검증 |
| 한국 법/세무/행정 (사업자/통신판매/PG) | 🔴 **낮음** | ⚠️ 라벨 박고 사용자에게 공식 채널 (1357/1588-9999/구청) 재확인 권장 |
| 의료/심리/법률 자문 | ⚫ X | 절대 자문 형태 X — 전문가 |

**과거 사례**: 간이과세 권장 (틀림 — SW 개발업 배제), 토스페이먼츠 가입비 무료 (틀림 — 33만원), 카카오페이 단독 무료 (틀림 — 에스크로 발급처 X). 한국 행정 영역 일반화는 위험.

## 파일 구조

```
soragodong-repo/
  index.html              ← 단일 HTML 파일 (~32k 줄, ~1.6MB). 거의 모든 코드 여기.
  vite.config.*           ← Vite 빌드 설정
  package.json            ← Vitest 추가됨
  vitest.config.ts
  tsconfig.json
  CLAUDE.md               ← 이 문서
  USER_TODO.md            ← 사용자 직접 작업 인계
  src/                    ← Phase A 점진 모듈 (현재 utils/date.ts만)
  tests/                  ← Vitest 단위 테스트
  supabase/migrations/    ← RLS / billing / feedback SQL (사용자 직접 실행)
    0001_rls.sql          ✅ 실행 완료
    0002_billing_usage.sql ⏸️ 사용자 실행 대기
    0003_feedback.sql     ⏸️ 사용자 실행 대기
  functions/              ← Cloudflare Pages Functions (Phase C 활성, 배포된 백엔드)
    api/_lib/             ← auth / billing / usage 헬퍼
    api/chat.ts           ← Anthropic 프록시 (admin 무료 + 일반 사용자 budget check)
    api/usage.ts          ← 사용량 조회
    api/feedback.ts       ← 인앱 피드백 저장
    api/account/delete.ts ← 회원 탈퇴
    api/billing/          ← charge / subscribe / refund / manual-charge / verify-toss-receipt
    api/admin/            ← pending-charges / confirm-charge / revoke-charge / feedback-list / feedback-reply
  legal_draft/            ← terms / privacy / refund / cross-border (변호사 검수 반영)
  public/sw.js            ← Service Worker (오프라인 + 설치 배너)
  .github/workflows/ci.yml← CI: build / typecheck / test
  api_draft/              ← 옛 Vercel 시절 reference (deprecated, 무시)
```

빌드: `npm run build` → `dist/index.html`. 테스트: `npm test`. 타입: `npm run typecheck`.

배포: **Cloudflare Pages** (Vercel X — Hobby tier 상업적 사용 금지로 마이그레이션 완료 2026-04-30).
브랜치: `v4-dev` = preview, `main` = production.

## Push 정책 (사용자 명시 2026-04-30 정정 — main 단독)

1. **main 단독 사용** (v4-dev 폐기 2026-04-30). soragodong.com / pages.dev 둘 다 main 배포.
2. **push 항상 허락** — 자동 push OK. 옛 정책 (batch 10 commit / 명시 허락 필요) 무효.
3. **commit 후 자연 push** — 한 작업 단위 마무리 후.
4. **force push 또는 큰 reset 시 backup branch** (`main-backup-YYYY-MM-DD`) 자동 박기. 일반 push 는 backup 안 함.

## 작업 흐름

1. 변경 → 빌드 (`npm run build`) — 신택스 점검.
2. commit. 메시지: `V4 [fix|feat|ui] (사용자 [요청|보고]): <짧은 설명>`
3. push (사용자 요청 시).

## 코드 찾기

index.html 거대한 단일 파일. Grep 적극 활용:

- **튜토리얼 step 찾기:** `Grep "id: 'step_id_here'" index.html`
- **튜토리얼 phase 9개:** `ONBOARDING_PHASES` (search)
- **튜토리얼 step 배열:** `ONBOARDING_STEPS` (line ~10376)
- **렌더링 함수:** `function renderXxx`
- **데이터 구조:** `memory/reference_codebase.md` 참고

## 주의 사항

- `console.error`는 정상 (로깅 패턴).
- 시드 데이터 / testerMode: 사용자 V3 데이터 절대 건드리지 않게 — id-prefix `seed_` sweep만 안전. signature 기반 sweep 금지.
- Korean 문법: "너의/네" 둘 다 가능. 일괄 치환 X.

---

## 핵심 시스템 — 한 줄씩

### 인증 / 데이터 / E2EE
- Supabase auth (이메일 OTP). JWT 만료 시 refresh.
- `state` → `soragodong_data` row (cloud) + localStorage. cloud 우선 (loadFromCloud overwrites).
- Stage 1 RLS ✅ 박힘 (0001_rls.sql).
- **Stage 2 E2EE** ✅ 박힘 (사용자 password 기반, PBKDF2 1M). password 분실 시 자동 백업 fallback 가능.
- 데이터 손실 방지 race fix 多 (location.reload 직전 await saveToCloudNow 강제).

### Phase C — 백엔드 프록시 (활성)
- 모든 Anthropic API 호출 = `/api/chat` 프록시. 클라이언트 fetch interceptor 자동 swap.
- 사용자 본인 API 키 모델 폐기 (state.apiKey 영구 비움 마이그레이션 박힘).
- AI 호출 가능 여부 헬퍼: `_canAI()` = state.apiKey OR session.access_token. 30+ 곳 게이트 통일.
- billing: 충전 잔액 (USD) + 월 정액 (subscription_active). 무료 토큰 $1.0 자동 부여.
- 결제: 토스 수동 송금 + AI vision 자동 인증 (verify-toss-receipt) 또는 manual-charge (사용자 신뢰 모델). 포트원 통합 대기.

### Admin 시스템 (jade6679@naver.com)
- env `ADMIN_USER_ID = 4ba0a92e-7f79-45ec-8c48-b339d259382e` 박혀있어야 활성.
- `_isAdmin()` (client) — UI 가드 (개발자 도구 / admin 피드백 답변 버튼 표시).
- server-side admin endpoint들 — `env.ADMIN_USER_ID` 강제 검증 (403 비-admin 차단).
- /api/chat — admin 무료 사용 (budget check + cost deduction 우회).
- 일일 chat cap (`_checkDailyChatCap`) — admin 우회.
- billing UI — admin은 잔액·충전 버튼 숨김 + 사용량 (토큰/비용) 만 표시.

### 코어 튜토리얼 잠금 시스템
- `state.unlocked.{core1, core2, core3, core4, core5, core6, core8}` 7개 코어 잠금.
- testerMode ON 또는 로그인 X → 잠금 우회.
- 코어 #1 = '하면서 익히기'. startId `welcome` (사용자 요청: 'tutorial_plea' 제거됨).
- 풀 튜토리얼은 Settings → 가이드 → 별도 버튼.
- 코어 끝 = `help_button` ("시작! ✦") → onbFinish → testerMode backup restore + saveToCloudNow await.
- 업데이트 모달 dismiss 단위: `dismissedMajor` (V4). V5 등 새 메이저 시 재출현.

### 신규 사용자 첫 진단 (First-Touch Analysis)
- `maybeShowFirstTouchQuiz` — 5문항 mini quiz (1분, skip 가능). 신규 사용자만 (entries ≤ 3 + `_firstTouchDone === false`).
- Sonnet 4.6 → `generateFirstTouchAnalysis` → 정체성 한 단어 + 친근 인사 + 가설 3 (trait/value/pattern 표준 schema) + 관찰 거리 2.
- 가설 ✓ → 기존 `state.traits/values/patterns`에 `user_verified: false` 박힘 → `_renderConfirmableSection` 자동 표시.
- watch_points → `state._firstTouchSeeds` → 첫 weekly review에서 callback (continuity).
- init 4.5초 setTimeout 트리거. quiz close → `autoTourOnUpdate` (튜토리얼 chooser 직진).
- 사용자당 ~$0.01-0.02 (Sonnet 1회).

### 리뷰 시스템 (재설계 — Detective + Quotes + Seeds + One-word)
- weekly / monthly: `generateReview` — pattern (headline/evidence/condition) + quotes 5개 + experiment + seeds + (monthly) one_word.
- quarterly: `generateQuarterlyReview` — + turning_point (변곡점).
- 이전 리뷰 seeds → 다음 리뷰 prompt에 inject → AI callback ("지난 씨앗 어떻게 됐는지").
- 첫 weekly review는 first-touch quiz의 watch_points 사용 (continuity 시작점).
- 모델: 모두 Sonnet 4.6 (리뷰 = 데이터 요약 task).

### 결과 체크 (defer 시스템)
- 미션 'completed' + attemptStatus 없음 = follow-up 대상.
- defer 옵션: 내일 / 3일 / 1주 / 2주 / 한 달 / **📅 직접 고르기 (캘린더 picker)**.
- defer 후 scheduledFor 만기일까지 `_findPendingStrategyFollowup` skip.
- 만기일 도달 → 매일 prompt (답 안 하면 다음날 또). daily gate (`_lastFollowupAt`)만으로 same-day re-show 차단.
- 또 미루면 또 미뤄짐 (chain 가능).
- defer된 미션은 7일 룰 무시 (사용자가 '한 달 후' 박았으면 30일 후 prompt).

### 4단 분석 디자인
- 라벨: 🔍 내가 본 것 / 💡 이게 뭐냐면 / 🌱 이럴 땐 이렇게 / ✦ 오늘의 제안 (gold accent — CTA 강조).
- bracket `[]` 제거 + 단계 사이 1px 부드러운 border-top (gentle separator).
- 카드 박스 / 그라디언트 / 큰 아이콘 X (과한 디자인 회피).

### 인앱 피드백 (사용자 ↔ admin)
- 사용자: ✉️ 메시지 → POST `/api/feedback` → soragodong_feedback table.
- 사용자 inbox (`fetchMyFeedback` direct RLS SELECT) — 미읽음 답변 빨간 dot.
- admin: GET `/api/admin/feedback-list` (status filter) → POST `/api/admin/feedback-reply` (service_role PATCH).
- 개발자 도구 안에 admin 답변 버튼 박힘 (`adminFeedbackBtnDev`).

### Settings UI (계층화 redesign 2026-04-30)
- 자주 보는 거 (프로필+한도, 결제) / 가끔 (가이드, 백업·복원, 피드백) / 보안+계정 (E2EE, 계정) / 위험 영역 / 개발자 (admin only) / 정보 (데이터 보호).
- `.settings-card` / `.settings-collapse` 일관 스타일.

---

## 비용 / 인프라

### Heavy user API 비용 (Anthropic)
- 매일 30분 대화 + 일기 + 양생방 + 마법의 소라고동 풀가동
- 월 $10–15 (~1.5–2만 원). prompt caching 적용 기준.
- → 100명이면 월 $1500 (~200만 원) API 원가.

### 1년차 1인 단계 외부 비용
- Cloudflare Pages: free
- Cloudflare Registrar (.com): ~$10/년
- Supabase: free tier 충분
- Anthropic API: monthly cap (사용자 결정)
- Apple Developer: $99/년 (앱 스토어 시 — PWA만 가면 X)
- Google Play Console: $25 일회성 (앱 스토어 시 — PWA만 가면 X)
- ISMS / 보안 audit: 의무 X (1년차)

---

## 알려진 한계 / 후순위

- index.html 1.6MB 단일 파일 — Phase A 점진 모듈 분리 (현재 utils/date.ts만, 나머지 inline)
- testerMode race (saveToCloud 1초 debounce + 600ms reload) — functional 안전이지만 fragile
- 24시간 갭 자동 챕터 분리 vs ✓ 마무리 흐름 — 일관성 OK
- 새 device E2EE 복원 — cloud `_e2eeRecovery` 박힌 후 가능 (옛 cloud 데이터는 same-device 만 가능)

---

## 최근 큰 작업 (2026-04-30 세션)

이번 세션에 박힌 큰 변화들 — 다음 세션 대비:

1. **Stage 2 E2EE 완전 박힘**:
   - 12-word passphrase → 사용자 지정 password (PBKDF2 1M)
   - submitE2EERecovery race fix (await saveToCloudNow 강제)
   - 비밀번호 잊음 fallback (auto-backup snapshots)
   - cloud `_e2eeRecovery` 자동 sync (새 device 복원 가능)
   - data-loss race 6개 일괄 fix (P1-P5 + 새 device 복원)

2. **Phase C 백엔드 프록시 완전 활성**:
   - Cloudflare Pages Functions 마이그레이션 (Vercel X)
   - state.apiKey 영구 wipe 마이그레이션
   - `_canAI()` 헬퍼 + 30+ 게이트 mass replace
   - 토스 수동 송금 + Sonnet vision 자동 인증
   - 본인 계좌 내역 캡처 인식 (모든 은행 앱 지원)

3. **관리자 시스템**:
   - jade6679@naver.com → ADMIN_USER_ID 검증
   - admin 무료 사용 (chat cap 우회 + budget 우회)
   - 인앱 피드백 답변 admin UI (개발자 도구 안)

4. **신규 사용자 첫 진단**:
   - 5문항 quiz → AI 첫 가설 (정체성 + 가설 + 관찰거리)
   - 가설 ✓ → 기존 traits/values/patterns 표준 schema 편입
   - watch_points → 첫 weekly review seeds

5. **리뷰 전체 재설계**:
   - Detective (cross-pattern 발견) + Quotes (인용 5개) + Seeds (다음 리뷰 callback) + One-word (정체성 명명)
   - quarterly = + turning_point (변곡점)

6. **Settings UI 계층화** + 4단 분석 디자인 + 결과 체크 defer 흐름 + 캘린더 picker.

7. **사업자 / 도메인 진행**:
   - Naeun Lab (간이과세) 사업자등록 진행 중
   - soragodong.com (Cloudflare) 등록 + Pages 연결 완료

---

## 2026-04-30 v2 세션 (defer/UI/audit/사업자)

### 코드 박힘
- **defer 한 번만 묻기** (`d9f73ac`) — `_findPendingStrategyFollowup`에 `_followupAsked` 체크 복구. 답 안 하면 양생방에서 직접 결과 체크. defer 시점만 reset.
- **자동초안(user_verified=false) 자연스럽게** (`d9f73ac`) — `_renderConfirmableSection` 단순화. "X개 확인 대기" 강요 흐름 제거 → 일반 confidence 정렬.
- **마법의 소라고동 magic-mode UI** (`d9f73ac`) — body.magic-mode 토글 + 🧙‍♂️ chip + 보라 그라디언트 (`screen-decisions`/`screen-decision-detail`)
- **API 키 stale 메시지 4곳 fix** (`5c1a7df`) — Phase C 마이그 후 잔존. 401/auth 에러 시 state.apiKey/session 분기로 정확한 안내.
- **인터셉터 401 자동 refresh + retry** (`5c1a7df`) — JWT 1h 만료 후 무한 401 fix. `_refreshSessionForApi()` 헬퍼 + inflight guard.
- **admin 피드백 'table 없음' 친화적 셋업 카드** (`a0f195d`) — `0003_feedback.sql` 미실행 시 raw 500 → 4단계 가이드 + 복사 가능 SQL textarea.
- **추적 그래프 예쁘게** (`7885180`, glyph stretch fix `fce29c3`) — area gradient + 마지막 점 ring pulsing + 현재값 floating tag + grid 3줄 + 시작/끝 날짜 축 + 목표 도달 success 색조. preserveAspectRatio + aspect-ratio CSS.
- **state.apiKey 헤더 dead pattern 17곳 cleanup** (`6ee9ca1`) — Phase C 후 interceptor가 swap하니 dead. `_anthropicHeaders()` 헬퍼 통합. -30줄.
- **Hybrid Opus 토글 + 차감 토스트** (`8a5922d`) — chat input bar에 🐚/🦉 토글. useOpus 시 generateAIResponse가 Opus 4.7 사용. 누를 때 토스트로 "5x 빠르게 차감" 안내.

### audit 발견 (이전 세션 검증)
- a35d8cd 4건 (renderArchiveReviews / runMonthly / runQuarterly / adminFeedbackLoad) 다 박혀있음 ✓

### Phase C 추가 fix (이전 batch `53f187d`)
- 토스 충전 직전 환불정책 + 약관 재확인 체크박스 (전상법 §13)
- 충전 시점 consentLog 박힘
- verify-toss-receipt + manual-charge: user_memo_code 형식 검증
- sw.js CACHE_NAME v1 → v2
- admin endpoints ADMIN_USER_ID env 분리
- usage.ts KST 월 경계
- privacy.md Vercel → Cloudflare
- 첫 진단 quiz AI 비용 안내 toast
- 첫 진단 step wizard (5문항 분리, emoji + progress dot)
- 환영 선물 모달 ($1 + 법적 고지)
- Settings 위기 안내 카드 (1393 / 1577-0199 / 119)
- 토스 영수증 OCR 추출 정보 명시

### 사업자 / 행정
- ✅ **사업자등록 완료** (2026-04-30) — Naeun Lab, **일반과세** (간이 X — 소프트웨어 개발업 배제 업종), 사업자번호 **261-21-02592**, 사업용 이메일 **soragodongapp@gmail.com**
- ✅ **통신판매업 신고 완료** — 네이버 스마트스토어 가입 → 무료 구매안전서비스 확인증 우회 (5분, 무료)
- 🟡 **토스뱅크 사업자 통장** 진행 중 (KB는 단기 다중 계좌 제한 → 채권양도 전용계좌만 가능 → 토스뱅크 비대면으로 변경)
- ⏸️ **PG 결정 대기** — 토스페이먼츠 가입비 33만원 (가입 22만 + 연관리 11만) 또는 다른 PG 또는 보류 (현 단계 결제 없음)

### 네이버 우회의 본질 (사용자 알기)
- 네이버 스마트스토어 확인증 = 행정 절차 통과 OK
- 진짜 자체 사이트 거래 보호 ≠ 동일 (네이버 채널 외)
- 베타 단계 (결제 X 또는 토스 수동) = OK
- 자체 사이트 카드 결제 시작 시 → PG 추가 필요 (전상법 §13 진짜 보호)
- 적발 risk: 1년차 1인 사업자 = 매우 낮음

8. **데이터 손실 race 전수조사 fix**:
   - 18개 location.reload 호출 audit
   - checkServerVersionAndReload / _chooseUpdateOption / E2EE 복원 race fix

9. **wording 정리 多**:
   - "AI 라이프 전략가" → 태그라인 "인생의 답 같이 찾자 ✦"
   - "평문" → "본인의 데이터" (8군데)
   - "학습에 사용 X" → "학습에 전혀 사용되지 않습니다"
   - "가설을 박을게" → "가설을 세워볼게"
   - "초안 — 아직 확신 안 가는 가설" 원래 wording 유지 (rename 시도 → revert)
   - "24시간 이상 갭이면 자동 마무리 — 안전망" → "마지막 대화 이후 24시간이 지나도 알아서 마무리 돼"
   - 등 多

---

## 다음 세션 우선순위

### 🔴 사용자가 직접 박을 거 (USER_TODO.md 참고)

가장 중요:
- [ ] Cloudflare env: `ADMIN_USER_ID` / `SUPABASE_*` / `ANTHROPIC_API_KEY` 박기 (안 박혀있으면)
- [ ] Supabase migration 0002, 0003 실행
- [ ] 토스뱅크 사업자 통장 받기 (비대면 1-2일) → 정산 계좌로 사용
- [ ] PG 결정 (토스페이먼츠 33만원 가입 vs 보류 vs 다른 PG)
- [ ] **사업장 주소** 알려주기 (footer/legal placeholder 박는 데 필요)
- [ ] **통신판매업 신고번호** 받았으면 알려주기 (정부24에서 발급된 번호 형식: `제 OOOO-시도-OOOOO호`)
- [ ] KIPRIS 상표 검색 + 결합 상표 출원
- [ ] 1357 무료 변호사 자문 (cross-border / 약관 / 정신건강 데이터)

### 다음 세션 박을 만한 거 (사용자 정보 받으면)

- [ ] 사업자 정보 footer + legal placeholder 박기 (값 박힘 후 5분):
  - 회사명: Naeun Lab
  - 대표: 김나은
  - 사업자번호: 261-21-02592
  - 통신판매신고번호: (대기)
  - 주소: (대기)
  - CPO 이메일: soragodongapp@gmail.com
- [ ] 결제 모달 (PG 결정 후 통합)
- [ ] 약관 동의 모달 (결제 시점)
- [ ] Performance audit (1.6MB 단일 HTML — Phase A 진행)
- [ ] 24시간 갭 자동 마무리 vs ✓ 마무리 일관성 점검

### 🔴 다음 세션 대기 항목 (사용자 요청 2026-04-30 — UI 작업)

- [ ] **모델 토글 위치 통일**: sonnet/opus 전환 버튼이 입력창에 박혀있는 거 → 헤더 오른쪽 (동기화 버튼 왼쪽) 으로 이동. 대화탭 / 돌연변이 임시대화창 헤더 / 마법고동 / 숙고의 방 4곳 다 통일.
- [ ] **마법의 방 UI 변경**: 숙고의 방과 동일한 대화 UI 로 (사용자 요청 2026-04-30 — "제약된 대화" 가치 유지 X, 숙고의 방과 똑같이). 단 색만 차별화.
- [ ] **두 방 색 차별화**: 숙고의 방 = 파랑 또는 청록, 마법의 방 = 다른 톤. UI 구조는 동일하되 색만 달라서 구분.
- [ ] **첫 진단 JSON parse error 박힘**: 신규 사용자 quiz 시 "첫 진단 받기" 클릭하면 `실패: JSON Parse error: Expected ']' - 나중에 다시` 뜸. AI 응답 JSON 파싱 robust 박아야 (불완전 JSON 시 재시도 또는 partial parse).
- [ ] **첫 진단 quiz 자체 재검토**: 사용자 본인 만족 X — "불필요하게 사용자한테 막 요구하는 느낌". skip 더 부드럽게 / 또는 quiz 자체 폐기 / 또는 자연 대화로 흡수 검토.
- [ ] **첫 진단 → 튜토리얼 대화탭 통합 (사용자 요청 2026-04-30)**: 5문항 quiz form 폐기. 대신 코어 튜토리얼 대화탭에서 자연스러운 대화로 정보 수집 → AI 가설 추출 → '나 탭' (traits/values/patterns) 에 자동 표시. 폼 X, 대화 흐름 안에서 흡수.
- [ ] **시드데이터 + 리뷰 변경사항 반영 X 진단 (사용자 보고 2026-04-30)**: 시드데이터 넣은 후 리뷰 돌리면 최근 변경/추가가 결과에 반영 안 됨. cache / 옛 transcript / 시드 ID prefix 무시 흐름 / 리뷰 input window 등 의심. 재현 후 진단. → 1차 fix 적용 (chapters/topicCards/pearls/archive/insights inject + monthly cutoffEnd + chat user-only -40). verify 필요.
- [x] **gh-pages 에러 (사용자 보고 2026-04-30)**: ✅ fix — `.github/workflows/deploy-pages.yml` 삭제. Cloudflare Pages 마이그레이션 후 GitHub Pages 불필요 (V3 시대 옛 workflow). main / v4-dev push 마다 trigger 됐던 거.
- [ ] **useOpus 적용 범위 검토 (사용자 질문 2026-04-30)**: 헤더 모델 토글 = `state.preferences.useOpus`. 현재 `sendChat` (line 19982) 만 영향. 다른 호출 (마법 helpChat / 숙고 reflection / 돌연변이 / forceAnalyze / generateReview / firstTouch / 등) 은 *고정 모델*. 사용자 의도 = 토글 박으면 *모든 대화* opus 인지 / *메인 chat 만* opus 인지 결정 후 적용 범위 통일.
- [ ] **admin 특혜 제거 (사용자 명시 2026-04-30)**: "관리자 계정이라고 결제 / 사용량 다르게 하지 말아줘". `_isAdmin()` 의 client UI 가드 (admin 잔액·충전 숨김) 제거 + `/api/chat` 의 admin 무료 사용 path 제거 + `_checkDailyChatCap` admin 우회 제거. admin 도 일반 사용자처럼 결제 / 사용량 흐름 사용. (admin 답변 권한 같은 *기능* 권한은 보존 — 결제 흐름만 일반화)
- [x] **마법의 방 UI 작업 — 1차 (사용자 명시 2026-04-30)**: ✅ 진행. (1) 임시대화창 접근성 높이기 (askAIForStep 진입 버튼 4곳 보라 톤 + prominent). (2) 대화창 UI 깔끔 (.reflection-msg 말풍선 디자인 + magic-mode 보라 / reflection-mode 청록 차별). placeholder 마법 톤. _starter inline style 그대로 (작은 회색).
- [ ] **마법의 방 고유 모티프 (다음 세션)**: 보라 색만으로 부족. 모래시계 / 14일 시각화 / 진행도 ring / 페이지 전환 swipe / 결정 detail 안 별 / 마법서 느낌 typography 등 추가 디자인.

### 사용자 대기 노트 (우선순위 낮음)

세션 끝나기 직전 박힐 수도 있는 사용자 발견 항목들 — 다음 세션 시작 시 먼저 정리:
- '더 깊은 나' 자동 채움 confirm (이미 동작 — 알림만 필요할 수도)
- 코어 튜토리얼 첫 모달 설명 변경 (구체 wording 사용자 결정 필요)
- 풀 튜토리얼 문구 추가 변경 (구체 wording 사용자 결정 필요)
- **튜토리얼 대화 중 첫 진단 받기 401** (인터셉터 자동 refresh 박혀서 fix 가능성. 재현 시 알려주기)
