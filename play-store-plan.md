# 소라고동 Play Store 출시 계획

> 작성일: 2026-05-08
> 다음 세션에서 본격 작업 시작용 작업 문서.
> 결정된 전제: **Play Store 우선, App Store 는 후순위**, 윈도우 노트북에서 작업.

---

## 0. 한 줄 요약

`soragodong.com` PWA 를 **TWA (Trusted Web Activity)** 로 감싸서 Play Store 에 올린다. Bubblewrap CLI 가 자동 변환. 코드 작성 0 줄, 빌드 1 회, 일주일 내 출시 가능.

---

## 1. 사실 정리

### 왜 Play Store 부터인가
- Android 빌드는 macOS 불필요 → 윈도우 노트북에서 끝남
- 개발자 등록비 **$25 1 회** (Apple $99/년)
- 한국 Android 점유율 ~70%
- TWA 는 Google 공식 권장 방식 → "WebView 래퍼" reject 위험 없음
- 본인이 사용자라 dogfooding 즉시 가능

### 왜 App Store 는 후순위인가
- macOS 또는 iPad Swift Playgrounds 필요 → 우회 비용 큼
- App Store Guideline 4.2 (Minimum Functionality) reject 리스크
- 토스 결제 → IAP 강제 → 재설계 부담
- $99/년 비용 + 심사 1~3 일

### 토스 결제 (중요)
- Google 정책상 디지털 구독은 Play Billing 강제. 단 한국은 「인앱결제 강제 금지법」 (2022) 으로 외부 결제 허용 트랙 운영 중.
- **이번 출시 방침**: Play 빌드에서 결제 진입점 자체를 숨김. 구독 안내는 "웹에서 진행" 표시 (Google 은 이 안내 허용. Apple 만 금지).
- 32-billing/* 의 결제 UI 를 TWA 환경에서 분기 처리하는 코드 1 곳만 추가하면 됨.

---

## 2. 환경 (윈도우 노트북)

### 옵션 A: WSL2 + Ubuntu (추천)
```powershell
# 윈도우 PowerShell (관리자)
wsl --install -d Ubuntu
```
- 리눅스 워크스페이스 흐름 그대로
- Bubblewrap / Android SDK 설치가 깨끗하게 됨

### 옵션 B: 윈도우 순정
- 가능하긴 함. Node.js + JDK 17+ + Android SDK 직접 설치
- 일부 Bubblewrap 명령에서 경로 이슈 가끔. 시간 손해 가능

**다음 세션 첫 결정사항**: A or B.

---

## 3. 사전 준비 (사용자 작업, Claude 가 못 함)

| 항목 | 누가 | 비용 | 소요 |
|---|---|---|---|
| Google Play Console 가입 | 사용자 | $25 (1 회) | 30 분 |
| 신원 확인 (정부 신분증 + 주소 증빙) | 사용자 | 0 | 1~3 일 검토 |
| 결제 카드 등록 | 사용자 | 0 | 5 분 |
| 앱 아이콘 512x512 PNG | 사용자 | 0 | 디자인 시간 |
| 피처 그래픽 1024x500 PNG | 사용자 | 0 | 디자인 시간 |
| 스크린샷 최소 2 장 (폰), 권장 8 장 | 사용자 | 0 | 캡처만 |
| 개인정보 처리방침 URL | 사용자 | 0 | soragodong.com 에 페이지 추가 |
| 짧은 설명 (80 자), 긴 설명 (4000 자) | 사용자 | 0 | 작성 |

> 신분증 검토가 1~3 일 걸리니 **Play Console 가입은 다음 세션 시작 전에 미리 해두면 시간 절약**.

---

## 4. PWA 사전 점검 (Claude + 사용자 협업)

TWA 는 PWA 품질을 그대로 노출. 출시 전 점검 항목:

### manifest.json
- [ ] `name`, `short_name` 한국어 표기 일관
- [ ] `start_url` 명확 (예: `/` 또는 `/?source=pwa`)
- [ ] `display: "standalone"` 또는 `"fullscreen"`
- [ ] `theme_color`, `background_color` 지정 (TWA splash 화면이 이걸 사용)
- [ ] `icons[]` 에 192x192, 512x512 maskable + any 둘 다 포함
- [ ] `orientation` 정책 정하기 (`portrait` 권장)

### head 메타태그
- [ ] `<meta name="viewport" ...>` `viewport-fit=cover` 추가 (safe-area)
- [ ] `<meta name="theme-color">`
- [ ] `apple-touch-icon` (iOS 대비, 지금은 불필요해도 무해)

### CSS
- [ ] `env(safe-area-inset-*)` 사용해서 노치/제스처바 회피
- [ ] 풀스크린 가정한 레이아웃 (주소창 없음)

### Service Worker
- [ ] `sw.js` 가 오프라인 fallback 가능한지
- [ ] 캐싱 정책이 너무 공격적이지 않은지 (업데이트 안 받는 사용자 발생 방지)
- [ ] APP_VERSION 갱신 흐름 검증

### 기능 동작 확인 (Chrome Android 에서 미리)
- [ ] 카메라 / 사진 라이브러리 접근
- [ ] 푸시 알림 (Web Push) - Android Chrome 은 풀 지원
- [ ] 결제 진입 차단 분기 (TWA 환경 감지)
- [ ] E2EE 마스터키 / Supabase 인증 / OTP 흐름
- [ ] 다크모드 / safe-area / 가로 회전

### TWA 환경 감지 (32-billing 분기용)
TWA 는 `document.referrer` 가 `android-app://com.yourpackage` 로 시작.
```js
const isTWA = document.referrer.startsWith('android-app://');
```
이 플래그로 결제 UI 숨김. 다음 세션에서 32-billing 어디에 끼울지 결정.

---

## 5. Bubblewrap 으로 TWA 빌드

### 설치
```bash
# WSL2 또는 윈도우 어디든
npm i -g @bubblewrap/cli
bubblewrap doctor   # 의존성 자동 진단 + JDK / Android SDK 자동 설치 제안
```

### 프로젝트 생성
```bash
mkdir soragodong-android && cd soragodong-android
bubblewrap init --manifest=https://soragodong.com/manifest.json
```

대화형 질문:
- Domain: `soragodong.com`
- Application name: 소라고동
- Short name: 소라고동
- Display mode: standalone
- Orientation: portrait
- Status bar color: (theme_color 와 일치)
- Splash background: (background_color 와 일치)
- Application ID (package name): `com.soragodong.app` 같은 역도메인 (한 번 정하면 못 바꿈, **신중히**)
- Starting version: 1
- Display color: light/dark
- Signing key: 새로 생성 (Bubblewrap 이 keystore 만듦)

### keystore 백업 (절대 잃어버리면 안 됨)
- 생성된 `android.keystore` 파일을 **별도 안전한 곳에 백업**.
- 이거 잃으면 같은 패키지명으로 업데이트 영원히 못 함 → 새 패키지로 다시 출시해야 함 (= 사용자 다 잃음)
- 권장: 1Password / Bitwarden / 하드디스크 + 클라우드 양쪽
- keystore 비밀번호도 같이 저장

### 빌드
```bash
bubblewrap build
# 결과물: app-release-bundle.aab (Play 업로드용)
#         app-release-signed.apk (직접 설치 테스트용)
```

### 로컬 테스트
APK 를 실제 안드로이드 폰에 USB 디버깅으로 설치, 본인이 굴려본다.
```bash
adb install app-release-signed.apk
```

---

## 6. Digital Asset Links 검증

TWA 가 도메인 소유를 증명해야 풀스크린 (주소창 숨김) 됨. 안 하면 그냥 Chrome 탭처럼 보임.

### 단계
1. Bubblewrap 이 `assetlinks.json` 내용 출력해줌. 형태:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.soragodong.app",
    "sha256_cert_fingerprints": ["AA:BB:CC:..."]
  }
}]
```
2. 이 파일을 **`https://soragodong.com/.well-known/assetlinks.json`** 에 호스팅
3. Cloudflare Pages 의 정적 파일이므로 `public/.well-known/assetlinks.json` 로 추가
4. `Content-Type: application/json` 으로 서빙되는지 확인
5. https://developers.google.com/digital-asset-links/tools/generator 에서 검증

> **중요**: 서명 키 변경하면 fingerprint 도 바뀌므로 assetlinks.json 다시 갱신 필요. Play App Signing 사용 시 (다음 단계) Google 측 fingerprint 도 추가해야 함.

---

## 7. Play Console 업로드

### 7-1. 앱 만들기
- Play Console → 앱 만들기
- 기본 언어: 한국어
- 앱/게임: 앱
- 무료/유료: 무료
- 정책 동의 체크박스들

### 7-2. 출시 트랙
권장 순서: **Internal Testing → Closed Testing (선택) → Production**

#### Internal Testing (즉시 가능, 100 명까지)
- AAB 업로드
- 테스터 이메일 등록 (본인 + 지인 5 명)
- Google Play 가 링크 줌, 그 링크로 깔면 정식 앱처럼 설치됨
- 심사 거의 없음 (몇 분 ~ 몇 시간)

#### Production
- Internal 에서 며칠 굴려보고 문제 없으면 promote
- 심사 평균 몇 시간 ~ 1 일

### 7-3. 필수 입력 항목
- [ ] 앱 콘텐츠 등급 설문 (성인 콘텐츠 X, 폭력 X 등 선택)
- [ ] 타겟 사용자층 (만 18 세 이상 권장 — 자기관찰/AI 상담 특성상 미성년 보호 이슈 회피)
- [ ] 데이터 보안 설문 (이게 까다로움 ↓ 별도 절)
- [ ] 광고 포함 여부: 없음
- [ ] 정부 앱 여부: 아니오
- [ ] 뉴스 앱 여부: 아니오
- [ ] COVID-19 앱 여부: 아니오

### 7-4. 데이터 보안 (까다로움, 정확히 답해야 함)
수집/공유 항목 모두 정확하게 신고. 거짓 신고하면 출시 거절 + 재발시 계정 정지.

소라고동의 경우 솔직하게:
- **수집**: 이메일 (Supabase 인증), 사용자 콘텐츠 (관찰/메모/사진), 디바이스 ID (PWA 식별), 결제 정보 (토스 — 단, TWA 빌드에선 이 진입점 차단하므로 미수집으로 신고 가능)
- **공유**: Anthropic (AI 분석 목적, 사용자 콘텐츠), Sentry (오류 보고)
- **암호화**: 전송 중 (TLS) ✓, 저장 시 (E2EE 적용 항목 명시)
- **삭제 요청**: 사용자가 계정 삭제로 가능

### 7-5. 개인정보 처리방침 URL
필수. soragodong.com 에 별도 페이지 만들어야 함. 다음 세션 작업 항목.

---

## 8. 출시 체크리스트 (시간순)

### 사전 (사용자 단독, 다음 세션 전 가능하면 미리)
- [ ] Play Console $25 결제 + 신원 인증 시작
- [ ] 앱 패키지명 결정 (`com.soragodong.app` 류, 영구 고정)
- [ ] 앱 아이콘 / 피처 그래픽 디자인

### Phase 1: PWA 폴리싱 (Claude + 사용자, 1~2 일)
- [ ] manifest.json 점검 / 보강
- [ ] safe-area CSS 정리
- [ ] sw.js 캐싱 정책 검토
- [ ] TWA 환경 감지 코드 추가 (32-billing 분기)
- [ ] 개인정보 처리방침 페이지 추가
- [ ] iPad / Android 양쪽에서 PWA 로 직접 dogfooding

### Phase 2: 빌드 (Claude + 사용자, 1 일)
- [ ] WSL2 또는 윈도우에 Bubblewrap 설치
- [ ] `bubblewrap init` → 패키지명 / 메타 입력
- [ ] keystore 백업 (1Password 등 2 곳 이상)
- [ ] `bubblewrap build` → AAB 생성
- [ ] 본인 안드로이드 폰에 APK 직접 설치 테스트

### Phase 3: Asset Links (Claude + 사용자, 30 분)
- [ ] `public/.well-known/assetlinks.json` 추가
- [ ] Cloudflare 배포 후 Google 검증 도구로 통과 확인
- [ ] 풀스크린 (주소창 숨김) 동작 확인

### Phase 4: Play Console (사용자 단독, 반나절)
- [ ] 앱 만들기
- [ ] 메타데이터 입력 (설명, 스크린샷, 아이콘)
- [ ] 데이터 보안 설문 정확히
- [ ] 콘텐츠 등급 설문
- [ ] AAB Internal Testing 트랙 업로드
- [ ] 본인 + 지인 테스터 등록

### Phase 5: 검증 (1 주)
- [ ] Internal Testing 으로 본인 + 지인 굴려보기
- [ ] 크래시 / 버그 / 결제 분기 / E2EE 흐름 확인
- [ ] 필요시 PWA 수정 → 재배포 (TWA 는 PWA 갱신 자동 반영)

### Phase 6: Production (반나절 + 심사)
- [ ] Production 트랙 promote
- [ ] 심사 대기
- [ ] 출시 + Play Store 링크 확보

---

## 9. 함정 / 주의사항

1. **keystore 분실 = 앱 종신형**. 패키지명 영구 고정 + 새 패키지로 다시 시작 = 사용자 전부 잃음. 백업 2 곳 이상 필수.
2. **Application ID (패키지명) 영구 고정**. `com.soragodong.app` 형태 권장. 한 번 출시하면 못 바꿈.
3. **PWA 버그 = 앱 버그**. TWA 는 Chrome 통째로라 PWA 의 모든 결함이 그대로 노출. Phase 1 폴리싱이 중요한 이유.
4. **타겟 SDK 버전 매년 강제 상승**. Bubblewrap 만 최신 유지하면 자동 추종.
5. **데이터 보안 설문 거짓 신고**: 출시 거절 + 누적 시 개발자 계정 정지. 솔직히 답해야 함.
6. **결제 분기 빠뜨리면**: TWA 빌드에서 토스 결제 UI 가 노출되어 Play 정책 위반 → 가능성: 알림 1 회 → 미시정 시 앱 삭제 + 계정 경고. 반드시 분기 확인.
7. **첫 심사 후 거절 시**: 사유 받고 수정 → 재제출. 횟수 제한 거의 없음. 심리적 타격만 있을 뿐 실질 비용 0.
8. **소상공인 수수료**: 연 매출 100 만 달러 미만 = Google 수수료 30% → 15%. 자동 적용.

---

## 10. iOS 후속 (참고용, 이번 사이클은 X)

Play Store 출시 + 사용자 일정 수 도달 후 검토. 옵션:
- iPad Swift Playgrounds 4 → SwiftUI + WKWebView 래퍼 (1~3 주, $99/년)
- 클라우드 Mac (Codemagic / EAS Build) + Capacitor (윈도우에서 트리거 가능)
- 둘 중 어느 쪽이든 Play Store 트래픽 보고 결정

> 결정 트리거: "iOS 사용자 요청이 일정 수 누적" 또는 "Android MAU 가 의미있는 숫자 달성" 시점.

---

## 11. 다음 세션 시작 시 체크할 것

1. Play Console 신원 인증 진행 상태
2. WSL2 vs 윈도우 순정 — 어느 환경에서 시작할지 확정
3. 패키지명 (영구 고정) 결정 → 메모
4. 앱 아이콘 / 피처 그래픽 / 스크린샷 준비 상태
5. 개인정보 처리방침 페이지 — 신규 작성 필요

---

## 부록: 비용 요약

| 항목 | 비용 | 주기 |
|---|---|---|
| Play Console 가입 | $25 | 평생 1 회 |
| 도메인 (이미 보유) | - | - |
| Cloudflare Pages | 무료 | - |
| Bubblewrap / Android SDK / JDK | 무료 | - |
| 개인정보 처리방침 페이지 | 0 (직접 작성) | - |
| **총 출시 비용** | **$25** | |
| 매출 발생 시 Google 수수료 | 15% (영세) / 30% (일반) | 매 결제 |

---

## 부록: 참고 링크

- Bubblewrap CLI: https://github.com/GoogleChromeLabs/bubblewrap
- TWA 가이드: https://developer.chrome.com/docs/android/trusted-web-activity/
- Play Console: https://play.google.com/console
- Digital Asset Links 검증: https://developers.google.com/digital-asset-links/tools/generator
- 한국 외부 결제 가이드: https://support.google.com/googleplay/android-developer/answer/12348241

---

*다음 세션에서 이 문서를 기반으로 Phase 1 부터 시작.*
