# 사용자(김나은) 직접 작업 리스트

Claude Code가 못 하는 거. 너가 침대에서 / 외출 없이 다 가능. 우선순위 순.

진행 상황: ✅ 완료 / ⏸️ 대기 / 🔴 다음 액션

---

## 🔴 P0 — 지금 / 바로 (Stage 1 완료 위해 필요)

### 1. ✅ Supabase RLS 정책 적용 (2026-04-29 완료)
- `supabase/migrations/0001_rls.sql` Supabase SQL Editor에서 실행함.
- 본인 row만 read/write. 다른 사용자 row 접근 차단.
- 단 service_role key 가진 사람(=dev)은 우회 가능 — Stage 2 (E2EE) 에서 그것도 차단 예정.

### 2. ⏸️ Anthropic API 키 (백엔드용) 따로 받기 (5분) — 미룸
**시점**: Phase C 본격 활성 직전 (수익화 시작 무렵)
1. https://console.anthropic.com → API Keys → New Key
2. 이름: `soragodong-backend`
3. 키 복사 → 안전한 곳 (1Password / Bitwarden / Apple Notes 잠금)
4. **이 키는 Vercel 환경변수에만 박힘. 절대 클라이언트 코드 X.**

---

---

## 📌 다음 진행 트리거 (인계)

**현 상태 (2026-04-29):**
- Stage 1 RLS 박힘. 사용자 row 본인만 접근.
- 풀 튜토리얼·코어 잠금 시스템·E2EE 인계 다 박힘 (CLAUDE.md / src/README.md / api_draft/README.md 참고).
- 사용자 본인(김나은)이 1–2주 베타 사용 후 다음 단계.

**다음 세션 들어가기 전 본인 검증:**
- [ ] 앱 정상 동작 확인 (RLS 박힌 후 로그인 / 데이터 read/write OK?)
- [ ] 매일 체크인·대화 자연스럽게 됨?
- [ ] 4시간 → 24시간 갭 변경 후 이어서 대화 자연스러움?
- [ ] 잠금 시스템 / 튜토리얼 첫 진입 흐름 본인 데이터로 자연스러움?
- [ ] 양생방 전략이 실제로 행동 바꾸는 거 같음?
- [ ] 모래사장 / 마법의 소라고동 / 숙고 질문 — 진짜 쓰게 됨?

문제 발견 시 → 다음 세션에서 fix.

**다음 세션 진입 시 우선순위 (Claude 역할):**
1. 베타 사용 중 발견된 버그 fix
2. Phase A 다음 모듈 추출 (`src/utils/format.ts`, `src/utils/dedupe.ts` 등)
3. (사용자 결정 시) 베타 사용자 1–2명 모집 시작 — 그러면 P1 ↓ 활성

---

## 🚀 Phase C 활성 (2026-04-30 시작 — 앱 결제 모델)

사용자 결정: 백엔드 프록시 + 앱이 결제 받음 (사용자 본인 키 X). 무료 충전 토큰 + 월 정액 + 충전식 + 포트원 자동 환불.

### 사용자 필수 — 클로드 못 함

#### 베타 시작 직전 (1주일 안)
- [ ] **사업자등록** (10-15분, hometax.go.kr, 침대)
  - 개인사업자 / 간이과세자 / 업종 722000 (소프트웨어)
  - 본인 명의 통장
- [ ] **도메인 등록** (1.5-3만 원/년, 가비아/카페24/Cloudflare)
- [ ] **Anthropic 회사용 API 키** (5분, console.anthropic.com)
  - 이름 `soragodong-backend`
  - **사용량 cap 박기 (월 $200, 보안)**
- [ ] **Vercel 프로젝트 셋업** (10분, vercel.com → Import)
  - 환경변수: `ANTHROPIC_API_KEY` / `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **Supabase migration SQL 실행** (5분, 클로드가 작성)
  - `supabase/migrations/0002_billing_usage.sql` Dashboard SQL Editor 실행
- [ ] **1357 무료 법률 상담** (30분 전화)
  - ADHD wording 의료법 회피 / 다크 패턴 / 14일 환불 검수

#### 결제 받기 시작 직전 (베타 → 정식)
- [ ] **통신판매업 신고** (10분, gov.kr, 1-3일 처리)
- [ ] **포트원 가입** (10분, portone.io, 심사 1-3일)
  - Vercel 환경변수 추가: `PORTONE_API_KEY` / `PORTONE_API_SECRET` / `PORTONE_CHANNEL_KEY`

### 클로드 다음 세션 박을 거 (현재 50% 진행)

#### 박힌 거 (2026-04-30)
- ✓ legal_draft 4개 정교화 (terms / privacy / refund / cross-border + README)
- ✓ 회원 탈퇴 클라이언트 함수 + Settings 버튼 (약관 8조 의무)
- ✓ api/_lib/auth.ts (Supabase JWT 검증)
- ✓ api/_lib/usage.ts (사용량 logging + 가격 계산 PRICING)
- ✓ api/_lib/billing.ts (잔여 토큰 체크 + 차감, FREE_INITIAL_CREDIT_USD = $1)

#### 박힌 거 (2026-04-30 후속)
- ✓ api/chat.ts (Anthropic 프록시 — non-stream + streaming + budget check + usage log + 차감)
- ✓ api/usage.ts (사용자 본인 사용량 + billing 정보 조회)
- ✓ api/account/delete.ts (회원 탈퇴 RPC + auth.users 삭제)
- ✓ api/billing/charge.ts / subscribe.ts / refund.ts (포트원 통합)
- ✓ supabase/migrations/0002_billing_usage.sql (3 테이블 + RLS + RPC)
- ✓ 클라이언트 fetch interceptor — 28개 LLM call 자동 swap (코드 변경 X)
- ✓ Settings billing UI section (display:none, Phase C 활성 시 표시)
- ✓ Q2 자동 추출 (extractChapterCaseAnalysis에 deep_profile_update 통합)
- ✓ cross-border.md v2.0 — 전문적 + 사실 기반 강한 신뢰 톤

#### 다음 세션 박을 거
- [ ] 결제 모달 (포트원 SDK 통합 — 충전 / 월 정액)
- [ ] 약관 동의 모달 (결제 시점)
- [ ] 국외이전 동의 모달 (첫 AI 호출 직전 — cross-border.md v2 활용)
- [ ] `refreshBillingStatus` / `openChargeModal` / `openSubscribeModal` 함수 박기 (Settings billing UI section 동적 로드)
- [ ] 무료 충전 토큰 첫 진입 시 자동 부여 (api/usage 첫 호출 시 ensureBillingRow 처리됨, 단 UI에 토스트로 안내)
- [ ] '나 탭' values / patterns UX 개선 (사용자 요청 대기):
  - 미컨펌 항목 1개만 메인 표시 (confidence 높은 거 우선)
  - '맞아' / '아니야' 토글 시 다음 미컨펌 항목으로 자동 이동
  - 모두 컨펌 후 → 원래 흐름 (top 1만 + 나머지 전체 보기 collapse)
  - 박을 곳: renderModel (values/patterns 분기) + renderModelItem
- [ ] 1357 자문 결과 반영해 legal_draft 미세 조정 (사용자가 상담 후 알려줌)

### Phase C 활성 시점 (가격 정책 결정 필요)
- [ ] 월 정액 가격 (예: 월 30,000원, 월 토큰 한도 X)
- [ ] 충전 단가 (예: 1,000원 = $0.7 어치 토큰)
- [ ] 무료 초기 토큰 한도 ($1 = sonnet 333K input or 67K output)

---

## 🟡 P1 — 베타 시작 직전 (며칠 안에)

### 3. Vercel 프로젝트 셋업 (10분, 침대 가능)
1. https://vercel.com 로그인 (GitHub로 로그인)
2. **Add New Project** → `soragodong-repo` 선택 → Import
3. Framework: Vite 자동 감지
4. **Environment Variables**:
   - `ANTHROPIC_API_KEY` = (위 #2에서 받은 키)
   - `SUPABASE_URL` = (이미 코드에 있는 거)
   - `SUPABASE_SERVICE_ROLE_KEY` = (Supabase 콘솔 → Settings → API에서 service_role)
5. Deploy

### 4. 사업자등록 (10–15분, 침대)
1. https://hometax.go.kr 로그인 (간편인증 가능)
2. **신청/제출 → 사업자등록 신청** → 개인사업자
3. 업종코드: `722000` (소프트웨어 자문·개발 및 공급업) 또는 `639900` (그 외 정보서비스업)
4. 상호명: 자유 (예: "소라고동")
5. **간이과세자** 선택 (매출 4800만 미만 예상)
6. 본인 명의 통장 사본 업로드
7. 즉시 발급 (사업자등록증 PDF 다운로드)

### 5. 통신판매업 신고 (10분, 침대)
1. https://www.gov.kr 로그인
2. 검색: "통신판매업 신고"
3. 사업자등록증 + 도메인(있을 시) + 결제수단 정보 입력
4. 처리: 1–3일

### 6. 변호사 무료 자문 (선택, 30분 전화)
- 1357 (중소기업통합콜센터): 무료, 변호사 연결
- 또는 구청 무료법률상담
- 질문 거리:
  - "ADHD 자기관찰 앱에서 정신건강 데이터 = 민감정보 처리 의무 어디까지?"
  - "3일 무료 → 사용량 과금 = 다크 패턴 / 자동결제 규제 회피 wording"
  - "Anthropic API (US 서버) = 국외이전 동의 필수 문구"
  - "ADHD 라이프 전략가 wording = 의료법 회피 가능?"
- 약관·정책 검토는 별도 30–50만 원 (선택)

---

## 🟢 P2 — 수익 본격화 시점

### 7. PG사 가입 (포트원 권장, 침대)
1. https://portone.io 가입
2. 사업자등록증 + 통장사본 + 신분증 업로드
3. 심사 1–3일
4. 가맹점 ID + 키 받음 → Vercel 환경변수에 박음

### 8. 약관·정책 게시
- 이용약관, 개인정보처리방침, 환불정책
- 변호사 자문 후 (P1 #6) 또는 표준약관 기반 직접
- Claude Code 같이 작성 가능 — 요청 시

### 9. (선택) Apple Developer + Google Play (앱 출시 시)
- Apple Developer: $99/년
- Google Play Console: $25 일회성
- PWA만 가는 한 skip 가능

---

## 🔵 P3 — 운영 인프라 (선택)

### 10. Sentry 가입 (무료, 5분)
- https://sentry.io free tier
- 프로젝트 만들기 → DSN 받기 → Vercel 환경변수에 박음

### 11. 도메인 (선택)
- soragodong.com 등 (1.5–3만 원/년)
- 카페24 / 가비아 / Cloudflare Registrar
- Vercel에 연결 (5분)

### 12. (대학생 특수) 부모 부양가족 / 국가장학금
- 매출 100만/년 넘으면 부모 부양가족 공제 X (부모님께 미리 말씀드리기)
- 한국장학재단에서 소득 변화 보고 의무 확인
- 건강보험 피부양자 유지 가능 여부 (연 소득 2000만 미만)

---

## 📞 무료 상담 채널 (다 침대에서 전화 가능)

| 기관 | 번호 / URL | 다루는 거 |
|---|---|---|
| 중소기업통합콜센터 | 1357 | 사업·세무·법무 종합 |
| 자영업119 | 1577-9119 | 자영업 시작 |
| 1인창조기업 비즈센터 | 02-368-8731 | 1인 사업자 |
| 서울청년창업센터 | 02-2152-3115 | 청년 창업 |
| 대한법률구조공단 | 132 | 법률 무료 상담 |

대학생 대상 무료 창업 멘토링 프로그램도 많음 (학교 창업지원단 / K-Startup).

---

## 메모

- 매출 10만 원 넘기 전엔 사업자등록 안 해도 됨 (소액 비과세). 다만 통신판매로 결제 받으려면 등록 필수.
- 이 모든 거 외출 없이 침대에서 가능.
- 본인 명의 통장 + 본인 명의 카드만 있으면 됨.
