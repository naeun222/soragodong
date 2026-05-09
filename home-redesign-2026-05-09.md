# 홈 화면 개편 스펙

> 작성: 2026-05-09
> 대상: Claude Code
> 컨텍스트: 사용자(개발자 본인)와의 대화에서 결론 도출. 부산스럽지 않게 + 매일 도파민 + 친구 톤 유지.

---

## 0. 빌드 룰 (필수, CLAUDE.md 재확인)

- `src/` 만 수정. `index.html` (root) 와 `public/index.html` 은 빌드 산출물. 직접 편집 금지.
- 매 작업 단위마다 `npm run build` → `npm run verify` 통과 확인.
- 인라인 `onclick` 526개 의존 → ES module / `import` / `<script type="module">` 금지. 새 함수도 자동 전역 함수.
- 새 파일은 기존 prefix-기반 디렉터리 정렬에 맞춰 배치.

---

## 1. 배경 — 왜 개편하는가

### 1-1. 사용자 페인 (개발자 본인 보고)

> *"며칠 쓰다 보니까 잘 안 들어가게 돼. 고민 있을 때는 유용한데, 소라고동한테 할 말이 없어. 일상을 털어놓아야 되는데 그 연결다리가 좀 부족한 느낌. 살짝 매일매일 즉각적으로 받는 도파민이 좀 부족한 거 같아."*

### 1-2. 핵심 진단

이 앱은 분석 엔진(case formulation / traits / values / patterns / deep profile)이 매우 강한데, 그 결과를 매일 사용자에게 흘려주는 surface 가 부족. 사용자가 input 하는 빈도(체크인·대화·미션) ≫ feedback 받는 빈도(분석 1일 1회·주간 리뷰 1주 1회). 이 비대칭이 도파민 결핍의 정체.

해결 방향: **이미 만든 자산을 매일 다른 angle 로 작게 보여주는 surface(회전 카드)를 홈 한가운데에 둔다.** 새 기능 X · 분석 빈도 ↑ X · 비용 ↑ X.

### 1-3. 톤 가드

소라고동의 정체성 = "앞에서는 친구, 뒤에서는 임상가"(`src/scripts/main/20-system-prompt.js` SYSTEM_PERSONA 참조). 모든 새 카피는 친구 톤:
- 분석 보고서 톤 X → 친구 카톡 톤 ○
- "힘내" / "화이팅" / "괜찮아질 거야" 절대 X (anti-sycophancy 룰)
- 이모지 1-2개. 🐚 가끔. 부담스럽지 X.

---

## 2. 현재 홈 구조 (변경 전)

`src/body/app-shell.html` 14-54줄.

| 순서 | 컨테이너 | 조건 |
|---|---|---|
| 1 | `.greeting` | 항상 |
| 2 | `#reviewPromptsContainer` | 일요일 + 데이터 있음 |
| 3 | `#predictionFollowupsContainer` | 결정 예측 followup 시점 |
| 4 | `#activeDecisionsContainer` | 결정 액션데이 (3/5/7/10/14) |
| 5 | `#yesterdayCardContainer` | 어제 체크인 다음날 1회 |
| 6 | `#mainActionContainer` | 항상 (진주 hero + 체크인 카드 stack) |
| 7 | `#missionContainer` | 미션 있을 때 |
| 8 | `#reflectionContainer` | 항상 (active or empty) |
| 9 | `.home-small-row` | 항상 (셸 컬렉션 + 마법고동 미니) |

문제: 조건부 prominent 카드 5종(2-6)이 동시에 켜질 수 있어 zone 8-9개 가능. 평일도 5-7. 부산스러움 source.

---

## 3. 새 홈 구조

### 3-1. layout

```
┌──────────────────────────────────────┐
│ 헤더 (변경 X)                        │
├──────────────────────────────────────┤
│  좋은 아침,                          │ ← greeting (변경 X)
│  나은 ✦                              │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🌟 오늘의 너   🐚 12   . ✦ . . . │ │ ← 회전 카드 (NEW)
│ │ ─────────────────────────────    │ │
│ │  [현재 source 본문]              │ │
│ │                          ›       │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🐚 소라의 부름                   │ │ ← 미션 (swipe-left dismiss 추가)
│ │ "마감 알람 설정"                 │ │
│ │ [✓ 해냈어]  [패스]              │ │
│ └──────────────────────────────────┘ │
│                                      │
│  ✓ 오늘 기록 완료              ›     │ ← 체크인 미니 (NEW: 완료 시)
│                                      │
│ ┌─────────┐  ┌─────────────────┐    │ ← small row
│ │ 🐚      │  │ [godong.webp]   │    │
│ │ 12 모았어│  │ 마법고동        │    │
│ │ 보기 →  │  │ 2 안고 있어 →   │    │
│ └─────────┘  └─────────────────┘    │
│                                      │
├──────────────────────────────────────┤
│ 🏠   🐚   🚀   🔮   📚               │ ← bottom nav (변경 X)
└──────────────────────────────────────┘
```

### 3-2. zone 매핑 (변경 전 → 변경 후)

| 변경 전 | 변경 후 |
|---|---|
| reviewPromptsContainer | 회전 카드 source 4(미니 리뷰)로 흡수. 정식 주간 리뷰 도착 시 source 4 prominent stay |
| predictionFollowupsContainer | 회전 카드 source 6(통찰)로 흡수 |
| activeDecisionsContainer | small row 마법고동 카드 안 카운트로 흡수 |
| yesterdayCardContainer | 회전 카드 source 2(어제 비교)로 흡수 |
| mainActionContainer | 진주 hero → 회전 카드 source 1로 이동. 체크인은 미완 시 큰 카드 / 완료 시 한 줄 미니 |
| missionContainer | 유지 + swipe-left dismiss 추가 |
| reflectionContainer | **폐기** (빈 카드 X). 활성 숙고는 마법고동 카드에 통합 카운트 |
| home-small-row | 유지하되 마법고동 카드 변경 (godong.webp + 카피) |

### 3-3. 평소 zone 수

| 상황 | zone |
|---|---|
| 평일, 다 했음, 마법 X | 인사 / 회전 / 체크인 미니 / small row = **4** |
| 평일 아침, 체크인 미완, 미션 있음 | 인사 / 회전 / 미션 / 체크인 큰 카드 / small row = **5** |
| 일요일 + 미니 리뷰 trigger | 인사 / 회전(주간 리뷰 stay) / 미션 / 체크인 미니 / small row = **5** |
| 결정 + 숙고 active | 인사 / 회전 / 미션 / 체크인 미니 / small row(활성) = **5** |
| 최악 (다 켜짐) | **5-6** |

지금 8-9 → 새 5-6. 25-50% 감소.

---

## 4. 🌟 회전 카드 — "오늘의 너" 풀 spec

### 4-1. 콘셉트

홈 한가운데 한 카드. 진입 시마다 1장 freshly picked. 사용자가 카드 안에서 세로 swipe 시 다음 source 카드. 자동 fade 회전 X (부산스러움 우려). 6 source + 1 surprise = 7 source 가 한 자리에서 우선순위 + 신선도로 회전.

라벨: **🌟 오늘의 너** (현 진주 hero 의 라벨 차용 — 사용자에게 익숙함)

### 4-2. 7 Source 정의

#### Source 1 — 진주 (default, 거의 항상 가용)

현 `src/scripts/main/23-archive/03-todays-pearl-rotation.js` 의 `_pickHeroPearl` + `_heroCardHtml` 그대로 흡수. 음악/사진/영상/텍스트 분기 유지. 변경 X.

가용 조건: dna 제외 진주 ≥1
빈 상태: 현 `_heroEmptyHtml` 로 fallback ("첫 진주 추가" CTA)
탭: 진주 모달 또는 도서관 진주 탭

```
🌟 오늘의 너          🐚 12  ●·····

  [artwork]   Vanilla Days
              LNGSHOT
              "새벽 카페에서 발견"
              ▶
              음악 · 5월 3일
```

#### Source 2 — 어제 비교

가용 조건: 어제 entry 존재 + (활력/기분/메모/잠 중 ≥1 채워짐)

비교 항목 (가장 변화 큰 1-2개 자동 선택):
- 잠 시간 vs 최근 14일 평균 (1시간 이상 차이일 때만)
- 활력 / 기분 vs 평균 (1점 이상 차이)
- 메시지 양 (chat turn) — 평소보다 ↑ 또는 ↓
- 진주 추가 — 어제 새 진주 ≥1
- 모드 — 어제 새 모드 활성

카피 풀 (랜덤 회전, AI 호출 0):
- "어제 5시간 반밖에 못 잤네. 너 보통 6시간 반쯤 자거든."
- "어 너 어제 잠 진짜 짧았더라."
- "5시간 반... 어제 좀 무리했어?"
- "어제 잠 막대 한 시간쯤 잘렸어."

탭: 어제 entry 화면 (현 yesterdayCard 진입 동작 reuse)

```
🌟 오늘의 너          🐚 12  ·●····

  어제                  [godong-걱정]

  어제 5시간 반밖에 못 잤네.
  너 보통 6시간 반쯤 자거든.

  ▓▓▓▓▓░  어제                       ← mini visual
  ▓▓▓▓▓▓▓  평소
                          어제 보기 ›
```

#### Source 3 — 새로 본 너 (case formulation 변경)

가용 조건: 마지막 4AM 분석 결과로 traits/values/patterns/case formulation 에 새 추가 항목 ≥1.

detect 방법: 새벽 분석 후 직전 분석 시점의 항목 id 목록과 비교 → 새 id 가 있으면 그 항목을 이 source 컨텐츠로 stash.

카피 풀:
- "있잖아, 너 주말 끝난 월요일에 유독 처지더라. 최근 6번 중 5번이 그렇더라."
- "어 너 패턴 하나 있는 거 알아? 주말 다음 월요일."
- "잠깐 — 너 주말 끝나고 첫 날이 좀 그렇네."

탭: 나 탭(model 화면) + 해당 항목 highlight

```
🌟 오늘의 너          🐚 12  ··●···

  있잖아              [godong-발견]

  너 주말 끝난 월요일에
  유독 처지더라.
  최근 6번 중 5번이 그래.

                          나 탭 ›
```

#### Source 4 — 미니 리뷰 (3일 / 주말)

가용 조건:
- (마지막 미니 리뷰로부터 ≥3일) AND (체크인 ≥2 OR chat turn ≥8 OR 미션 ≥1 since)
- OR 토요일 저녁(18시 이후) + 일요일 정식 주간 리뷰 trigger 전

카피 풀:
- "지난 3일 어땠어? 짧게 한 번 짚어볼까."
- "이 3일 — 같이 한 번 보자."
- "화·목 어떻게 지나갔는지 정리해줄까?"

탭 시 동작: Haiku 1턴 호출 (~$0.001) → 모달 1장("이 3일의 너 — 한 단락"). Stories 형식 X (가볍게). dismiss 시 다음 trigger 까지 skip.

특수: 일요일 + 정식 주간 리뷰 도착 시 score 격상 → swipe 비활성, 이거부터 prominent stay.

```
🌟 오늘의 너          🐚 12  ···●··

  지난 3일           [godong-정리중]

  화·목 어떻게 지나갔는지
  같이 한 번 보자.

  · · ·  ← 활력 점 3개 mini chart
                          지금 보기 ›
```

#### Source 5 — 회상

가용 조건 (우선순위 순):
1. 정확히 1년 전 오늘 entries / chatArchive exact match
2. 3개월 전 / 6개월 전
3. 3주 전 / 12주 전

매칭 룰: `todayKey()` 의 4AM cutoff 기준으로 N년/월/주 전 날짜 계산. 윤년 가드 (월/일 재검증). 매칭 entry 의 가장 dramatic 한 한 줄 (note 첫 50자 또는 chatArchive summary).

카피 풀:
- "이거 1년 전에 너가 쓴 거 — \"...\""
- "1년 전 오늘 너 — \"...\" 라고 썼더라"
- "어 이거 1년 전 너 한 줄."

탭: 도서관 → 해당 day modal

```
🌟 오늘의 너          🐚 12  ····●·

  1년 전 오늘         [godong-그리움]

  "오늘 또 연구실 가기 싫어서
   인스타 2시간 봤어 ㅠ"

  — 너가 쓴 한 줄
                          그날 보기 ›
```

#### Source 6 — 통찰 한 줄

가용 조건: 새벽 분석에서 worth-mentioning 변화 1-2개 detect.

template 매칭(LLM 호출 0):
- 어휘 빈도 변화 ("ㅠ", "안 돼", "몰라", "좋아" 등 7-10 keyword)
- 잠 평균 변화 (지난 주 vs 이번 주, 30분 이상 차이)
- 활력 평균 변화 (1점 이상)
- 모드 카운트 변화 (마감/방전/휴식)
- 미션 깬 횟수 변화

새벽 분석 시 위 비교 → 가장 변화 큰 1-2개 stash.

카피 풀:
- "어 너 이번 주 'ㅠ' 7번 썼어. 지난 주 2번이었거든. 잠도 짧고."
- "이번 주 'ㅠ' 좀 자주 등장. 평소보다 3.5배."
- "너 이번 주 좀 지친 듯 — 단어가 그렇게 나와."

탭: 나 탭 또는 도서관 통찰 탭

```
🌟 오늘의 너          🐚 12  ·····●

  이번 주 너         [godong-진지]

  "ㅠ" 7번 등장.
  지난 주 2번이었거든.

  ㅁ ㅁ █ ▆ █  ← 4주 sparkline
                            자세히 ›
```

#### Source 7 — Surprise / 기념 (가끔, novelty)

trigger 조건 (각 1번 표시 후 dismiss stash):
- 함께한 N일 째 (30·60·100·180·365·500·1000)
- 첫 진주 N일 째 (30·90·180·365)
- 분기 셸 30개 / 50개 도달
- 미션 5연속 ✓
- 새 단어 N개 등장 (이번 주 unique noun 12개 이상)
- 14일 연속 일일 진입

각 milestone 한 번 표시 후 다시 X.

카피 풀:
- "100일 함께야 🐚"
- "너의 첫 진주가 한 달 됐어"
- "이번 분기 30번 깼어 (소라 30개)"
- "마지막 미션 5연속 ✓"
- "너의 단어 사전 — 새 단어 12개 등장"
- "14일 연속 매일 한 번 들렀어"

탭: 도서관 / 또는 모달 1장(해당 milestone 의 작은 회상)

```
🌟 오늘의 너          🐚 12

                      [godong-신남]

           100일 함께야

  첫 대화부터 오늘까지.

                          도서관 ›
```

### 4-3. Score / 우선순위 (산문)

각 source 마다 baseWeight:
- 미니 리뷰 도래: 100 (시점 sensitive)
- surprise: 90 (novelty)
- 새로 본 너: 80 (어제 새 분석)
- 통찰 한 줄: 60
- 회상: 50 (정확 match)
- 어제 비교: 40
- 진주 (default): 20

거기에 freshness (최근 본 같은 source 면 -10), variety bonus (이번 주 가장 적게 본 source 면 +10) 가산. 가장 높은 score 가 default first. 사용자 swipe 시 score 순 다음.

특수: 일요일 + 정식 주간 리뷰 도착 = source 4 의 baseWeight 200 격상, swipe 비활성.

### 4-4. 인터랙션

- 진입 → score 1위 카드 즉시 표시
- 세로 swipe → 다음 source (score 순). 가용 source 1개면 swipe 비활성
- 탭 본문 → 해당 화면/모달
- 인디케이터: 모래알/별 모티프 ( . ✦ . . . . ). 7 source 슬롯 중 가용한 것만 ✦, 비활성은 흐릿하게

좌우 swipe X — 미션 카드 swipe-dismiss(좌)와 충돌 가능. 세로 only.

### 4-5. 신선도 / dedupe

- 같은 source 의 같은 콘텐츠 hash → 14일 안 다시 표시 X
- 진주 source 는 현 `_libHeroSeen` 로직 유지
- surprise source dismiss 시 재등장 X
- 미니 리뷰 dismiss 시 다음 trigger 까지 skip

### 4-6. Edge case / Bug 가드

| 상황 | 동작 |
|---|---|
| 모든 source 비활성 (신규 1일차) | source 1 빈 진주 CTA 단일. 인디케이터 1개. swipe 비활성 |
| 진주 0 + 다른 source 가용 | source 1 자리 빈 진주 CTA, 다른 source 가 default |
| 가용 source 1개 | swipe 비활성, 인디케이터 1개 |
| 어제 sosSkipped | source 2 비활성 (비교 데이터 X) |
| 회상 윤년 케이스 | 월/일 재검증, 매칭 실패 시 source 비활성 |
| 미니 리뷰 Haiku 호출 실패 | 모달에 "지금은 못 정리하겠어, 다시 시도" + 재시도 |
| 카드 안 음악 ▶ vs swipe gesture | event.stopPropagation 처리 |
| 미션 swipe 좌 vs 회전 카드 swipe 세로 | touchstart 첫 30px 방향으로 lock, 충돌 X |
| state.preferences 미초기화 | 모든 read 안전 가드 |
| score 계산 NaN/undefined | 항목별 Number 가드 |
| swipe 시 가용 source array 빈 경우 | swipe X (modulo 안 함) |

### 4-7. Mini visual

각 source 본문 안 작은 visual:

| Source | Visual |
|---|---|
| 1 진주 | 기존 SVG (변경 X) |
| 2 어제 | 잠 막대 2개 (어제 vs 평균) 또는 활력 점 비교 |
| 3 새로 본 너 | 작은 ✦ pulse |
| 4 미니 리뷰 | 활력 점 3개 + 기분 점 3개 |
| 5 회상 | 인용 quotation mark large |
| 6 통찰 | 4주 sparkline |
| 7 surprise | 큰 ✦ + halo |

복잡한 차트 라이브러리 X. inline SVG 충분.

### 4-8. godong.webp variant (작은 표정)

`/godong.webp` 이미지 헤더에서 이미 사용 중. variant 추가 (후속 일러스트 작업):

| 표정 | 사용 source |
|---|---|
| 빛나는 (default) | 1 진주 |
| 살짝 걱정 | 2 어제 |
| 발견 / 눈 반짝 | 3 새로 본 너 |
| 정리 중 | 4 미니 리뷰 |
| 그리움 / 살짝 미소 | 5 회상 |
| 진지 | 6 통찰 |
| 신남 | 7 surprise |

1차 구현 시 모두 `/godong.webp`(default)로 두고 자리만 reserve. 일러스트 추가되면 source 별 mapping 만 교체.

### 4-9. 카드 진입 시 미세 motion

각 source CSS animation (0.3-0.6초, 한 번만):
- 1 진주: 기존 surface glint
- 2 어제: 별 1개 좌→우 fade
- 3 새로 본 너: ✦ pulse 한 번
- 4 미니 리뷰: 점 3개 차르륵 (stagger)
- 5 회상: skew 0.3° (페이지 살짝 펼침)
- 6 통찰: sparkline path 좌→우 그려짐
- 7 surprise: 큰 ✦ + halo expand

같은 카드 자리 stay 면 motion X (재진입 시만).

---

## 5. 다른 변경 사항

### 5-1. 체크인 미니 (완료 시)

현재: 완료 시에도 큰 카드 + 진주 hero stack.

새:
- 진주 hero → 회전 카드로 이동 (mainActionContainer 에서 제거)
- 체크인 미완 → 큰 카드 그대로 (시간대별 카피)
- 체크인 완료 → **한 줄 미니** ("✓ 오늘 기록 완료" + ›). 이모지 X, 추가 정보 X.
- 한 줄 메모 / 수시 체크인 기능은 추가 X (사용자 명시)

### 5-2. 미션 swipe-left dismiss

미션 카드에 좌→우 swipe 핸들러 추가. iOS swipe-to-delete 패턴.
- 좌측 30px 이상 drag → 카드 transform translateX
- 좌측 80px 넘으면 → "치워둘까?" 표시
- 놓으면 → mission.status = 'dismissed' + dismissedAt timestamp
- 30px 이내 놓으면 → snap back

`getTodayMissions` 필터에 dismissed 제외. 자동 dismiss X — 사용자 명시 trigger 만.

### 5-3. 마법고동 small row 카드

현재 `renderDecisionMiniLink` 카피 변경:

- "결정" 단어 X (사용자 명시)
- 저울 이모지 X (사용자 명시)
- godong.webp 이미지 그대로
- 활성 결정 + 활성 숙고 둘 다 카운트

활성 ≥1 일 때: "**N 안고 있어 →**"
활성 0 일 때: "**큰 거 풀어볼래 →**"

빈 카드 폐기 X — 활성 0 일 때도 카드는 표시 (진입 가능 유지).

### 5-4. reflectionContainer zone 폐기

`#reflectionContainer` HTML zone 삭제. `renderReflectionHome` 함수는 stub 으로 유지 (다른 호출처 안전).

활성 숙고 진입 경로:
1. small row 마법고동 카드 → 마법고동 화면 (안에서 결정 / 숙고 두 섹션 통합)
2. chat input bar `+` 메뉴에 "🌊 숙고 시작" 추가
3. (선택) 회전 카드 source 6 또는 7 의 변형으로 "숙고 안고 N일째" 가끔 등장 — 1차 안 해도 OK

### 5-5. 진주 hero 단순화

- 회전 dot 추가 X (사용자 명시 폐기)
- "왜 이 진주야?" Haiku 추가 X (사용자 명시 폐기)
- 진주 hero 자체는 변경 X — 회전 카드 source 1 으로 자리만 이동

### 5-6. 헤더 변화 점 X

헤더 `.header` 영역 변경 X. `chat-mode-btn` + `date-pill`(sync dot) 그대로. 우상단 ✦N badge 추가 X (사용자 명시 폐기).

---

## 6. 비용 estimate

| 항목 | 비용 |
|---|---|
| 회전 카드 운영 (source 1·2·3·5·6·7) | $0 (LLM 호출 X) |
| 미니 리뷰 Haiku (source 4) | 사용자당 주 ~$0.003 (탭 시만) |
| 진주 hero | $0 (변경 X) |
| 새벽 분석 / 모델 호출 | $0 (1일 1회 그대로) |

총 추가 비용: 거의 0. 사용자당 월 ~$0.012.

---

## 7. 구현 우선순위 (Phase)

### Phase 1 — 회전 카드 골격

회전 카드 컨테이너 + source 1(진주) + source 2(어제) + source 5(회상) 부터. 진주 hero 자리 이동, 체크인 미니, zone 정리, 인디케이터 도트.

이 Phase 만 해도 부산스러움 ↓ + 진주 / 어제 / 회상 dopamine 작동.

### Phase 2 — Source 추가

source 3 (새로 본 너) — 새벽 분석 결과 비교 로직
source 6 (통찰 한 줄) — 어휘 빈도 / 평균 변화 detect
source 7 (surprise) — milestone detect
swipe gesture (세로)

### Phase 3 — 미니 리뷰 (Haiku)

source 4 trigger 로직 + 모달 1장 + Haiku 호출 + dismiss 가드.

### Phase 4 — 미션 swipe + small row 마법고동

미션 swipe-left dismiss
마법고동 카드 카피 / 카운트 변경
reflectionContainer zone 폐기
chat-input-bar `+` 메뉴에 "🌊 숙고 시작" 추가

### Phase 5 — 시각 다듬기 (선택, 후속)

mini visual (잠 막대 / sparkline / 활력 점)
godong.webp variant (일러스트 작업 후)
카드 진입 motion

각 Phase 끝에 `npm run verify` 통과 확인.

---

## 8. 톤 / 카피 가드 (전 Phase 공통)

모든 회전 카드 카피는 소라고동 친구 톤:
1. 분석 보고서 톤 X → 친구 화법
2. 빈 응원("힘내", "화이팅", "괜찮아질 거야") 절대 X
3. 평가성 칭찬("잘했어", "대단해") 절대 X. 관찰 ○
4. 분석명 / 진단명 직접 명시 X (회전 카드는 4단 응답 자리 X)
5. 이모지 1-2개. 🐚 가끔
6. 사용자 어휘 그대로 인용 (회상 source 5 는 따옴표 + raw)
7. 같은 source 라도 매번 살짝 다른 표현 (카피 풀 5-8개 랜덤)

근거: SYSTEM_PERSONA 1-13 절대 원칙 + introduce.html 톤.

---

## 9. 안 하는 것 (의도적 제외)

이 개편에서 하지 않는 것 (사용자 거부 / 디자인 의도 / 범위 외):

- 진주 시각 매일 변화 (사용자 거부)
- 진주 hero "회전 dot" / "왜 이 진주야" Haiku (사용자 거부)
- 헤더 corner ✦N badge (사용자 거부)
- 체크인 한 줄 메모 / 수시 체크인 (사용자 거부)
- 가로 입구 row 추가 (bottom nav 가 이미 처리)
- 4 chat 통합 (디자인 의도 — 별개 도구)
- 응답 인용 칩 (이번 범위 X)
- 일러스트 작업 (godong variant — 후속)
- ES module 전환 / 인라인 onclick → addEventListener 마이그 (CLAUDE.md 룰)

---

## 10. 검증 / 완료 기준

각 Phase 끝에:
- [ ] `npm run build` 성공
- [ ] `npm run verify` byte-identical 통과
- [ ] 홈 진입 → zone 4-6개 사이
- [ ] 회전 카드 진입 시마다 source 변경 (또는 동일 source 다른 콘텐츠)
- [ ] swipe 세로 동작 (가용 source 2 이상일 때)
- [ ] 빈 데이터 user(신규 1일차) → source 1 빈 진주 CTA 단독 + crash X
- [ ] 미션 swipe-left → 사라짐
- [ ] 체크인 완료 시 한 줄 미니 (이모지 X)
- [ ] 마법고동 small row — godong.webp + "안고 있어 N" / "큰 거 풀어볼래"
- [ ] reflectionContainer zone 폐기됨
- [ ] 친구 톤 가드 통과 (분석 보고서 톤 X)

---

## 부록 A — 자주 만지는 파일 (참조)

| 변경 | 파일 |
|---|---|
| 홈 zone 구조 | `src/body/app-shell.html` 14-54 |
| 홈 진입 시 render | `src/scripts/main/15-navigation.js` `showScreen('home')` |
| 진주 hero (source 1) | `src/scripts/main/23-archive/03-todays-pearl-rotation.js` |
| 어제 비교 (source 2) | `src/scripts/main/02-state.js` 안 entries 비교 |
| case formulation 변경 detect (source 3) | `src/scripts/main/30-force-analyze.js` 분석 후 diff |
| 미니 리뷰 (source 4) | 신규 파일 (예: `27a-mini-review.js`) |
| 회상 (source 5) | timestamp 매칭 — 신규 helper |
| 통찰 (source 6) | `src/scripts/main/30-force-analyze.js` 안에 stash |
| surprise (source 7) | 신규 helper (milestone detect) |
| 미션 카드 + swipe | `src/scripts/main/12-mission/08-render-today-mission.js` |
| 체크인 미니 | `src/scripts/main/10-home/02-main-action.js` `renderMainAction` |
| 마법고동 카드 | `src/scripts/main/10-home/02-main-action.js` `renderDecisionMiniLink` |
| 시스템 프롬프트 (톤 가드 참조) | `src/scripts/main/20-system-prompt.js` |
| chat plus 메뉴 (숙고 진입 추가) | `src/body/chat-input-bar.html` |
| CSS 추가 | `src/styles/09-misc.css` |

---

## 부록 B — 사용자 컨텍스트 (참고)

이 개편은 다음 사용자 의견을 받아 도출:

- "며칠 쓰다 보니까 잘 안 들어가게 돼"
- "고민 있을 때는 유용한데, 일상을 털어놓아야 되는데 그 연결다리가 좀 부족"
- "매일 즉각적으로 받는 도파민이 좀 부족"
- "분석은 1일 1회만" (비용 정당)
- "친구지만 진짜로 나를 아는 친구. 편안 + 친근 + 나를 안다. 부담 X / 거부감 X"
- "인스티즈 같은 커뮤니티의 새 글 / 인기글 회전 메커니즘 — 들어왔을 때 새로움"
- "결정"이라는 말 안 씀 / 저울 이모지 X / godong.webp 사용
- "부산스러우면 안 돼"

→ 회전 카드 = 분석 보고서 X, 친구 카톡 ○. 들어왔을 때 매번 작은 한 면이 새로움.

---

## 11. P0 보완 (2026-05-09 risk 분석 후 추가)

본문 1-10 절을 적용 전 ultrathink risk 분석에서 도출한 P0 critical 5개 + 코드 검증 도출 2개 보완 사항. 본문 affected 부분이 11절과 충돌 시 **11절 우선**.

### 11-1. swipe gesture 가드 detail (본문 4-7 보강)

본문 "touchstart 30px 방향 lock" 만으로는 부족. 회전 카드 자체가 짧으면 30px = 카드 거의 끝, 페이지 스크롤이 default 로 fire.

**CSS**
- 회전 카드 컨테이너: `touch-action: pan-x` (가로 패닝만 허용, 세로는 우리 핸들러)
- 음악 ▶ / 도서관 진입 버튼은 별도 `<button>` 으로 감싸고 swipe 핸들러는 외곽 컨테이너에만

**JS**
- Pointer Events API (`pointerdown`/`pointermove`/`pointerup`). iOS 13+ 지원.
- 30px lock 후 명시적 `event.preventDefault()` on `pointermove` → 페이지 스크롤 차단
- 가용 source 1개 시 핸들러 자체 unbind

### 11-2. score 시간 단위 / tie-breaker (본문 4-3 보강)

- **"최근 본 같은 source" cooldown** = 4시간 windowing. 같은 4시간 안 재진입 시 같은 source stay (친구 카톡 비유 fit), 4시간 후 변경.
- **"이번 주 가장 적게 본 source"** = ISO week (월~일), 4AM cutoff 적용
- **동률 tie-breaker** = source id 오름차순 (1 → 2 → 3 → ...)
- **testerMode 디버그**: 카드 상단에 `source 5 · score 50 · base 50 + fresh 0 + variety 0` 표시. testerMode OFF 시 hidden.

### 11-3. streak milestone 제거 (본문 4-2 source 7)

본문 4-2 source 7 trigger 풀에서 다음 2개 제거 (memory `feedback_no_streak_pressure.md` 위반 — ADHD UX 압박):
- ~~"14일 연속 매일 한 번 들렀어"~~ → 제거 (또는 "최근 14일 중 12일 들렀어" 비-strict 표현)
- ~~"마지막 미션 5연속 ✓"~~ → 제거 (또는 "이번 분기 미션 N개 깼어")

### 11-4. 회상 source 5 anti-trigger 가드 (본문 4-2 source 5)

매칭 entry raw 인용 시 trauma trigger 위험. 가드:

1. **crisis keyword** 정의 (7-10개): 자살, 자해, 죽고싶, 사라지고싶, 끝내고싶, 뛰어내리, 목숨, 극단, 종결, 약 다, 끝내자
2. 매칭 entry note + diary + chatArchive summary 안에 keyword 1개라도 매칭 → entry skip, 다음 후보 (3개월 → 6개월 → 3주 → 12주) fallback
3. 모든 후보 skip 시 → source 5 비활성 (가용 source 에서 제외)
4. 추가 score 가드: 매칭 entry 의 mood 가 1 (최저) 면 score -20 (긍정 entry 우선)

### 11-5. 회전 카드 → chat 입력 다리 (본문 4-1 추가)

**사용자 페인 1번** "일상 털어놓을 다리 부족" 직접 해결.

모든 source 본문 footer 에 작은 CTA:

```
🌟 오늘의 너          🐚 12  ●·····

  [본문 컨텐츠]
                              ›
  ────────────────────────────
  🐚 한 마디                  ↗
```

- footer CTA 카피: `🐚 한 마디` + 우측 `↗` (12px, accent 색)
- 탭 시: chat 화면 진입 + input placeholder 자동 inject (source 별):
  - source 1 (진주): "이 진주에 대해..."
  - source 2 (어제): "어제..."
  - source 3 (새로 본 너): "이게 맞는 거 같아? 아니면..."
  - source 4 (미니 리뷰): "이 3일..."
  - source 5 (회상): "1년 전 이 한 줄..."
  - source 6 (통찰): "이번 주..."
  - source 7 (surprise): (해당 milestone 어휘)
- placeholder 만 inject. 사용자가 본인 어휘로 시작 가능.
- 비용 0, 구현 ~1시간.

### 11-6. preferences namespace 보호 (코드 검증 도출)

`state.preferences.*` 7+ 신규 필드 추가 시 namespace pollution. 신규 object 권장:

```js
state.rotatingCardState = state.rotatingCardState || {
  history: [],            // [{sourceId, contentHash, seenAt}] — 14일 dedupe
  dismissedSurprises: [], // [milestoneKey] — 1번 표시 후 영구 X
  lastMiniReviewAt: null, // ISO timestamp — source 4 cooldown
  windowStartAt: null,    // 4시간 windowing 시작
  windowSourceId: null,   // 그 4시간의 stay source
};
```

### 11-7. Haiku 응답 verify (source 4 미니 리뷰, 코드 검증 도출)

SYSTEM_PERSONA prompt 만으로는 약함 (LLM 출력 검증 X). 응답 후 코드 verify:

- **sycophancy keyword** 매칭 시 retry 1회 or fallback ("지금은 못 정리하겠어, 다음에"): 힘내, 화이팅, 괜찮아질, 잘하고 있어, 대단해
- **진단명** 매칭 시 retry 1회 or fallback: ADHD, 우울, 불안, PTSD, 강박 (직접 언급 금지)
- 9-reviews 가 이미 quotes verification 도입했음 (`_filterValidQuotes` 패턴) — 같은 패턴 재사용

---

11절 끝. 본문 4절과 충돌 시 11절 우선.
