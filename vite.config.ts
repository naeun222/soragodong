import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// 사용자 명시 2026-05-01 (agent audit): APP_VERSION (index.html) → version.txt 자동 sync.
// 이전 = 수동 갱신 2자리 → 한 곳만 갱신 시 checkServerVersionAndReload 무한 reload loop risk.
function appVersionSyncPlugin() {
  return {
    name: 'app-version-sync',
    closeBundle() {
      try {
        const html = readFileSync(resolve('dist/index.html'), 'utf-8');
        const match = html.match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
        if (match && match[1]) {
          writeFileSync(resolve('dist/version.txt'), match[1], 'utf-8');
          console.log(`[app-version-sync] dist/version.txt = ${match[1]}`);
        } else {
          console.warn('[app-version-sync] APP_VERSION 추출 실패 — version.txt 안 박힘');
        }
      } catch (e) {
        console.warn('[app-version-sync] error:', e);
      }
    }
  };
}

export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2020',
    emptyOutDir: true,
    rollupOptions: {
      output: { manualChunks: undefined }
    }
  },
  // 사용자 명시 2026-04-30 ultrathink: Performance audit quick win — production console.log 제거 (런타임 1.7MB 단일 HTML 부담 ↓). console.warn / console.error 는 유지 (런타임 디버그용).
  esbuild: {
    pure: ['console.log']
  },
  plugins: [appVersionSyncPlugin()],
  server: {
    port: 3000,
    open: false,
    host: true
  }
});
