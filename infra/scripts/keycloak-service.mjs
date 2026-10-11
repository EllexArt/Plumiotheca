// Compte de service de l'API (client « api-administration ») : lui donne son seul droit,
// la gestion des comptes (manage-users), et écrit son secret dans apps/api/.env.
// Idempotent, lancé par « pnpm infra:up » après l'import du realm.
//
// Le droit est porté par l'utilisateur technique du compte de service, que l'export du
// realm n'inclut pas ; le secret est généré par Keycloak à l'import (jamais dans le dépôt).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminClient, REALM, root } from './keycloak-admin.mjs';

const CLIENT = 'api-administration';
const kc = await adminClient();
const R = `/${REALM}`;

const [client] = await kc.get(`${R}/clients?clientId=${CLIENT}`);
if (!client)
  throw new Error(`Client ${CLIENT} absent du realm : régénérer le realm (infra/README.md)`);

const account = await kc.get(`${R}/clients/${client.id}/service-account-user`);
const [management] = await kc.get(`${R}/clients?clientId=realm-management`);
const manageUsers = await kc.get(`${R}/clients/${management.id}/roles/manage-users`);
await kc.post(`${R}/users/${account.id}/role-mappings/clients/${management.id}`, [manageUsers]);

const { value: secret } = await kc.get(`${R}/clients/${client.id}/client-secret`);
const apiEnv = join(root, 'apps', 'api', '.env');
if (existsSync(apiEnv)) {
  let env = readFileSync(apiEnv, 'utf8');
  const line = `KEYCLOAK_ADMIN_CLIENT_SECRET=${secret}`;
  env = /^KEYCLOAK_ADMIN_CLIENT_SECRET=.*$/m.test(env)
    ? env.replace(/^KEYCLOAK_ADMIN_CLIENT_SECRET=.*$/m, line)
    : `${env.trimEnd()}\n\n# Compte de service Keycloak de l'API (pnpm infra:up)\n${line}\n`;
  writeFileSync(apiEnv, env, { mode: 0o600 });
  console.log(`✓ Compte de service ${CLIENT} prêt ; secret écrit dans apps/api/.env`);
} else {
  console.log(`✓ Compte de service ${CLIENT} prêt (apps/api/.env absent : pnpm infra:setup)`);
}
