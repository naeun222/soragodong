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
  server: {
    port: 3000,
    open: false,
    host: true
  }
});
