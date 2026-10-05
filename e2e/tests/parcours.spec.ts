import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

/** Aucune violation axe-core (WCAG 2.2 A et AA) sur la page affichée. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id} : ${n.target.join(' ')} : ${n.failureSummary ?? v.help}`),
    ),
  ).toEqual([]);
}

const suffix = randomBytes(3).toString('hex');
const handle = `e2e.${suffix}`;
const title = `Les lucioles du canal ${suffix}`;
const text = 'Il était une fois une lanterne qui ne voulait pas s’éteindre.';

test('écrire → publier → lire', async ({ page, browser }) => {
  const username = process.env.E2E_USERNAME!;
  const password = process.env.E2E_PASSWORD!;

  await test.step('connexion par Keycloak', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#kc-login').click();
  });

  await test.step('accueil : âge, pseudonyme, charte', async () => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bienvenue sur Plumiotheca' }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('radio', { name: /18 ans ou plus/ }).check();
    await page.getByRole('textbox', { name: /Votre pseudonyme/ }).fill(handle);
    await page.getByRole('checkbox', { name: /J’ai lu la charte/ }).check();
    await page.getByRole('button', { name: 'Commencer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Explorer' })).toBeVisible();
  });

  let storyUrl = '';
  await test.step('écrire une histoire et son premier chapitre', async () => {
    await page.getByRole('link', { name: 'Écrire' }).first().click();
    await page.getByRole('link', { name: 'Nouvelle histoire' }).click();
    await page.getByRole('textbox', { name: /^Titre/ }).fill(title);
    await page.getByRole('button', { name: 'Créer l’histoire' }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    storyUrl = page.url();

    await page.getByRole('textbox', { name: 'Titre du nouveau chapitre' }).fill('La lanterne');
    await page.getByRole('button', { name: 'Ajouter un chapitre' }).click();
    const editor = page.getByRole('textbox', { name: 'Texte du chapitre' });
    await editor.click();
    await page.keyboard.type(text);
    await page.getByRole('button', { name: 'Publier le chapitre' }).click();
    // Après publication, retour à l'histoire, chapitre marqué « publié ».
    await expect(page).toHaveURL(storyUrl);
    await expect(page.getByText('publié', { exact: true })).toBeVisible();
  });

  await test.step('avant de publier : classement, avertissements, aperçu', async () => {
    await page.getByRole('link', { name: 'Publier l’histoire' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Avant de publier' })).toBeVisible();
    const publish = page.getByRole('button', { name: 'Publier l’histoire' });
    await expect(publish).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('radio', { name: /Tout public/ }).check();
    await page.getByRole('checkbox', { name: 'Aucun avertissement majeur' }).check();
    await page.getByRole('checkbox', { name: 'deuil' }).check();
    const preview = page.getByRole('complementary', { name: 'Aperçu dans Explorer' });
    await expect(preview.getByText('Autres avertissements : deuil')).toBeVisible();
    await expect(page.getByText('Tout est prêt.')).toBeVisible();
    await expectAccessible(page);
    await publish.click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Votre histoire est publiée' }),
    ).toBeVisible();
  });

  await test.step('lire sans compte : Explorer, fiche, chapitre', async () => {
    const visitor = await browser.newContext({ locale: 'fr-FR', reducedMotion: 'reduce' });
    const reader = await visitor.newPage();
    await reader.goto('/');
    await reader.getByRole('link', { name: title }).click();
    await expect(reader.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(reader.getByText('Tout public').first()).toBeVisible();
    await reader.getByRole('link', { name: 'Commencer la lecture' }).click();
    await expect(reader.getByRole('heading', { level: 1, name: 'La lanterne' })).toBeVisible();
    await expect(reader.getByText(text)).toBeVisible();
    await expectAccessible(reader);
    await visitor.close();
  });
});
