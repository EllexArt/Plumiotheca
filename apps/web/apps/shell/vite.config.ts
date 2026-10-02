import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      // Les remotes sont servis depuis leur dossier de build: /assets/remoteEntry.js.
      // A la racine, vite preview renvoie le fallback index.html et l'import echoue.
      remotes: {
        reader: 'http://localhost:5001/assets/remoteEntry.js',
        editor: 'http://localhost:5002/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
  resolve: {
    alias: {
      '@plumiotheca/api-client': fileURLToPath(
        new URL('../../libs/api-client/src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5000,
    strictPort: true,
    cors: true,
  },
  preview: {
    port: 5000,
    strictPort: true,
  },
});
