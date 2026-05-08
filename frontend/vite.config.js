import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || process.env.BACKEND_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/graphql': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
