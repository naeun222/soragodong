# 소라고동 — 작업 가이드

## 한 줄 요약

`index.html` 은 **빌드 산출물**이다. 절대 손대지 말 것. **`src/` 만 수정**하고 `npm run build` 로 재생성.

## 레이아웃

```
index.html        ← 빌드 산출물 (커밋함, 배포가 그대로 사용)
build.mjs         ← concat 빌드 (deps 0)
watch.mjs         ← node --watch 래퍼
package.json      ← npm scripts
src/
  index.template.html   ← {{INCLUDE: ...}} 마커가 박힌 셸
  head.html             ← meta / manifest / fonts
  styles/**/*.css       ← 합쳐서 한 <style> 블록으로
  body/**/*.html        ← 화면·모달·오버레이
  scripts/**/*.js       ← 합쳐서 한 <script> 블록으로 (이름순 정렬이 곧 실행 순서)
```

## 핵심 불변식

**`npm run verify` 가 항상 통과해야 한다.**

`verify` 는 src/ 를 빌드한 결과가 현재 `index.html` 과 **byte-identical** 인지 확인한다. 통과하지 못하는 커밋은 만들지 말 것. 깨졌다는 건 둘 중 하나:

1. src/ 를 수정한 뒤 `npm run build` 를 빼먹음 → 빌드해서 다시 커밋.
2. 의도한 변경이라 산출물도 같이 바뀌어야 함 → src/ 수정 + 빌드 → `git add src/ index.html` 같이 커밋.

## 워크플로우

```bash
# 개발 중
npm run watch       # src/ 변경 시 자동 재빌드

# 커밋 직전
npm run build       # src/ → index.html
npm run verify      # 결과 검사 (빌드 후 verify 는 항상 OK)
git add src/ index.html
```

## 마커 문법

`src/index.template.html` 안에서 사용:

- `{{INCLUDE: head.html}}` — `src/head.html` 의 내용을 그대로 삽입.
- `{{INCLUDE_DIR: scripts/01-config}}` — 디렉터리 안의 모든 파일을 **이름순 정렬해서 그대로 이어붙임** (구분자 없음). 디렉터리 마커 하나로 폴더 전체 흡수.

INCLUDE_DIR 가 의존하는 사실: 같은 디렉터리 안에서 파일명 prefix(`01-`, `02-`, …)가 곧 실행 순서. 새 파일은 prefix 를 신중히 골라 배치.

## 인라인 onclick / 전역 함수 — 절대 깨지 말 것

`<button onclick="foo()">` 같은 인라인 핸들러가 **526개** 있다. 이게 동작하려면 `foo` 가 전역 (window) 스코프에 있어야 한다.

- ES module (`<script type="module">`) 로 바꾸면 전부 깨짐 → 금지.
- `import/export` 도입 금지.
- 새 함수도 그냥 `function foo() { ... }` 형태로 정의하면 자동으로 전역.

## 자주 만지는 곳 매핑

| 만질 거 | 여기 본다 |
|---|---|
| 로그인 / OTP 흐름 | `src/body/login-screen.html`, `src/scripts/03-auth/` |
| 챗 입력창 | `src/body/app-shell.html` 의 `chatInputBar`, `src/scripts/19-chat/`, `src/scripts/99-chat-input.js` |
| 결제 / 구독 | `src/scripts/32-billing/` |
| 셸 모달 | `src/body/modals/shell-modal.html`, `src/scripts/13-shell-collection/` |
| 셀러브레이션 / 토스트 | `src/body/overlays/`, `src/scripts/14-celebration-toast/` |
| PWA 설치 카드 | `src/body/login-screen.html`, `src/scripts/00-pwa-install.js` |
| Supabase / 백업 | `src/scripts/05-supabase/`, `src/scripts/06-backup/` |
| 시스템 프롬프트 | `src/scripts/20-system-prompt/` |
| 설정 화면 | `src/body/screens/settings.html`, `src/scripts/31-settings/` |

## 외부 자산 (이 repo 범위 X)

`/api/billing/*`, `/api/admin/*`, `/sw.js`, `/godong.webp`, `/godongicon.png`, `/icon-180.png`, `/icon-192.png`, `/icon-512.png`, `/baseball.jpg`, `/hanriver.jpg`, `/kimchi.jpg`, `/gimchi.webp` — 배포 환경이 따로 서빙. 이 repo 에는 없음.

## 안 하는 것 (의도적 제외)

- ES module 전환 — 인라인 onclick 깨짐.
- 번들러 (Vite/esbuild) — concat 으로 충분, deps 0 유지.
- index.html 직접 편집.
