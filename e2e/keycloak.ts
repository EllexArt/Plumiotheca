import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Comptes jetables pour les parcours : créés par l'API d'administration de Keycloak (realm
// de développement), avec un mot de passe aléatoire qui ne quitte pas l'exécution.
const KC = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
const REALM = 'plumiotheca';

function infraEnv(): Record<string, string> {
  const text = readFileSync(join(import.meta.dirname, '..', 'infra', '.env'), 'utf8');
  return Object.fromEntries(
    text
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

async function admin(method: string, path: string, body?: unknown) {
  const env = infraEnv();
  const token = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: env.KEYCLOAK_ADMIN_USERNAME ?? '',
      password: env.KEYCLOAK_ADMIN_PASSWORD ?? '',
    }),
  });
  if (!token.ok) throw new Error(`Connexion admin Keycloak impossible : ${token.status}`);
  const { access_token } = (await token.json()) as { access_token: string };
  const res = await fetch(`${KC}/admin/realms/${REALM}${path}`, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export interface TestAccount {
  username: string;
  password: string;
}

export async function createAccount(prefix: string): Promise<TestAccount> {
  const username = `${prefix}-${randomBytes(4).toString('hex')}`;
  const password = `E2e-${randomBytes(12).toString('base64url')}`;
  await admin('POST', '/users', {
    username,
    email: `${username}@exemple.localhost`,
    emailVerified: true,
    enabled: true,
    credentials: [{ type: 'password', value: password, temporary: false }],
  });
  return { username, password };
}

export async function deleteAccount(username: string) {
  const users = (await admin('GET', `/users?username=${username}&exact=true`)) as { id: string }[];
  for (const user of users) await admin('DELETE', `/users/${user.id}`);
}
