import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // У режимі розробки запити /api проксуються на локальний API-сервер.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
