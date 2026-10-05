import { test as base } from '@playwright/test';
import { createAccount, deleteAccount, type TestAccount } from './keycloak.js';

export { expect } from '@playwright/test';

/**
 * Un compte Keycloak neuf par tentative (une nouvelle tentative recommence donc à l'accueil),
 * supprimé à la fin, même en cas d'échec. Compte jetable sur un Keycloak de développement :
 * son mot de passe peut apparaître dans les traces ; ne jamais réutiliser ce schéma avec un
 * vrai compte.
 */
export const test = base.extend<{ account: TestAccount }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright exige la déstructuration.
  account: async ({}, use) => {
    const account = await createAccount('e2e');
    try {
      await use(account);
    } finally {
      await deleteAccount(account.username);
    }
  },
});
