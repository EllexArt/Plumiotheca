/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// L'API tourne à part (pnpm dev:api) ; en développement, Vite lui relaie /api :
// même origine pour le navigateur, donc pas de CORS à configurer.
const api = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Les paquets du monorepo sont lus depuis leurs sources (pas de build préalable).
    conditions: ['@plumiotheca/source', ...defaultClientConditions],
  },
  server: {
    // Port déclaré dans le client « web » de Keycloak (redirections autorisées).
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: api, changeOrigin: false } },
  },
  preview: { port: 5173, strictPort: true },
  build: {
    // Cartes de source générées (suivi d'erreurs) mais non référencées par les fichiers servis.
    sourcemap: 'hidden',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
