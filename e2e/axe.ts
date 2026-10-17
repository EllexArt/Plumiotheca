import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Aucune violation axe-core (WCAG 2.2 A et AA, contrastes compris) sur la page affichée. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id} : ${n.target.join(' ')} : ${n.failureSummary ?? v.help}`),
    ),
  ).toEqual([]);
}
