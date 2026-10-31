/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// L'API tourne à part (pnpm dev:api) ; en développement, Vite lui relaie /api :
// même origine pour le navigateur, donc pas de CORS à configurer.
const api = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    // Application installable et lecture hors ligne (#35). Le service worker ne touche ni à
    // l'API ni à Keycloak : il garde l'interface du site (fichiers compilés, pages, config).
    VitePWA({
      // Nouvelle version : proposée (« Recharger »), jamais imposée pendant une lecture.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Plumiotheca',
        short_name: 'Plumiotheca',
        description: 'Lire, écrire et partager des histoires et des univers.',
        lang: 'fr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#14202b',
        theme_color: '#14202b',
        icons: [
          { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icones/icone-masquable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Fichiers compilés et ceux de public/ (thème, icônes) ; index.html est servi par la
        // règle des pages ci-dessous (nonce de CSP propre à chaque réponse).
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
        globIgnores: ['**/*.map'],
        // Comme le reste du site : pas de carte de sources servie avec le service worker.
        sourcemap: false,
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Pages : le réseau d'abord (nouvelle version, nonce frais), la dernière gardée
            // hors ligne.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 1 },
              plugins: [{ cacheKeyWillBeUsed: async () => '/index.html' }],
            },
          },
          {
            // Configuration de l'environnement (servie par nginx), la dernière gardée.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/config.js',
            handler: 'NetworkFirst',
            options: { cacheName: 'configuration', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
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
