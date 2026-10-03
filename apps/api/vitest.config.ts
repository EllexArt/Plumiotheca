import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC plutôt qu'esbuild : NestJS a besoin des métadonnées de décorateurs
  // (injection de dépendances), qu'esbuild ne produit pas.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    // Les contrats sont lus depuis leurs sources : pas besoin de les compiler avant les tests.
    alias: {
      '@plumiotheca/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Base PostgreSQL réelle, recréée et migrée avant les tests.
    globalSetup: ['test/global-setup.ts'],
  },
});
