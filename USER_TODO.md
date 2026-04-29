# 사용자(김나은) 직접 작업 리스트

Claude Code가 못 하는 거. 너가 침대에서 / 외출 없이 다 가능. 우선순위 순.

상태: ✅ 완료 / ⏸️ 대기 / 🔴 다음 액션 / 🟡 진행 중

회사명: **Naeun Lab**
도메인: **soragodong.com** ✅ 등록 + Cloudflare Pages 연결 완료
Admin 이메일: **jade6679@naver.com**
Admin Supabase auth uid: **`4ba0a92e-7f79-45ec-8c48-b339d259382e`**

---

## 🔴 P0 — 지금 바로 (Phase C / Admin 활성 위해)

### 1. Cloudflare Pages env 변수 박기 (10분)

**위치**: Cloudflare 대시보드 → Workers & Pages → soragodong → Settings → Environment variables.
**Production + Preview 둘 다** 박을 거:

| Name | Value | 출처 / 용도 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (본인 Anthropic 키) | console.anthropic.com → API Keys → New Key. 이름 `soragodong-backend`. **사용량 cap 박기 (월 $200)** |
| `SUPABASE_URL` | `https://pfagqvfteqzfhkbxtnwp.supabase.co` | Supabase Settings → API |
| `SUPABASE_ANON_KEY` | (anon public 키) | Supabase Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | (service_role 키 — 비공개!) | Supabase Settings → API → service_role |
| `ADMIN_USER_ID` | `4ba0a92e-7f79-45ec-8c48-b339d259382e` | (위에 명시) |

박은 후 → **Deployments → Retry deployment** (재배포 후 적용).

**박혀야 동작 (지금 작동 X)**:
- `/api/chat` (모든 AI 호출) — 비-admin 사용자도 미작동
- `/api/admin/*` (피드백 답변 / 토스 송금 처리)
- jade6679@naver.com 무료 사용
- 인앱 피드백 인증

### 2. Supabase Migration 실행 (5분)

**위치**: Supabase 대시보드 → SQL Editor → New query

다음 두 파일 내용 복붙 → **Run**:

| 파일 | 무엇 | 박혀야 동작 |
|---|---|---|
| ⏸️ `supabase/migrations/0002_billing_usage.sql` | billing / usage / payments 3 테이블 + RLS + RPC | 결제 / 사용량 추적 |
| ⏸️ `supabase/migrations/0003_feedback.sql` | soragodong_feedback 테이블 + RLS | 인앱 피드백 (현재 admin 답변 500 에러) |

**박혀야 작동**:
- `/api/billing/*` (충전 / 월정액 / 환불)
- `/api/usage` (사용자 사용량 조회 — 현재 ?)
- `/api/feedback` (사용자 메시지 저장)
- `/api/admin/feedback-list` (admin 피드백 답변 — 현재 500 에러)

### 3. ✅ 도메인 등록 완료

- soragodong.com (Cloudflare Registrar)
- www.soragodong.com → Pages Custom domain 연결 완료
- 갱신: 2027-04-30

---

## 🟡 P1 — 며칠 안 (사업자등록 → 통신판매업)

### 4. 🟡 사업자등록 (진행 중)

이미 신청 제출 완료:
- 회사명: **Naeun Lab**
- 사업자 유형: **간이과세자**
- 업종: **722000 응용 소프트웨어 개발 및 공급업** (주) + **525101 전자상거래 소매업** (부)
- 사업장: 본인 거주지 (자동이전 동의)
- 통신판매: '예'
- 현금영수증 가맹점: '여' (525101 의무)
- 사이버몰: 소라고동 / soragodong.com

**대기**: 1-2일 후 사업자등록증 발급. 홈택스 → 민원신청 처리결과 조회.

### 5. ⏸️ 통신판매업 신고 (사업자등록증 받은 후)

1. 정부24 (https://gov.kr) 로그인
2. "통신판매업 신고" 검색 → 신청
3. 사업자등록증 + 도메인 (soragodong.com) + 결제 정보 입력
4. 1-3일 처리. **신고증 발급**.

### 6. ⏸️ 포트원 (PG) 가입 (통신판매업 신고증 받은 후)

1. https://portone.io 가입
2. 사업자등록증 + 통신판매업 신고증 + 통장사본 + 신분증 업로드
3. 심사 1-3일
4. 가맹점 ID + 키 받음 → Cloudflare env 추가:
   - `PORTONE_API_KEY` / `PORTONE_API_SECRET` / `PORTONE_CHANNEL_KEY`

→ 클로드가 결제 모달 (포트원 SDK 통합) 박을 수 있음.

### 7. ⏸️ KIPRIS 상표 검색 + 출원 (사업자등록증 받은 후)

1. https://kipris.or.kr 접속 (무료 검색)
2. 검색: `소라고동` / `Soragodong` (한글 + 영문 둘 다)
3. 등록 / 출원 중인 게 없으면 → 결합 상표 출원
4. 결합 = 한글 + 영문 + 도형 (🐚) + 슬로건 ("인생의 답 같이 찾자 ✦")
5. 지정상품: **9류** (모바일 앱) + **42류** (SaaS 서비스)
6. 비용: 1류당 ~5만원 + 변리사 의뢰 시 30-50만원 (직접 출원도 가능)

### 8. ⏸️ 1357 무료 변호사 자문 (선택, 30분 전화)

질문 거리:
- "ADHD 자기관찰 앱에서 정신건강 데이터 = 민감정보 처리 의무 어디까지?"
- "AI (Anthropic, US 서버) = 국외이전 동의 필수 문구"
- "ADHD wording = 의료법 회피 가능?" (현재 legal_draft 4종 박혀있음, 검수 받기 권장)
- "토스 수동 송금 신뢰 모델 → 포트원 자동 결제 전환 시 약관 추가사항?"
- 기타 약관·정책 직접 검수는 별도 30-50만원 (선택)

### 9. ⏸️ 앱 footer / 약관 페이지에 사업자 정보 (사업자등록증 받은 후)

전자상거래법 의무. 다음 정보 노출:
- 상호 (Naeun Lab)
- 대표자 (김나은)
- 사업자등록번호 (XXX-XX-XXXXX)
- 통신판매업 신고번호 (XXXX-시도-XXXXX호)
- 사업장 주소
- 연락처 / 이메일
- 개인정보 보호책임자: 김나은

→ 클로드가 footer template 미리 박아둠. 발급 후 숫자만 갈아끼우면 됨. 알려줘.

---

## 🟢 P2 — 베타 시작 후 (선택)

### 10. ⏸️ Sentry 가입 (5분, 무료)
에러 트래킹. https://sentry.io free tier → DSN → Cloudflare env.

### 11. ⏸️ 사업용 통장 개설
회계 깔끔하게. 토스뱅크 / KB / 우리 등.

### 12. ⏸️ 홈택스 사업용 신용카드 등록
매입세액 자동 정리. 사업자카드 새로 만들거나 기존 카드 등록.

### 13. ⏸️ Apple Developer / Google Play (앱 스토어 시)
- Apple Developer: $99/년
- Google Play Console: $25 일회성
- PWA만 가는 한 skip 가능

---

## 📞 무료 상담 채널 (다 침대에서 전화 가능)

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
- ✅ Stage 1 RLS (0001_rls.sql) 실행 완료 (2026-04-29)
- ✅ Stage 2 E2EE 박힘 (사용자 password, PBKDF2 1M, 자동 백업 fallback)
- ✅ Cloudflare Pages 마이그레이션 (Vercel → Cloudflare, 2026-04-30)
- ✅ soragodong.com 도메인 등록 + 연결

### Phase C 백엔드 (functions/api/*)
- ✅ /api/chat (Anthropic 프록시 + budget + admin 무료)
- ✅ /api/usage (사용자 사용량)
- ✅ /api/feedback (인앱 메시지)
- ✅ /api/account/delete (회원 탈퇴)
- ✅ /api/billing/charge / subscribe / refund (포트원 통합 — 키 박히면 동작)
- ✅ /api/billing/manual-charge (토스 신뢰 모델)
- ✅ /api/billing/verify-toss-receipt (Sonnet vision 자동 인증)
- ✅ /api/admin/* (pending-charges / confirm / revoke / feedback-list / feedback-reply)

### UI / UX
- ✅ Settings UI 계층화 redesign
- ✅ 4단 분석 디자인 (emoji + gentle separator + gold accent)
- ✅ 결과 체크 defer 흐름 (캘린더 picker + 재미루기 chain)
- ✅ 코어 튜토리얼 첫 step 'tutorial_plea' 제거
- ✅ 신규 사용자 첫 진단 quiz (5문항 → AI 가설)
- ✅ 리뷰 전체 재설계 (Detective + Quotes + Seeds + One-word)
- ✅ 인앱 피드백 사용자 inbox + admin 답변 UI
- ✅ '평문' → '본인의 데이터' 통일 (8군데)
- ✅ 태그라인 "인생의 답 같이 찾자 ✦"
- ✅ 다양한 wording 정리

### 사업자 / 도메인
- ✅ 사업자등록 신청 제출 (Naeun Lab, 간이, 722000+525101)
- ✅ 도메인 soragodong.com 등록
- ✅ Cloudflare Pages 연결 (production + www)

---

## 메모 / 참고

### 결제 단계
- **현재**: 토스 수동 송금 신뢰 모델 + AI vision 자동 인증 (verify-toss-receipt). 사용자가 송금 → 영수증 캡처 업로드 → AI가 검증 → 자동 충전.
- **다음**: 포트원 가입 후 자동 결제 전환. 그 전엔 토스 수동만.

### 비용 추정
- 1년차 외부 비용: 도메인 1.5-3만원 + Anthropic API (사용량 따라) + (선택) 변리사 30-50만원
- 사용자 100명 도달 시 Anthropic 월 ~$1500 (200만원) 예상 (heavy user 기준)

### 베타 출시 체크리스트
- [ ] 본인 1-2주 사용 자연스럽게 됨
- [ ] env / migration 다 박힘
- [ ] 통신판매업 신고증 + 포트원 가입 완료
- [ ] 사업자 정보 footer 박힘
- [ ] 약관 / 개인정보처리방침 / 환불정책 게시
- [ ] (선택) 1357 자문 결과 반영
- [ ] 베타 사용자 1-2명 모집

### Q1 / Q2 사용자 발견 (관찰 중)
- '더 깊은 나' 자동 채움 — 동작 확인 필요 (extractChapterCaseAnalysis가 case_formulation_update + deep_profile_update 박음)
- 첫 진단 가설 ✓ 흐름 — 기존 traits/values/patterns 표준 schema 편입 박혀있음
