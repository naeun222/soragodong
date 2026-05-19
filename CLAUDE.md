# 소라고동 — 작업 가이드

## 한 줄 요약

`index.html` (root) 와 `public/index.html` 은 **빌드 산출물**이다. 절대 손대지 말 것. **`src/` 만 수정**하고 `npm run build` 로 둘 다 재생성.

## 레이아웃

```
index.html        ← 빌드 산출물 (커밋함, watch / 로컬 dev 용)
public/index.html ← 빌드 산출물 (Cloudflare Workers 배포 entry)
                    wrangler.jsonc assets.directory=./public 참조
public/           ← 정적 자산 (sw.js / 아이콘 / godong.webp / version.txt 등)
wrangler.jsonc    ← Cloudflare Workers 설정 (SPA 모드)
build.mjs         ← concat 빌드 (deps 0, root + public 둘 다 write)
watch.mjs         ← node --watch 래퍼
package.json      ← npm scripts
src/
  index.template.html       ← {{INCLUDE_*}} 마커가 박힌 셸
  head.html                 ← meta / manifest / fonts
  styles/
    00-tokens.css           ← :root 변수
    01-reset.css            ← 글로벌 reset
    02-app-shell.css        ← .app, .header, .screens, .greeting 등
    09-misc.css             ← (TODO: 컴포넌트별 분할 — Phase 3 후속 작업)
  body/
    onboarding.html
    magic-mode-chips.html
    login-screen.html
    app-shell.html          ← <div class="app">: 헤더 + 15 screen + bottom-nav
    chat-input-bar.html     ← .app 의 sibling
    modals/shell-modal.html
    overlays/{celebration,toast}.html
  scripts/
    00-pwa-install.js       ← 첫 inline <script> (PWA 설치)
    main/
      01-config.js          ← Supabase keys, Sentry init, SHELL_TYPES
      02-state.js
      03-auth/              ← 8 파일 (session/OTP, logout, server-time, E2EE 4종, annual seed)
      04-annual-review-phase1/  ← 10 파일
      05-supabase.js
      06-backup-migration.js
      07-init/              ← 10 파일 (init fn, tutorial, onb, login flow, OTP cooldown 등)
      08-decision-room.js
      09-reviews-future-self/   ← 9 파일
      10-home/              ← 8 파일 (night mode, action, decisions, reflection 5종)
      11-daily-pool.js
      12-mission/           ← 15 파일 (helpers, attempt-result, photo/video capture)
      13-shell-collection/  ← 14 파일 (Core 2/3, beach, DNA pearl SVG/helix)
      14-celebration-toast.js
      15-navigation.js
      16-modes.js
      17-mood-vitality-sleep.js
      18-model-rendering.js
      19-chat/              ← 12 파일 (scroll, render, send, AI generate, deeper)
      20-system-prompt.js
      21-insight-saving/    ← 15 파일 (insight, pearl, memo, strategy, mutation 7종)
      22-proposal.js
      23-archive/           ← 16 파일 (library, day modal, lens, topic, builder, timeline)
      24-execute.js
      25-archive-daily/     ← 12 파일 (chat archive, ICS import/export, drawer)
      26-test-tools/        ← 11 파일 (testSeedV4Data 1268줄 단일 + force-tests)
      27-monthly-rollup.js
      28-project-tracking/  ← 14 파일 (project cards, trackers, Stories, viz)
      29-music.js
      30-force-analyze.js
      31-settings.js
      32-billing/           ← 20 파일 (tiers, feedback, admin, subscribe, backup, version)
      33-chat-input.js
```

## 핵심 불변식

**`npm run verify` 가 항상 통과해야 한다.**

`verify` 는 src/ 를 빌드한 결과가 현재 `index.html` (root) 과 `public/index.html` 둘 다와 **byte-identical** 인지 확인한다. 통과하지 못하는 커밋은 만들지 말 것. 깨졌다는 건 둘 중 하나:

1. src/ 를 수정한 뒤 `npm run build` 를 빼먹음 → 빌드해서 다시 커밋.
2. 의도한 변경이라 산출물도 같이 바뀌어야 함 → src/ 수정 + 빌드 → `git add src/ index.html public/index.html` 같이 커밋.

## 워크플로우

```bash
# 개발 중
npm run watch       # src/ 변경 시 자동 재빌드

# 커밋 직전
npm run build       # src/ → index.html + public/index.html (둘 다)
npm run verify      # 결과 검사 (빌드 후 verify 는 항상 OK)
git add src/ index.html public/index.html
```

## 마커 문법

`src/index.template.html` 안에서 사용:

- `{{INCLUDE: head.html}}` — `src/head.html` 의 내용을 그대로 삽입.
- `{{INCLUDE_DIR: scripts/main}}` — 디렉터리 안의 모든 파일을 **이름순 정렬해서 그대로 이어붙임** (재귀, 구분자 없음). 디렉터리 마커 하나로 폴더 전체 흡수.

INCLUDE_DIR 가 의존하는 사실: 같은 디렉터리 안에서 파일명 prefix(`01-`, `02-`, …)가 곧 실행 순서. 새 파일은 prefix 를 신중히 골라 배치.

`07-init/` 같은 sub-folder 는 `07-` prefix 덕분에 `06-backup-migration.js` 와 `08-decision-room.js` 사이에 자연스럽게 배치된다 (string sort 로 `07-init` < `07-init.js` 이고, 폴더 안 파일들은 재귀로 그 자리에 끼어든다).

## 인라인 onclick / 전역 함수 — 절대 깨지 말 것

`<button onclick="foo()">` 같은 인라인 핸들러가 **526개** 있다. 이게 동작하려면 `foo` 가 전역 (window) 스코프에 있어야 한다.

- ES module (`<script type="module">`) 로 바꾸면 전부 깨짐 → 금지.
- `import/export` 도입 금지.
- 새 함수도 그냥 `function foo() { ... }` 형태로 정의하면 자동으로 전역.

## 자주 만지는 곳 매핑

| 만질 거 | 여기 본다 |
|---|---|
| 로그인 / OTP / SNS | `src/body/login-screen.html`, `src/scripts/main/03-auth/01-session-otp.js`, `07-init/08-login-flow.js` |
| E2EE 비밀번호 | `src/scripts/main/03-auth/04-e2ee-helpers.js` ~ `07-e2ee-recovery-modal.js` |
| 챗 입력창 | `src/body/chat-input-bar.html`, `src/scripts/main/19-chat/`, `33-chat-input.js` |
| 챗 메시지 렌더 / 보내기 | `src/scripts/main/19-chat/02-render-message.js`, `05-send-chat.js`, `09-generate-ai-response.js` |
| 결제 / 구독 / 토스 | `src/scripts/main/32-billing/08-subscribe-modal.js`, `09-toss-subscribe.js`, `10-overage-purchase.js` |
| 클라우드 백업 / 복원 | `src/scripts/main/32-billing/13-auto-backup.js` ~ `16-migration-backup-recovery.js` |
| 셸 모달 / 모래사장 | `src/body/modals/shell-modal.html`, `src/scripts/main/13-shell-collection/09-render-beach.js` |
| DNA 진주 SVG | `src/scripts/main/13-shell-collection/11-dna-pearl-svg.js`, `12-dna-pearl-helix.js` |
| 셀러브레이션 / 토스트 | `src/body/overlays/`, `src/scripts/main/14-celebration-toast.js` |
| PWA 설치 카드 | `src/body/login-screen.html` (loginPwaCard), `src/scripts/00-pwa-install.js` |
| Supabase / 인증 | `src/scripts/main/05-supabase.js`, `06-backup-migration.js` |
| 시스템 프롬프트 | `src/scripts/main/20-system-prompt.js` |
| 미션 (오늘의 부름) | `src/scripts/main/12-mission/08-render-today-mission.js`, `09-complete-mission.js` |
| 사진 / 동영상 캡처 | `src/scripts/main/12-mission/10-photo-capture-verify.js` ~ `13-video-compress.js` |
| 도서관 / 아카이브 | `src/scripts/main/23-archive/` |
| 캘린더 / 타임테이블 | `src/scripts/main/25-archive-daily/04-v4-timetable.js`, `07-ics-import-export.js` |
| 프로젝트 추적 / Stories | `src/scripts/main/28-project-tracking/` |
| 리뷰 (주/월/분기/연) | `src/scripts/main/09-reviews-future-self/`, `04-annual-review-phase1/` |
| 인사이트 저장 / 돌연변이 | `src/scripts/main/21-insight-saving/` |
| 음악 (iTunes) | `src/scripts/main/29-music.js` |
| 통합 분석 강제 | `src/scripts/main/30-force-analyze.js` |
| 설정 화면 | `src/scripts/main/31-settings.js` |
| 테스터 모드 시드 | `src/scripts/main/26-test-tools/02-seed-v4-data.js` (1268줄 단일) |

## CSS

현재 4 파일:
- `00-tokens.css` — `:root` 변수
- `01-reset.css` — 글로벌 reset
- `02-app-shell.css` — `.app`, `.header`, `.date-pill`, `.screens` 등
- `09-misc.css` — **9,691줄, TODO**: 컴포넌트별로 더 쪼개기. 자연 경계는 `/* Today's mission card */`, `/* Sora's Call */`, `/* DECISION ROOM */`, `/* Shell collection modal */`, `/* Celebration animation */`, `/* Toast */` 같은 주석에서 시작. 한 번에 한 컴포넌트씩 잘라내고 `npm run verify` 로 byte-identical 확인.

## 외부 자산 (이 repo 범위 X)

`/api/billing/*`, `/api/admin/*`, `/sw.js`, `/godong.webp`, `/godongicon.png`, `/icon-180.png`, `/icon-192.png`, `/icon-512.png`, `/baseball.jpg`, `/hanriver.jpg`, `/kimchi.jpg`, `/gimchi.webp` — 배포 환경이 따로 서빙. 이 repo 에는 없음.

## 안 하는 것 (의도적 제외)

- ES module 전환 — 인라인 onclick 깨짐.
- 번들러 (Vite/esbuild) — concat 으로 충분, deps 0 유지.
- index.html 직접 편집.
- 인라인 onclick → addEventListener 전체 마이그레이션 (별도 작업, 별도 위험).

## 후속 작업 (시간 날 때)

1. **CSS 컴포넌트 분할** — `09-misc.css` 9,691줄을 `components/`, `screens/` 로 점진 분리. 매 단계 `npm run verify` 가드.
2. **남은 큰 JS 파일** — 다음 파일들이 여전히 500줄 이상 (필요할 때 추가 분할):
   - `26-test-tools/02-seed-v4-data.js` (1269줄, 단일 함수라 분할 어려움)
   - `07-init/02-tutorial-welcome.js` (1229줄, ONBOARDING_STEPS array 가 절반)
   - `07-init/06-onb-event-listeners.js` (959줄)
   - `08-decision-room.js` (948줄)
   - `30-force-analyze.js` (943줄)
3. **dead code 청소** — 주석으로 표시된 dead 코드 (`V3 호환`, `V203 폐기`, `chooser 폐기` 등) 별도 PR 로 제거.
4. **⏰ Phase 1E Step 7 — 2026-07-01 이후 자동 트리거** — 일기/체크인 사진 dual-write fallback path 제거. Step 6 마이그 (commit `dbc9be7`, ship 2026-05-20) 후 4-6 주 운영 + production 데이터 100% 마이그 확인되면 cleanup. 자세한 사항은 memory `phase1e_step7_pending.md` + `PHASE-1E-HANDOFF.md` §4 Step 7. **Claude 가 트리거 날짜 이후 첫 세션에서 자동 확인** — 사용자에게 마이그 status 검증 후 진행.
