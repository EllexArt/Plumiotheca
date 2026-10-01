import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'reader',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx'
      },
      shared: ['react', 'react-dom']
    })
  ],
  resolve: {
    alias: {
      '@plumiotheca/api-client': fileURLToPath(
        new URL('../../libs/api-client/src/index.ts', import.meta.url)
      )
    }
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  },
  server: {
    port: 5001,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5001',
  },
  preview: {
    port: 5001,
    strictPort: true,
  }
});
