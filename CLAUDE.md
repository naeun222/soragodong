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
  index.html         ← 단일 HTML 파일 (~29.6k 줄, ~1.3MB). 거의 모든 코드 여기.
  vite.config.*      ← Vite 빌드 설정
  package.json
  CLAUDE.md          ← 이 문서
```

빌드: `npm run build` → `dist/index.html`

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
