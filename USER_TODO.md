# 사용자(김나은) 직접 작업 리스트

Claude Code가 못 하는 거. 너가 침대에서 / 외출 없이 다 가능. 우선순위 순.

---

## 🔴 P0 — 지금 / 바로 (Stage 1 완료 위해 필요)

### 1. Supabase RLS 정책 적용 (5분, 침대 가능)
1. https://supabase.com/dashboard 로그인
2. soragodong 프로젝트 → **SQL Editor**
3. `supabase/migrations/0001_rls.sql` 파일 내용 복사 → 붙여넣기 → **Run**
4. **Database → Roles**에서 anon role이 `service_role` 권한 없는지 확인
5. **Settings → API**에서 `service_role key`는 *다시는 클라이언트 코드에 넣지 않음*. 백엔드 전용으로 보관.

### 2. Anthropic API 키 (백엔드용) 따로 받기 (5분)
1. https://console.anthropic.com → API Keys → New Key
2. 이름: `soragodong-backend`
3. 키 복사 → 안전한 곳 (1Password / Bitwarden / Apple Notes 잠금)
4. **이 키는 Vercel 환경변수에만 박힘. 절대 클라이언트 코드 X.**

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
