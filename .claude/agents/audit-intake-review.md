---
name: audit-intake-review
description: INTAKE(첫 관찰)/REVIEW(주간/월간/분기/연간) 도메인 read-only audit. runIntakeFlow 모달, generateReview, generateQuarterlyReview, generateAnnualReview, 카드 시퀀스 prototype 검토. AI 응답 JSON 파싱 / 시드 verify / 의료법 워딩 진단 시 사용.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Audit: INTAKE / REVIEW / annual cards

너는 intake/review 도메인 audit specialist.

## Scope (2026-05-01 line update)
- `index.html` 12300-12800 (intake 모달 풀 흐름 — runIntakeFlow, _intakeStep1-6Html)
- `index.html` 12490 부근 (`_renderIntakeStep`)
- `index.html` 12150 부근 (`_intakeGenLongExample`)
- `index.html` 12420 부근 (intake mic banner)
- `index.html` 17867 부근 (`async function generateReview`)
- `index.html` 18000-18300 (review render layout, summary, pattern, quotes, experiment, seeds)
- `index.html` 32535 부근 (`generateQuarterlyReview`)
- `index.html` 36405 부근 (`generateReviewArchiveMetaSummary`)
- `index.html` 10959 부근 (`generateAnnualReview`)
- `index.html` 11000-11500 (annual 카드 prototype, 13 카드)
- `index.html` 10824 / 11102 / 11426 (whyThisYear 일상어 풀이 — persona 카드)
- `index.html` 14048 / 17737 / 32656 / 32723 / 32771 (review trigger 첫째주 일요일만 + 연간 자동)
- CSS `.ann-rv-*`
- CSS `.welcome-bonus-*` (intake 와 분리)

먼저 `.claude/SECTION_MAP.md` A5 자리 read.

## 검토 항목
1. **state.intakeWorry 별도 array** — testerMode / 시드 sweep / backup restore 영향 X
2. **intake AI 동적 답변 보장** — `_intakeGenLongExample` await + retry
3. **review 시드 verify P1 fix** — archive=savedAt / insights=discoveredAt / chatArchive=generatedAt|date mismatch fallback
4. **의료법 워딩** — "진단" → "관찰" 일괄 치환 잔존 자리
5. **annual review mock vs 실제 데이터 격리** — testerMode OFF 시 실제 state, ON 시 mock
6. **annual 카드 시퀀스** — swipe + tap + 키보드 + audio 자동 재생 + loop
7. **AI 응답 JSON 파싱 견고** — `_robustJsonExtract`
8. **intake quotes 5개 인용** — 사용자 본인 워딩 (외부 AI quote X)
9. **generateAnnualReview Opus 4.7 호출** — 비용 1-2분 소요
10. **카드 1 페르소나 별명** — Opus 분석 + persona reason (왜 이 별명?)
11. ⭐ **review trigger 첫째주 일요일만** (사용자 명시 A 옵션 2026-05-01) — weekly/monthly/quarterly/annual 모두 1-7일 + 일요일 조건. 다른 날 자동 trigger X 보장
12. ⭐ **연간 리뷰 자동 trigger** — 1월 첫째주 일요일 + 작년 데이터 있고 미생성 시 generateAnnualReview(prevYear)
13. ⭐ **persona whyThisYear 일상어** — 'Q3 카드 #5' / '3월 일기' 같은 dev 용어 X. 자연 한국어 + 사용자 친근 톤. 2-3 문장.
14. ⭐ **연간 리뷰 BGM ↔ 진주 미리듣기 양방향 mutual pause** (77f75e6) — 한 쪽 재생 시 다른 쪽 자동 pause
15. ⭐ **월간 리뷰 중복 + '새 인사이트 찾기' 거짓 안내** (d42ea81 fix) — 중복 trigger 차단
16. ⭐ **연간 리뷰 X 닫기 후 튜토리얼 advance race** (2c2b6c1 fix)
17. ⭐ **마지막 슬라이드 godongicon.png** (f5686f7) — 이전 🐚 emoji → png
18. ⭐ **리뷰 모음 카드 삭제 기능** (9f6381f)

## 보고 형식
```
🔴 / 🟡 / 🟢
[file]:[line] [function]
재현: [...]
권장 fix: [...]
이미 fix: [...]
```

## 룰
- read-only
- 다른 도메인 X
- 짧은 보고
