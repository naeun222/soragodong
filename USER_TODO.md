# 사용자(김나은) 직접 작업 리스트

Claude Code가 못 하는 거. 너가 침대에서 / 외출 없이 다 가능. 우선순위 순.

상태: ✅ 완료 / ⏸️ 대기 / 🔴 다음 액션 / 🟡 진행 중

회사명: **나은 랩(Lab)**
사업자등록번호: **261-21-02592** ✅ (일반과세, 2026-04-30 발급)
사업용 이메일: **soragodongapp@gmail.com**
도메인: **soragodong.com** ✅ 등록 + Cloudflare Pages 연결 완료
Admin 이메일: **jade6679@naver.com** (앱 로그인용)
Admin Supabase auth uid: **`4ba0a92e-7f79-45ec-8c48-b339d259382e`**

---

## 🔴 P0 — 지금 바로 (Phase C / 결제 시스템 활성)

### 1. Cloudflare Pages env 변수 (10분)

**위치**: Cloudflare 대시보드 → Workers & Pages → soragodong → Settings → Environment variables.
**Production + Preview 둘 다**:

| Name | Value | 출처 / 용도 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (본인 Anthropic 키) | console.anthropic.com → API Keys → New Key. 이름 `soragodong-backend`. **사용량 cap 적용하기 (월 $200)** |
| `SUPABASE_URL` | `https://pfagqvfteqzfhkbxtnwp.supabase.co` | Supabase Settings → API |
| `SUPABASE_ANON_KEY` | (anon public 키) | Supabase Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | (service_role 키 — 비공개!) | Supabase Settings → API → service_role |
| `ADMIN_USER_ID` | `4ba0a92e-7f79-45ec-8c48-b339d259382e` | (위에 명시) |
| `PORTONE_API_KEY` | (포트원 가입 후) | PG 결정 후 |
| `PORTONE_API_SECRET` | (포트원 가입 후) | 동일 |
| `PORTONE_CHANNEL_KEY` | (포트원 가입 후) | 동일 |
| 🟡 `BILLING_RECURRING_ENABLED` | `false` (또는 삭제) | 정기결제 5 endpoint 가드. **2026-05-13 (재정정): 일반결제 (KG이니시스 일회성) 복귀** — Cloudflare env 에서 `false` 로 변경 또는 항목 삭제. backend 자동 가계약 모드 동작. frontend `01-config.js:BILLING_RECURRING_ENABLED = false` 도 같이 적용됨. 정기 PG 빌링 채널 실 발급 후 재 `true`. |

적용한 후 → **Deployments → Retry deployment** (재배포 후 적용).

**들어가야 동작 (지금 작동 X)**:
- `/api/chat` (모든 AI 호출) — 비-admin 사용자도 미작동
- `/api/admin/*` (피드백 답변 / 토스 송금 처리)
- `/api/billing/subscribe` / `overage-pack` / `upgrade-tier` (포트원 키 적용된 후)

### 1-bis. 🔴 Cloudflare Workers AI binding (RAG embedding) 활성

**상태**: `wrangler.jsonc` 의 `[ai] binding=AI` 추가 완료 (사용자 명시 2026-05-13). **Cloudflare Pages 재배포 후 적용**.

**위치**: Cloudflare 대시보드 → Workers & Pages → soragodong → Deployments → 최신 production retry (또는 다음 push 자동 trigger).

**역할**: `functions/api/embeddings/bge.ts` 가 `env.AI.run('@cf/baai/bge-m3')` 호출 — RAG retrieval 의 핵심.

**검증**: 재배포 후 Plus/Premium 사용자가 대화탭 RAG 토글 ON → 첫 메시지 보냈을 때 콘솔에 `[rag]` 경고 없으면 OK. 만약 `AI_BINDING_MISSING` 에러 보이면 binding 미적용.

**비용**: 100K req/일 무료. 사용자 ~3000명 까지 free tier 안. 그 이후 P2 재검토 (USER_TODO P2-10-3).

### 2. Supabase Migration 실행 (5분)

**위치**: Supabase 대시보드 → SQL Editor → New query → 복붙 → Run

| 파일 | 무엇 | 들어가야 동작 |
|---|---|---|
| ✅ `supabase/migrations/0001_rls.sql` | RLS Stage 1 | 데이터 격리 |
| ⏸️ `supabase/migrations/0002_billing_usage.sql` | billing / usage / payments 3 테이블 + RLS + RPC | 결제 / 사용량 추적 |
| ⏸️ `supabase/migrations/0003_feedback.sql` | soragodong_feedback 테이블 + RLS | 인앱 피드백 |
| ✅ `supabase/migrations/0004_subscription_tiers.sql` | 2-tier 월정액 (light/premium) + monthly_quota_usd 컬럼 + deduct_credit_atomic 갱신 | tier 별 cap 적용 + cap 도달 시 credit fall-through |
| ⏸️ `supabase/migrations/0005_indexes.sql` | data / billing / usage / feedback 인덱스 (100명 대비 query 속도) | 100명 / 1000+ row 시 query 100ms → 5ms 자리. 멱등 IF NOT EXISTS. |
| ⏸️ `supabase/migrations/0006_legacy_bonus_may2026.sql` | legacy bonus 1,000원 컬럼 + grant RPC | 기존 사용자 += 1,000원 1회 (없으면 RPC 호출 시 함수 미존재 에러) |
| ⏸️ `supabase/migrations/0007_legacy_bonus_signup_guard.sql` | grant RPC 가드 강화 (auth.users.created_at < 2026-05-01) | 신규 사용자 1,000원 받기 차단 (frontend 가드 우회 방지). 0006 후에 실행. |
| ⏸️ `supabase/migrations/0008_e2ee_escrow.sql` (예정) | E2EE escrow 테이블 (Phase 2 시작 시 작성) | 분실 복구 = 이메일 OTP + 카카오 재인증 + 24h 시간 지연 후 server unwrap |
| ⏸️ `supabase/migrations/0009_daily_cap.sql` (예정) | **v2 일일 cap (Light /25, Premium /20)** — billing 에 `daily_quota_used_today USD` + `daily_quota_reset_at TIMESTAMPTZ` 컬럼 + `consume_daily_atomic` RPC 신규 + `deduct_credit_atomic` 갱신 (일일 cap 우선 차감 → 도달 시 24h reset 모달 trigger) | 일일 cap 동작 보장. 사용자 명시 2026-05-04 ultrathink. |

⚠️ **0002 + 0003 + 0005 + 0006 + 0007 + 0009 + 0013 아직 실행 X** — 0002/0003 안 적용되면 `/api/chat` 자체가 NO_BILLING_ROW 로 차단됨. 0005 는 100명 가까이 가면 적용하기 (지금은 무해). 0006/0007 = legacy bonus 배너 (1,000원) 작동 위해 필요. 0008 = E2EE Phase 2 시작 시 작성·실행. 0009 = v2 일일 cap (Light /25, Premium /20) 동작 — frontend 적용 후 작성·실행.

**🔴 0013 (2026-05-08 ultrathink audit FAIL #2)**: `0013_billing_renewal_notice.sql` — `renewal_notice_7d_at` 컬럼 + 인덱스. **콘텐츠산업진흥법 §25 자동 갱신 7일 전 사전고지 의무 충족** — 얼리버드 구독자 첫 결제 (가입 후 30일) 전에 *반드시* 적용. 미적용 시 첫 자동 결제 = 법 위반.

**🔴 0014 (2026-05-08 ultrathink audit WARN #21 #22)**: `0014_consent_log_payments_anon.sql` — `soragodong_consent_log` 신규 테이블 + RLS + payments 익명화 컬럼 (`anonymized_at` / `anonymized_token`) + `withdraw_user_data` RPC 갱신. **PIPA 분쟁 증거 + §36 즉시 익명화 강화**. 출시 전 적용 권장 (미적용 = audit trail 부재).
※ 2026-05-09 fix: 옛 `withdraw_user_data(uuid)` return type 충돌 해결 — `DROP FUNCTION IF EXISTS` 선행 추가됨.

**🔴 0015 (2026-05-09 ultrathink 사용자 명시 + audit FAIL #8)**: `0015_cash_receipt.sql` — payments 에 `receipt_url` / `cash_receipt_status` / `cash_receipt_type` 컬럼 추가. **부가가치세법 §32-2 자진발급 의무 + 수정 영수증 자동 발급** (한국 사업자 의무).

**🔴 0016 (2026-05-09 사용자 보고)**: `0016_billing_user_email.sql` — `soragodong_billing` 에 `user_email` 컬럼 추가 + auth.users.email 백필. **cron-renewal-notice / cron-charge-recurring 이 의존**. 미적용 시 cron 측 fallback (auth.users lookup) 으로 작동하지만 매 row 마다 추가 fetch라 성능 ↓.

**🔴 0022 (2026-05-13 사용자 명시 ultrathink)**: `0022_scheduled_plan_change.sql` — `soragodong_billing` 에 `scheduled_plan_change TEXT NULL` / `scheduled_plan_change_at TIMESTAMPTZ NULL` 컬럼 추가 + CHECK 제약. **다운그레이드 = 다음 갱신부터 자동 전환** (Phase B). 미적용 시 `/api/billing/schedule-plan-change` endpoint 가 `COLUMN_MISSING` 거부 — 다운그레이드 버튼 동작 X. cron-charge-recurring 이 이 값 보고 자동 plan 전환.

**🔴 0023 (2026-05-13 사용자 명시 ultrathink)**: `0023_cycle_anchor.sql` — `soragodong_billing` 에 `subscription_started_at TIMESTAMPTZ NULL` / `cycle_anchor_day SMALLINT NULL` 컬럼 + CHECK 제약 (1-31). **매월 가입일 anchor cycle** (Netflix/YouTube 표준). 옛 30일 fixed 주기 폐기 — 1년 12회 결제. 옛 row 백필: `cycle_anchor_day = EXTRACT(DAY FROM next_billing_at AT TIME ZONE 'Asia/Seoul')`. 미적용 시 코드는 옛 30일 fallback 으로 동작 (column NULL 이면 calcNext30DayFallback) — 안전. 가입 시 정확한 anchor 저장은 column 적용 후만 가능.

### 2-bis. 신규 cron job 등록 (5분)

**위치**: cron-job.org 또는 GitHub Actions schedule.

| Cron | 빈도 | endpoint | 헤더 |
|---|---|---|---|
| `cron-charge-recurring` | 매시간 | `POST https://soragodong.com/api/billing/cron-charge-recurring` | `X-Cron-Secret: <CRON_SECRET>` |
| **🔴 `cron-renewal-notice` (2026-05-08 신규)** | **매일 (예: 09:00 KST)** | `POST https://soragodong.com/api/billing/cron-renewal-notice` | `X-Cron-Secret: <CRON_SECRET>` |

**🔴 cron-renewal-notice 미등록 시** = 콘텐츠산업진흥법 §25 위반. 얼리버드 첫 자동 결제 = 가입 후 30일 시점이라 그 전에 등록 필수.

또한 **`RESEND_API_KEY`** Cloudflare env 미설정 시 발송 silent skip → 위반 — Resend 가입 후 키 등록 (USER_TODO P2-X 참고).

### 3. ✅ 도메인 등록 완료

- soragodong.com (Cloudflare Registrar) / 갱신 2027-04-30
- www.soragodong.com → Pages Custom domain 연결 완료

---

## 🟡 P1 — 며칠 안 (사업자 / 정책)

### 4. ✅ 사업자등록 완료 (2026-04-30)

- 나은 랩(Lab) / 일반과세자 / **261-21-02592** / 722000 (주) + 525101 (부) / 자택 사업장 / soragodongapp@gmail.com

### 5. 🟡 통신판매업 신고 (처리 중)

- 네이버 스마트스토어 우회로 신청 완료 → 신고증 발급 대기 중
- 발급 후: 신고번호 (`제 OOOO-시도-OOOOO호`) 클로드에게 알려주면 footer / legal 마크다운에 5분 commit
- ⚠️ **베타 단계 OK** — 실제 카드 결제 시작 시 PG 추가 필요 (전상법 §13)

### 6. 🔴 사업자 통장 — 토스뱅크 비대면 (1-2일)

⚠️ **KB는 단기 다중 계좌 제한** → 채권양도 전용계좌만 가능 → **토스뱅크 비대면**.

1. 토스 앱 → 토스뱅크 → 사업자 통장 만들기
2. 사업자등록증 + 신분증 + 셀카 업로드
3. 영업일 1-2일 심사 → 통장 + 체크카드
4. **사용용도**: 수금 / 결제 / 세금
5. 받으면: 네이버 스마트스토어 정산 계좌 변경 + 추후 PG 가입 시 정산 계좌

### 7. ⏸️ PG 결정 — 결제 활성화 위해 필수

⚠️ **이전 "가입비 무료"는 틀림**: 토스페이먼츠 가입비 22만원 + 연관리 11만원 = **33만원/년**.

**옵션**:
- **토스페이먼츠** 33만원 — 토스뱅크와 일관성, 보증보험 면제 (월 정산 1천만 미만)
- **KG이니시스 / KCP** 가입비 ~10-22만원 + 연 ~10만원
- **나이스페이먼츠** 0~10만원 (저렴)
- **PortOne (Gateway)** 무료, 단 연결 PG 별도 가입비
- **보류** — 베타 + 토스 수동 송금만 → 0원

**권장 시점**: 사용자 100명+ 또는 자체 사이트 카드 결제 시작 시. 베타 = 보류 OK.

가입 결정 시:
1. 사업자등록증 + 통신판매업 신고증 + 통장사본 + 신분증
2. 심사 1-3일 → 키 발급
3. Cloudflare env 추가 (`PORTONE_API_KEY` / `PORTONE_API_SECRET` / `PORTONE_CHANNEL_KEY`)
4. 결제 즉시 활성 (코드는 이미 들어가 있음)

### 7-2. ⏸️ KIPRIS 상표 — 보류

- ✓ 검색 완료: `Soragodong` 등록·출원 없음
- 사용자 판단: 고유명사라 출원 보류 (다른 사람이 가져갈 risk 낮음)
- **모니터링**: 사용자 100명+ 도달 또는 카피캣 발견 시 재검토

### 8. ⏸️ 1357 무료 변호사 자문 (선택, 30분 전화)

질문 거리:
- ADHD 자기관찰 앱 = 정신건강 데이터 처리 의무 어디까지?
- AI (Anthropic, US 서버) = 국외이전 동의 문구 적정성
- 약관 / 환불정책 / 개인정보처리방침 1차 검수
- 토스 수동 송금 → 포트원 자동 결제 전환 시 약관 추가사항?

### 9. 🔴 사업자 정보 footer (신고번호 + 주소 알려주면 5분 commit)

전자상거래법 의무. `BUSINESS_INFO` 객체에 한 번에 적용됨.

| 항목 | 값 | 상태 |
|---|---|---|
| 상호 | 나은 랩(Lab) | ✓ |
| 대표자 | 김나은 | ✓ |
| 사업자등록번호 | **261-21-02592** | ✓ |
| 통신판매신고번호 | (대기 — 발급 후) | 🟡 |
| 사업장 주소 | 서울특별시 동작구 상도로47아길 14 | ⚠️ UI 노출 X (자택), legal_draft 마크다운만 |
| 사업용 이메일 | **soragodongapp@gmail.com** | ✓ |
| CPO | 김나은 | ✓ |

**적용될 곳** (한 번에):
- `index.html` `BUSINESS_INFO` 상수 (footer 자동 렌더)
- `legal_draft/privacy.md` §9 CPO
- `legal_draft/refund.md` 연락처
- `legal_draft/terms.md` 회사 정보

### 10. 🔴 legal_draft 갱신 — 충전 → 구독 모델 변경 반영 (2026-04-30 정책 변경)

이번 세션 큰 변경 — 결제 모델이 충전식에서 2-tier 월정액으로 전환:
- ❌ **충전 plan 폐기** (CHARGE_PLANS 5단계 / 토스 송금 / 영수증 인증 흐름 모두 frontend 폐기)
- ✅ **2-tier 월정액**: Light 8,900원 / Premium 25,000원
- ✅ **추가팩**: Light 5K (+$4) / Premium 7K (+$5) — 계속 결제 가능
- ✅ **무료 토큰**: 2,000원 (가입 시 자동)

**갱신 필요 파일**:
- `legal_draft/terms.md` — 결제 방식 / 자동 갱신 X 명시 / 추가팩 정책
- `legal_draft/refund.md` — 구독 잔여일 비례 환불 / 추가팩 청약철회 30일 / 충전 잔액 (legacy 호환) 처리
- `legal_draft/privacy.md` — 결제 정보 처리 (PG / 포트원 키 발급 후 위탁자 명시)

→ 통신판매신고번호 받는 시점에 함께 일괄 commit 추천.

### 10-2. 🔴 카카오 SNS 로그인 활성 (V4 — 코드 deploy 완료, dev console 등록만 남음)

V4 사용자 명시 2026-05-02 — 카카오 SNS 로그인 도입 (네이버는 V5).

**현재 상태**:
- ✅ HTML / CSS / JS 코드 완료 (loginWithProvider / 동의 4 분리 / E2EE master password 보존)
- ✅ Supabase OAuth scope = `account_email` 만 명시 (PIPA 데이터 최소 수집)
- ⏸️ 카카오 dev console 등록 (사용자 직접)
- ⏸️ Supabase Dashboard provider 활성 (사용자 직접)

**카카오 dev console** (https://developers.kakao.com):
1. 앱 생성 (나은 랩(Lab))
2. **비즈 앱 등록** (사업자등록증 업로드)
3. **비즈니스 정보 심사** 신청 → 통과 (1-2일)
4. **카카오 로그인 → 동의 항목** 활성화:
   - **카카오계정(이메일)** → [설정] → **필수 동의**
   - **닉네임 (profile_nickname)** → [설정] → **"선택 동의"** ⚠️ 필수 (Supabase 기본 scope)
   - **프로필 사진 (profile_image)** → [설정] → **"선택 동의"** ⚠️ 필수 (Supabase 기본 scope)
5. **앱 설정 → 플랫폼 → Web** → 도메인: `https://soragodong.com`
6. **카카오 로그인 → Redirect URI**: `https://pfagqvfteqzfhkbxtnwp.supabase.co/auth/v1/callback`
7. **보안 → Client Secret** 생성 + **활성화** (default 비활성)
8. **앱 키** → **REST API 키** 복사

**Supabase Dashboard**:
- Authentication → Providers → Kakao
- Client IDs = REST API 키 / Client Secret = 카카오 Secret
- Save

#### ⚠️ 닉네임 / 프로필사진 scope 처리 — *기술 수신만, 사용 X*

**원인**: Supabase 의 Kakao OAuth provider 가 default scope 로 `account_email + profile_nickname + profile_image` 3개 *hardcoded* 요청. URL `scopes` param 으로 override 안 됨.

**해결**: 카카오 dev console 에서 닉네임 + 프로필사진 = **"선택 동의"** 활성화 (위 4단계).
- 사용자 입장: 동의 화면에 "이메일 (필수) + 닉네임 (선택) + 프로필사진 (선택)" 표시
- 사용자 거부 가능 — 거부해도 로그인 정상 진행

**PIPA 데이터 최소 수집 정합** (privacy.md / cross-border.md 명시됨):
- 이메일 = 필수 / 회원 식별자
- 닉네임 / 프로필사진 = OAuth 표준 scope 기술 수신 / **사용·저장·DB 적용됨 X / 즉시 폐기**
- 코드 : `state.user.user_metadata` 의 nickname / avatar_url 무시 (이메일만 사용)

**옛 옵션 A vs B 분기**: 옵션 B (URL scopes param) 작동 X 검증됨 → 옵션 A 가 *현재 default*. fallback X 필수 절차.

#### 추가 메모

- **웹훅 (User Unlinked / 연결 해제)**: V4 = skip 가능 (warning 만, 검수 통과). V5 출시 전 구현 권장 — 사용자 카카오 탈퇴 시 자동 데이터 삭제 (PIPA 준수)
- **네이버 SNS 로그인**: V5 (휴대폰 본인 인증과 함께) — 네이버 정책상 SNS 가입 시 별도 비밀번호 X 의무 → E2EE master password 강제 흐름과 충돌 → V4 X
- **Apple Sign In**: V5 (iOS 출시 시 — Apple Developer $99/년 묶기)

---

## 🟢 P2 — 베타 시작 후 (선택)

### 10-3. 🟡 RAG 비용 재검토 (사용자 3000명 도달 시)

**상태**: 현재 Cloudflare Workers AI BGE-M3 (100K req/일 무료) 채택.

- 사용자 ~3000명 이하 = Cloudflare 무료 한도 안 = 사실상 무료.
- 사용자 3000명+ = Cloudflare paid tier 진입. Voyage AI voyage-3 와 비교 재검토.

**검토 항목**:
- Voyage 한국어 정확도 +5-10% (MIRACL Korean nDCG)
- 가격: Voyage $0.06/1M tokens vs Cloudflare ~$0.011/1K neurons
- Privacy: Voyage 외부 server vs Cloudflare 우리 infra 안 (E2EE 정책 정합)

**가능 옵션**:
- 그대로 Cloudflare 유지 (privacy 우위)
- Voyage 로 마이그레이션 (정확도 우위)
- Tier 별 분리 (예: Premium = Voyage 정확도, Plus = Cloudflare 경제)

### 11. ⏸️ Sentry 가입 + DSN 적용하기 (5분, 무료)

**상태**: 코드 자리는 적용됨 (`index.html` 의 `SENTRY_DSN` 빈 상수). DSN 빈 상태 = SDK 로드 X (영향 0).

**작업**:
1. https://sentry.io → Sign up (Github 연동 가능)
2. New Project → Browser → JavaScript → 이름 `soragodong-v4`
3. Settings → Client Keys (DSN) → 복사 (`https://abc@oXXXX.ingest.sentry.io/YYYY` 형식)
4. `index.html` 의 `const SENTRY_DSN = '';` → `const SENTRY_DSN = '<위 DSN>';` 으로 적용하기
5. commit + push → 자동 활성

**효과**: unhandled error / promise rejection → Sentry dashboard 에 stack trace + breadcrumb. 27878 같은 init crash 다시 발생 시 즉시 알림.
**Free tier**: 5K errors/month — 100명 안에서 충분.

### 12. ⏸️ 홈택스 사업용 신용카드 등록
매입세액 자동 정리.

### 13. 🟡 Google Play Console — TWA 출시 (사용자 명시 2026-05-13 진행 중)

**출시 방향**:
- ✅ **PWA + Google Play (TWA)** 우선 출시 — Mac 불필요 / signing cloud / 리뷰 3-7일.
- ⏸️ Apple iOS = 6-12개월 후 (Apple IAP 30% + cloud Mac).

**현재 상태**:
- ✅ Google Play Console 가입 완료 (Individual, $25 결제됨).
- ✅ manifest.webmanifest TWA-friendly 변환 완료 (id/display_override/prefer_related_applications 등 + Bubblewrap 호환).
- ✅ `public/.well-known/assetlinks.json` 템플릿 생성 (SHA-256 placeholder — 너가 keystore 생성 후 교체).
- ✅ Cloudflare Pages `_headers` 에 Content-Type 추가 (assetlinks.json = application/json, manifest = application/manifest+json).
- 🔴 **다음 → A: JDK + Bubblewrap 설치 + init**.

#### A. JDK 17 + Bubblewrap 설치 (30분, 너 작업) 🔴

Bubblewrap = 너의 PC 에서 돌리는 Node CLI. Android Studio 필요 X (Bubblewrap 가 Android SDK 자동 다운로드).

**1) JDK 17 (필수)**:
```powershell
# winget 으로 가장 간단:
winget install Microsoft.OpenJDK.17
# 또는 직접: https://learn.microsoft.com/en-us/java/openjdk/download
```
설치 후 `java -version` → `openjdk version "17..."` 확인.

**2) Bubblewrap CLI**:
```powershell
npm install -g @bubblewrap/cli
bubblewrap --version
```

**3) 첫 실행 — Doctor 점검**:
```powershell
bubblewrap doctor
```
Android SDK / JDK 경로 자동 감지. 없으면 자동 다운로드 (~500MB, 5-10분).

#### B. TWA 프로젝트 init (10분, 너 작업) 🔴

너 PC 어딘가에 별도 폴더 만들어. (이 repo 안 X — Android 빌드 산출물이라 git 분리)

```powershell
# 예: C:\Users\user\Desktop\soragodong-twa
mkdir C:\Users\user\Desktop\soragodong-twa
cd C:\Users\user\Desktop\soragodong-twa
bubblewrap init --manifest=https://soragodong.com/manifest.webmanifest
```

대화형 질문 답변 가이드:
- **Domain**: `soragodong.com`
- **URL path**: `/`
- **App name**: `소라고동`
- **Short name**: `소라고동` (최대 12자)
- **Application ID** (package name): `com.soragodong.twa`
  - ⚠️ **중요**: 이 값이 `assetlinks.json` 의 package_name 과 **반드시 일치**.
  - 한 번 출시하면 변경 X — 신중히.
- **Starting version**: `1` (codeVersion), `1.0.0` (versionName)
- **Display mode**: `standalone`
- **Status bar color**: `#0f0e17`
- **Splash screen color**: `#0f0e17`
- **Icon URL**: `https://soragodong.com/icon-512.png`
- **Maskable icon**: 없음 (Enter pass)
- **Monochrome icon**: 없음
- **Shortcuts**: 없음 (Enter pass)
- **Signing key**:
  - **New (생성)** 추천.
  - 경로: `./android.keystore`
  - 별칭(alias): `android`
  - 비밀번호: **반드시** 1Password/Bitwarden 에 저장. **분실 시 앱 업데이트 영구 불가**.
  - Common Name (CN): 너 이름 또는 `Soragodong`
  - Organization (O): `나은 랩` (선택)
  - Country (C): `KR`

init 끝나면 `twa-manifest.json` + `android.keystore` 생성.

#### C. SHA-256 추출 + assetlinks.json 업데이트 (5분, 너 + 나) 🔴

```powershell
bubblewrap fingerprint
```
출력 예시:
```
sha256: AB:CD:12:34:...:EF (64 자, 콜론 구분)
```

이 값 나한테 알려주면 내가 즉시 `public/.well-known/assetlinks.json` 의 `REPLACE_WITH_SHA256_FINGERPRINT_FROM_BUBBLEWRAP` 자리에 박고 commit + push. Cloudflare Pages 가 자동 배포.

배포 확인:
```powershell
curl https://soragodong.com/.well-known/assetlinks.json
```
교체된 값으로 응답 오는지 확인.

#### D. AAB 빌드 (20분, 너 작업) 🔴

```powershell
bubblewrap build
```
산출물: `app-release-bundle.aab` (Play Console 업로드용) + `app-release-signed.apk` (직접 설치 테스트용).

테스트 install (선택):
- USB 로 Android 폰 연결 + 개발자 모드 / USB 디버깅 ON.
- `adb install app-release-signed.apk` (adb 가 PATH 에 있어야).

#### E. Play App Signing (자동) ✅

- Play Console 이 *App Signing Key* (출시용) 자동 생성·보관. 너가 만든 keystore = *Upload Key* (Bubblewrap 가 만든 것 → Play 에 업로드).
- 분실 위험 ↓ (Upload Key 잃어도 Play Console 에서 reset 가능. App Signing Key 는 Google 이 갖고 있음).
- **단**: Upload Key 분실 = Play Console support 에 reset 요청 (수일 소요). 안전 보관 권장.

#### F. 결제 정책 — 하이브리드 (옵션 C) ✅ 구현 완료 (2026-05-13)

**구현 요약** (commit `98a9544`):
- `_isTWAEnv()` 헬퍼 — `document.referrer` 가 `android-app://com.soragodong.twa` 로 시작하는지 검사 + sessionStorage 캐시.
- 결제 진입점 4곳 가드 — `openSubscribeModal`, `proceedSubscribe`, `proceedOneTimePurchase`, `purchaseOveragePack`. TWA 면 결제 모달 차단하고 `_showTwaPaymentNoticeModal()` 호출.
- 안내 모달 — 🌐 "구독은 웹사이트에서" + "웹사이트 열기" 버튼 → `window.open('https://soragodong.com/?from=twa', '_blank')` (Chrome Custom Tabs).
- 일반 브라우저 / PWA install 영향 X — `_isTWAEnv()` 가 `false` 면 옛 흐름 그대로.

**Play 정책 안전성**:
- ✅ 앱 안에서 결제 UI / 가격 / "구독" CTA 자체가 안 보임 (모달 차단 후 안내만).
- ✅ "외부 결제 강제" 톤 X — "웹사이트에서 가입" 의 자연 톤.
- ✅ Chrome Custom Tabs = TWA 표준 패턴. Spotify / Netflix 등 다수 TWA 앱이 같은 방식.
- ⚠️ Play 가 review 시 거부 가능성 = 낮지만 0 X. 거부 시 메시지 톤 더 부드럽게 ("Premium 기능 안내" 등) 재제출.

**테스트 방법** (Bubblewrap install 후):
1. 폰에 APK install → 앱 실행.
2. 설정 → "🌊 Plus 구독" 또는 "Premium 으로 늘리기" 클릭.
3. 결제 모달 자체 안 뜨고 안내 모달 ("구독은 웹사이트에서") 뜸 → OK.
4. "웹사이트 열기" 클릭 → Chrome Custom Tabs 로 soragodong.com 열림.
5. 결제 완료 후 앱 복귀 → `/api/usage` refresh → plan 자동 반영.

**롤백 방법** (정책 검토 결과 변경 필요 시):
- `01-config.js` 의 `_isTWAEnv` 가 항상 `false` 리턴하도록 한 줄 변경 + rebuild → 결제 가드 무효화 (모든 환경에서 결제 UI 표시).

**D. Play Console 앱 생성 + AAB 업로드** (2-3일, 너 + 나)
- New App:
  - 앱 이름: **소라고동** (Soragodong)
  - Default language: 한국어
  - 앱/게임: 앱
  - 무료/유료: 무료 (구독 별도)
- AAB 업로드 → 내부 테스트 트랙 먼저.
- 출시 트랙 단계: 내부 테스트 → 비공개 베타 → 공개 베타 → 프로덕션.

**E. 메타데이터 + 그래픽 자산** (2-3일, 너 작업 가능 / 디자이너 의뢰 가능)
- 짧은 설명 (80자 한국어): 예) "ADHD 자기관찰 — 매일 5-10분으로 너를 더 깊이 이해해 🐚"
- 자세한 설명 (4000자): 핵심 가치 + 기능 + 데이터 처리 / E2EE 안내.
- **그래픽 자산**:
  - 앱 아이콘 512×512 PNG (이미 있음 — godongicon)
  - Feature graphic 1024×500 PNG (새로 작업 필요)
  - 스크린샷 (휴대폰 9:16) 2-8장. 예: 메인 대화 / 진주 카드 / 마법고동 / 미션 / 나 탭 / 도서관 (실 사용자 데이터 X — 시뮬 데이터 또는 직접 디자인)
- 카테고리: **Lifestyle** 또는 **Health & Fitness**.
- 콘텐츠 등급 — *Mental Health / Self Improvement*.

**F. Data Safety 섹션 (Privacy)** (1-2일)
- 데이터 처리 명시:
  - 이메일 (회원 식별) — 수집, 암호화 in transit, 사용자 삭제 가능.
  - 위치 X / 카메라 (미션 사진) — device only, 우리 서버 전송 X.
  - 음성 X / 마이크 (입력 도움) — Browser API, 외부 서버 X.
  - **AI 처리**: Anthropic Claude (US) — ZDR (Zero Data Retention) 정합.
  - 암호화: in transit (HTTPS), at rest (E2EE).
  - 데이터 삭제 요청: 가능 (`/api/account/delete` endpoint).
  - 어린이 X (13세 미만 대상 X).
- 개인정보 처리방침 URL: https://soragodong.com/privacy (이미 있음).

**G. 결제 정책 — Google Play Billing vs Web Billing** ⚠️ (Phase 결정)
- Google Play 정책: 디지털 콘텐츠 = Play Billing **필수** (30% 수수료).
- 2026 정책 일부 완화 — 일부 카테고리 외부 결제 허용 (구독 일부).
- 옵션:
  - **(a) Play Billing 통합** — 30% 수수료. 코드 작업 필요 (PaymentRequest 또는 Play Billing API).
  - **(b) Web Billing 유지** — 정책 위반 위험. *앱 안 결제 UI* 자체 제거 + 웹 결제 안내.
  - **(c) 하이브리드** — 앱 무료. 결제 자리에 *"브라우저에서 진행"* 안내 + 웹 redirect.
- **추천 Phase 1**: **(c) 하이브리드** — 30% 수수료 회피 + 정책 위반 risk ↓.
  - 단점: 사용자 친화 ↓ (앱 안에서 직접 결제 X).
- 추후 사용자 100명+ 도달 시 (a) 통합 재검토.

**H. 심사 + 출시**
- 내부 테스트: 너 본인 휴대폰 1대 — 1-2일 동작 확인.
- 비공개 베타: 5-10명 가까운 사람 — 1주 운영.
- 공개 베타 또는 프로덕션 제출 → 심사 3-7일.
- 첫 심사 거부 가능성: 정책 위반 / Data Safety 누락 / 메타데이터 부족 등. 재제출 가능.

**I. 출시 후**
- ASO (앱 검색 최적화): 키워드 (ADHD / 자기관찰 / 일기 / 한국).
- 초기 사용자 리뷰 부탁 (5점 받으면 ASO 부스트).
- 업데이트 = web 만 vs Play AAB 재업로드 차이.
  - **web 만 업데이트** = 즉시 (TWA 가 라이브 URL 로딩).
  - **AAB 재업로드** = manifest/icon 변경 시만 필요 (드물).

#### 비용 총합
- Play Console: **$25 일회성**
- 그래픽 자산 (디자이너): 0 (직접) ~ 30-50만원 (외주)
- 첫 1년 운영: ~$25

#### 일정 추정 (집중 시)
- 1주차: Bubblewrap 학습 + TWA 생성 + Play Console 가입
- 2주차: 메타데이터 + 그래픽 자산 + 내부 테스트
- 3주차: 비공개 베타 (5-10명) → 공개 베타 또는 정식 제출
- 4주차: 심사 → 출시

#### 위험 / 함정 (PR 전 점검)
1. **결제 정책** — Google Play Billing 강제 위험. 모니터링 필수.
2. **앱 거부** — 첫 심사 거부 케이스 대비. 메타데이터 / Data Safety 꼼꼼히.
3. **PWA 한계** — TWA = Chrome 의존. iOS 와 cross-platform = 별도 작업.
4. **부정 리뷰** — 초기 사용자 careful. 베타 단계에서 충분히 검증.
5. **개인정보 / 의료법** — '🔍 의료법 회피' 카피 + Data Safety 정확 명시.

#### 다음 액션 (사용자 결정 후 진행)
1. Google Play Console 가입 ($25) — 너 직접.
2. Bubblewrap 설치 + TWA 생성 — 내가 작업 (사용자 명시 후).
3. 그래픽 자산 (feature graphic + 스크린샷) — 너 또는 디자이너.
4. 결제 정책 Phase 결정 — (c) 하이브리드 추천.

### 14. ⏸️ Apple Developer (iOS 출시 시)
- Apple Developer Program: $99/년
- Capacitor / PWABuilder 로 iOS shell 생성 → cloud build (Codemagic / EAS Build)
- ⚠️ **Apple IAP 30% 강제** — 구독 8,900원 → 6,230원 net
- → **6-12개월 후 한국 사용자 base 검증된 후 진행 권장**

---

### 15. 🔴 Hook 시스템 Phase B — Web Push 셋업 (2026-05-17 ultrathink)

**필요한 이유**: hook 카드가 회전카드에 뜨려면 (Phase A) frontend trigger 만으로 충분. 그런데 **사용자가 앱 안 열면 hook 발사 X** → 본질적 가치 (돌아오게 만들기) 절반 손실. Phase B = 매일 정해진 시간 (default 21시) 에 push notification 발사 → 사용자가 누르면 chat 탭으로 직진 + hook 메시지 깔린 채로.

#### 15-1. VAPID 키 생성 (5분)

로컬에서 한 번만:

```bash
npm install -g web-push
web-push generate-vapid-keys
```

출력 예:
```
Public Key:
BL12...long base64url string... (88 chars)

Private Key:
xyz...43 chars base64url...
```

#### 15-2. Cloudflare Pages env 등록 (3분)

Cloudflare Dashboard → Pages → soragodong → Settings → Environment variables (Production):

```
VAPID_PRIVATE_KEY    = <위 Private Key>
VAPID_PUBLIC_KEY     = <위 Public Key>
VAPID_CONTACT_EMAIL  = mailto:bsya21@gmail.com
HOOK_CRON_SECRET     = <random 32+ 자 문자열, openssl rand -hex 32>
```

#### 15-3. Frontend 에 PUBLIC KEY 박기 (1분)

`src/scripts/main/01-config.js` 마지막 줄:

```js
window._VAPID_PUBLIC_KEY = '<위 Public Key 그대로>';
```

→ `npm run build` 후 push (다음 배포 시 반영).

#### 15-4. Supabase migration 적용 (2분)

```bash
# Supabase dashboard SQL editor 또는 CLI
psql $DATABASE_URL -f supabase/migrations/0030_hook_system.sql
```

또는 Supabase dashboard → SQL Editor → 파일 내용 paste → Run.

확인:
```sql
SELECT * FROM soragodong_hook_preferences LIMIT 1;
SELECT * FROM soragodong_hook_push_queue LIMIT 1;
```

#### 15-5. Cron 서비스 설정 (5분)

매 분 `POST https://soragodong.com/api/hook/cron-push` 호출 + 헤더 `X-Cron-Secret: <위 HOOK_CRON_SECRET>`.

옵션 A — **cron-job.org** (무료):
1. https://console.cron-job.org → New cronjob
2. URL: `https://soragodong.com/api/hook/cron-push`
3. Schedule: `* * * * *` (매 분)
4. Method: POST
5. Headers: `X-Cron-Secret: <secret>`
6. Save

옵션 B — **GitHub Actions** (기존 repo 활용):
`.github/workflows/hook-cron.yml`:
```yaml
on:
  schedule:
    - cron: '* * * * *'
jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST -H "X-Cron-Secret: ${{ secrets.HOOK_CRON_SECRET }}" \
            https://soragodong.com/api/hook/cron-push
```
→ repo Settings → Secrets → `HOOK_CRON_SECRET` 등록.

#### 15-6. 테스트

1. PWA 설치 (Android Chrome / desktop Chrome — iOS Safari 는 16.4+ 홈 추가).
2. 앱 진입 → 온보딩 모달 "응 그 시간에 줘" 클릭 → 권한 prompt OK → "알림 켜졌어 ✦" 토스트.
3. 회전카드에 hook 카드 뜨는지 확인 (= Phase A 동작).
4. 23시 이전이면 21시까지 기다림 OR test: Supabase SQL editor 에서
   ```sql
   UPDATE soragodong_hook_push_queue SET scheduled_at = NOW() WHERE user_id = '<your_uuid>';
   ```
   → 1분 안에 push 도착.

#### 15-7. 향후 (P2)

- **iOS 16.4+ PWA**: 사용자가 홈 추가 후에만 권한 prompt 노출 (현재 ensurePushSubscription 가드).
- **Android 네이티브 앱** (USER_TODO P1): FCM 직접 + Web Push 호환 layer 폐기 가능.
- **Notification time picker UI**: 설정 화면에 빈도 + 시간 변경 UI (현재 온보딩 모달 1회만).

---

## 📞 무료 상담 채널

| 기관 | 번호 / URL | 다루는 거 |
|---|---|---|
| 중소기업통합콜센터 | 1357 | 사업·세무·법무 종합 |
| 자영업119 | 1577-9119 | 자영업 시작 |
| 1인창조기업 비즈센터 | 02-368-8731 | 1인 사업자 |
| 서울청년창업센터 | 02-2152-3115 | 청년 창업 |
| 대한법률구조공단 | 132 | 법률 무료 상담 |

---

## ✅ 이미 완료된 것

### 인프라 / 보안
- ✅ Stage 1 RLS (0001_rls.sql) 실행 (2026-04-29)
- ✅ Stage 2 E2EE (PBKDF2 1M, 자동 백업 fallback)
- ✅ Cloudflare Pages 마이그레이션 (Vercel → Cloudflare)
- ✅ soragodong.com 도메인 + 연결
- ✅ **Supabase migration 0004 실행** (2-tier 월정액 — 사용자 확인 2026-04-30)

### Phase C 백엔드 (functions/api/*)
- ✅ /api/chat (Anthropic 프록시 + tier-aware budget + waitUntil)
- ✅ /api/usage (사용자 사용량 — tier + cap + 잔여 표시)
- ✅ /api/feedback (인앱 메시지)
- ✅ /api/account/delete (회원 탈퇴)
- ✅ /api/billing/subscribe (light / premium tier 검증)
- ✅ /api/billing/overage-pack (5K / 7K 추가팩)
- ✅ /api/billing/upgrade-tier (Light → Premium 차액)
- ✅ /api/billing/refund (잔여일 비례)
- ✅ /api/billing/verify-toss-receipt (legacy charge — Sonnet vision 자동 인증)
- ✅ /api/admin/* (pending-charges / confirm / revoke / feedback-list / feedback-reply)

### UI / UX 큰 변화 (2026-04-30 세션)
- ✅ **충전 plan 완전 폐기** (CHARGE_PLANS / 토스 송금 / 영수증 인증 frontend ~280줄 정리)
- ✅ **2-tier 구독 모달** (Light / Premium 카드, 정량 KRW cap 표기 X — claude 패턴)
- ✅ **cap 도달 모달** (추가팩 계속 결제 가능, tier 업그레이드 / 다음 cycle 대기 옵션 제거)
- ✅ **헤더 컴팩트화** (top padding 52px → max(10px, env(safe-area-inset-top)) / 로고 제거 / sonnet 토글 → godongicon 이미지)
- ✅ **대화탭** "소라고동 🐚" → "고동이에게" + godongicon
- ✅ **마법고동 핵심 자리 4곳** (chip / screen-title / dm-icon / action-icon) 🧙‍♂️ → godongicon
- ✅ **godongicon HEIC → PNG 변환** (heic-convert npm, 285KB)
- ✅ **환영 모달 인스타톤 재설계** + 카피 "한 달 쓰면 / 너 자신이 다르게 보일지도." (introduce.html CTA 차용)
- ✅ **무료 토큰 1,400원 → 4,000원 → 2,000원** ($1.0 → $2.86, pure API cost / 마진 X)
- ✅ **튜토리얼 음성 인식 적극 권장** (chat_mic_intro 새 step + intake step1 nudge)
- ✅ **튜토리얼 흐름 개선** — intake 모달 종료 → 분석 결과 자동 chatMessages 4단 표시 + click_strategy 점프
- ✅ **튜토리얼 chat_opus_intro 아이콘 godong**
- ✅ **옛 5문항 quiz 완전 폐기** (~275줄 dead code 정리)
- ✅ **결제 모달 필수 항목 전체 동의** 체크박스 (양방향 sync)
- ✅ **개발자 도구 환영 선물 모달 미리보기 버튼**

### Critical Bug Fix (2026-04-30)
- ✅ **잔액 race condition** — deductCost read-modify-write → deduct_credit_atomic RPC (FOR UPDATE row lock)
- ✅ **recordUsage / deductCost waitUntil** — fire-and-forget 으로 워커 종료 시 drop 되던 거 fix
- ✅ **SSE buffer 잔여 처리** — 마지막 message_delta 누락 → output_tokens 거의 0 으로 기록되던 root cause fix
- ✅ **새로고침 시 잔액 자동 충전** — ensureBillingRow Prefer: ignore-duplicates + 자동 grant X (POST /api/billing/welcome-bonus 만 trigger)
- ✅ **튜토리얼 끝내면 원본 데이터 소실** — onbFinish 에서 _testerModeBackupState 메모리 backup null 시 cloud backup 폴백 + seed marker sweep 강제 (fallback 경로 안전망)
- ✅ **JWT 만료 시 401 자동 refresh + retry**

### 사업자 / 도메인
- ✅ **사업자등록 완료** (나은 랩(Lab), 일반과세, 261-21-02592, 722000+525101) — 2026-04-30
- 🟡 **통신판매업 신고 처리 중** — 발급 대기
- ✅ 도메인 soragodong.com 등록 + Cloudflare Pages 연결

---

## 🎓 핵심 결정·학습 정리 (2026-04-30 세션)

### 결제 모델 — 충전식 → 2-tier 월정액 전환

**why**: 충전식 = 사용자가 "쓸수록 돈 까진다" 압박 → 깊은 대화 / 일기 / 마법고동 같은 핵심 가치 자리가 회피됨. 정액 = "이미 냈으니 본전 뽑자" 마인드 → 깊이 사용 → 가치 체감 → retention.

**가격 표 (사용자 확정)**:
| Tier | 월 | cap (USD) | tagline | 타깃 |
|---|---|---|---|---|
| 무료 | 0원 | $1.43 (2K원, 1회) | try-out | 신규 가입 1주 |
| Light | 8,900원 | $5 | 가볍게 매일 | 월 ~$3 평균 |
| Premium | 25,000원 | $15 | 깊게 자주 (claude pro 동일) | 월 ~$9 평균 |

**추가팩 (cap 도달 시)**:
- Light 5,000원 = +$4 어치
- Premium 7,000원 = +$5 어치
- 사용자 명시: **계속 결제 가능** (1회만 X)

**제거된 옵션** (사용자 명시):
- ❌ tier 업그레이드 (Light → Premium 차액 결제) — endpoint 는 살아있지만 UI 에서 옵션 제거 (Premium 은 업그레이드 X)
- ❌ 다음 cycle 대기 옵션 — UI 에서 옵션 제거 (불필요)

**예상 매출 (300 sub 가정, 70% Light / 30% Premium)**: 가중평균 마진 ~7,000원/sub → 월 2.1M (1인 part-time 생계). 500 sub = 3.5M (직장인 신입 수준). 1,000 sub = 7M (안정 1인 사업).

### 출시 방향 — PWA + Google Play 우선 (사용자 명시)

- ✅ **현재**: PWA (Cloudflare Pages, soragodong.com)
- 🟢 **Phase 1**: Google Play (PWA → TWA, $25 일회성)
- ⏸️ **Phase 2 (6-12개월 후)**: iOS App Store (Apple Dev $99/년 + cloud Mac/build + IAP 30% 마진)

### Brand DNA — 스폰지밥 Magic Conch 모티브 (중요)

- "마법의 소라고동" = 스폰지밥 Magic Conch 패러디·오마주 (사용자 명시)
- 스폰지밥 Magic Conch = 큰 결정 묻는데 "no" / "maybe someday" 만 답하는 useless oracle (코미디)
- 우리 마법고동 = 14일 숙성 + WRAP/Pre-mortem/Odyssey 로 *실제 작동하는* 결정 도구
- → **"the joke that became real"** — irony 자체가 brand identity
- 한국 + 영어권 millennial/gen-Z 양쪽에서 작동 (cross-cultural rare brand)
- 영어 출시 시점에 brand name "Conch" / "Magic Conch" 직접 차용 가능 (Viacom 상표 risk 변호사 검수 자리)

### 한국 사업자 / 행정 영역 — 신뢰도 ⚠️

이번 세션 큰 안내 오류 (사용자 시간/비용 영향):
- ❌ "간이과세 진행" → SW 개발업은 **간이 배제** (부가세법 §109)
- ❌ "토스페이먼츠 가입비 무료" → 가입비 22만 + 연관리 11만 = **33만원/년**
- ❌ "카카오페이 단독 무료 에스크로" → 카카오페이는 **에스크로 발급처 X** (간편결제일 뿐)
- ❌ "KB 사업자 통장 비대면" → 단기 다중 계좌 제한 시 **채권양도 전용계좌만** 가능

**향후 패턴**: 클로드 안내 = 출발점. **공식 채널 (1357 / 1588-9999 / 구청 / 정부24) 재확인 필수**. 한국 행정 정보는 매년 변경.

---

## 비용 추정 (확정 정책 기반)

### 1년차 외부 비용
- Cloudflare Pages: free / Cloudflare Registrar (.com): ~$10/년
- Supabase: free tier (50K MAU 도달 전)
- Anthropic API: 사용량 기반 (heavy 사용자 100명 = ~$1500/월 원가)
- 도메인 갱신: 2027-04-30 ($10)
- (선택) Google Play Console: $25 일회성
- (선택) PG 가입: 0~33만원
- (선택) 1357 무료 자문 → 변호사 직접 검수: 30-50만원

### 매출 예측 (가중 마진 ~7K/sub)
- 30 sub (베타): 210K/mo
- 100 sub: 700K/mo (알바 부수입)
- 300 sub: 2.1M/mo (1인 part-time 생계)
- 500 sub: 3.5M/mo (직장인 신입)
- 1,000 sub: 7M/mo (안정 1인 사업)

손익분기점: ~15 sub (Supabase Pro $25/월 + 도메인 등 고정비 cover).

---

## 베타 출시 체크리스트

- [ ] 본인 1-2주 사용 자연스럽게 됨
- [ ] Cloudflare env 적용됨 (P0-1)
- [ ] Supabase migration 0002 / 0003 실행 (P0-2 — 0004 는 완료)
- [✅] 사업자등록 + 통신판매업 신고 (처리 중)
- [ ] 통신판매신고번호 발급 → BUSINESS_INFO 갱신 (P1-9)
- [ ] legal_draft 갱신 (충전 → 구독 모델, P1-10)
- [ ] 토스뱅크 사업자 통장 → 정산 계좌 (P1-6)
- [ ] PG 결정 (P1-7) — 베타는 보류 OK
- [ ] (선택) 1357 자문 결과 반영 (P1-8)
- [ ] 베타 사용자 1-2명 모집

---

## 메모 / 참고

### 한국 → 영어권 출시 가능성 (2026-04-30 ultrathink 분석)

**기술적 가능 ✅** (Claude agent 100% 번역 + i18n 가능)
**실용적 추천 — 한국 검증 후 (6-12개월) 권장**:

1. **품질**: 어색한 영어 = mental health 앱에 치명적
2. **법무**: 영어권 변호사 검수 $1,500-5,000 (GDPR/CCPA/COPPA 등)
3. **브랜드**: 소라고동 → 영어 brand 새로 (Magic Conch 차용 가능, 변호사 검수 자리)
4. **시장 cold start**: 검증된 한국 base 없이 영어권 = 정복 어려움

영어 출시 시점에 i18n 리팩터 + Claude agent 번역 (~100h) + native review + 변호사 → 검증된 product 베이스라 효율적.

---

## ⚠️ 알려진 한계 / fragile

- index.html 1.75MB 단일 — Phase A 점진 분리 (현재 utils/date.ts 만)
- testerMode race (saveToCloud 1초 debounce + 600ms reload) — functional 안전이지만 fragile
- 24시간 갭 자동 챕터 분리 vs ✓ 마무리 — 일관성 OK 단 점검 필요
- 새 device E2EE 복원 — cloud `_e2eeRecovery` 적용된 후 가능. 옛 cloud 데이터는 same-device 만
- legacy charge 잔액 (credit_balance_usd > 0) 사용자 — 그대로 차감, 0 도달 후 구독 안내 (호환 유지)
