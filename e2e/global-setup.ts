import { createAccount } from './keycloak.js';

/** Un compte neuf par exécution : le parcours commence par l'accueil (âge, pseudonyme, charte). */
export default async function globalSetup() {
  const account = await createAccount('e2e');
  // Transmis aux tests (les variables d'environnement passent aux workers).
  process.env.E2E_USERNAME = account.username;
  process.env.E2E_PASSWORD = account.password;
}
