# 소라고동 iOS App Store 출시 계획서

> 작성일: 2026-05-17
> 대상: 김나은 (1인 개발자)
> 범위: Android TWA → Capacitor migration + iOS App Store 신규 출시
> 상태: 계획 (실행 전)

---

## 1. Executive Summary

### 1.1 한 줄

**Android TWA 를 폐기하고 Capacitor 로 Android + iOS 동시 wrapper 화. iOS 는 Phase 1 free tier only 로 빠르게 통과, Phase 2 에서 Apple IAP 통합.**

### 1.2 핵심 숫자

| 항목 | 값 |
|---|---|
| 총 일정 | 6 ~ 9 주 |
| 외부 현금 비용 | $99 (Apple Dev) + $0 ~ $300 (Cloud Mac, 직접 Mac 보유 시 0) |
| Apple 수수료 | 0% (Phase 1, free tier) / 15% (Phase 2, Small Business Program) |
| 코드 손실 위험 | 낮음 (web codebase 그대로 wrapper, src/ 손대지 않음) |
| Apple Review reject 위험 | 중 (Minimum Functionality 4.2 + Mental Health 분류) |

### 1.3 결정 포인트 (지금 답해야 하는 것)

| 결정 | 옵션 | 권장 |
|---|---|---|
| 결제 정책 | A. iOS free tier only / B. Apple IAP 통합 / C. 외부결제 한국법령 | **A 먼저 → B 차후** |
| Mac 조달 | 직접 구매 / 친구 빌림 / Cloud Mac / 안 함 (포기) | **친구 빌림 1주 시도 → 안 되면 MacInCloud** |
| Web Push → Native Push | 즉시 마이그 / 둘 다 유지 / web 만 유지 | **둘 다 유지 (device-type 분기)** |
| 출시 시점 | 베타 중 즉시 / 사용자 100명 이후 | **사용자 100명 이후 (Android Capacitor 안정화 후)** |

### 1.4 단계 요약

```
Phase 0 (1주) — Mac + Apple Developer + Capacitor 학습
Phase 1 (1~2주) — Capacitor 도입, Android wrapper 전환
Phase 2 (1~2주) — Google Play 재출시 (TWA → Capacitor)
Phase 3 (1주) — iOS Xcode 빌드 + WebKit 호환성 fix
Phase 4 (1주) — iOS 결제 분기 (free tier only)
Phase 5 (1~2주) — App Store Connect 등록 + Review 통과
```

---

## 2. 사전 준비 (Prerequisites)

### 2.1 Mac 환경

iOS 빌드는 **Xcode 가 필수**이고 Xcode 는 macOS 전용이다. Windows / Linux 로는 우회 불가.

| 옵션 | 비용 | 장점 | 단점 |
|---|---|---|---|
| 직접 Mac 구매 (M2 Mac mini) | ~85만원 | 영구 사용 | 초기 부담 |
| 친구 / 가족 Mac 빌림 | 0원 | 즉시 가능 | 빌드마다 이동, 검수 대응 지연 |
| **MacInCloud** | $30/월 (managed) | 카드만 있으면 즉시 | 네트워크 지연, Xcode 설치 시간 |
| **MacStadium** | $79/월 (Mac mini) | dedicated, 빠름 | 비쌈 |
| GitHub Actions macOS runner | $0 (월 2000분 무료) | CI 빌드 자동화 | 인터랙티브 Xcode 불가, 검수 stage 부족 |

**권장 path**: Phase 0 에서 친구 Mac 1주 빌려서 Capacitor + Xcode 학습 → Phase 3~5 본 작업 시 MacInCloud 월 $30 으로 2~3 달 사용 (총 $60~$90).

### 2.2 Apple Developer Program

- URL: https://developer.apple.com/programs/
- 비용: **$99/년** (USD, 약 14만원)
- 가입 form: 개인 (Individual) 으로 충분. 사업자 (Organization) 는 DUNS 번호 필요해서 복잡.
- 가입 후 활성화까지 **24~48 시간** 소요 (Apple 심사).
- 카드: Apple ID 에 연결된 카드 필수. 한국 카드 가능.

### 2.3 Bundle Identifier

- 현재 Android TWA packageId: `com.soragodong.app`
- iOS Bundle ID 도 **동일하게 `com.soragodong.app` 권장** (Capacitor 통합 + 추후 Universal Link 일관성).
- App Store Connect 에서 등록: Certificates, IDs & Profiles → Identifiers → App IDs → New.

### 2.4 로컬 환경

이미 갖춰진 것:
- Node.js / npm (이미 사용 중)
- Git, 그리고 codebase

추가로 필요:
- Xcode (Mac App Store, 무료, 약 12 GB)
- Xcode Command Line Tools: `xcode-select --install`
- CocoaPods: `sudo gem install cocoapods` (Capacitor iOS 가 의존)

---

## 3. Capacitor Migration (Android + iOS 통합)

### 3.1 왜 Capacitor 인가

- TWA = Chrome 의 Custom Tabs wrapper. Google 정책에 종속, "wrapper" 의심 받기 쉬움.
- Capacitor = WebView (Android) / WKWebView (iOS) 안에 web 을 띄우고, **native plugin bridge** 를 제공.
- 같은 web codebase 로 Android + iOS 양쪽 빌드 가능.
- src/ → public/ 빌드 파이프라인 그대로 유지. concat-build (build.mjs) 손대지 않음.

### 3.2 Capacitor 도입

```bash
# 프로젝트 루트에서
npm install --save-dev @capacitor/core @capacitor/cli
npx cap init "소라고동" com.soragodong.app --web-dir=public
```

생성되는 `capacitor.config.ts` 예시:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.soragodong.app',
  appName: '소라고동',
  webDir: 'public',
  server: {
    // 권장: remote 모드. web 변경이 즉시 반영, 앱 재배포 불필요.
    url: 'https://soragodong.com',
    cleartext: false,
    // androidScheme: 'https',
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true, // service worker + ITP
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#FFF8EE',
      androidSplashResourceName: 'splash',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
```

### 3.3 remote vs bundled 모드 선택

| 모드 | 동작 | 장점 | 단점 |
|---|---|---|---|
| **remote** (`server.url`) | 앱이 매번 soragodong.com 을 WKWebView 로 load | web update 즉시 반영, 빌드 1회로 끝 | Apple 검수 시 "그냥 wrapper" 라며 4.2 reject 위험 ↑, offline 사용 X |
| **bundled** (`webDir: 'public'`) | public/ 의 정적 파일을 앱에 묶어 배포 | offline OK, native feel ↑, 검수 통과율 ↑ | 매 web update 마다 앱 재배포 + Apple Review (1~3 일) 필요 |

**권장**: **hybrid**. `webDir: 'public'` 으로 핵심 셸을 번들링하되, 동적 데이터 (Supabase / Claude API) 는 remote 호출. 즉, `server.url` 을 비우고 `webDir` 만 지정. 이 방식이 Apple Review 통과율이 가장 높다.

Cloudflare Pages 의 web 변경 → public/ 재빌드 → `npx cap copy` → Xcode 빌드 → TestFlight 또는 App Store 재배포. **즉시 반영 X**. 큰 hot fix 가 필요할 때는 web push 메시지 또는 in-app banner 로 update 유도.

### 3.4 Android target (TWA → Capacitor 전환)

```bash
npx cap add android
npx cap sync android
npx cap open android  # Android Studio 열림
```

**기존 자산 처리**:

| 자산 | 처리 |
|---|---|
| `app/` (Bubblewrap TWA 폴더) | **폐기**. `_emergency_backup/` 으로 이동 후 삭제. |
| `android.keystore` | **재사용**. Capacitor android 프로젝트의 `app/build.gradle` 의 signingConfigs 에 동일 keystore 지정. 같은 packageId + 같은 keystore = Play Console 이 동일 앱으로 인식 → 기존 비공개 테스터 그대로 유지. |
| `assetlinks.json` (Digital Asset Links) | **삭제 가능**. TWA 만 필요했음. Capacitor WebView 는 origin 체크 X. 다만 향후 Universal Link / App Links 도입 시 다시 필요. |
| AndroidManifest.xml | Capacitor 가 새로 생성. 기존 TWA Manifest 의 INTENT FILTER, custom theme 등은 수동으로 옮겨야 함. |
| 아이콘 / Splash | `npx @capacitor/assets generate` 로 godongicon.png 한 장으로 일괄 생성 가능. |

### 3.5 iOS target

```bash
npx cap add ios
npx cap sync ios
npx cap open ios  # Xcode 열림
```

Xcode 에서 수동 작업:

1. **Signing & Capabilities**: Team = Apple Developer 계정, Bundle Identifier = `com.soragodong.app`.
2. **Provisioning Profile**: Automatic 모드 권장. (수동은 cert + profile 관리 복잡)
3. **Capabilities 추가**: Push Notifications, Background Modes (remote-notification, fetch).
4. **Info.plist**: 권한 사용 사유 문구 (한국어).
   - `NSCameraUsageDescription`: "미션 인증 사진 / 영상을 찍기 위해 카메라가 필요해."
   - `NSPhotoLibraryUsageDescription`: "미션 인증 영상을 저장하기 위해 사진 라이브러리 접근이 필요해."
   - `NSMicrophoneUsageDescription`: "영상 인증에 소리를 함께 담기 위해 마이크가 필요해."
   - `NSLocationWhenInUseUsageDescription`: "(만약 사용 시) 위치 기반 회상 기능을 위해 위치 정보가 필요해."

---

## 4. WebKit 호환성 체크리스트

iOS WKWebView 는 Safari 와 거의 동일한 엔진을 쓴다. 단 일부 API 는 PWA / 일반 Safari / WKWebView 별로 지원 차이가 있음.

| API | 사용 위치 | iOS WKWebView 지원 | 대응 |
|---|---|---|---|
| **Service Worker** | `public/sw.js` | iOS 16.4+ 지원, BUT WKWebView 내에서는 origin 제약 강함 | 확인: `limitsNavigationsToAppBoundDomains` + WKAppBoundDomains Info.plist 등록. 안 되면 SW 없이 동작 fallback (이미 hook system 일부 SW 의존). |
| **Web Push (VAPID)** | `functions/api/hook/cron-push.ts` | **iOS Safari PWA 한정 (16.4+)**, WKWebView 에서는 작동 X | → **APNs 로 마이그 필수**. Capacitor `@capacitor/push-notifications` plugin 사용. (자세히는 §6) |
| **WebCodecs** | `src/scripts/main/12-mission/13-video-compress.js` | **iOS 17.4+ 부분 지원** (VideoEncoder/VideoDecoder), 16.x 이하 미지원 | fallback 3 단계: ① feature detect, ② 미지원 시 원본 그대로 업로드, ③ 또는 server-side compress (Cloudflare Worker + FFmpeg WASM). iOS 17.4 미만 사용자는 압축 skip. |
| **IndexedDB** | E2EE key 저장 / 캐시 | 지원 OK, 단 7일 미사용 시 storage clear (ITP) | 사용자 14일 이상 미접속 시 E2EE key 재발급 흐름 (이미 `03-auth/07-e2ee-recovery-modal.js` 에 있음). 점검 필요. |
| **getUserMedia** | 미션 사진/영상 캡처 | 지원 OK | 권한 prompt 한국어 (위 Info.plist). |
| **Web Audio** | `29-music.js` (iTunes preview 재생) | 지원 OK, 단 **사용자 제스처 없이 autoplay 불가** | 이미 user gesture 기반. iOS 검토 시 silent mode 에서도 재생되는지 확인 (필요 시 `AVAudioSession` native plugin). |
| **Geolocation** | (있다면) | 지원 OK, 권한 prompt 필요 | Info.plist 문구. |
| **Web Crypto (E2EE)** | `03-auth/04-e2ee-helpers.js` ~ 07 | 지원 OK (모든 WKWebView) | 변경 없음. |
| **localStorage / sessionStorage** | 전반 | 지원 OK, ITP 영향 받음 | IndexedDB 와 동일. |
| **FullScreen API** | (영상 재생 시) | iOS 는 video tag 의 playsinline 권장 | `<video playsinline>` 확인. |
| **`prefers-color-scheme`** | (있다면) | OK | |

### 4.1 호환성 검증 체크리스트 (Phase 3 작업)

- [ ] 친구 / 본인 iPhone 에 TestFlight 로 설치 (또는 Xcode → 연결된 iPhone 직접 실행)
- [ ] 로그인 (OTP) → 메인 화면 도달
- [ ] E2EE 비밀번호 설정 → IndexedDB 저장 확인
- [ ] 챗 입력 → AI 응답 수신 (Anthropic API 호출)
- [ ] 미션 사진 캡처 → 업로드
- [ ] 미션 영상 캡처 → WebCodecs fallback 동작 확인 (iOS 17.4 미만 device 도 1대)
- [ ] Native push 알림 수신 (Phase 6 작업과 묶음)
- [ ] 백그라운드 → 포그라운드 복귀 시 데이터 유지
- [ ] 음악 (iTunes preview) 재생
- [ ] Sentry 에 iOS 디바이스 에러 들어오는지 확인

---

## 5. 결제 흐름 재설계 (가장 큰 정책 작업)

### 5.1 Apple App Store Review Guideline 3.1.1

> "Apps using IAP to offer digital goods or services must use Apple's in-app purchase system. Apps may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than IAP."

- 외부 결제 페이지 redirect = **즉시 reject** (binary rejection, appeal 어려움).
- 한국 외부결제 옵션 (2022.06 전기통신사업법 개정 적용) 은 **Apple 도 fee 부과** (26%) → 실효성 거의 없음.
- 현재 PortOne V2 + KG이니시스 / 카카오페이 / 토스페이 5 채널 = **iOS 앱 안에서 직접 노출 시 무조건 reject**.

### 5.2 3 가지 옵션 비교

| 옵션 | 시간 | 비용 / 수수료 | revenue 영향 | 검수 통과율 |
|---|---|---|---|---|
| **A. iOS free tier only** | 0.5 ~ 1주 | Apple 수수료 0% (결제 없음) | Plus / Premium 구독 iOS 신규 가입 0 (기존 사용자는 web 에서 갱신 가능) | 매우 높음 |
| **B. Apple StoreKit2 통합** | 1 ~ 3주 + Cloudflare server-to-server validation 작업 | Apple 30% (또는 Small Business Program 15%, 연매출 $1M 미만 시) | iOS 구독 정상 진행, but 수수료로 net 70% / 85% | 보통 (가격 표기 / restore purchase / family sharing 등 detail 까다로움) |
| **C. 한국 외부결제 entitlement** | 2 ~ 4주 + Apple 별도 신청 + 한국 사업자 등록증 필요 | Apple 11% + PG fee 별도 (사실상 26%) | 30% 보다 약간 절감, but 사업자등록 필수 | 낮음 (별도 entitlement 신청 + 한국 limit) |

### 5.3 Phase 1 권장: 옵션 A (iOS free tier only)

**구현 방법**:

1. iOS 빌드 시점에 `window.IS_IOS_APP_STORE = true` 플래그 주입 (Capacitor 의 `Capacitor.getPlatform() === 'ios'` 또는 build-time inject).
2. `src/scripts/main/32-billing/` 안에서 플래그 체크:
   - `08-subscribe-modal.js` — 구독 모달 호출 시 iOS 면 "현재 iOS 에서는 무료 플랜만 제공해. soragodong.com 에서 로그인 후 업그레이드 가능해" 안내 modal 만 띄움.
   - `09-toss-subscribe.js`, `10-overage-purchase.js` — iOS 면 entry 자체 hide.
3. 기존 Plus / Premium 사용자는 Supabase `subscriptions` 테이블 기준으로 plan 인식. iOS 앱에서도 그대로 Plus / Premium 기능 사용 가능 (구매만 막은 것).
4. UI 에서 "Plus 혜택", "Premium 혜택" 마케팅 카피는 **유지 가능** (실제 결제 버튼만 hide). Apple 가이드 3.1.3(b) — "Multiplatform Services" 예외: 다른 플랫폼에서 산 컨텐츠를 iOS 에서 보여주는 건 허용.
5. 단 **"web 에서 구매하세요" 라는 직접 안내 + 외부 링크는 금지**. 그냥 "이 플랜은 iOS 앱에서 가입할 수 없어" 로 끝.

**리스크**: 작음. Apple 이 가장 자주 통과시키는 패턴.

### 5.4 Phase 2 (옵션): Apple StoreKit2 통합

조건: 사용자 1000명 이상 + iOS 구독 의향 측정 (분기 1회).

작업:
1. Apple StoreKit2 product 등록 (App Store Connect → In-App Purchases).
   - `com.soragodong.app.plus.monthly` (₩4,400 또는 Apple 단가표)
   - `com.soragodong.app.premium.monthly` (₩9,900)
2. Capacitor plugin: `cordova-plugin-purchase` (StoreKit2 지원 fork) 또는 native bridge 직접 작성.
3. 구매 영수증 → Cloudflare Worker → Apple `verifyReceipt` (legacy) 또는 App Store Server API 로 검증.
4. 검증 OK → Supabase `subscriptions` 테이블 upsert (기존 PortOne 흐름과 통합).
5. Restore Purchase 버튼 (Apple 필수).
6. Subscription Group 설정 (Plus / Premium 같은 group → 사용자가 한 번에 하나만 구독).
7. Small Business Program 가입 (App Store Connect → Agreements). 신청 후 활성화까지 ~1주.

**Small Business Program**: 연 매출 (전 세계) $1M 미만 + Developer Program 가입 자동 자격 → 수수료 30% → 15%. 베타 단계라면 자동 적합.

### 5.5 Phase 1 결정 매트릭스 정리

```
iOS 첫 출시
  ├── 결제 노출? NO (옵션 A)
  ├── Plus/Premium 사용자 iOS 에서 기능 사용? YES
  ├── 신규 사용자 iOS 에서 유료 가입? NO (web 에서만)
  └── Apple Review 통과 확률? 높음
```

---

## 6. Native Push 마이그 (Web Push 의 iOS 미작동 해결 부수효과)

### 6.1 현황

- 현재: VAPID + RFC 8030 Web Push.
- 발사: `functions/api/hook/cron-push.ts` (Cloudflare Worker scheduled trigger).
- 구독 저장: Supabase `push_subscriptions` 테이블 (endpoint, keys).
- 동작 환경: Android Chrome PWA / iOS Safari PWA 16.4+ / Desktop Chrome / Firefox.
- 문제: **WKWebView (Capacitor iOS) 안에서는 Web Push API 작동 X**. iOS Capacitor 앱은 native APNs 필수.

### 6.2 마이그 plan

**선택지**:

| 안 | 동작 | 복잡도 |
|---|---|---|
| (a) 둘 다 유지 | web push subscription + native (APNs/FCM) token 둘 다 받아서 device 별 분기 발사 | 보통 |
| (b) 완전 마이그 | web 도 FCM web push 로 통합 (Firebase Cloud Messaging) | 큼 |
| (c) iOS 만 native | iOS 만 APNs 추가, Android / web 은 VAPID 그대로 | 작음 |

**권장**: **(c) iOS 만 native APNs 추가**.

### 6.3 구현 (Phase 4 작업)

1. **Capacitor Push Notifications plugin**:
   ```bash
   npm install @capacitor/push-notifications
   npx cap sync ios
   ```

2. **클라이언트 등록 로직** (web codebase 에 추가):
   ```javascript
   // src/scripts/main/03-auth/ 또는 init 단계 어딘가
   async function registerNativePush() {
     if (window.Capacitor?.getPlatform() !== 'ios') return; // iOS only
     const { PushNotifications } = window.Capacitor.Plugins;
     const perm = await PushNotifications.requestPermissions();
     if (perm.receive !== 'granted') return;
     await PushNotifications.register();
     PushNotifications.addListener('registration', async (token) => {
       // token.value = APNs device token (hex string)
       await supabase.from('push_subscriptions').upsert({
         user_id: currentUser.id,
         platform: 'ios_apns',
         token: token.value,
         endpoint: null, // web push 와 schema 공유 시 null
       });
     });
   }
   ```

3. **Supabase 스키마 확장**:
   ```sql
   ALTER TABLE push_subscriptions
     ADD COLUMN platform TEXT DEFAULT 'web_vapid', -- 'web_vapid' | 'ios_apns' | 'android_fcm'
     ADD COLUMN token TEXT; -- APNs / FCM token
   -- 기존 endpoint, keys 컬럼은 web_vapid 용으로 유지
   ```

4. **서버 발사 분기** (`functions/api/hook/cron-push.ts`):
   ```typescript
   for (const sub of subs) {
     if (sub.platform === 'web_vapid') {
       await sendWebPush(sub.endpoint, sub.keys, payload);
     } else if (sub.platform === 'ios_apns') {
       await sendAPNs(sub.token, payload); // node-apn 또는 Cloudflare 호환 lib
     }
   }
   ```

5. **APNs Auth Key** 발급 (Apple Developer Portal → Keys → New Key, "Apple Push Notifications service" 체크). `.p8` 파일 다운로드 → Cloudflare Worker secret 으로 저장.

6. **APNs Topic** = Bundle ID (`com.soragodong.app`).

### 6.4 hook system 영향

`_hook-system-spec.md` + `functions/api/hook/` 에 정의된 6 routes (generate / preferences / queue / cron-push / pending / answered) 중 `cron-push.ts` 만 변경. 나머지 route 는 platform 무관 (DB 만 조작).

---

## 7. App Store Listing 준비

### 7.1 메타데이터

| 필드 | 값 |
|---|---|
| App Name | 소라고동 |
| Subtitle (30자) | "ADHD 자기관찰 친구" 또는 "내 마음 흔적 기록 친구" |
| Promotional Text (170자) | "고동이가 매일 너의 하루를 함께 들여다봐. 흩어진 생각을 모래사장 위 조개껍데기처럼 정리하고, 의미를 발견해줘." |
| Description | 1000자 내외, 한국어. AI 자기관찰, E2EE 종단간 암호화, 모래사장 / 조개 / 진주 UX, ADHD 친화 설명. |
| Keywords (100자) | ADHD,자기관찰,일기,저널링,감정기록,마음건강,자기이해,습관,회고,AI친구 |
| Category | Primary: Health & Fitness, Secondary: Lifestyle |
| Age Rating | 12+ (감정 / 정신건강 내용 포함) |
| Price | Free |
| In-App Purchases | Phase 1 = 없음 / Phase 2 = Plus 월 ₩4,400, Premium 월 ₩9,900 |

### 7.2 Screenshots

iPhone 다양한 화면 비율 필요. **6.9" + 6.5" 두 set 만 있어도 통과**. Apple 가 작은 화면 자동 letterbox.

| Device class | 해상도 | 매수 |
|---|---|---|
| 6.9" (iPhone 16 Pro Max) | 1320 × 2868 | 3 ~ 10 |
| 6.5" (iPhone 11 Pro Max) | 1242 × 2688 | 3 ~ 10 |
| 5.5" (iPhone 8 Plus) | 1242 × 2208 | optional |
| iPad Pro 12.9" | 2048 × 2732 | optional (iPad 미지원 시 skip) |

권장 5 컷:
1. 홈 화면 (체크인 + 모래사장 + 마법고동 + 깜빡임 점 효과)
2. 챗 대화 (고동이 답변)
3. 미션 인증 (사진 + 진주 화면)
4. 도서관 / 아카이브 (글뭉치 시각화)
5. DNA 진주 SVG (개인화 차별점)

### 7.3 App Privacy Form

Apple "Nutrition Label" 양식. 정확히 답해야 함 (허위 시 reject + ban).

| 데이터 카테고리 | 수집? | 용도 | 식별? |
|---|---|---|---|
| Email Address | Yes (OTP 로그인) | App Functionality | Linked to User |
| Health & Fitness > Mental Health | Yes (감정 / mood / vitality / sleep) | App Functionality | Linked to User |
| User Content > Other (일기 / 챗) | Yes | App Functionality | Linked to User (단, **E2EE 암호화** 명시) |
| Identifiers > User ID | Yes (Supabase user_id) | App Functionality | Linked to User |
| Usage Data > Product Interaction | Yes (Sentry / 분석) | Analytics | Linked to User (Sentry user context) |
| Diagnostics > Crash Data | Yes (Sentry) | App Functionality / Analytics | Not Linked |

**E2EE 강조**: Privacy Policy + App Privacy Form 양쪽에 "사용자 일기 / 챗 내용은 E2EE 종단간 암호화되어 Apple, 서버 운영자도 복호화 불가능" 명시.

### 7.4 Privacy Policy + Support URL

- Privacy Policy URL: 이미 있음 (`soragodong.com/privacy` 등). 점검 — Apple 검수자가 link 따라가서 한국어 + 영어 둘 다 있는지 확인. 영어 없으면 영어 section 추가 권장.
- Support URL: `soragodong.com/support` 또는 이메일 `bsya21@gmail.com` 게재 페이지.
- Marketing URL: optional.

### 7.5 App Review Notes

검수자에게 보낼 메모 (한국어 / 영어 권장):

```
Test account:
  Email: review@soragodong.com
  OTP: (검수자 요청 시 임시 OTP 발급, support@soragodong.com 으로 회신)

About this app:
  소라고동 is a self-observation companion app for users with ADHD or
  scattered thoughts. The "Sora" character (고동이) helps users reflect on
  daily moments using AI conversation, image-based missions, and a
  pearl/seashell visualization metaphor.

  This app does NOT diagnose or treat any medical condition. We display
  a crisis hotline (Korean Lifeline 1577-0199, Suicide Hotline 1393)
  when keywords suggest user distress, but we DO NOT provide therapy
  or medical advice.

  All user diary/chat content is end-to-end encrypted with Web Crypto API.
  Neither Apple, Anthropic, nor we can decrypt this content.

  Payments: All premium features are accessible without payment in
  this iOS version. Subscription purchases are not available in the
  iOS app per our current launch plan.
```

---

## 8. App Review 통과 전략

### 8.1 자주 걸리는 가이드라인

| Guideline | 위험도 | 대응 |
|---|---|---|
| **4.2 Minimum Functionality** | 높음 | "단순 web wrapper" 의심. 대응: native push, native splash, native camera 권한 / capture, native splash screen, native haptic 등 **Capacitor plugin 을 최소 3개 이상 활용**해서 "wrapper 가 아닌 native 통합 앱" 어필. |
| **3.1.1 In-App Purchase** | 중 (Phase 1 회피) | Phase 1 = 결제 entry 자체 hide. 외부 결제 buttons / links 0개. |
| **5.1.1 Privacy** | 중 | App Privacy Form 정확, Privacy Policy 한국어 + 영어, 데이터 사용 사유 Info.plist 명시. |
| **1.4 Physical Harm (Mental Health)** | 중 | 정신건강 관련 disclaimer + 위기 신호 안내 (1393 / 1577-0199 / 다음스토리 메모) + "의료 진단 / 치료 X" 명시. |
| **2.1 App Completeness** | 중 | 베타 기능 표시 X. 미완성 screen 숨김. 모든 버튼 동작. |
| **5.1.2 Data Use** | 낮음 | E2EE 강조. 사용자 데이터 third-party 매도 X. |

### 8.2 차별점 (Minimum Functionality 회피 카드)

- **DNA 진주 SVG 시각화** (수학적 helix 알고리즘) — 다른 ADHD / 일기 앱에 없는 unique element.
- **모래사장 모드 + 셸 컬렉션** — 시각적 메타포 게임 요소.
- **E2EE 종단간 암호화** — 의료 / 정신건강 앱 중 드문 강도.
- **AI 자기관찰 chat (Anthropic Claude)** — 단순 일기 X, 상호작용형.
- **Capacitor native plugin 통합 목록** (어필 포인트):
  - `@capacitor/push-notifications` (APNs)
  - `@capacitor/camera` (미션 사진)
  - `@capacitor/haptics` (셀러브레이션 진동)
  - `@capacitor/share` (조개 / 진주 공유)
  - `@capacitor/local-notifications` (hook 알림 fallback)
  - `@capacitor/app` (백그라운드 복귀 처리)

### 8.3 Mental Wellness 분류

App Store 의 "Mental Wellness" 분류 자체는 없음 (Health & Fitness 안의 sub). 단 Apple 은 정신건강 관련 앱을 별도로 review 강화. 통과 키 포인트:

- "치료 / 진단 / 치유" 단어 회피. "기록 / 관찰 / 친구" 단어 권장.
- 위기 안내 (Crisis Hotline): 한국 — 1393 (자살예방상담), 1577-0199 (정신건강위기상담). 키워드 트리거 (예: "죽고 싶어") 발생 시 즉시 표시.
- 의료 disclaimer in Description + Onboarding 첫 화면 또는 ToS.

---

## 9. 단계별 milestone + 일정

### 9.1 Phase 0 — 사전 준비 (1주)

- [ ] Mac 확보 결정 (직접 / 친구 / Cloud)
- [ ] Apple Developer Program 가입 + 결제 ($99)
- [ ] Apple ID 2FA 활성화
- [ ] App Store Connect 로그인 확인
- [ ] Bundle ID 등록 (`com.soragodong.app`)
- [ ] Xcode 설치 + Command Line Tools + CocoaPods
- [ ] Capacitor 공식 docs 1회독 (https://capacitorjs.com/docs)
- [ ] Ionic Capacitor iOS tutorial 1개 따라하기

### 9.2 Phase 1 — Capacitor 도입 (1~2주)

- [ ] 새 git branch `feat/capacitor` 생성
- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`
- [ ] `npx cap init`, `capacitor.config.ts` 작성
- [ ] `npx cap add android` → Android Studio 빌드 확인
- [ ] `@capacitor/push-notifications`, `@capacitor/camera`, `@capacitor/haptics` 등 plugin 도입
- [ ] 웹 codebase 에 `Capacitor.getPlatform()` 분기 로직 추가 (push / camera)
- [ ] 로컬 Android 에뮬레이터에서 동작 확인
- [ ] PR merge to main

### 9.3 Phase 2 — Android Play Store 재출시 (1~2주)

- [ ] Capacitor Android signed APK / AAB 빌드 (`android.keystore` 재사용)
- [ ] Internal Testing → Closed Testing 트랙 업로드
- [ ] 기존 TWA 비공개 테스터들에게 "Capacitor 빌드로 갱신" 공지
- [ ] 1주 internal testing 후 production rollout (10% → 50% → 100%)
- [ ] TWA 폐기 (Play Console 에서 old AAB version 만 inactive)

### 9.4 Phase 3 — iOS Xcode 빌드 + WebKit 호환성 fix (1주)

- [ ] `npx cap add ios`
- [ ] Xcode 에서 iPhone simulator 빌드 성공
- [ ] 실 device 빌드 (USB 연결, signing 확인)
- [ ] §4 WebKit 호환성 체크리스트 전체 통과
- [ ] WebCodecs fallback 로직 검증 (iOS 17.4 미만 device 1대)
- [ ] Sentry iOS 디바이스 에러 캡처 확인

### 9.5 Phase 4 — iOS 결제 분기 (1주)

- [ ] `window.IS_IOS_APP_STORE` 또는 `Capacitor.getPlatform() === 'ios'` 분기
- [ ] `src/scripts/main/32-billing/08-subscribe-modal.js` 에 iOS guard
- [ ] `09-toss-subscribe.js`, `10-overage-purchase.js` entry hide
- [ ] iOS 빌드에서 "구독 / Plus / Premium" 버튼이 결제 redirect 없는지 직접 클릭 확인
- [ ] 외부 결제 URL 호출 0건 보장 (Charles Proxy 또는 Xcode Network 모니터)

### 9.6 Phase 5 — App Store submission + Review (1~2주)

- [ ] App Store Connect 에 신규 앱 생성
- [ ] §7 메타데이터 입력
- [ ] Screenshots 업로드 (6.9" + 6.5")
- [ ] App Privacy Form 작성
- [ ] App Review Notes 작성 (test account 정보)
- [ ] Xcode → Archive → Distribute → Upload to App Store Connect
- [ ] TestFlight Internal Testing 1주 (본인 + 1~2 friend)
- [ ] TestFlight External Testing (선택)
- [ ] Submit for Review
- [ ] Review 대기 (평균 24~48 시간, 최대 7일)
- [ ] Approved → Manual Release → 출시

### 9.7 비용 추정 (총)

| 항목 | 비용 |
|---|---|
| Apple Developer Program | $99 (₩135,000) |
| MacInCloud 2~3개월 | $60 ~ $90 (₩80,000 ~ ₩120,000) |
| (옵션) Mac mini M2 | ₩850,000 |
| Cloudflare / Supabase / Anthropic | 변화 없음 |
| **최소** (친구 Mac + Cloud Mac 2개월) | **약 ₩215,000** |
| **최대** (Mac mini 직접 구매) | **약 ₩985,000** |

---

## 10. Risk + 대응

| Risk | 발생 확률 | 대응 |
|---|---|---|
| Apple Review reject — 4.2 Minimum Functionality | 중 | Capacitor plugin 3개+ 도입 어필, native splash / push / haptic / camera, Description 에 unique 기능 강조. reject 시 appeal (한국어 X, 영어로) 또는 plugin 추가 후 재제출. |
| Apple Review reject — 3.1.1 IAP | 낮음 (Phase 1 회피) | iOS 빌드에 결제 entry 0개 보장. Charles Proxy 로 외부 결제 redirect 0건 확인. |
| Apple Review reject — 1.4 Physical Harm | 낮음 | Disclaimer + 위기 hotline + "치료 X" 명시. |
| WebCodecs 미지원으로 영상 인증 실패 | 중 | feature detect + fallback (원본 업로드 또는 server-side compress). iOS 17.4 미만 사용자에게 in-app 안내 ("iOS 17.4 이상에서 자동 압축 지원"). |
| APNs 마이그 작업 지연 | 중 | Phase 1 출시 시 push 알림 일시적 disable 도 OK. 출시 후 hotfix 로 추가. |
| 30% Apple 수수료 (Phase 2) | (Phase 2 전까지 N/A) | Small Business Program 가입 → 15%. |
| iOS / Android 사용자 데이터 sync | 낮음 | 이미 Supabase 로 cloud sync, E2EE key 도 user account 에 연결. 신규 iOS device 첫 로그인 시 E2EE recovery flow 동작 확인. |
| TWA → Capacitor 전환 시 기존 Android 사용자 로그인 풀림 | 중 | 같은 packageId + 같은 keystore = Play Console 동일 앱 인식. WebView 의 localStorage / IndexedDB 는 TWA 와 다른 storage. → **사용자 OTP 재로그인 + E2EE 복구 필요**. 사전 공지 + in-app banner. |
| 1인 개발자 검수 대응 burnout | 중 | Phase 5 review 기간에 다른 작업 일정 비워두기. 첫 reject 는 흔함, 1~2회 반복 예상. |

---

## 11. 의사결정 매트릭스

### 11.1 출시 시기

| 시점 | 장점 | 단점 |
|---|---|---|
| 즉시 (베타 사용자 ~10명) | iOS 사용자 1~2명 즉시 확보 가능, Apple Review 사이클 빨리 학습 | Android Capacitor 아직 검증 안 됨, 동시 진행 부담 |
| **사용자 100명 후 (Android Capacitor 안정화)** | Android 에서 Capacitor 버그 1차 잡힘, iOS 동일 codebase 안정성 ↑ | iOS 출시까지 추가 1~2개월 대기 |

**권장**: 사용자 100명 또는 Capacitor Android 출시 후 2개월 안정화 후.

### 11.2 iOS 출시 vs Android only

| 시나리오 | iOS 출시 의미 |
|---|---|
| 베타에서 iOS 요청 사용자 0~1명 | 미루기. Android Capacitor 안정화에 집중. |
| 베타에서 iOS 요청 사용자 5명+ | 출시 진행. 1인 개발자 capacity 가 제일 비싼 자원 — iOS 출시는 6주+ block. |
| 한국 시장 타깃 | 한국 iOS 점유율 30%+ → 장기적으로 출시 필수. 단 시점은 위 §11.1 기준. |

---

## 12. 즉시 액션 체크리스트

지금 (Phase 0 시작 전) 할 수 있는 것:

- [ ] Mac 조달 결정 — 친구 / 가족에게 1주 빌림 가능한지 문의
- [ ] Apple Developer Program 가입 ($99 결제) — https://developer.apple.com/programs/enroll/
- [ ] Bundle ID `com.soragodong.app` 가입 (Apple Developer Portal)
- [ ] Capacitor 공식 docs URL 북마크: https://capacitorjs.com/docs/getting-started
- [ ] iOS Safari WebCodecs 지원 현황 재확인 (caniuse.com)
- [ ] `_emergency_backup/app-twa-bubblewrap/` 백업 폴더 생성 (Phase 1 시작 전 옛 TWA 폴더 안전 보관)
- [ ] Privacy Policy 영어 section 추가 검토 (한국어만 있을 시)
- [ ] Crisis Hotline 1393 / 1577-0199 표시 로직 점검 (`20-system-prompt.js` 의 escalation keyword)
- [ ] App Store screenshot 5컷 mock 작업 의뢰 또는 직접 작업 일정 잡기
- [ ] 가족 / 친구 중 iPhone 보유자 2명 — TestFlight 베타 tester 후보 확정

---

## 부록 A — capacitor.config.ts 최종 권장 형태

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.soragodong.app',
  appName: '소라고동',
  webDir: 'public',
  // server.url 은 비워두는 hybrid 모드 (Apple Review 통과율 ↑)
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true,
    preferredContentMode: 'mobile',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#FFF8EE',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'native',
      style: 'light',
    },
  },
};

export default config;
```

## 부록 B — iOS 빌드 자동화 (선택)

GitHub Actions macOS runner 로 매 main push 마다 .ipa 자동 빌드:

```yaml
# .github/workflows/ios-build.yml
name: iOS Build
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npx cap sync ios
      - run: cd ios/App && pod install
      - name: Archive
        run: |
          cd ios/App
          xcodebuild -workspace App.xcworkspace -scheme App \
            -configuration Release archive \
            -archivePath $PWD/build/App.xcarchive
      # Code signing + upload 단계는 별도 secret + fastlane 권장
```

월 2000분 무료 (private repo). macOS runner 는 분당 10배 가중치 → 사실상 200분/월.

## 부록 C — 검수 reject 응답 templates

**Case 1: 4.2 Minimum Functionality reject**

```
Hi App Review,

We appreciate the feedback. We'd like to highlight that 소라고동 is not
a generic web wrapper:

1. The app uses native APNs push notifications via APNs Auth Key
   (capacitor/push-notifications), not web push.
2. The app uses native camera access (capacitor/camera) for mission
   verification with on-device image processing.
3. The app uses native haptic feedback (capacitor/haptics) for the
   pearl celebration animation, which is not available in mobile Safari.
4. The DNA Pearl SVG visualization uses a mathematical helix algorithm
   unique to this app.
5. All user diary/chat content is end-to-end encrypted using Web Crypto API,
   meaning even we cannot read it — this is rare among journaling apps.

We hope these details clarify the app's value beyond a web view.
We've also added [specific native feature X] in this resubmission to
further demonstrate native integration.

Best regards,
김나은
```

---

*문서 끝. 변경 사항은 commit log 로 추적. 의문점 발생 시 이 문서 + Apple Developer Forums + Capacitor Discord 참고.*
