import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/graphql': process.env.VITE_API_URL?.startsWith('http') ? process.env.VITE_API_URL.replace('/graphql', '') : 'http://localhost:4000'
    }
  }
});
