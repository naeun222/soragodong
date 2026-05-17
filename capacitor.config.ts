import type { CapacitorConfig } from '@capacitor/cli';

// V4 (사용자 명시 2026-05-17 ultrathink) — Capacitor hybrid bundled 모드.
//   server.url 비움 → public/ 정적 자산을 native 안에 묶어 배포.
//   web hotfix 즉시 반영 X (앱 재빌드 필요) — Apple/Play 검수 통과율 우선.
//   backgroundColor #0F0E17 = public manifest.webmanifest 의 background_color 일치.
const config: CapacitorConfig = {
  appId: 'com.soragodong.app',
  appName: '소라고동',
  webDir: 'public',
  // V4 fix (사용자 보고 2026-05-18 ultrathink) — WebView 의 base URL 위장.
  //   default = https://localhost → 카카오 OAuth callback (soragodong.com 등록) 불일치로
  //   로그인 후 게스트로 인식, Notification permission 도 origin 분리되어 prompt 안 뜸.
  //   server.hostname=soragodong.com → web 과 동일 origin 인식, localStorage / SW / OAuth callback 동작.
  //   주의: fetch('/api/...') 는 그대로 https://soragodong.com 으로 실제 네트워크 호출 (bundled assets 와는 별개).
  server: {
    hostname: 'soragodong.com',
    androidScheme: 'https',
    // V4 fix (사용자 보고 2026-05-18 ultrathink) — Capacitor WebView 의 base origin 위장 = https://soragodong.com.
    //   효과: localStorage / Notification 권한 / Supabase OAuth implicit flow 의 callback hash 처리 모두 web 동일 origin 인식.
    //   카카오 OAuth 는 외부 Chrome Custom Tabs (@capacitor/browser) 으로 던져 카카오톡 SSO deep link 활성 — allowNavigation 으로 WebView 안에서 처리 X.
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0F0E17',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
