import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.API_URL || 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': target,
      '/uploads': target,
      '/anims': target,
      '/socket.io': { target, ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
