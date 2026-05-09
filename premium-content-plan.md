# 프리미엄 컨텐츠 3종 — 다음 세션 작업 계획

> 컨텍스트: 리뷰 차별화 3단계 (주간 / 분기 / 연간) 끝. 월간은 사용자 명시로 그대로 유지.
> 다음 작업 = 프리미엄 구독자 전용 컨텐츠 3종 추가. 사용자 명시 = 셋 다 하기로 결정.
> 모든 AI 호출은 단일 opus 호출 한 번으로 끝내기 (멀티 스텝 X). 사용자 명시.

---

## 🥇 Case Formulation PDF (가장 가치 있음)

**한 줄**: 정신과/상담 갈 때 가져갈 수 있는 "내 케이스" 리포트 PDF.

**데이터 소스**:
- `state.diagnoses` (detectDiagnoses 결과 — wrong_layer / weak_tool / avoidance / value_clash)
- `state.traits` / `state.patterns` / `state.values` (user_verified ✓ 만)
- 분기 리뷰 4개 + 연간 리뷰 (있다면)
- `state.archive` 깨달음 카드 + 진주
- mood/vitality/sleep entries 분포 요약

**의료법 워딩 가드**:
- "진단" 단어 X / "관찰 데이터" ○
- "이 데이터는 의료 진단 X. 의료진 참고용 자기관찰 자료" 명시
- detectDiagnoses 결과도 "관찰된 패턴" 으로 풀어 써

**구현 요점**:
- 단일 Opus 호출 → 의료진 친화 포맷 JSON 받기
- 출력 HTML (print-friendly CSS, A4 레이아웃) → 브라우저 print 로 PDF 저장
- 별도 라이브러리 X (jsPDF 같은 deps 추가하지 말고 window.print() 활용)
- 새 prompt builder + 새 렌더 화면 (overlay 또는 새 screen)

**프롬프트 핵심 필드** (예상):
```
{
  "header": { "patient_label": "...", "period": "...", "purpose": "self-observation summary for clinical context" },
  "presenting_observations": "주요 자기관찰 패턴 (의료법 어휘 X)",
  "longitudinal_patterns": [...],  // 시간 따라 반복된 패턴
  "context_factors": "수면/환경/모드 등 condition factors",
  "self_identified_strengths": [...],
  "self_identified_struggles": [...],  // "증상" X "어려움" ○
  "user_verified_traits_values": [...],
  "salient_quotes": [...],  // 사용자 인용 5-8개
  "questions_for_clinician": [...]  // "의료진에게 묻고 싶은 것" — 사용자가 직접 적은 것 우선
}
```

**진입점 후보**: 설정 → 데이터 / 도서관 → 마법·리뷰 옆

---

## 🥈 Pattern Detective

**한 줄**: AI 가 숨겨진 longitudinal 상관관계 찾아주는 월간/분기 깊이 리포트.

**무료 vs 프리미엄**:
- 무료: 표면 패턴 (이미 월간 리뷰 의 pattern 카드)
- 프리미엄: 다변량 / 시계열 / 시차 분석

**예시 출력**:
- "수면 5시간 미만이었던 다음 날에 결정 회피율 73%"
- "월요일 + 비 + 시험 모드 = 일기 길이 1.6배"
- "X 가닥 시도한 주의 다음 주, 다른 가닥 진화율 +20%"

**의료법 가드**: 통계 어휘 사용해도 OK (이미 데이터 분석 영역). but "진단" 톤 X.

**구현 요점**:
- 단일 Opus 호출 + 풍부한 데이터 (entries 90일+, missions, decisions, modes, weather)
- 한국 사용자라 천기 / 황체기 / 계절 cycle 도 포함
- 출력 = 별도 화면 (월간/분기 리뷰 옆 expandable section 또는 별도 카드 시퀀스)
- 비용 우려: 호출당 비용 ↑ → 월 N회 cap (프리미엄 권한 안에서)

---

## 🥉 Time Capsule

**한 줄**: 지금의 너가 N개월 후의 너에게 봉인. 풀리는 날 푸시.

**ADHD UX 가드**: streak 압박 X (메모리에 적힌 원칙). 비선형 보상.

**구현 요점**:
- 새 state.timeCapsules: [{ id, content, sealedAt, unlockAt, opened }]
- 작성 화면: 자유 텍스트 + 첨부 사진 (선택) + 풀릴 날짜 (1개월/3개월/6개월/1년 picker)
- 푸시: PWA notification 또는 진입 시 모달 ("🔒 → 🔓 N개월 전 너가 보낸 편지")
- AI 호출 X (그냥 user content 보존). 단순 기능.
- 단, 풀릴 때 "지금의 너가 그때 너에게 한 줄 답" 옵션 — Opus 한 번 호출 (선택)

**연간/분기 리뷰랑 자연스럽게 묶임**: 분기 리뷰 카드에 "이번 분기 캡슐 봉인" CTA / 1년 전 캡슐 = 연간 리뷰 안에 자동 등장.

---

## 다음 세션 시작 시 결정할 것

1. **진입점** — 어디에 노출?
   - (a) 도서관 → 마법·리뷰 옆에 새 섹션 추가
   - (b) 설정 → 데이터 / 프리미엄
   - (c) 홈 카드 (push 식)
   - (d) 별도 화면

2. **Premium gating** — 현재 billing tier 시스템 그대로?
   - 무료 사용자에게: lock 표시 + "프리미엄 가입" CTA / 완전 hidden 둘 중?

3. **구현 순서**
   - 추천: **Case Formulation 먼저** (가장 사용자 가치 ↑) → Time Capsule (가장 가벼움) → Pattern Detective (비용 가장 큼, 마지막)
   - 또는 가장 쉬운 Time Capsule 부터 (워밍업)

---

## 참고 — 리뷰 차별화 (이미 끝남)

- 주간 = `scenes[3]` (when/what/feeling) + pattern 톤다운 (Detective 어휘 X 가벼움)
- 월간 = 그대로 (Detective + cycles + value_align)
- 분기 = `transformation`{start_quote, end_quote, shift} + `continuity` + 새 Stories 슬라이드 8.9
- 연간 = `trajectory[4]` + `top_pearls[4]` + `persona_evolution` + 새 카드 3 (10→11카드)

관련 커밋:
- `f25006e` 주간 리뷰 = 미시 일기 톤
- `a181a12` 분기 리뷰 = 변화 렌즈
- `24834c0` 연간 리뷰 = 정체성 궤적

## 인스타 공유 카드 (가장 마지막 — 사용자 명시 "이건 나중에")

- 트렌디 = DNA pearl SVG 재활용 / 9:16 세로 / 미니멀 + 강한 디테일 1개
- 4 리뷰 종류별 카드 톤 다르게 (주=가벼움 / 연=무게감)
- 위치: `08-export-share.js` 의 `exportReviewShareCard` 확장
