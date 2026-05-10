# 회전 카드 spec (final)

> 작성: 2026-05-09
> 대상: Claude Code
> 상태: **이 문서가 최종**. `home-redesign-2026-05-09.md` 4절(회전 카드)과 `rotating-card-spec-2026-05-09.md`(v2) 는 deprecated — 충돌 시 **이 문서 우선**.

---

## 0. 빌드 룰 (CLAUDE.md 재확인)

- `src/` 만 수정. `index.html` (root) 와 `public/index.html` 은 빌드 산출물. 직접 편집 금지.
- 매 작업 단위 `npm run build` → `npm run verify` 통과.
- 인라인 `onclick` 526개 의존 → ES module / `import` / `<script type="module">` 금지. 새 함수도 자동 전역.
- 새 파일은 prefix-기반 디렉터리 정렬에 맞춰 배치.

---

## 1. 배경

홈 한가운데 회전 카드 = *분석 자산을 매일 다른 각도로 작게 보여주는 surface*. 사용자 페인 (*"며칠 쓰니 안 들어감, 일상 다리 부족, 매일 도파민 부족"*) 직접 답.

톤 가드: 친구 카톡 톤, 분석 보고서 톤 X. *"힘내 / 화이팅 / 괜찮아질 거야"* 절대 X (anti-sycophancy 룰).

---

## 2. 5 Source 확정

| # | Source | 라벨 | 컨텐츠 변경 주기 |
|---|---|---|---|
| 1 | 🌟 진주 | "오늘의 너" | 4시간 같은 진주 stay |
| 2 | ✨ 새로 본 너 | "있잖아" | 새 인사이트 생길 때 |
| 3 | 📔 미니 리뷰 | "지난 3일" | 3일 stay |
| 4 | 🎯 Quiz | "고동이가 너 얼마나 맞히고 있을까?" | 매일 (4AM cutoff) |
| 5 | 🌗 고동의 운세 | "고동의 운세" | 매일 (lazy fetch) |

폐기된 source: 어제 비교 / 회상 (1년 전 등) / Surprise·기념 / 통찰 (→ 새로 본 너로 흡수). 사유는 §13.

---

## 3. 우선순위 — 미컨펌 우선

### 3-1. 분류

각 source 를 *미컨펌* 또는 *컨펌* 으로 분류:

- **미컨펌**: 사용자가 안 본 새 컨텐츠가 있는 source
- **컨펌**: cooldown 동안 stay 중이고 사용자가 이미 본 컨텐츠

### 3-2. 정렬

```
1. 미컨펌 source 위로 (1순위)
2. 컨펌 source 아래 (2순위)
3. 같은 그룹 안 — baseWeight 순
```

baseWeight:

| Source | baseWeight |
|---|---|
| 미니 리뷰 | 100 |
| 새로 본 너 | 80 |
| Quiz | 70 |
| 고동의 운세 | 50 |
| 진주 (default) | 20 |

특수: 일요일 + 정식 주간 리뷰 도착 → 미니 리뷰 baseWeight 200 격상.

### 3-3. 가용 source 0 인 경우

source 1 의 빈 진주 CTA 단독. 인디케이터 1개. 좌우 화살 비활성.

---

## 4. 세션 lock 룰

### 4-1. "세션" 정의

- **세션 시작** = 홈 화면 진입 시점
- **세션 종료** = 홈 화면 떠난 시점 (다른 탭 / 앱 닫기 / 화면 전환)

### 4-2. 세션 내 동작

```
홈 진입
  ↓
[정렬 알고리즘 — 미컨펌 우선 + score]
  ↓
정렬된 순서 = state.rotatingCardState.sessionOrder 에 stash
  ↓
사용자 좌우 화살 navigate
  ↓
[순서 변경 X — sessionOrder 그대로]
  ↓
사용자 컨펌 액션 (예: [맞아] 누름) → 그 source 컨펌 mark
  ↓
[순서 X 그대로]  ← 핵심
```

세션 동안 컨펌 액션 해도 카드 *순서 자체는 안 바뀜*. 사용자 입장에서 navigate 안정성.

### 4-3. 세션 종료 후 재진입

```
사용자 홈 떠남 → 다시 홈 진입
  ↓
[정렬 알고리즘 재실행]
  ↓
미컨펌 source 위로 (이전 세션 컨펌한 것들 자동 아래)
  ↓
새 sessionOrder stash
```

같은 세션 = 안정, 새 세션 = 안 본 거 우선.

---

## 5. 공통 shell

```
┌──────────────────────────────────────┐
│ [컨텐츠]                              │
│                                      │
│                       [godong 표정]  │
│                                      │
├──────────────────────────────────────┤
│  ‹       ●○○○○        ›              │
└──────────────────────────────────────┘
```

- min-height 통일 (~140px)
- godong 표정 SVG = source 별 다름 (§9). 단 진주 음악/사진/영상 카드는 충돌 방지로 hide.
- 좌우 화살: 이전 / 다음 source 카드
- 인디케이터: 가용 source 5개 중 현 위치 (●○○○○ 등)

---

## 6. Source 별 spec

### 6-1. 🌟 Source 1 — 진주

**컨텐츠**: 사용자 진주 1장 (현 `_pickHeroPearl` + `_heroCardHtml` 그대로 흡수). 음악 / 사진 / 영상 / 텍스트 분기 유지.

**컨펌 정의**: 카드 1번 봄 = 컨펌

**회전 빈도**: 4시간 같은 진주 stay. 이후 다른 진주 (안 본 진주 우선)

**가용 조건**: dna 제외 진주 ≥1

**빈 상태**: 빈 진주 CTA (`_heroEmptyHtml`)

**탭 동작**: 진주 모달 또는 도서관 진주 탭

```
┌──────────────────────────────────────┐
│  [artwork]   Vanilla Days            │
│              LNGSHOT                 │
│              "새벽 카페에서 발견"     │
│              ▶                       │
│              음악 · 5월 3일          │
├──────────────────────────────────────┤
│  ‹       ●○○○○        ›              │
└──────────────────────────────────────┘
```

### 6-2. ✨ Source 2 — 새로 본 너

**컨텐츠**: 새벽 4시 분석에서 detect 된 *worth-mentioning 인사이트 1개*. 두 종류 흡수:
- case formulation 의 traits / values / patterns 새 추가 항목 (정체성 차원)
- 어휘 빈도 / 잠 평균 / 활력 / 모드 카운트 변화 (단기 변화)

**컨펌 정의**: [맞아 ✓] 또는 [아닌데 ✕] 누른 시점

**회전 빈도**: 새 인사이트 생길 때 바뀜. 안 생기면 같은 컨텐츠 stay

**가용 조건**: 미컨펌 새 인사이트 ≥1

**카피 풀** (랜덤 회전, AI 호출 0):
- "있잖아, 너 주말 끝난 월요일에 유독 처지더라. 최근 6번 중 5번이 그래."
- "어 너 패턴 하나 있는 거 알아? 주말 다음 월요일."
- "잠깐 — 너 주말 끝나고 첫 날이 좀 그렇네."
- "어 너 이번 주 'ㅠ' 7번 썼어. 지난 주 2번이었거든."
- "이번 주 잠 평균 짧아졌네 — 5시간 반쯤."

(사용자 명시: "결" 단어 X. *"잔잔한 결"*, *"가벼운 결"* 같은 표현 회피.)

**[맞아 ✓] 동작**:
- 그 항목 user_verified=true (또는 confidence ↑)
- 토스트: "고동이가 너 더 잘 알게 됐어"
- 다음 source 자동 cycle

**[아닌데 ✕] 동작**:
- 그 항목 user_verified=false fix + confidence 50% 감소 (또는 down-weight)
- 토스트: "오케이 다시 볼게"
- 다음 source 자동 cycle

```
┌──────────────────────────────────────┐
│  있잖아              [godong-발견]   │
│                                      │
│  너 주말 끝난 월요일에                │
│  유독 처지더라.                      │
│  최근 6번 중 5번이 그래.             │
│                                      │
│  ● ● ● ● ● ○      ← evidence 시각화 │
│                                      │
│  [맞아 ✓]  [아닌데 ✕]                │
├──────────────────────────────────────┤
│  ‹       ○●○○○        ›              │
└──────────────────────────────────────┘
```

### 6-3. 📔 Source 3 — 미니 리뷰

**컨텐츠**: Haiku 1턴 호출로 생성된 *지난 3일 한 단락* (탭 시 모달)

**trigger 조건**:
- (마지막 미니 리뷰 ≥3일 전) AND (체크인 ≥2 OR chat ≥8 turn OR 미션 ≥1)
- OR 토요일 18시 이후 + 일요일 정식 주간 리뷰 trigger 전

**컨펌 정의**: 본문 탭 → 모달 열어본 시점

**회전 빈도**: 3일 같은 리뷰 stay. 다음 trigger 시 새 생성

**가용 조건**: trigger 조건 만족 + 미컨펌

**비용**: Haiku 1턴 ~$0.001 / 탭

**탭 동작**: Haiku 호출 → 모달 1장 (한 단락 + 닫기). dismiss 시 다음 trigger 까지 skip.

**Haiku 실패 시**: 모달에 "지금은 못 정리하겠어, 다시" + 재시도 버튼. 카드 자체는 stay (이전 미니 리뷰 있으면).

**카피 풀** (카드 표면, 모달 안 단락은 매번 Haiku 생성):
- "지난 3일 어땠어? 짧게 한 번 짚어볼까."
- "이 3일 — 같이 한 번 보자."
- "화·목 어떻게 지나갔는지 정리해줄까?"

```
┌──────────────────────────────────────┐
│  지난 3일          [godong-정리중]   │
│                                      │
│  화·목 어떻게 지나갔는지              │
│  같이 한 번 보자.                    │
│                                      │
│   · · ·   ← 활력 점 3개 mini chart   │
│                                      │
│                       지금 보기 ›    │
├──────────────────────────────────────┤
│  ‹       ○○●○○        ›              │
└──────────────────────────────────────┘
```

### 6-4. 🎯 Source 4 — Quiz

**라벨**: "고동이가 너 얼마나 맞히고 있을까?"

**컨텐츠**: case formulation 의 user_verified=false 항목 *5개 random pick* → 한 카드 안 N 질문 묶음

**생성 시점**: 그날 첫 quiz 진입 시 random pick → stash. 같은 날 재진입 = stash 이어서. 다음날 (4AM cutoff 후) 새 5 pick.

**가드** (4개):

1. **신규 user**: case formulation 항목 < 1 → quiz source 비활성. 사용자 입장에서 자연스럽게 안 보임.

2. **항목 적합도**: pick pool 에서 *추상 trait* 제외. quiz 적합 = *구체 / 관찰 가능* 항목만 (예: "야행성", "마감 7일 전 카페인 ↑", "주말 다음 월요일 처짐"). 추상 trait ("깊이 보는 사람", "신중한 성향") 제외. 적합도 flag 또는 length / specificity 기반 자동 분류.

3. **dedupe**:
   - [맞아] 한 항목 → user_verified=true → 자동 제외
   - [아닌데] 한 항목 → 14일 cooldown (다시 안 등장)
   - [넘기기] 한 항목 → 1일 cooldown

4. **가용 항목 < 5**: 있는 만큼만 (예: 3 → [1/3]). 다 답하면 컨펌.

**컨펌 정의**: 5개 (또는 가용 항목 수) 모두 답한 (또는 [넘기기] 한) 시점

**진행 stash**: 도중에 외부 화살로 다른 source 가도 진행 상태 (`questionIds`, `currentIdx`, `answers`) stash. 다시 quiz 오면 이어서.

**카드 layout (질문 진행 중)**:

```
┌──────────────────────────────────────┐
│ 🎯  고동이가 너 얼마나 맞히고 있을까? │
│                                      │
│  [1/5]                               │
│                                      │
│  너 야행성이지?                       │
│                                      │
│  [맞아 ✓]  [아닌데 ✕]  [넘기기 →]    │
│                                      │
│              ●○○○○    ← 카드 내부    │
├──────────────────────────────────────┤
│  ‹       ○○○●○        ›              │
└──────────────────────────────────────┘
```

**카드 내부 미니 회전**: 답 → 자동 advance + 카드 안 작은 좌우 화살로 이전 질문 가능. 외부 큰 화살은 *다른 source* 로.

**액션 동작**:
- [맞아 ✓]: user_verified=true + 다음 질문 자동 advance + 짧은 토스트 ("고동이 +1")
- [아닌데 ✕]: confidence 50% 감소 + user_verified=false fix + 14일 cooldown stash + 다음 질문 advance + 토스트 ("오케이 다시 볼게")
- [넘기기 →]: 답 안 함 + 1일 cooldown stash + 다음 질문 advance

**끝 화면** (5개 다 끝나면 같은 카드 자리에):

```
┌──────────────────────────────────────┐
│ 🎯  고동이 점수    [godong-신남]     │
│                                      │
│  오늘 4개 맞히고 1개 빗나감.         │
│                                      │
│  고동이가 너 알아간 점수             │
│       67% → 71%                      │
│                                      │
│  [좋아]                              │
├──────────────────────────────────────┤
│  ‹       ○○○●○        ›              │
└──────────────────────────────────────┘
```

누적 점수 = 전체 case formulation 항목 중 user_verified=true 비율. 한 칸 오르는 게 dopamine.

[좋아] 누르면 컨펌 + 다음 source 자동 cycle.

### 6-5. 🌗 Source 5 — 고동의 운세

**라벨**: "고동의 운세" (오하아사 단어 X — 정직성)

**데이터 source**: [Free Horoscope API (Vercel)](https://horoscope-app-api.vercel.app/) — 완전 무료, API key 불필요, 12 별자리 daily horoscope endpoint

**처리 흐름**:

```
사용자 진입
  ↓
[별자리 미설정?] → 별자리 onboarding 카드 (§6-5-1)
  ↓
[lazy fetch — 마지막 fetch 시간 < 오늘 09:00 KST?]
  ├─ Yes → API fetch
  │   ├─ 성공 → Haiku 1턴 한국어 + 친구 톤 변환
  │   │   ├─ 성공 → state.rotatingCardState.lastHoroscopeFetch stash + 카드 표시
  │   │   └─ 실패 → source 비활성
  │   └─ 실패 → source 비활성
  └─ No → stash 된 운세 표시
```

**컨펌 정의**: 카드 1번 봄

**회전 빈도**: 매일 (lazy fetch — 09:00 KST 이후 첫 진입 시 자동 fetch)

**가용 조건**: 별자리 설정됨 + 오늘 fetch 성공 (API + Haiku 둘 다)

**비용**: Haiku 1턴 ~$0.0005 / 사용자 / 일

**API 실패 시**: source 비활성 (이전 운세 stay X — 정직)

**Haiku 실패 시**: source 비활성 (영어 raw 표시 X)

**일요일 / 주말**: API 가 매일 갱신하니까 issue 없음 (오하아사 일본 방송 timing issue 와 무관)

#### 6-5-1. 별자리 onboarding

별자리 미설정 시 매 홈 진입마다 onboarding 카드 (skip 가능):

```
┌──────────────────────────────────────┐
│ 🌗  너의 별자리?                      │
│                                      │
│   ♈ 양자리   ♉ 황소자리              │
│   ♊ 쌍둥이   ♋ 게자리               │
│   ♌ 사자자리 ♍ 처녀자리              │
│   ♎ 천칭자리 ♏ 전갈자리              │
│   ♐ 사수자리 ♑ 염소자리              │
│   ♒ 물병자리 ♓ 물고기자리            │
│                                      │
│   [건너뛰기]                          │
├──────────────────────────────────────┤
│  ‹       ○○○○●        ›              │
└──────────────────────────────────────┘
```

선택 → `state.preferences.userZodiac` 에 stash. 이후 매일 fetch.

[건너뛰기] → 그 세션 동안 source 비활성. 다음 세션 진입 시 다시 onboarding (사용자 명시: 매번).

별자리 변경: 설정 화면 → 별자리 항목.

#### 6-5-2. 카드 layout

```
┌──────────────────────────────────────┐
│ 🌗  고동의 운세                       │
│                                      │
│       ♓ 물고기자리                   │
│                                      │
│  오늘은 새 만남보다 익숙한 곁이        │
│  좋은 날. 오후 3시쯤 작은 신호를       │
│  놓치지 마.                          │
│                                      │
│   행운: 따뜻한 차 한 잔                │
│                                      │
├──────────────────────────────────────┤
│  ‹       ○○○○●        ›              │
└──────────────────────────────────────┘
```

- 행운 / 조심: API 가 제공하면 표시, 안 주면 생략
- 카드 본문 = Haiku 가 영어 → 한국어 + 친구 톤 변환한 한 단락
- 톤 가이드: 친구 톤이지만 살짝 신비롭게 OK (운세 특성). 단 분석 / 진단 단어 X.

#### 6-5-3. Haiku 변환 prompt 가이드

영어 horoscope → 한국어 변환 시 prompt 톤 가이드:
- 친구 카톡 톤
- 분석 보고서 톤 X
- "힘내 / 화이팅" X
- 평가성 X
- 살짝 신비로운 어휘 OK (운세 특성)
- 길이: 3-4 문장
- 행운 / 조심 한 줄씩 (API 데이터 있으면)

---

## 7. 데이터 모델 (state.rotatingCardState)

| 필드 | 용도 |
|---|---|
| `sessionOrder` | 현 세션 source 순서 array |
| `sessionStartAt` | 세션 시작 timestamp |
| `confirmedSources` | 컨펌된 source list |
| `pearlWindowStart` | 진주 4시간 windowing 시작 |
| `pearlCurrentId` | 4시간 stay 진주 id |
| `lastMiniReviewAt` | 미니 리뷰 마지막 생성 시점 |
| `quizProgress` | quiz 진행 상태 (`{questionIds, currentIdx, answers}`) |
| `quizDay` | quiz 5 pick 이 만들어진 날짜 (4AM cutoff 비교용) |
| `quizDeniedCooldown` | [아닌데] 한 항목 cooldown stash |
| `quizSkippedCooldown` | [넘기기] 한 항목 cooldown stash |
| `lastHoroscopeFetch` | 운세 마지막 fetch timestamp |
| `lastHoroscopeContent` | 운세 마지막 텍스트 (Haiku 변환 결과) |
| `unseenInsights` | 새로 본 너 미컨펌 인사이트 큐 |
| `unseenInsightsHistory` | 컨펌된 인사이트 (재등장 X) |

기타:
- `state.preferences.userZodiac` — 별자리 (`'aries'` ... `'pisces'` 또는 `null`)

---

## 8. 인터랙션 정리

| 액션 | 동작 |
|---|---|
| 홈 진입 | 정렬 → 1순위 카드 표시 |
| 좌우 화살 ‹ › | 이전 / 다음 source. 순서 sessionOrder 그대로 |
| 카드 본문 탭 | source 별 (진주 모달 / 어제 entry / 모델 / 미니 리뷰 모달 / 도서관) |
| 새로 본 너 [맞아] | user_verified=true + 토스트 + auto-cycle |
| 새로 본 너 [아닌데] | confidence ↓ + 토스트 + auto-cycle |
| Quiz 카드 안 ‹ › | 같은 source 안 이전 / 다음 질문 |
| Quiz [맞아] / [아닌데] / [넘기기] | 다음 질문 자동 advance |
| Quiz 끝 화면 [좋아] | 컨펌 + auto-cycle |
| 미니 리뷰 본문 탭 | Haiku 호출 + 모달 |
| 별자리 chip 선택 | preferences stash + fetch 시작 |

자동 fade 회전 X — 좌우 화살만.

---

## 9. godong 표정 variant

| 표정 | 사용 source |
|---|---|
| 빛나는 (default) | 진주 |
| 발견 / 눈 반짝 | 새로 본 너 |
| 정리 중 | 미니 리뷰 |
| 게임 / 호기심 | Quiz (질문 중) |
| 신남 | Quiz 끝 화면 |
| 신비 (살짝) | 고동의 운세 |

1차 구현 시 모두 `/godong.webp` (default) 로 두고 자리만 reserve. 일러스트 추가되면 mapping 만 교체. 후속 작업.

---

## 10. Edge case / Bug 가드

| 상황 | 동작 |
|---|---|
| 모든 source 비활성 (신규 1일차) | source 1 빈 진주 CTA 단독. 인디케이터 1개. 좌우 화살 비활성 |
| 진주 0 + 다른 source 가용 | source 1 자리 빈 진주 CTA, 다른 source 가 default |
| 가용 source 1개 | 좌우 화살 비활성, 인디케이터 1개 |
| Quiz 가용 항목 < 5 | 있는 만큼만 ([1/3] 등) |
| Quiz 가용 항목 0 | source 비활성 |
| 별자리 미설정 | onboarding 카드. [건너뛰기] 시 그 세션 비활성 |
| 운세 API 실패 | source 비활성 |
| 운세 Haiku 실패 | source 비활성 |
| 미니 리뷰 Haiku 실패 | 카드 stay (이전 리뷰 있으면), 모달 안 재시도 버튼 |
| 4AM cutoff 직후 진입 | 새 quiz 5 pick + 기타 source 미컨펌 우선 |
| 컨펌 안 하고 닫음 | 미컨펌 유지, 다음 세션 우선 등장 |
| 같은 세션 좌우 화살 여러 번 | sessionOrder 그대로, 위치만 변경 |
| Quiz 진행 도중 외부 화살로 나감 | 진행 stash, 다시 와서 이어서 |
| 진주 음악 ▶ vs 카드 swipe | event.stopPropagation (▶ 우선) |

---

## 11. 비용

| Source | 비용 |
|---|---|
| 진주 | $0 |
| 새로 본 너 | $0 (분석 결과 reuse) |
| 미니 리뷰 | Haiku 1턴 ~$0.001 (탭 시만) |
| Quiz | $0 (case formulation random pick) |
| 고동의 운세 | Haiku 1턴 ~$0.0005 (매일 1회) |

총: 사용자당 월 ~$0.018. 사용자 1만명 가정 월 $180.

---

## 12. 친구 톤 가드 (전 source 공통)

1. 분석 보고서 톤 X → 친구 화법
2. "힘내" / "화이팅" / "괜찮아질 거야" 절대 X
3. 평가성 칭찬 ("잘했어", "대단해") X. 관찰 ○
4. 분석명 / 진단명 직접 명시 X (Barkley / Gollwitzer 등 회전 카드 자리 X)
5. 이모지 1-2개. 🐚 가끔
6. 사용자 어휘 그대로 인용 가능
7. 같은 source 매번 살짝 다른 표현 (카피 풀 5-8개)
8. **"결" 단어 X** (사용자 명시 — *"잔잔한 결"*, *"가벼운 결"* 같은 표현 회피)

근거: SYSTEM_PERSONA 1-13 절대 원칙 + introduce.html 톤.

---

## 13. 안 하는 것 (의도적 제외)

- **어제 비교 source** — 회고 전용으로 들어가서 정보가 얇음 + 사용자 신선도 X
- **회상 (1년 전 / N개월 전) source** — 데이터 두꺼운 사용자만 의미 있고, 1년 미만 user 에선 가용 X
- **Surprise / 기념 source** — streak 압박 risk + 사용자 명시 X
- **통찰 source** — *새로 본 너* 에 흡수 (사용자 진단대로 겹침)
- **진주 후보 자동 추출** — AI 자동 추출 정확도 risk
- **오늘 한 가지 (마이크로 챌린지)** — 훈수 톤
- **심리테스트 (양자택일 → 결과 라벨)** — 초기 검토 후 폐기
- **오하아사 공식 데이터 fetch** — timing 일관성 X (일본 방송 5-8시 KST 갱신, 일요일 X). horoscope API + Haiku 로 대체.
- **순위 (1-12)** — 영어 horoscope API 에 없음. 폐기.
- **회전 카드 안 ▾ 더보기 toggle** — 페기
- **자동 fade 회전** — 사용자 화살만
- **chat 다리 footer** — 페기
- **세로 swipe gesture** — 좌우 화살만
- **헤더 corner ✦N badge** — 사용자 거부

---

## 14. 검증 / 완료 기준

- [ ] 5 source 다 가용 시 진입 시 미컨펌 source 가 위 (첫 카드)
- [ ] 컨펌 액션 후에도 같은 세션 sessionOrder 변경 X
- [ ] 다른 탭 → 홈 재진입 시 미컨펌 우선으로 재정렬
- [ ] 진주 4시간 같은 진주 stay
- [ ] 미니 리뷰 3일 같은 리뷰 stay
- [ ] Quiz 카드 안 N 질문 미니 회전 (자동 advance + 카드 내부 인디케이터)
- [ ] Quiz 진행 도중 외부 화살 → 다시 quiz 오면 이어서
- [ ] Quiz 4 가드 (신규 X / 추상도 / dedupe / 4AM 첫 진입) 작동
- [ ] 새로 본 너 [맞아/아닌데] → user_verified flag 업데이트
- [ ] 별자리 미설정 시 매 진입 onboarding (skip 가능)
- [ ] 운세 lazy fetch (09:00 KST 이후 첫 진입 시)
- [ ] 운세 API / Haiku 실패 시 source 비활성
- [ ] 친구 톤 가드 통과 (분석 보고서 톤 X, "결" 단어 X)
- [ ] 빈 데이터 user (신규 1일차) → source 1 빈 진주 CTA 단독 + crash X
- [ ] godong 표정 mapping 작동 (1차 모두 default 로 OK)
- [ ] `npm run build` + `npm run verify` 통과

---

## 15. 자주 만지는 파일 (참조)

| 변경 | 파일 |
|---|---|
| 홈 zone 구조 | `src/body/app-shell.html` (`#rotatingCardContainer`) |
| 회전 카드 메인 로직 | `src/scripts/main/10-home/0X-rotation-card.js` (신규) |
| 진주 hero (source 1) | `src/scripts/main/23-archive/03-todays-pearl-rotation.js` (reuse) |
| 새로 본 너 detect | `src/scripts/main/30-force-analyze.js` (분석 후 stash) |
| 미니 리뷰 (source 3) | `src/scripts/main/27a-mini-review.js` (신규) |
| Quiz (source 4) | `src/scripts/main/10-home/0X-quiz.js` (신규) |
| 고동의 운세 (source 5) | `src/scripts/main/10-home/0X-horoscope.js` (신규) + Haiku call |
| 별자리 onboarding | 같은 파일 안 |
| godong 표정 SVG variant | CSS / SVG asset |
| CSS 추가 | `src/styles/09-misc.css` |
| 시스템 프롬프트 (톤 가드 참조) | `src/scripts/main/20-system-prompt.js` |
| 설정 — 별자리 변경 | `src/scripts/main/31-settings.js` |

---

## 16. 결정 이력 (참고)

이 spec 까지 오는 데 사용자 거친 결정들:

1. 7 source → 6 source → **5 source** 로 점진 축소
2. 어제 비교 / 회상 / Surprise 폐기 (회고 색 너무 강함)
3. 통찰 → 새로 본 너 흡수 (겹침)
4. 진주 후보 / 오늘 한 가지 / 심리테스트 폐기 (각자 사유)
5. quiz 도입 (게임 결 + AI 학습 가시화)
6. 오하아사 공식 데이터 폐기 → horoscope API + Haiku
7. 순위 (1-12) 폐기 (영어 API 에 없음)
8. 라벨: "오늘의 오하아사" → **"고동의 운세"**
9. API 실패 / Haiku 실패 시 모두 **source 비활성** (정직)
10. 별자리 미설정 시 매번 onboarding (skip 가능)
11. quiz 4 가드 추가
12. 카드 내부 미니 회전 (quiz)
13. 미컨펌 우선 정렬 + 세션 lock
14. 자동 fade 회전 X, swipe 도 X — 좌우 화살만
15. "결" 단어 안 씀 (사용자 명시)
