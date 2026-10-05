import { defineConfig, devices } from '@playwright/test';

// Parcours de bout en bout contre la stack de développement : infrastructure lancée à part
// (`pnpm infra:up`), API et web démarrés ici s'ils ne tournent pas déjà.
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests',
  // Un seul parcours, qui dépend de l'état de la base : pas de parallélisme. Une nouvelle
  // tentative repart d'un compte neuf (fixture « account »).
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    locale: 'fr-FR',
    // Transitions coupées (le site respecte ce réglage) : axe-core mesure les couleurs finales.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @plumiotheca/api dev',
      cwd: '..',
      url: `${API}/api/health`,
      env: { DB_MIGRATE_ON_START: 'true' },
      // Journaux de l'API visibles en CI (erreurs 500, migrations).
      stdout: CI ? 'pipe' : 'ignore',
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @plumiotheca/web dev',
      cwd: '..',
      url: WEB,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
