import type { CapacitorConfig } from '@capacitor/cli';

// V4 (사용자 명시 2026-05-17 ultrathink) — Capacitor hybrid bundled 모드.
//   server.url 비움 → public/ 정적 자산을 native 안에 묶어 배포.
//   web hotfix 즉시 반영 X (앱 재빌드 필요) — Apple/Play 검수 통과율 우선.
//   backgroundColor #0F0E17 = public manifest.webmanifest 의 background_color 일치.
const config: CapacitorConfig = {
  appId: 'com.soragodong.app',
  appName: '소라고동',
  webDir: 'public',
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
