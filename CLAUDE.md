# 소라고동 (Soragodong) — V4

ADHD 자기관찰 PWA. 사용자 김나은 단독 개발 + 본인 사용 + 향후 다른 사용자.

## 기본 원칙

- **한국어로 소통.** 영어 답변 금지.
- **짧고 직관적.** 진단 → 수정 한 줄.
- 사용자가 코드 안 읽음(보통). 행동/결과로 검증.
- 캐주얼 톤이지만 가벼운 농담 X.

## 파일 구조

```
soragodong-repo/
  index.html              ← 단일 HTML 파일 (~31k 줄, ~1.4MB). 거의 모든 코드 여기.
  vite.config.*           ← Vite 빌드 설정
  package.json            ← Vitest 추가됨 (npm test)
  vitest.config.ts
  tsconfig.json           ← src/ tests/ api_draft/ include
  CLAUDE.md               ← 이 문서
  USER_TODO.md            ← 사용자 직접 작업 인계
  src/                    ← Phase A 점진 모듈 분리 (현재 utils/date.ts만)
  tests/                  ← Vitest 단위 테스트
  supabase/migrations/    ← RLS SQL (사용자 직접 실행 — 0001_rls.sql 완료)
  api_draft/              ← Phase C 백엔드 프록시 reference (비활성)
  legal_draft/            ← terms / privacy / refund / cross-border 초안
  public/sw.js            ← Service Worker (오프라인 + 설치 배너)
  .github/workflows/ci.yml← CI: build / typecheck / test
```

빌드: `npm run build` → `dist/index.html`. 테스트: `npm test`. 타입: `npm run typecheck`.

## Push 정책 (사용자 명시)

1. **자동 push 금지.** v4-dev든 main이든 사용자 요청 시 또는 batch threshold 도달 시만.
2. **v4-dev 우선:** 평소 commit은 v4-dev에. 10 commit 정도 모이면 push.
3. **main 직접 push:** 사용자가 "main에 올려"라고 명시할 때만. main에 push 직전 백업 브랜치(`main-backup-YYYY-MM-DD`) 만들기.
4. main 직접 push 차단 hook 있어 어차피 막힘 — v4-dev → main merge 흐름 사용.

## 작업 흐름

1. 변경 → 빌드 (`npm run build`) — 신택스 점검.
2. commit. 메시지: `V4 [fix|feat] (사용자 [요청|보고]): <짧은 설명>`
3. 10개 모이면 push. main도 함께 올릴지 사용자 확인.

## 코드 찾기

index.html이 거대한 단일 파일이라 Grep 적극 활용:

- **튜토리얼 step 찾기:** `Grep "id: 'step_id_here'" index.html`
- **튜토리얼 phase 9개:** index.html line 9441 `ONBOARDING_PHASES`
- **튜토리얼 step 배열:** line 8355 `ONBOARDING_STEPS`
- **렌더링 함수:** `function renderXxx`
- **데이터 구조:** memory/reference_codebase.md 참고

## 주의 사항

- `console.error`는 정상. 로깅 패턴.
- 시드 데이터 / testerMode: 사용자 V3 데이터 절대 건드리지 않게 — id-prefix `seed_` sweep만 안전. signature 기반 sweep 금지.
- Korean 문법: "너의/네" 둘 다 가능. 일괄 치환 X.

---

## V4 코어 튜토리얼 잠금 시스템 (2026-04-29 박힘)

`state.unlocked.{core1, core2, core3, core4, core5, core6, core8}` 7개 코어 잠금. 자세한 룰은 `index.html` 안 `CORE_TUTORIAL_RANGES` / `CORE_LABELS` / `CORE_LOCK_INFO` / `CORE_BODY_OVERRIDE` 주석 참고.

핵심:
- testerMode ON 또는 API 키 없음 → 잠금 우회
- 코어 끝 = `help_button` ("시작! ✦") → onbFinish → testerMode backup restore + saveToCloudNow await
- 풀 튜토리얼 완주 시 모든 코어 unlock
- '이미 알아' = 모두 unlock, '하면서 익히기' = 모두 lock 후 코어 #1, '풀 튜토리얼' = 풀 진행

업데이트 모달 dismiss 단위: `dismissedMajor` (V4). V5 등 새 메이저 시 재출현.

---

## 보안 / 인프라 로드맵 (2026-04-29 시작)

## 다음 세션 인계 (2026-04-29 끝)

**큰 작업 박힘 (이번 세션)**:
- 코어 튜토리얼 잠금 시스템 7개 (#1~#8)
- Stage 1 RLS 완료
- Service Worker / API helper / 약관 초안
- 진주 큰 보기 모달 + 더보기 ⋮
- 마법 도움 받기 풀스크린 (숙고의 방 패턴) + 자동 컨텍스트 템플릿 + helpChat 영구 저장
- 돌연변이 "옵션 → 가지" + 자동→버튼 + 인라인 메시지 + 진지 모드 + 사용자 데이터 인용 + 깨달음 버튼 + 가지 재생성 + 같은 차원 refine
- 숙고 진지 모드 강화 + caching
- 'didnt' attempt DNA 트리 안 박힘 fix
- 코어 #2 시작 시 시드 미션 정리 (mis_seed_2 등 제거)
- "차원" → "가지" wording (mutation 컨텍스트)
- 입력바 textarea 자동 높이 (chatInput / reflectionInput / magicHelpInput 통일 max 140px)

**다음 세션 우선순위 — 사용자 질문 대기 중**:

### Q1 (사용자 명시): 임시 대화창 → caseFormulation feed-in
사용자: "숙고/마법/돌연변이 임시 대화에서 한 대화들이 메인 case formulation? 거기에 영향을 줘? 저장 돼? 예: 내 패턴, 나에 대한 분석, '나 탭' 정보들. 임시 대화창에서 좋은 인사이트 많이 나와서."

**현재 상태 (2026-04-29 기준)**:
- 메인 chat: 응답 끝 JSON으로 `new_traits` / `new_values` / `new_patterns` / `case_formulation_update` 자동 추출 → state에 박힘
- 숙고 chat: 박힘 X (sysPrompt에 "페르소나 분석 OFF" 명시)
- 마법 helpChat: 박힘 X
- 돌연변이 임시 대화창: 박힘 X (가지 옵션 생성 + 대화만)

**제안 (다음 세션 박을 거)**:
- 임시 대화창 3종 모두 응답 끝 JSON 추출 룰 추가 (선택적, opt-in)
- 또는 "✦ 깨달음으로" 버튼 누르면 거기서 추출 (더 명시적, 사용자 선택권)
- 또는 챕터 마무리 시점처럼 임시 대화 종료 시 일괄 추출 (background, batch)
- **주의**: 임시 대화 = 가벼운 탐색 vs 메인 = 신중한 분석. 임시 대화에서 unverified로 박고 사용자가 ✓ 검증해서 verified로 승격하는 흐름이 자연.

### Q2 (사용자 명시): 나 탭 추가 저장 정보 후보
**지금 박혀있는 거**: traits / values / patterns / caseFormulation (problems/mechanisms/strengths/goals/growth) / diagnoses / 미션·전략 통계 / task별 평균 시간 (몰입)

**더 박을 만한 거 (가벼운)**:
- 모드 빈도 시계열 (월경/시험/여행/아픔/휴식 — 이미 부분 박힘)
- 저녁/아침 작업 효율 비교 (shift 패턴)
- 거절 패턴 빈도 (yes/no 응답 시간)
- 진주 카테고리 분포 변화 (취향 진화)
- 챕터 카테고리 분포 (concern/감정/관계 등 톤 분석)
- 결정 → 결과 정확도 (예측 vs 실제)
- "체화" 도달 평균 시도 횟수 (학습 속도)

**더 박을 만한 거 (무거운, 신중하게)**:
- 자연어 자기소개 (free-form profile, AI 요약 한 단락)
- 가치 충돌 패턴 매트릭스
- 행동 변화 지표 (전략 도입 후 N일 변화)

**비용 vs 가치**: 무거운 거 박으면 시스템 프롬프트 길이 ↑ → token 비용. 가벼운 통계는 공짜. 제안: 가벼운 거 1-2개 우선.

### 기타 후순위 (인계)
- API call 19+ 사이트 callAnthropic helper 점진 마이그레이션
- Phase A: utils/format / utils/dedupe 추출
- Stage 2 E2EE 부분 구현 (베타 직전 필수)
- Performance audit (1.4MB 단일 HTML)
- 4시간/24시간 갭 자동 챕터 분리 vs ✓ 마무리 일관성 점검

---

### Stage 1 — RLS ✅ 완료 (2026-04-29)
- Supabase Row Level Security 강화. 사용자는 본인 row만 read/write.
- 클라이언트에서 service_role key 절대 X. anon key만.
- 마이그레이션 SQL: `supabase/migrations/0001_rls.sql`
- 사용자(김나은)가 직접 Supabase SQL Editor에서 실행 완료.
- **알려진 한계**: service_role key 가진 사람(dev)은 RLS 우회 가능. 완전 차단은 Stage 2 E2EE.

### Stage 2 — 클라이언트 E2EE (다음 세션 / 베타 사용자 받기 전 필수)
**왜**: ADHD/정신건강 데이터 = PIPA 민감정보. 저장 시 암호화 의무. 개발자(나)도 평문 못 보게.

**설계**:
- 마스터 키: 사용자 device localStorage (256-bit random, base64). 서버 X.
- BIP39 12단어 백업 passphrase 표시. 사용자가 어딘가 저장.
- 새 device 진입 시 passphrase 입력 → 키 복원.
- AES-256-GCM (필드별 random IV). PBKDF2 100k iterations.
- WebCrypto API 사용 (브라우저 표준).

**암호화 대상 (민감)**:
```
entries[*].diary, .note, .dailyQuestion.answer, .music
chatMessages[*].content
chatArchive[*]
topicCards[*]
pearls[*].content, .note
decisions[*]
reflectionQuestions[*]
traits / values / patterns / caseFormulation
state.profile (사용자 직접 입력 자기 소개)
```

**비암호화 (메타데이터 OK)**:
```
date keys, mood/vitality 숫자, timestamps, IDs, preferences
```

**리스크**:
- passphrase 분실 = 영구 데이터 손실 (의도적 설계).
- 마이그레이션 시 자동 백업 의무 (기존 `runAutoBackupIfNeeded` 활용).
- AI API call 시점은 클라이언트가 평문 보냄 (Anthropic은 어차피 평문 봐야 함).

**작업 양**: 4–7일.

**시작 트리거**: 베타 사용자 1명이라도 받기 시작 직전. 그전엔 너 본인 데이터만 있으니 우선순위 X.

### Phase A — 모듈 분리 (점진)
1.3MB 단일 HTML → `src/` 디렉토리 구조. 한 번에 X, 점진 추출.
첫 단계: state / services / utils 일부만 먼저.
나머지 (UI 컴포넌트, screens) 는 새 화면 / 큰 변경 있을 때 점진.

### Phase B — Framework (선택, 후순위)
1인 단계엔 vanilla로 충분. 협업 / 채용 시작 시 React/Svelte 도입 검토.

### Phase C — 백엔드 프록시 (Vercel Functions)
**왜**: 사용자 API 키 노출 차단 + 사용량 추적 + 청구 인프라.
- `/api/chat.ts` — Anthropic SDK proxy. 인증 미들웨어 + 사용량 logging.
- `/api/usage.ts` — 사용자 토큰 사용량 조회.
- `/api/auth.ts` — Supabase JWT 검증.
- 환경변수: `ANTHROPIC_API_KEY` (서버 전용), `SUPABASE_SERVICE_ROLE_KEY` (서버 전용).
- 배포: Vercel (free tier 충분).

### Phase D — 앱 패키징 (선택)
PWA만으로 충분. App Store 노릴 때만 Apple Developer + Google Play 가입 ($124/년).

### Phase E — DevOps
GitHub Actions CI (build + typecheck), Sentry 에러 트래킹.

### Phase F — TypeScript / Test
점진적 TS 마이그레이션 (Phase A와 함께). Vitest 단위 테스트 인프라.

---

## 비용 추정 (참고)

### Heavy user API 비용 (Anthropic)
- 매일 30분 대화 + 일기 + 양생방 + 마법의 소라고동 풀가동
- 월 $10–15 (~1.5–2만 원). prompt caching 적용 기준.
- → 100명이면 월 $1500 (~200만 원) API 원가.

### 1년차 1인 단계 외부 비용
- Vercel/Supabase: 거의 free
- Domain: 1.5–3만 원/년
- 변호사 1회 자문: 30–50만 원 (선택)
- Apple Developer: $99/년 (앱 스토어 시)
- Google Play Console: $25 일회성 (앱 스토어 시)
- ISMS / 보안 audit: 의무 X (1년차)
