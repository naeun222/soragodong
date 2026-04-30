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
- AI 호출 가능 헬퍼: `_canAI()` = `state.apiKey || session.access_token` (30+ 곳 게이트 통일).
- `_anthropicHeaders()` 헬퍼 — interceptor swap 후 dead pattern 17곳 cleanup 완료.
- 인터셉터 401 자동 refresh + retry (`_refreshSessionForApi()` + inflight guard).
- billing: 충전 잔액 (USD) + 월 정액. 무료 토큰 $1.0 자동.
- 결제: 토스 수동 송금 + Sonnet vision 자동 인증 (`verify-toss-receipt`). PG (포트원) 통합 대기.

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

### 첫 진단 (현재 = 코어 #1 종료 snapshot, **재설계 회의 중**)
- 옛 5문항 quiz 폐기 (bd44e48) — 사용자 본인 만족 X (강요감).
- 현재: 코어 #1 종료 시점 snapshot 데이터로 AI 가설 1회 생성 → traits/values/patterns `user_verified=false` 자동 합류.
- **재설계 진행 중** (회의 1) — testerMode + 시드 X 흐름. 사용자 본인 데이터로 시작. step11 부터 chip 3 라운드 (날씨 + 영역 + 한 단어) + AI 자연 답 + "더 알고 싶어" 옵션. `state.intakeWorry` 별도 array 보관 (testerMode OFF / backup restore 영향 X). 결과 = traits/values/patterns `user_verified=false` 자동 합류 ('나 탭' 통합 분석에 자연 노출, 별도 모달 X).
- 사용자당 ~$0.01-0.02 (Sonnet 1회).

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

### Hybrid Opus 토글 (8a5922d)
- 헤더 🐚/🦉 토글 = `state.preferences.useOpus`. 4곳 헤더 통합 (메인 / 숙고 / 마법 / 돌연변이).
- 영향 범위 = `sendChat` (메인 대화) + 마법 helpChat + 숙고 reflection (ea779a1).
- **나머지 (forceAnalyze / generateReview / firstTouch / 돌연변이) 는 고정 Sonnet** — 분석/리뷰는 데이터 요약 task로 Sonnet 충분. 토글 의도 = "지금 대화 깊게" 의 dial.
- 누를 때 토스트 안내: "🦉 Opus — 5x 빠르게 차감".

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
- Apple $99/년 + Google Play $25 1회 = 앱 스토어 시만 (PWA 만 가면 X)
- ISMS / 보안 audit: 의무 X (1년차)

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

### 🟢 코드 (즉시 가능)
- [ ] **첫 진단 재설계 구현** — 회의 1 흐름 (chip 3 라운드 + state.intakeWorry + testerMode 안전 격리). 사용자 답 받은 후.
- [ ] **소라고동 일상 대화 티키타카** (사용자 큐 2026-04-30) — 적절한 후속 질문으로 대화 이어가기. 현재 답변이 한 번에 끝나는 경향. 조사 필요: `sendChat` system prompt + 4단 분석 후 자연 follow-up 질문 패턴.
- [ ] **코어 #1 튜토리얼 — Opus 체험 step** (사용자 큐 2026-04-30) — 대화 시작 전에 헤더 🐚/🦉 토글 설명 + "지금은 무료 토큰 내가 줬으니까 opus로 해보자! ㄱㄱ" 안내. 튜토리얼 끝나면 자동 sonnet 복원 (`state.preferences.useOpus = false`). onbFinish / 시드 정리 흐름에 복원 로직 합치기.
- [ ] **튜토리얼 "누르고 잠깐 기다려야 돼! ~ 눌러줘" 멘트 삭제** (사용자 큐 2026-04-30) — 일부 튜토리얼 step 안 안내 멘트 정리. 사용자가 누른 후 자동 advance 로 충분.
- [ ] **24시간 갭 vs ✓ 마무리 일관성** 점검
- [ ] **Performance audit** (1.6MB 단일 — Phase A 진행)

### 🟡 사용자 결정 대기
- [ ] **useOpus scope** — 분석/리뷰류도 토글 따를지 / 현재대로 대화류만 둘지 (의견: 현재 OK)
- [ ] **첫 진단 회의 1 잔여** — 날씨 메타포 OK? 라운드 3 chip 단어 / "더 알고 싶어" 후 AI 깊이
- [ ] **시드 verify** — 5cdcb79 fix 후 시드 넣고 리뷰 돌려서 변경 반영 확인 (브라우저)

### 🔴 사용자 정보·외부 대기
- [ ] **사업장 주소** (자택 또는 비상주 오피스) — `BUSINESS_INFO.address` 채울 자리
- [ ] **통신판매신고번호** (정부24 발급 형식 `제 OOOO-시도-OOOOO호`) — `BUSINESS_INFO.ecommerce_no`
- [ ] **결제 모달 + 약관 동의 모달** — PG 결정 후

### 사용자 직접 (USER_TODO.md 참고)
- Cloudflare env (`ADMIN_USER_ID` / `SUPABASE_*` / `ANTHROPIC_API_KEY`)
- Supabase migration 0002, 0003 실행
- 토스뱅크 사업자 통장 / PG 결정
- KIPRIS 상표 검색 + 결합 상표 출원
- 1357 무료 변호사 자문 (cross-border / 약관 / 정신건강 데이터)

### 대기 노트 (낮음)
- '더 깊은 나' 자동 채움 알림 (이미 동작 — 알림 추가만)
- 코어 튜토리얼 첫 모달 / 풀 튜토리얼 wording (사용자 결정)
- 튜토리얼 중 첫 진단 401 (인터셉터 자동 refresh 후 재현 시 알리기)
- 첫 진단 JSON parse error (quiz 폐기 후 stale 가능 — 새 흐름에서 재현 시만)
