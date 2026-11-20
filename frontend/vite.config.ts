import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wails from '@wailsio/runtime/plugins/vite';

export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [react(), tailwindcss(), wails('./bindings')],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@bindings': fileURLToPath(new URL('./bindings/github.com/rexchoppers/trellis', import.meta.url)),
    },
  },
});
