// Petit client de l'API d'administration Keycloak, partagé par les scripts d'infra.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const KC = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
export const REALM = 'plumiotheca';

export function infraEnv() {
  const text = readFileSync(join(root, 'infra', '.env'), 'utf8');
  return Object.fromEntries(
    text
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

export async function adminClient() {
  const env = infraEnv();
  const res = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: env.KEYCLOAK_ADMIN_USERNAME,
      password: env.KEYCLOAK_ADMIN_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`Connexion admin Keycloak impossible : ${res.status}`);
  const { access_token } = await res.json();
  const call = async (method, path, body) => {
    const r = await fetch(`${KC}/admin/realms${path}`, {
      method,
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok && r.status !== 409)
      throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    put: (p, b) => call('PUT', p, b),
    del: (p, b) => call('DELETE', p, b),
  };
}
