import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/env.js';
import { KeycloakAdminService } from './keycloak-admin.service.js';

const config = loadConfig({
  NODE_ENV: 'test',
  KEYCLOAK_ISSUER: 'https://compte.exemple/realms/plumiotheca',
  KEYCLOAK_JWKS_URL: 'http://keycloak:8080/realms/plumiotheca/protocol/openid-connect/certs',
  KEYCLOAK_ADMIN_CLIENT_SECRET: 'secret',
});

type Call = { url: string; method: string; auth: string | undefined; body: unknown };

/** Keycloak simulé : jetons numérotés, réponses d'administration fournies par le test. */
function fakeKeycloak(admin: (call: Call) => number) {
  const calls: Call[] = [];
  let tokens = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const call: Call = {
        url,
        method: init.method ?? 'GET',
        auth: headers.Authorization,
        body:
          typeof init.body === 'string'
            ? JSON.parse(init.body)
            : init.body instanceof URLSearchParams
              ? init.body.toString()
              : undefined,
      };
      calls.push(call);
      if (url.endsWith('/protocol/openid-connect/token')) {
        tokens++;
        return Promise.resolve(Response.json({ access_token: `jeton-${tokens}`, expires_in: 300 }));
      }
      return Promise.resolve(new Response(null, { status: admin(call) }));
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('KeycloakAdminService', () => {
  it('adresse interne, realm de l’émetteur, jeton du compte de service réutilisé', async () => {
    const calls = fakeKeycloak(() => 204);
    const service = new KeycloakAdminService(config);
    await service.deleteUser('a/b');
    await service.deleteUser('c');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://keycloak:8080/realms/plumiotheca/protocol/openid-connect/token',
      'DELETE http://keycloak:8080/admin/realms/plumiotheca/users/a%2Fb',
      'DELETE http://keycloak:8080/admin/realms/plumiotheca/users/c',
    ]);
    expect(calls[0]?.body).toContain('grant_type=client_credentials');
    expect(calls[0]?.body).toContain('client_id=api-administration');
    expect(calls.slice(1).every((c) => c.auth === 'Bearer jeton-1')).toBe(true);
  });

  it('compte déjà absent (404) : comme supprimé ; autre refus : erreur', async () => {
    fakeKeycloak((c) => (c.url.endsWith('/absent') ? 404 : 403));
    const service = new KeycloakAdminService(config);
    await expect(service.deleteUser('absent')).resolves.toBeUndefined();
    await expect(service.deleteUser('autre')).rejects.toThrow('(403)');
  });

  it('jeton refusé (401) : un jeton neuf, une seule nouvelle tentative', async () => {
    let first = true;
    const calls = fakeKeycloak(() => {
      if (!first) return 204;
      first = false;
      return 401;
    });
    await new KeycloakAdminService(config).deleteUser('x');
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.auth)).toEqual([
      'Bearer jeton-1',
      'Bearer jeton-2',
    ]);
  });

  it('désactivation : compte désactivé puis sessions fermées', async () => {
    const calls = fakeKeycloak(() => 204);
    await new KeycloakAdminService(config).disableUser('x');
    const admin = calls.filter((c) => !c.url.endsWith('/token'));
    expect(admin.map((c) => `${c.method} ${c.url.replace(/^.*\/plumiotheca/, '')}`)).toEqual([
      'PUT /users/x',
      'POST /users/x/logout',
    ]);
    expect(admin[0]?.body).toEqual({ enabled: false });
  });

  it('sans secret, ou réponse de jeton inattendue : erreur claire', async () => {
    const noSecret = new KeycloakAdminService(
      loadConfig({ NODE_ENV: 'test', KEYCLOAK_ISSUER: config.KEYCLOAK_ISSUER }),
    );
    await expect(noSecret.deleteUser('x')).rejects.toThrow('non configuré');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ token: 'x' }))),
    );
    await expect(new KeycloakAdminService(config).deleteUser('x')).rejects.toThrow(
      'réponse de jeton inattendue',
    );
  });
});
