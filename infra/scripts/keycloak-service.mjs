// Compte de service de l'API (client « api-administration ») : lui donne sa seule
// permission et écrit son secret dans apps/api/.env. Idempotent, lancé par
// « pnpm infra:up » après l'import du realm.
//
// Aucun rôle d'administration (realm-management) : avec manage-users, le secret de l'API
// suffirait à lister les e-mails, changer des mots de passe et s'attribuer le rôle
// « administration ». À la place, une permission fine (FGAP v2) « gérer les utilisateurs »
// : désactiver, déconnecter, supprimer un compte ; la liste des comptes et l'attribution
// de rôles restent refusées (vérifié par infra/scripts/check-realm.mjs).
//
// Le secret est généré par Keycloak (jamais dans le dépôt). Sur un poste dont le realm est
// antérieur à ce client, le script le crée, sans effacer les données.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminClient, REALM, root } from './keycloak-admin.mjs';

const CLIENT = 'api-administration';
const POLICY = 'api-administration';
const PERMISSION = 'api-administration-gerer-utilisateurs';
const kc = await adminClient();
const R = `/${REALM}`;

// Realm antérieur : permissions fines et client à créer (mêmes réglages que keycloak-realm.mjs).
// Permissions fines activées ici (pas dans le JSON du realm) ; si le client
// « admin-permissions » manque malgré l'option, la réactiver le recrée.
const realm = await kc.get(R);
if (!realm.adminPermissionsEnabled) await kc.put(R, { adminPermissionsEnabled: true });
if (!(await kc.get(`${R}/clients?clientId=admin-permissions`)).length) {
  await kc.put(R, { adminPermissionsEnabled: false });
  await kc.put(R, { adminPermissionsEnabled: true });
}
if (!(await kc.get(`${R}/clients?clientId=${CLIENT}`)).length) {
  await kc.post(`${R}/clients`, {
    clientId: CLIENT,
    name: 'API Plumiotheca (administration des comptes)',
    protocol: 'openid-connect',
    publicClient: false,
    bearerOnly: false,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: true,
  });
  console.log(`• Client ${CLIENT} créé (realm antérieur)`);
}
const [client] = await kc.get(`${R}/clients?clientId=${CLIENT}`);

// Aucun rôle d'administration sur le compte de service (retire ceux d'une version antérieure).
const account = await kc.get(`${R}/clients/${client.id}/service-account-user`);
const [management] = await kc.get(`${R}/clients?clientId=realm-management`);
const granted = await kc.get(`${R}/users/${account.id}/role-mappings/clients/${management.id}`);
if (granted.length) {
  await kc.del(`${R}/users/${account.id}/role-mappings/clients/${management.id}`, granted);
  console.log(`• Rôles d'administration retirés : ${granted.map((r) => r.name).join(', ')}`);
}

// Permission fine : « gérer les utilisateurs », pour ce client seulement.
const [permissions] = await kc.get(`${R}/clients?clientId=admin-permissions`);
const base = `${R}/clients/${permissions.id}/authz/resource-server`;
let [policy] = await kc.get(`${base}/policy?name=${POLICY}&exact=true`);
if (!policy) {
  await kc.post(`${base}/policy/client`, {
    name: POLICY,
    description: "Compte de service de l'API",
    logic: 'POSITIVE',
    clients: [client.id],
  });
  [policy] = await kc.get(`${base}/policy?name=${POLICY}&exact=true`);
}
const [permission] = await kc.get(`${base}/permission?name=${PERMISSION}&exact=true`);
if (!permission) {
  await kc.post(`${base}/permission/scope`, {
    name: PERMISSION,
    description: 'Désactiver, déconnecter et supprimer des comptes (comptes verrouillés)',
    resourceType: 'Users',
    scopes: ['manage'],
    policies: [policy.id],
    decisionStrategy: 'UNANIMOUS',
  });
}

const { value: secret } = await kc.get(`${R}/clients/${client.id}/client-secret`);
const apiEnv = join(root, 'apps', 'api', '.env');
if (existsSync(apiEnv)) {
  let env = readFileSync(apiEnv, 'utf8');
  const line = `KEYCLOAK_ADMIN_CLIENT_SECRET=${secret}`;
  env = /^KEYCLOAK_ADMIN_CLIENT_SECRET=.*$/m.test(env)
    ? env.replace(/^KEYCLOAK_ADMIN_CLIENT_SECRET=.*$/m, line)
    : `${env.trimEnd()}\n\n# Compte de service Keycloak de l'API (pnpm infra:up)\n${line}\n`;
  writeFileSync(apiEnv, env, { mode: 0o600 });
  chmodSync(apiEnv, 0o600);
  console.log(`✓ Compte de service ${CLIENT} prêt ; secret écrit dans apps/api/.env`);
} else {
  console.log(`✓ Compte de service ${CLIENT} prêt (apps/api/.env absent : pnpm infra:setup)`);
}
