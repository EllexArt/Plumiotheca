import { Controller, Get } from '@nestjs/common';
import { MySession } from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { RequireRoles } from '../src/auth/decorators.js';
import { expectProblem, foreignKey, start as startApp, token } from './support.js';

/** Routes d'essai protégées, déclarées seulement dans les tests. */
@Controller('essai-roles')
class RolesController {
  @Get('moderation')
  @RequireRoles('moderation')
  moderation() {
    return { ok: true };
  }

  @Get('tags')
  @RequireRoles('jardinage-tags', 'moderation')
  tags() {
    return { ok: true };
  }
}

const start = () => startApp({}, [RolesController]);
const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
const now = () => Math.floor(Date.now() / 1000);

describe('authentification', () => {
  it('accepte un jeton d’accès valide', async () => {
    const { http } = await start();
    const res = await http
      .get('/api/moi')
      .set(...bearer(await token()))
      .expect(200);
    expect(MySession.parse(res.body)).toEqual({ roles: [], mfa: false });
  });

  it('les routes publiques restent accessibles sans jeton', async () => {
    const { http } = await start();
    await http.get('/api/health').expect(200);
  });

  it('refuse par défaut une route sans jeton (401 + WWW-Authenticate)', async () => {
    const { http } = await start();
    const res = await http.get('/api/moi').expect(401);
    expect(expectProblem(res.body, 401).type).toBe('non-authentifie');
    expect(res.headers['www-authenticate']).toBe('Bearer realm="plumiotheca"');
  });

  it('signale un jeton expiré pour que le web le renouvelle', async () => {
    const { http } = await start();
    const expired = await token({ iat: now() - 600, exp: now() - 60 });
    const res = await http
      .get('/api/moi')
      .set(...bearer(expired))
      .expect(401);
    expect(expectProblem(res.body, 401).type).toBe('jeton-expire');
    expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
  });

  const refusals: [string, () => Promise<string>][] = [
    ['signé par une autre clé', () => token({}, { key: foreignKey })],
    ['clé inconnue', () => token({}, { kid: 'autre-cle' })],
    ['autre émetteur', () => token({ iss: 'http://localhost:8080/realms/master' })],
    ['sans l’audience « api »', () => token({ aud: 'account' })],
    ['émis pour un autre client', () => token({ azp: 'admin-cli' })],
    ['jeton d’identité', () => token({ typ: 'ID', aud: 'web' })],
    ['jeton de rafraîchissement', () => token({ typ: 'Refresh' })],
    ['sans sujet', () => token({ sub: undefined })],
    ['émis dans le futur', () => token({ iat: now() + 600, nbf: now() + 600 })],
    [
      'non signé (alg « none »)',
      async () => {
        const [, payload] = (await token()).split('.');
        const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
        return `${header}.${payload}.`;
      },
    ],
    ['illisible', () => Promise.resolve('pas.un.jeton')],
  ];

  it.each(refusals)('refuse un jeton %s (401)', async (_, make) => {
    const { http } = await start();
    const res = await http
      .get('/api/moi')
      .set(...bearer(await make()))
      .expect(401);
    expect(expectProblem(res.body, 401).type).toBe('jeton-invalide');
  });

  it('refuse un schéma d’autorisation autre que Bearer', async () => {
    const { http } = await start();
    await http
      .get('/api/moi')
      .set('Authorization', `Basic ${Buffer.from('a:b').toString('base64')}`)
      .expect(401);
  });

  it('ignore les rôles inconnus du jeton', async () => {
    const { http } = await start();
    const jwt = await token({ realm_access: { roles: ['offline_access', 'moderation', 'root'] } });
    const res = await http
      .get('/api/moi')
      .set(...bearer(jwt))
      .expect(200);
    expect(res.body).toEqual({ roles: ['moderation'], mfa: false });
  });
});

describe('rôles et double authentification', () => {
  const moderator = (amr: string[]) => token({ realm_access: { roles: ['moderation'] }, amr });

  it('refuse la modération sans le rôle (403)', async () => {
    const { http } = await start();
    const res = await http
      .get('/api/essai-roles/moderation')
      .set(...bearer(await token({ amr: ['pwd', 'otp'] })))
      .expect(403);
    expect(expectProblem(res.body, 403).type).toBe('interdit');
  });

  it('refuse la modération sans second facteur pendant cette connexion (403)', async () => {
    const { http } = await start();
    const res = await http
      .get('/api/essai-roles/moderation')
      .set(...bearer(await moderator(['pwd'])))
      .expect(403);
    expect(expectProblem(res.body, 403).type).toBe('mfa-requise');
  });

  it('refuse aussi une session sans « amr » (ancienne session, mot de passe oublié)', async () => {
    const { http } = await start();
    const jwt = await token({ realm_access: { roles: ['moderation'] }, amr: undefined });
    await http
      .get('/api/essai-roles/moderation')
      .set(...bearer(jwt))
      .expect(403);
  });

  it('accepte la modération avec code TOTP validé', async () => {
    const { http } = await start();
    await http
      .get('/api/essai-roles/moderation')
      .set(...bearer(await moderator(['pwd', 'otp'])))
      .expect(200);
  });

  it('les jardiniers des tags n’ont pas besoin de second facteur', async () => {
    const { http } = await start();
    const jwt = await token({ realm_access: { roles: ['jardinage-tags'] } });
    await http
      .get('/api/essai-roles/tags')
      .set(...bearer(jwt))
      .expect(200);
  });
});
