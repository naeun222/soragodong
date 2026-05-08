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

적용한 후 → **Deployments → Retry deployment** (재배포 후 적용).

**들어가야 동작 (지금 작동 X)**:
- `/api/chat` (모든 AI 호출) — 비-admin 사용자도 미작동
- `/api/admin/*` (피드백 답변 / 토스 송금 처리)
- `/api/billing/subscribe` / `overage-pack` / `upgrade-tier` (포트원 키 적용된 후)

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

### 13. 🟢 Google Play Console — PWA 출시 (사용자 결정 2026-04-30)

**출시 방향 확정 (사용자 명시 ultrathink 2026-04-30)**:
- ✅ **PWA + Google Play** 우선 출시 (Mac 불필요 / signing cloud / 리뷰 빠름)
- ⏸️ Apple iOS = 6-12개월 후 (Apple IAP 30% 마진 + cloud Mac 필요)

**Google Play 출시 단계**:
1. Google Play Console 가입 ($25 일회성)
2. PWA → TWA (Trusted Web Activity) 변환 — Bubblewrap CLI (Claude code 가능)
3. signing key 생성 (cloud 가능)
4. AAB 업로드 + 메타데이터 작성
5. 심사 ~3-7일 → 출시
6. 비용: $25 일회성 + 기타 0원

### 14. ⏸️ Apple Developer (iOS 출시 시)
- Apple Developer Program: $99/년
- Capacitor / PWABuilder 로 iOS shell 생성 → cloud build (Codemagic / EAS Build)
- ⚠️ **Apple IAP 30% 강제** — 구독 8,900원 → 6,230원 net
- → **6-12개월 후 한국 사용자 base 검증된 후 진행 권장**

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
