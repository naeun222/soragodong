# Code Section Map (2026-04-30 ultrathink — agent 병렬 audit 용)

agent 들이 자기 도메인만 read 하도록 자리 명세. line 번호 = approx (commit 마다 shift — grep 으로 재확인 권장).

`index.html` = ~38,884 lines / ~1.7MB 단일 파일.

---

## Frontend (index.html)

### 🔴 A1 — AUTH / SESSION / E2EE
**책임**: Supabase OTP 로그인, JWT refresh, E2EE master key, 다른 사용자 detect.

**자리**:
- HTML login screen: ~8500-9200
- `function handleSendCode` / `handleVerifyCode`
- `_refreshSessionForApi` (~9500)
- `function showE2EERecovery` (~11400)
- `installAnthropicProxyInterceptor` (fetch interceptor, ~9300)

**Backend**: `functions/api/_lib/auth.ts` (verifyAuth)

**위험 자리**:
- JWT 1h 만료 → interceptor 401 retry race
- E2EE master key recovery race (cloud sync 분기 / 비번 변경 부분-갱신)
- localStorage 다른 사용자 data 잔존 (V3.13.x SECURITY)
- inflight guard (`_sessionRefreshInflight`)

**Subagent**: `audit-auth`

---

### 🔴 A2 — STATE / DATA / CLOUD / E2EE encrypt
**책임**: state schema, saveState, loadState, cloud sync, E2EE encrypt/decrypt.

**자리**:
- state schema 정의: ~9500-9760
- `saveState` (9761)
- `_flushLocalSave` (~9700)
- `saveToCloudNow` (13176)
- `fetchCloudData` / cloud restore: ~13000-13400
- E2EE encrypt: ~10000-10500
- `tutorial backup restore`: ~14600 부근

**위험 자리**:
- `location.reload` 직전 saveToCloudNow await (CLAUDE.md "18곳 audit")
- testerMode ON 시 cloud 저장 차단 (격리)
- cloud 우선 / local fallback race
- E2EE 복원 race
- 시드 sweep 중 사용자 V3 데이터 손실 risk (id-prefix `seed_` 만 sweep — signature 금지)

**Subagent**: `audit-state`

---

### 🟡 A3 — CHAT / AI / 4단 분석 / streaming / interceptor
**책임**: sendChat, generateAIResponse, fetch interceptor swap, 스트리밍 부분 update, 4단 분석 (🔍/💡/🌱/✦).

**자리**:
- `installAnthropicProxyInterceptor`: ~9300-9430
- `_anthropicHeaders`: ~9430
- `sendChat` (22267)
- `generateAIResponse`: ~22500-23000
- 4단 분석 prompt: ~22700-23200
- 스트리밍 partial render: ~22800

**Backend**: `functions/api/chat.ts` (Anthropic 프록시)

**위험 자리**:
- 401 자동 refresh + retry (interceptor)
- streaming render race (마지막 bubble innerHTML 매 청크)
- system prompt 일관성 (rule 13개)
- "진단명 절대 먼저 꺼내지 말 것" 가드 (의료법 §27/§56)
- Opus / Sonnet 모델 토글 (`useOpus`)
- prompt caching TTL 1h

**Subagent**: `audit-chat`

---

### 🟡 A4 — TUTORIAL / ONBOARDING / coachmark / phase 9
**책임**: ONBOARDING_STEPS, startCoreTutorial, coachmark 위치, phase progress, 시드 데이터 잠금.

**자리**:
- `ONBOARDING_STEPS = [` (13595)
- `startCoreTutorial` (14840)
- `_scrubSeedsForCore`: ~13478
- `startInteractiveOnboarding`: ~13742
- coachmark 위치 로직: ~13921 (`step.coachmarkPosition === 'corner'`)
- onbFinish: ~14580
- core lock markers: `applyCoreLockMarkers` (~14655)

**위험 자리**:
- testerMode auto ON (튜토리얼 중)
- 시드 mission 강제 보장 (`mis_seed_active_call`)
- 코어 #2 진입 시 mission attemptStatus reset (이전 fix)
- step ID reference (chat_intake_entry / yangsaeng_explain / 등)
- coachmark step.coachmarkTop override

**Subagent**: `audit-tutorial`

---

### 🟡 A5 — INTAKE / REVIEW / annual cards
**책임**: 첫 관찰 (intake) 풀스크린 모달, generateReview (weekly/monthly/quarterly), generateAnnualReview, annual 카드 시퀀스.

**자리**:
- `runIntakeFlow`: ~11800-12300
- `_intakeStep1Html` (12036) ~ `_intakeStep6Html`
- `_intakeAnalyze` / `_intakeGenLongExample` (11630)
- `_renderIntakeStep` (12011)
- `generateReview` (17320)
- `generateQuarterlyReview` (31431)
- `generateAnnualReview` (10680)
- annual 카드 prototype: ~10700-11200

**위험 자리**:
- intake state.intakeWorry 별도 array (testerMode OFF / 시드 sweep / backup restore 영향 X)
- review 시드 verify P1 fix (archive=savedAt / insights=discoveredAt mismatch)
- 의료법 워딩 ("진단" → "관찰" 일괄 치환)
- annual review mock vs 실제 데이터 격리

**Subagent**: `audit-intake-review`

---

### 🟡 A6 — DATA SYSTEMS (7 시스템)
**책임**: 진주 (pearl), 양생방 (strategy), 소라의 부름 (mission), 마법의 소라고동 (decision), 돌연변이 (mutation), 숙고의 방 (reflection), case formulation.

**자리**:
- pearl: ~25000-25600 (진주 카드 / track / category)
- strategy (양생방): ~25060-26000 (진화 트리, generations, attempts)
- mission (소라의 부름): ~17800-18500 (`offerStrategyFollowup`, defer, attemptStatus)
- decision (마법): ~16800-17200 (`saveStateStep` 17023, dayUnlock 0/0/0/3/7/10/12/14/14/14)
- mutation (돌연변이): ~23000-23200 (가지별 분기)
- reflection (숙고의 방): ~17200-17400 (한 주제 깊이)
- case formulation: ~16700 부근 + ~16900 + 17000-17100
- detectDiagnoses (관찰 5종): ~25206 (자기 학습 confidence)
- SHELL_POOLS (28141), pickShellForTask (28150)

**위험 자리**:
- mission status / attemptStatus 일관성 (completed + attemptStatus 없음 = follow-up 대상)
- decision 14일 dayUnlock race
- pearl track (음악) 시드 data + Apple Music URL
- strategy 진화 → embodied 시 DNA 카드 반영
- detectDiagnoses confidence 자기 학습 (7일 내 shown 시 worked → ↓ / didnt → ↑)

**Subagent**: `audit-data-systems`

---

### 🔴 A7 — BILLING (client side)
**책임**: openChargeModal, refreshBillingStatus, verifyTossReceipt (client), welcome bonus 클라 측, payment 흐름.

**자리**:
- `openChargeModal`: ~9540-9650
- `CHARGE_PLANS` 정의: ~9550 (client 측)
- `verifyTossReceipt` client: ~9700-10000
- `showWelcomeBonusModal` (11363)
- `refreshBillingStatus` (36995)
- `adminResetBalance` (~37438)

**Backend**: `functions/api/billing/*` + `_lib/billing.ts`

**위험 자리** ⭐:
- 잔액 += 매 갱신 버그 (이미 fix — atomic helper + idempotency, 0005 migration 활성)
- 환영 모달 받기 button → POST /api/billing/welcome-bonus → 잔액 = $1.43 **SET (리셋, 사용자 명시 2026-04-30 변경: ≈ 2,000원)**
- 받기 idempotent (free_credit_granted=eq.false 필터 PATCH — race-protected)
- `_welcomeBonusShown` flag = client fast-path cache, **진실 source = backend free_credit_granted**
- admin/reset-balance.ts = `reset_free_credit_granted` 옵션 (admin 환영 보너스 재테스트용)
- toss memo_code prompt injection 차단 (`/^[A-Z0-9-]{4,20}$/`)
- 영수증 image_sha256 dup check
- rate limit (1분 5회 / 24시간 15회)
- FREE_INITIAL_CREDIT_USD = **1.43** (4000원 → 2000원 정정 2026-04-30)

**Subagent**: `audit-billing`

---

### 🟢 A8 — RENDERING / UI
**책임**: 모든 화면 렌더 (renderHome, renderModel, renderArchive, renderExecute, renderProjects, etc).

**자리**:
- `function renderXxx` 30+ 자리 흩어짐
- screen-home / screen-chat / screen-execute / screen-model / screen-archive / etc HTML 자리

**위험 자리**:
- render 후 잠금 시각 갱신
- iOS PWA 슬라이드 종료 후 재진입 시 새 버전 체크
- 추적 그래프 SVG (preserveAspectRatio + aspect-ratio CSS)
- Pinterest tile 자리

**Subagent**: `audit-rendering`

---

### 🟢 A9 — UTILS / PWA / version
**책임**: showToast (20723), escapeHtml (38876), formatDate, APP_VERSION (38457), service worker, PWA install.

**자리**:
- `showToast` (20723)
- `escapeHtml` (38876)
- `APP_VERSION` (38457)
- update modal: ~38600
- `public/sw.js` (별도 file)

**Subagent**: `audit-utils-pwa`

---

## Backend (functions/api/)

### 🔴 B1 — Backend AUTH
**자리**: `functions/api/_lib/auth.ts` (verifyAuth, unauthorized, jsonResponse).

**Subagent**: `audit-backend` (전체 backend 통합)

---

### 🔴 B2 — Backend BILLING
**자리**:
- `functions/api/billing/*.ts` (9 file: charge / verify-toss-receipt / overage-pack / refund / subscribe / upgrade-tier / welcome-bonus / manual-charge(deprecated 410) / 등)
- `functions/api/_lib/billing.ts` (`FREE_INITIAL_CREDIT_USD = 1.43`, ensureBillingRow, addCreditAtomic, subtractCreditAtomic, checkBudget, deductCost, TIER_PLANS, OVERAGE_PACKS)
- `functions/api/admin/*.ts` (6 file: confirm-charge / pending-charges / revoke-charge / reset-balance / feedback-list / feedback-reply)

**위험 자리**:
- ensureBillingRow 자동 free credit 부여 X (이미 fix — 잔액 0 INSERT, free_credit_granted=false)
- 모든 충전·환불 endpoint atomic + idempotency (0005 migration 활성)
- welcome-bonus = 잔액 SET ($1.43, 추가 X) + free_credit_granted=eq.false 필터 PATCH (race-safe)
- admin/reset-balance.ts = `reset_free_credit_granted` 옵션 (admin 환영 보너스 재테스트용)
- imp_uid / image_sha256 / memo_code idempotency keys

**Subagent**: `audit-backend`

---

### 🟡 B3 — Backend CHAT
**자리**: `functions/api/chat.ts`, `functions/api/_lib/usage.ts` (calculateCost, recordUsage)

**Subagent**: `audit-backend`

---

### 🟡 B4 — Backend admin / feedback / account
**자리**: `functions/api/admin/*.ts`, `functions/api/feedback.ts`, `functions/api/account/delete.ts`

**Subagent**: `audit-backend`

---

## Database (supabase/migrations/)

### 🔴 D1 — Database
**자리**: `supabase/migrations/0001_rls.sql` ~ `0005_atomic_billing.sql`

**위험 자리**:
- RLS policies (사용자 본인 row 만 SELECT)
- RPCs: deduct_credit_atomic (0002), add_credit_atomic_idempotent (0005), subtract_credit_atomic (0005)
- 트리거: updated_at, etc

**Subagent**: `audit-database`

---

## 사용 가이드 (병렬 audit)

병렬 = main agent 가 한 message 에 `Agent` tool 여러 번 호출. 11 agent 동시 실행 가능.

예:
```
사용자: "billing + state + auth 전수조사 병렬"
main: Agent(audit-billing) + Agent(audit-state) + Agent(audit-auth) 병렬 spawn → 3 보고서 → 종합
```

agent 보고 = 변경 X (read-only audit). 위험 자리 list + 권장 fix. main agent 가 결정 후 fix.

## 도메인별 위험 (re-cap)

| 도메인 | 위험 | 권장 audit 우선순위 |
|---|---|---|
| BILLING (A7+B2) | 🔴 돈 / race / idempotency | ⭐⭐⭐ 즉시 |
| AUTH (A1+B1) | 🔴 보안 / E2EE | ⭐⭐⭐ 즉시 |
| STATE (A2) | 🔴 데이터 손실 | ⭐⭐⭐ 즉시 |
| CHAT (A3+B3) | 🟡 비용 / 의료법 | ⭐⭐ |
| TUTORIAL (A4) | 🟡 신규 사용자 | ⭐⭐ |
| INTAKE/REVIEW (A5) | 🟡 | ⭐⭐ |
| DATA SYSTEMS (A6) | 🟡 | ⭐ |
| ADMIN (B4) | 🟡 | ⭐ |
| RENDERING (A8) | 🟢 | (나중) |
| UTILS/PWA (A9) | 🟢 | (나중) |
| DATABASE (D1) | 🔴 schema | ⭐⭐ |
