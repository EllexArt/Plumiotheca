import { deleteAccount } from './keycloak.js';

/** Le compte Keycloak jetable est supprimé ; l'histoire publiée reste dans la base de dev. */
export default async function globalTeardown() {
  if (process.env.E2E_USERNAME) await deleteAccount(process.env.E2E_USERNAME);
}
