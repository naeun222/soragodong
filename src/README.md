# src/ — 점진 모듈 분리 (Phase A)

`index.html` (1.3MB 단일 파일)에서 모듈을 점진적으로 추출 중.

## 들어간 모듈

- (2026-04-29) `utils/date.ts` — `getDayKey`, `todayKey`, `daysBetweenKeys`, `DAY_CUTOFF_HOUR`
  - 단위 테스트: `tests/date.test.ts` (12 cases)
- (2026-05-03) `utils/format.ts` — `escapeHtml` (391회 사용), `formatDateKorean` (date.ts 의존)
  - 단위 테스트: `tests/format.test.ts` (11 cases)

## 점진 추출 후보 (영향 적은 순서대로)

### Tier 1 — pure functions (의존성 적음, 안전)
- [x] `utils/format.ts` — `escapeHtml`, `formatDateKorean`
- [ ] `utils/dedupe.ts` — `dedupeStringArray`, `dedupeExactArray`
- [ ] `utils/strings.ts` — 토큰화, 마크다운 strip 등
- [ ] `utils/server-time.ts` — `getServerNowMs`, NTP sync

### Tier 2 — state 헬퍼 (state 객체 의존)
- [ ] `state/migration.ts` — V7 migration, default state
- [ ] `state/persistence.ts` — saveState / loadFromCloud / localStorage
- [ ] `state/serialize.ts` — `_SERIALIZE_TRANSIENT_KEYS`, replacer

### Tier 3 — service 통합
- [ ] `services/anthropic.ts` — Anthropic API call wrapper (현재 fetch 직접)
- [ ] `services/supabase.ts` — REST helpers
- [ ] `services/auth.ts` — magic link / session

### Tier 4 — domain 모듈 (가장 큰 작업)
- [ ] `tutorial/onboarding.ts` — ONBOARDING_STEPS, startInteractiveOnboarding
- [ ] `tutorial/core.ts` — CORE_TUTORIAL_RANGES, lock 시스템
- [ ] `screens/home.ts`, `screens/chat.ts`, `screens/archive.ts`, ...
- [ ] `components/modal.ts`, `components/coachmark.ts`, ...

## 추출 흐름 (안전하게)

1. 추출할 함수 + 의존성 식별
2. `src/<module>/<file>.ts` 만들고 export
3. `index.html` 안에서 그 함수 정의 부분 삭제 + import 추가 (또는 일단 양쪽 유지하면서 점진)
4. **단위 테스트** 작성 (`tests/<file>.test.ts`)
5. 빌드 + 테스트 통과 확인
6. 커밋

## 안전 원칙

- **거대한 한 번 refactor X** — 모듈 1–2개씩.
- 각 추출은 **회귀 테스트**로 보호.
- index.html 내부 로직 흐름은 가능한 한 안 건드림.
- `state` 전역 객체 그대로 유지 (Tier 1–2는 함수만 추출).

## 빌드 확인

```bash
npm run build       # Vite 빌드 (index.html 그대로 → dist/)
npm run typecheck   # TypeScript 검사 (src/ + tests/)
npm test            # Vitest 단위 테스트
```
