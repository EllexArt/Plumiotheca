import { test } from '@playwright/test';
import { expectAccessible } from '../axe.js';

// Les 8 thèmes (#77) : chaque ambiance en clair et en sombre, sur des écrans clés. axe-core
// y mesure les contrastes rendus par le navigateur ; une capture de chaque écran est gardée
// (artefact « captures-ambiances » de la CI) pour la revue visuelle.
const PALETTES = ['lueur', 'bougie', 'indigo', 'rouille'];
const MODES = ['light', 'dark'] as const;
const SCREENS = [
  ['explorer', '/'],
  ['charte', '/charte'],
  ['systeme-de-design', '/design-system'],
] as const;

for (const palette of PALETTES) {
  for (const mode of MODES) {
    test(`ambiance ${palette}, ${mode === 'light' ? 'clair' : 'sombre'}`, async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({
        baseURL,
        locale: 'fr-FR',
        reducedMotion: 'reduce',
        colorScheme: mode,
      });
      // Choix enregistré sur l’appareil : appliqué avant le premier affichage (theme.js).
      await context.addInitScript(
        (choice: { palette: string; mode: string }) => {
          localStorage.setItem('plumiotheca.ambiance', choice.palette);
          localStorage.setItem('plumiotheca.theme', choice.mode);
        },
        { palette, mode },
      );
      const page = await context.newPage();
      for (const [name, path] of SCREENS) {
        await page.goto(path);
        await page.locator('h1').first().waitFor();
        await test.expect(page.locator('html')).toHaveAttribute('data-palette', palette);
        await test.expect(page.locator('html')).toHaveAttribute('data-theme', mode);
        await expectAccessible(page);
        await page.screenshot({
          path: `test-results/ambiances/${palette}-${mode}-${name}.png`,
          fullPage: true,
        });
      }
      await context.close();
    });
  }
}
