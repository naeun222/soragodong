# 사용자(김나은) 직접 작업 리스트

Claude Code가 못 하는 거. 너가 침대에서 / 외출 없이 다 가능. 우선순위 순.

상태: ✅ 완료 / ⏸️ 대기 / 🔴 다음 액션 / 🟡 진행 중

회사명: **Naeun Lab**
사업자등록번호: **261-21-02592** ✅ (일반과세, 2026-04-30 발급)
사업용 이메일: **soragodongapp@gmail.com**
도메인: **soragodong.com** ✅ 등록 + Cloudflare Pages 연결 완료
Admin 이메일: **jade6679@naver.com** (앱 로그인용)
Admin Supabase auth uid: **`4ba0a92e-7f79-45ec-8c48-b339d259382e`**

> ⚠️ **간이 → 일반과세 정정**: 소프트웨어 개발·공급업은 부가세법 §109에 따라 간이과세 배제. 일반과세 = 부가세 10% but 매입세액 공제 가능 (Cloudflare/Anthropic 세금계산서로 절세).

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

### 4. ✅ 사업자등록 완료 (2026-04-30)

- 회사명: **Naeun Lab**
- 사업자 유형: **일반과세자** ⚠️ (간이 X — 부가세법 §109 SW 개발업 배제)
- 사업자번호: **261-21-02592**
- 업종: **722000 응용 소프트웨어 개발 및 공급업** (주) + **525101 전자상거래 소매업** (부)
- 사업장: 본인 거주지 (자동이전 동의)
- 사업용 이메일: **soragodongapp@gmail.com**
- 사이버몰: 소라고동 / soragodong.com

### 5. ✅ 통신판매업 신고 완료 (2026-04-30)

방법: **네이버 스마트스토어 무료 우회**
1. https://sell.smartstore.naver.com 사업자 가입 (5분)
2. 가입 직후 → 판매자정보 → 구매안전서비스 이용확인증 PDF 다운
3. 정부24 통신판매업 신고서 → 확인증 첨부 → 제출
4. 영업일 ~1주 → 신고증 발급

⚠️ **본질 알기**: 네이버 확인증 = 행정 절차 통과용. 진짜 자체 사이트 카드 결제 받기 시작 시 PG 자체 에스크로 별도 가입 필요 (전상법 §13 진짜 보호). 베타 단계 (결제 X 또는 토스 수동) = OK. 적발 risk: 1년차 1인 사업자 매우 낮음.

**다음**: 신고번호 + 사업장 주소 클로드에게 알려주면 footer/legal placeholder 한 번에 박힘 (5분).

### 6. 🔴 사업자 통장 — 토스뱅크 비대면 (1-2일)

⚠️ **KB는 단기 다중 계좌 제한** → 채권양도 전용계좌만 가능 → **토스뱅크 비대면**으로 변경.

1. 토스 앱 → 토스뱅크 → 사업자 통장 만들기
2. 사업자등록증 + 신분증 + 셀카 업로드
3. 영업일 1-2일 심사 → 통장 + 체크카드 발급
4. **사용용도**: 수금용 (+ 결제용 + 세금 납부)
5. 받으면:
   - 네이버 스마트스토어 정산 계좌 변경
   - 추후 PG 가입 시 정산 계좌

⚠️ **토스뱅크는 에스크로 발급처 X** (이미 통신판매업 신고 끝났으니 무관)

### 7. ⏸️ PG 결정 — 토스페이먼츠 가입비 33만원

⚠️ **이전에 "가입비 무료"라 박혔던 거 정정**: 토스페이먼츠 가입비 22만원 + 연관리비 11만원 = 33만원/년. 무료 X.

**옵션**:
- **토스페이먼츠** 33만원 — 토스뱅크와 일관성, 보증보험 면제 (월 정산 1천만 미만)
- **KG이니시스 / KCP** 가입비 ~10-22만원 + 연 ~10만원
- **나이스페이먼츠** 0~10만원, 비교적 저렴
- **PortOne (Gateway)** 무료, 단 연결 PG 별도 가입비
- **보류** — 베타 + 토스 수동 송금만 → 결제 인프라 0원

**권장 시점**: 사용자 100명+ 또는 자체 사이트 카드 결제 시작 시. 베타 = 보류해도 OK.

가입 결정 시:
1. PG 가입 → 사업자등록증 + 통신판매업 신고증 + 통장사본 + 신분증
2. 심사 1-3일 → 키 발급
3. Cloudflare env 추가:
   - `PORTONE_API_KEY` / `PORTONE_API_SECRET` / `PORTONE_CHANNEL_KEY` (또는 PG별 키)
4. 클로드가 결제 모달 통합

### 7-2. ⏸️ KIPRIS 상표 — 보류 (2026-04-30 검색 완료)

- ✓ KIPRIS 검색 완료: `Soragodong` 등록·출원 없음
- 사용자 판단: **고유명사라 출원 보류** (다른 사람이 가져갈 risk 낮음)
- 필요 시 9류 (모바일 앱) + 42류 (SaaS) 결합 상표 출원 가능 (1류당 ~5만원)
- **모니터링**: 사용자 100명+ 도달 또는 카피캣 발견 시 재검토

### 8. ⏸️ 1357 무료 변호사 자문 (선택, 30분 전화)

질문 거리:
- "ADHD 자기관찰 앱에서 정신건강 데이터 = 민감정보 처리 의무 어디까지?"
- "AI (Anthropic, US 서버) = 국외이전 동의 필수 문구"
- "ADHD wording = 의료법 회피 가능?" (현재 legal_draft 4종 박혀있음, 검수 받기 권장)
- "토스 수동 송금 신뢰 모델 → 포트원 자동 결제 전환 시 약관 추가사항?"
- 기타 약관·정책 직접 검수는 별도 30-50만원 (선택)

### 9. 🔴 앱 footer / 약관 페이지에 사업자 정보 박기

전자상거래법 의무. 클로드가 한 번에 박을 수 있음. **알려줄 거**:

| 항목 | 값 | 상태 |
|---|---|---|
| 상호 | Naeun Lab | ✓ |
| 대표자 | 김나은 | ✓ |
| 사업자등록번호 | **261-21-02592** | ✓ |
| 통신판매신고번호 | (대기 — 정부24 발급 후) | ⏸️ |
| 사업장 주소 | (대기 — 알려주기) | ⏸️ |
| 사업용 이메일 | **soragodongapp@gmail.com** | ✓ |
| CPO (개인정보 보호책임자) | 김나은 | ✓ |
| 전화 | (선택, 없어도 OK) | - |

**박힐 곳** (클로드가 한 번에):
- `index.html` `BUSINESS_INFO` 상수 (footer 자동 렌더)
- `legal_draft/privacy.md` §9 CPO 시행일/이메일/주소
- `legal_draft/refund.md` 연락처
- `legal_draft/terms.md` 회사 정보

→ **신고번호 + 주소 알려주면 5분 commit**.

---

## 🔴 P1.5 — agent review 후 사용자 결정 필요 (2026-04-30)

### 14. ✅ manual-charge 폐기 + verify-toss-receipt (AI 점검) 일원화 (2026-04-30 정정)

사용자 명시: "AI로 점검하고 즉시 반영되게 하면 안 돼?"
- manual-charge endpoint 410 Gone 응답 (폐기).
- confirmTossSent 함수 제거 (이미 dead UI 흐름이었음).
- 모든 충전 = 영수증 캡처 업로드 → verify-toss-receipt → AI vision 점검 → 즉시 잔액 반영.
- 영수증 없이 충전 불가능 — UI 에 영수증 input 강제. 사용자가 캡처 못 박는 케이스 = 카톡 오픈채팅 문의 fallback.
- cap 없음 — AI 점검 통과 시 모든 금액 즉시 반영.

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
- ✅ **사업자등록 완료** (Naeun Lab, **일반과세**, 261-21-02592, 722000+525101) — 2026-04-30
- ✅ **통신판매업 신고 완료** (네이버 스마트스토어 우회) — 2026-04-30
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
- [ ] Cloudflare env / Supabase migration 다 박힘
- [✅] 사업자등록 + 통신판매업 신고 완료
- [ ] 사업자 정보 footer 박힘 (신고번호 + 주소 알려주면 5분)
- [ ] 토스뱅크 사업자 통장 받음 → 정산 계좌
- [ ] PG 결정 (토스페이먼츠 33만 vs 보류)
- [✅] 약관 / 개인정보처리방침 / 환불정책 게시 (legal_draft 박힘, [TBD] 부분만 갈아끼우면 됨)
- [ ] (선택) 1357 자문 결과 반영
- [ ] 베타 사용자 1-2명 모집

### Q1 / Q2 사용자 발견 (관찰 중)
- '더 깊은 나' 자동 채움 — 동작 확인 필요 (extractChapterCaseAnalysis가 case_formulation_update + deep_profile_update 박음)
- 첫 진단 가설 ✓ 흐름 — 기존 traits/values/patterns 표준 schema 편입 박혀있음
- 튜토리얼 대화 중 첫 진단 받기 401 — 인터셉터 자동 refresh 박혀서 fix 가능성 (재현 시 알려주기)

---

## 🎓 이번 세션 큰 학습 (2026-04-30)

### 한국 사업자/통신판매 영역 — 신뢰도 ⚠️
이번 세션 큰 안내 오류 (사용자 시간/비용 영향):
- ❌ "간이과세 진행" → SW 개발업은 **간이 배제** (부가세법 §109)
- ❌ "토스페이먼츠 가입비 무료" → 가입비 22만 + 연관리 11만 = **33만원/년**
- ❌ "카카오페이 단독 무료 에스크로" → 카카오페이는 **에스크로 발급처 X** (간편결제일 뿐)
- ❌ "KB 사업자 통장 비대면" → 단기 다중 계좌 제한 시 **채권양도 전용계좌만** 가능

**향후 패턴**: 클로드 안내 = 출발점. **공식 채널 (1357 / 1588-9999 / 구청 / 정부24) 재확인 필수**. 한국 행정 정보는 매년 변경.

### 무료 구매안전서비스 발급처 (확정)
- ✅ **네이버 스마트스토어** — 5분 가입, 즉시 PDF 발급 (베스트)
- ✅ **KB / IBK / NH** 사업자 통장 + 영업점 (한도 제한 케이스 X)
- ❌ 토스뱅크 — 발급처 X
- ❌ 카카오뱅크 — 발급처 X
- ❌ 카카오페이 단독 — 간편결제일 뿐

### 결제 인프라 단계
1. **베타** (현재): 토스 수동 송금 + AI vision 자동 인증 (verify-toss-receipt 박힘) + admin 무료
2. **소수 사용자**: 본인 우리은행 정산 받기 → 토스뱅크 사업자 통장 받으면 변경
3. **사용자 100명+ 또는 카드 결제 시작 시**: PG 가입 (토스페이먼츠 33만원 또는 다른) → 진짜 보호 + 자동 결제
