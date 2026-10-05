import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { expect, test } from '../fixtures.js';

/** Aucune violation axe-core (WCAG 2.2 A et AA, contrastes compris) sur la page affichée. */
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

/**
 * Supprime une histoire avec le jeton de la session (gardé par le client OIDC dans la
 * session de l'onglet) : la base de développement ne garde pas les histoires de test.
 */
async function deleteStory(page: Page, storyId: string) {
  const status = await page.evaluate(async (id) => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('oidc.user:'));
    const token = key
      ? (JSON.parse(sessionStorage.getItem(key) ?? '{}') as { access_token?: string }).access_token
      : undefined;
    if (!token) return 0;
    const res = await fetch(`/api/histoires/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.status;
  }, storyId);
  expect(status, 'suppression de l’histoire de test').toBe(204);
}

const text = 'Il était une fois une lanterne qui ne voulait pas s’éteindre.';

test('écrire → publier → lire', async ({ page, browser, account }) => {
  // Propres à chaque tentative (une nouvelle tentative recommence avec un compte neuf).
  const suffix = randomBytes(3).toString('hex');
  const handle = `e2e.${suffix}`;
  const title = `Les lucioles du canal ${suffix}`;
  let storyId = '';

  try {
    await test.step('connexion par Keycloak', async () => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Se connecter' }).click();
      // Formulaire du thème Keycloak : identifiants stables d'une version à l'autre.
      await page.locator('#username').fill(account.username);
      await page.locator('#password').fill(account.password);
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
      await page.getByRole('banner').getByRole('link', { name: 'Écrire', exact: true }).click();
      await page.getByRole('link', { name: 'Nouvelle histoire' }).click();
      await page.getByRole('textbox', { name: /^Titre/ }).fill(title);
      await page.getByRole('button', { name: 'Créer l’histoire' }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      storyUrl = page.url();
      storyId = storyUrl.split('/').at(-1) ?? '';
      await expectAccessible(page);

      await page.getByRole('textbox', { name: 'Titre du nouveau chapitre' }).fill('La lanterne');
      await page.getByRole('button', { name: 'Ajouter un chapitre' }).click();
      const editor = page.getByRole('textbox', { name: 'Texte du chapitre' });
      await editor.click();
      await page.keyboard.type(text);
      await expectAccessible(page);
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
      const card = reader.getByRole('article').filter({ hasText: title });
      // Ce que la personne qui lit doit savoir avant d'ouvrir l'histoire.
      await expect(card.getByText('Tout public')).toBeVisible();
      await expect(card.getByText('Autres avertissements : deuil')).toBeVisible();
      await expectAccessible(reader);
      await card.getByRole('link', { name: title }).click();

      await expect(reader.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(reader.getByText('Autres avertissements : deuil').first()).toBeVisible();
      await expectAccessible(reader);
      await reader.getByRole('link', { name: 'Commencer la lecture' }).click();

      await expect(reader.getByRole('heading', { level: 1, name: 'La lanterne' })).toBeVisible();
      await expect(reader.getByText(text)).toBeVisible();
      await expectAccessible(reader);
      const chapterUrl = reader.url();
      await visitor.close();

      // Le lecteur en thème sombre aussi (appareil réglé en sombre dès l'ouverture).
      const night = await browser.newContext({
        locale: 'fr-FR',
        reducedMotion: 'reduce',
        colorScheme: 'dark',
      });
      const nightReader = await night.newPage();
      await nightReader.goto(chapterUrl);
      await expect(nightReader.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(nightReader.getByText(text)).toBeVisible();
      await expectAccessible(nightReader);
      await night.close();
    });
  } finally {
    if (storyId) await deleteStory(page, storyId);
  }
});
