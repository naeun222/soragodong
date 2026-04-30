import { defineConfig } from 'vite';

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
  server: {
    port: 3000,
    open: false,
    host: true
  }
});
