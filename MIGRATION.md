# 소라고동 — 새 데스크탑 / 새 Claude 계정으로 옮기기

> 작성 2026-05-27. PowerShell (Windows) 기준.

## 0. 한 문장

`git push` 만으로는 **5 가지가 안 옮겨감**: ① Claude 메모리 ② 안드로이드 keystore ③ 외부 인증 (Cloudflare/GitHub/Supabase) ④ `node_modules` (재설치) ⑤ 환경변수. 코드만 옮기고 나머지 빼먹으면 며칠 헤맨다.

---

## 1. 옮겨가는 것 / 옮겨가지 않는 것

| 항목 | git push 로? | 별도 처리 |
|---|---|---|
| `src/` + `public/` + `functions/` + `scripts/` | ✓ | — |
| `build.mjs` / `watch.mjs` / `package.json` / `wrangler.jsonc` | ✓ | — |
| `index.html` / `public/index.html` (빌드 산출물) | ✓ | — |
| `CLAUDE.md` / `.gitignore` / `MIGRATION.md` | ✓ | — |
| `android/` (소스만, `build/` 폴더 제외) | ✓ | — |
| **Claude 메모리** (`.claude/projects/<slug>/memory/`) | ✗ | USB / 클라우드 수동 복사 |
| **`android.keystore`** + keystore 비밀번호 | ✗ | USB / 비밀번호 매니저 |
| `twa-manifest.json` (절대 경로 박혀있음) | ✗ | 새 PC 에서 재생성 |
| Cloudflare wrangler 인증 | ✗ | `wrangler login` 재인증 |
| GitHub 인증 (`gh` / git credentials) | ✗ | `gh auth login` 재인증 |
| Supabase service_role key (recover 도구용) | ✗ | 환경변수 직접 설정 |
| `node_modules/` | ✗ | `npm install` 재실행 |
| 이전 Claude 대화 history | ✗ | 옮길 수단 없음 (memory 만 컨텍스트 잇는 수단) |

---

## 2. 지금 PC 에서 할 일

### 2.1 git 정리 — 안 올라간 작업물 처리

`git status` 깨끗한지 확인:

```powershell
git status
```

남은 변경 있으면 둘 중 하나:
- 가져갈 작업이면 → `git add <파일>` → `git commit` → `git push`
- 버려도 되면 → `git restore <파일>` (modified) 또는 그냥 두기 (untracked)

⚠️ `재설계-*.md` / `payload.json` / `main-current.json` / `cron-snap-*.json` 은 **사적 데이터 (일기 / E2EE / UID)** — `.gitignore` 로 차단됨. 가져가려면 USB 로 직접 복사 (절대 commit X).

### 2.2 Claude 메모리 백업 (가장 중요)

위치:
```
C:\Users\user\.claude\projects\C--Users-user-Desktop-soragodong\memory\
```

30 개 `.md` 파일 (MEMORY.md + 각 메모). **이게 없으면 새 PC 의 Claude 가 너에 대해 0% 알게 된다.**

압축:

```powershell
Compress-Archive `
  -Path "$env:USERPROFILE\.claude\projects\C--Users-user-Desktop-soragodong\memory\*" `
  -DestinationPath "$env:USERPROFILE\Desktop\soragodong-memory-backup.zip"
```

→ 결과 `soragodong-memory-backup.zip` 을 USB / OneDrive / 이메일 첨부로 새 PC 에 옮겨.

### 2.3 안드로이드 keystore (잃으면 Play Store 영영 X)

repo 루트에서:

```powershell
Test-Path .\android.keystore      # True 면 있음
Test-Path .\twa-manifest.json     # True 면 있음
```

→ 둘 다 USB / 비밀번호 매니저 (1Password 등) 에 복사. **keystore 비밀번호도 같이** 옮겨 — 비밀번호 잃으면 keystore 있어도 못 씀.

추가로 `local.properties` (Android SDK 경로) 도 옮길 수 있지만 새 PC 에서 새로 만드는 게 깨끗.

### 2.4 외부 인증 — 옮기지 말고 새 PC 에서 재인증

| 서비스 | 어디서 새로 받나 |
|---|---|
| Cloudflare wrangler | 새 PC 에서 `wrangler login` |
| GitHub | 새 PC 에서 `gh auth login` |
| Supabase service_role | Supabase dashboard → Settings → API → `service_role` key (지금 PC 에서 미리 복사해두기 권장) |
| Anthropic API key (Cloudflare secrets) | Cloudflare dashboard 의 환경변수 (서버 측 — 옮길 필요 X) |

→ Supabase service_role 은 *수동 복사 권장*: 지금 PC 의 환경변수 봐:

```powershell
$env:SUPABASE_URL
$env:SUPABASE_SERVICE_ROLE_KEY
```

값이 나오면 값을 메모. 안 나오면 Supabase dashboard 가야.

### 2.5 마지막 sanity check

```powershell
git status
# 깨끗하면 OK
```

`재설계-*.md` 등은 untracked 로 남아있어야 정상 (.gitignore 에 안 잡힘 — `재설계-*.md` 패턴은 .gitignore 에 있음). git status 에서 안 보이면 OK.

---

## 3. 새 PC 에서 할 일

### 3.1 사전 설치

```powershell
# Node.js LTS (24 권장)
winget install OpenJS.NodeJS.LTS

# Git
winget install Git.Git

# GitHub CLI
winget install GitHub.cli

# Claude Code CLI
npm i -g @anthropic-ai/claude-code

# Cloudflare CLI (functions/ 작업 시)
npm i -g wrangler
```

안드로이드 앱 빌드 안 할 거면 Android Studio / JDK 17 skip.

### 3.2 코드 받기

```powershell
cd $env:USERPROFILE\Desktop
git clone https://github.com/naeun222/soragodong.git
cd soragodong
npm install
```

### 3.3 빌드 검증

```powershell
npm run build
npm run verify
```

→ `verify OK` 메시지 나오면 코드 깨끗.

### 3.4 Claude 메모리 복원 (가장 까다로움)

Claude Code 가 자동 생성하는 폴더명은 **저장소 절대 경로 기반** slug:
- `C:\Users\bsya\Desktop\soragodong` → slug `C--Users-bsya-Desktop-soragodong`
- `D:\projects\soragodong` → slug `D--projects-soragodong`

→ 한 번 Claude Code 를 *실행해서* 폴더 자동 생성 트리거:

```powershell
cd $env:USERPROFILE\Desktop\soragodong
claude         # 실행되면 곧 Ctrl+C 로 종료
```

→ 자동 생성된 폴더 위치 확인:

```powershell
ls $env:USERPROFILE\.claude\projects\
```

→ 새로 생긴 `<slug>` 폴더 발견. 그 안에 `memory` 폴더 만들고 백업 압축 풀기:

```powershell
$slug = "C--Users-bsya-Desktop-soragodong"   # 위에서 확인한 값으로 교체
$dest = "$env:USERPROFILE\.claude\projects\$slug\memory"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Expand-Archive -Path "<백업위치>\soragodong-memory-backup.zip" -DestinationPath $dest -Force
ls $dest    # MEMORY.md + 메모 .md 들 보이면 성공
```

### 3.5 안드로이드 keystore 복원 (앱 빌드 시만)

옮긴 `android.keystore` + `twa-manifest.json` 을 repo 루트에 배치:

```powershell
Copy-Item <USB경로>\android.keystore     .\android.keystore
Copy-Item <USB경로>\twa-manifest.json    .\twa-manifest.json    # 있다면
```

`.gitignore` 에 잡혀있어서 commit 위험 X.

### 3.6 외부 인증

```powershell
# GitHub
gh auth login    # 브라우저 열림 → 인증

# Cloudflare wrangler
wrangler login   # 브라우저 열림 → 인증

# Supabase service_role (recover-user-data.mjs 실행 시만 필요)
# 영구 설정 — 시스템 환경변수 (재부팅해도 유지):
[Environment]::SetEnvironmentVariable("SUPABASE_URL", "https://...supabase.co", "User")
[Environment]::SetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY", "eyJh...", "User")
# 현재 쉘에도 즉시 반영:
$env:SUPABASE_URL = "https://...supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJh..."
```

### 3.7 첫 commit 테스트

```powershell
# 작은 파일 한 줄 수정 (예: CLAUDE.md 끝 빈 줄 추가)
git add -p
git commit -m "test from new PC"
git push origin main
```

→ 인증 OK 면 push 성공. fail 이면 `gh auth login` 다시.

---

## 4. 다른 Claude 계정 추가 고려

- Claude Code 는 **계정 단위 폴더** — 새 계정으로 로그인하면 *해당 계정 전용* slug 폴더가 자동 별도 생성
- 메모리 복원 위치도 *새 계정 폴더* 안 (위 3.4 와 동일 절차)
- `/ultrareview` 같은 *유료* 기능은 새 계정 빌링 별도로 활성화 필요
- **이전 대화 history 자체는 옮길 수단 X** — memory 폴더 가 유일한 컨텍스트 인계 수단
- Claude Code 의 `~/.claude/settings.json` (전역 설정 — keybindings, model, theme) 도 옮기고 싶으면 같이 백업:
  ```powershell
  Copy-Item "$env:USERPROFILE\.claude\settings.json" "<백업위치>\claude-settings.json"
  ```

---

## 5. 트러블슈팅

### Q. 새 PC 의 Claude 가 메모리 못 알아봄

A. slug 폴더명이 안 맞을 가능성. `ls $env:USERPROFILE\.claude\projects\` 로 폴더 list 확인 → 가장 최근 생성된 `C--Users-...-soragodong` 찾기. memory 폴더가 그 안에 있어야 한다.

### Q. `npm run verify` 실패 — byte-identical X

A. 보통 line ending (LF vs CRLF) 차이. Windows 의 git autocrlf 가 변환 중일 수 있음:

```powershell
git config --global core.autocrlf false
git rm --cached -r .
git reset --hard
npm run build
npm run verify
```

⚠️ `git reset --hard` 는 안 commit 된 변경 *날림*. 정말 깨끗한 clone 상태인지 확인 후.

### Q. 안드로이드 빌드 실패 — keystore 못 찾음

A. `capacitor.config.local.ts` (`.gitignore` 됨) 가 keystore 경로 박혀있을 수 있음. 새 PC 의 절대 경로로 직접 작성 또는 `capacitor.config.ts` 의 signingConfig 항목 확인. 자세한 건 [Capacitor Android 마이그 메모리](.claude/projects/<slug>/memory/capacitor_android_migration.md) 참고 (메모리 복원 후 보임).

### Q. recover-user-data.mjs 가 SUPABASE_URL 없다고 에러

A. 환경변수 미설정. 위 3.6 의 Supabase 부분 다시. `$env:SUPABASE_URL` 출력해서 값 나오는지 확인.

### Q. 한글 파일명 (`재설계-*.md`) 깨짐

A. PowerShell 의 한글 인코딩 issue. `chcp 65001` 로 UTF-8 모드 (현재 세션) 또는 PowerShell 7+ 사용 (UTF-8 default).

---

## 6. 빠진 거 없는지 최종 체크리스트

지금 PC 에서:
- [ ] `git status` 깨끗
- [ ] `soragodong-memory-backup.zip` USB 에 있음
- [ ] `android.keystore` + 비밀번호 USB / 비밀번호 매니저 에 있음
- [ ] `twa-manifest.json` (있다면) USB 에 있음
- [ ] Supabase service_role key 메모 / 비밀번호 매니저 에 있음
- [ ] (사적) `재설계-*.md` / `payload.json` / `main-current.json` / `cron-snap-*.json` — 가져갈 거면 USB 에 별도 (commit X)

새 PC 에서:
- [ ] `git clone` + `npm install` + `npm run verify OK`
- [ ] Claude Code 한 번 실행해서 slug 폴더 생성됨
- [ ] memory 압축 풀어서 30 개 .md 보임
- [ ] `android.keystore` repo 루트에 배치 (앱 빌드 시)
- [ ] `gh auth login` / `wrangler login` 완료
- [ ] `$env:SUPABASE_URL` / `$env:SUPABASE_SERVICE_ROLE_KEY` 설정
- [ ] test commit + push 성공
