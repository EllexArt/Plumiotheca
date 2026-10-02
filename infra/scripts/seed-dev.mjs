// Crée des comptes de démonstration dans le realm de développement (idempotent).
// Le mot de passe commun est généré une fois et stocké dans infra/.env (DEMO_PASSWORD).
import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminClient, infraEnv, root, REALM } from './keycloak-admin.mjs';

let password = infraEnv().DEMO_PASSWORD;
if (!password) {
  password = `Demo-${randomBytes(9).toString('base64url')}`;
  appendFileSync(
    join(root, 'infra', '.env'),
    `\n# Comptes de démonstration (pnpm infra:seed)\nDEMO_PASSWORD=${password}\n`,
  );
}

const kc = await adminClient();
const R = `/${REALM}`;
const accounts = [
  ['autrice-demo', []],
  ['lectrice-demo', []],
  ['jardinier-demo', ['jardinage-tags']],
];
for (const [username, roles] of accounts) {
  await kc.post(`${R}/users`, {
    username,
    email: `${username}@exemple.localhost`,
    emailVerified: true,
    enabled: true,
    credentials: [{ type: 'password', value: password, temporary: false }],
  });
  const [user] = await kc.get(`${R}/users?username=${username}&exact=true`);
  for (const name of roles) {
    const role = await kc.get(`${R}/roles/${name}`);
    await kc.post(`${R}/users/${user.id}/role-mappings/realm`, [role]);
  }
}
console.log(`✓ Comptes de démonstration : ${accounts.map(([u]) => u).join(', ')}`);
console.log('  Mot de passe : DEMO_PASSWORD dans infra/.env');
console.log(
  '  (pas de compte de modération : il exige la double authentification, à configurer soi-même)',
);
