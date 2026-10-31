import { expect, test } from '@playwright/test';

// Application installable et hors ligne (#35) : le service worker n'existe que dans le site
// compilé (image Docker du site), pas avec le serveur de développement de Vite.
test.skip(process.env.E2E_WEB_EXTERNAL !== '1', 'Site compilé seulement (service worker)');

test('installable : manifeste et icônes', async ({ request }) => {
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string;
    lang: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({ name: 'Plumiotheca', lang: 'fr', display: 'standalone' });
  expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});

test('hors ligne : le site s’ouvre encore, et le dit', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: 'fr-FR', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/charte');
  await page.locator('h1').first().waitFor();
  // Service worker installé et maître de la page (fichiers compilés gardés).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Vous êtes hors ligne.')).toBeVisible();
  // L'interface est là (en-tête, navigation), même sans réseau.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Vous êtes hors ligne.')).toBeHidden();
  await context.close();
});
