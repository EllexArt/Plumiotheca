import { randomUUID } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import { CHARTER_VERSION, MyAccount, PublicProfile } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { User } from '../src/users/user.entity.js';
import { expectProblem, readyToken, start as startApp, token } from './support.js';

/** Route ordinaire (compte prêt exigé par défaut), déclarée seulement dans les tests. */
@Controller('essai-compte')
class OrdinaryController {
  @Get()
  ok() {
    return { ok: true };
  }
}

const start = () => startApp({}, [OrdinaryController]);
const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
const unique = () => randomUUID().slice(0, 8);

type Http = Awaited<ReturnType<typeof start>>['http'];
const firstVisit = (http: Http, jwt: string, body: Record<string, unknown>) =>
  http
    .post('/api/moi/compte/premiere-visite')
    .set(...bearer(jwt))
    .send({ charterVersion: CHARTER_VERSION, age: '18+', ...body });

describe('première visite', () => {
  it('le compte est créé à la première requête, une seule fois', async () => {
    const { app, http } = await start();
    const sub = randomUUID();
    const jwt = await token({ sub });
    const [a, b] = await Promise.all([
      http.get('/api/moi/compte').set(...bearer(jwt)),
      http.get('/api/moi/compte').set(...bearer(jwt)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(MyAccount.parse(a.body).step).toBe('first-visit');
    expect(await app.get(DataSource).getRepository(User).countBy({ keycloakId: sub })).toBe(1);
  });

  it('les routes ordinaires attendent la première visite', async () => {
    const { http } = await start();
    const res = await http
      .get('/api/essai-compte')
      .set(...bearer(await token()))
      .expect(403);
    expect(expectProblem(res.body, 403).type).toBe('premiere-visite-requise');
  });

  it('pseudonyme, âge et charte : le compte est prêt', async () => {
    const { http } = await start();
    const jwt = await token();
    const handle = `Élise-${unique()}`;
    const res = await firstVisit(http, jwt, { handle, age: '15-17' }).expect(201);
    expect(MyAccount.parse(res.body)).toMatchObject({
      step: 'ready',
      handle,
      ageBand: '15-17',
      charterVersion: CHARTER_VERSION,
    });
    await http
      .get('/api/essai-compte')
      .set(...bearer(jwt))
      .expect(200);
    await firstVisit(http, jwt, { handle: `autre-${unique()}` }).expect(409);
  });

  it('moins de 15 ans : refusé, et la réponse verrouille le compte', async () => {
    const { app, http } = await start();
    const sub = randomUUID();
    const jwt = await token({ sub });
    const res = await firstVisit(http, jwt, {
      handle: `jeune-${unique()}`,
      age: 'under-15',
    }).expect(403);
    expect(expectProblem(res.body, 403).type).toBe('age-minimum');
    // Changer de réponse ne suffit pas.
    await firstVisit(http, jwt, { handle: `jeune-${unique()}`, age: '18+' }).expect(403);
    const account = await http
      .get('/api/moi/compte')
      .set(...bearer(jwt))
      .expect(200);
    expect(MyAccount.parse(account.body)).toMatchObject({ step: 'age-locked', handle: null });
    await http
      .get('/api/essai-compte')
      .set(...bearer(jwt))
      .expect(403);
    // Seule la réponse est gardée : ni pseudonyme ni charte.
    const row = await app.get(DataSource).getRepository(User).findOneByOrFail({ keycloakId: sub });
    expect([row.ageBand, row.handle, row.charterVersion]).toEqual(['under-15', null, null]);
  });

  it('refuse une charte périmée', async () => {
    const { http } = await start();
    const res = await firstVisit(http, await token(), {
      handle: `lectrice-${unique()}`,
      charterVersion: '0',
    }).expect(409);
    expect(expectProblem(res.body, 409).type).toBe('charte-perimee');
  });

  it.each([
    ['vide', ''],
    ['trop court', 'ab'],
    ['une adresse e-mail', 'nom@exemple.fr'],
  ])('refuse un pseudonyme %s (400)', async (_, handle) => {
    const { http } = await start();
    await firstVisit(http, await token(), { handle }).expect(400);
  });

  it('pseudonyme déjà pris, à la casse et aux accents près, ou réservé : 409', async () => {
    const { http } = await start();
    const base = `élise${unique()}`;
    await firstVisit(http, await token(), { handle: base }).expect(201);
    for (const handle of [
      base.toUpperCase(),
      base.replace('é', 'e'),
      'Modération',
      'Plumiotheca_officiel',
    ]) {
      const res = await firstVisit(http, await token(), { handle }).expect(409);
      expect(expectProblem(res.body, 409).type).toBe('pseudonyme-indisponible');
    }
  });

  it('deux personnes choisissent le même pseudonyme au même instant : une seule l’obtient', async () => {
    const { http } = await start();
    const handle = `simultane-${unique()}`;
    const [a, b] = await Promise.all([
      firstVisit(http, await token(), { handle }),
      firstVisit(http, await token(), { handle }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('indique si un pseudonyme est disponible', async () => {
    const { http } = await start();
    const jwt = await token();
    const free = await http
      .get(`/api/pseudonymes/libre-${unique()}/disponibilite`)
      .set(...bearer(jwt))
      .expect(200);
    expect(free.body).toEqual({ available: true });
    const reserved = await http
      .get('/api/pseudonymes/moderation/disponibilite')
      .set(...bearer(jwt))
      .expect(200);
    expect(reserved.body).toEqual({ available: false });
  });
});

describe('charte', () => {
  it('une nouvelle version doit être acceptée avant de continuer', async () => {
    const { app, http } = await start();
    const sub = randomUUID();
    const jwt = await readyToken(app, { sub });
    await app
      .get(DataSource)
      .getRepository(User)
      .update({ keycloakId: sub }, { charterVersion: '0' });
    const res = await http
      .get('/api/essai-compte')
      .set(...bearer(jwt))
      .expect(403);
    expect(expectProblem(res.body, 403).type).toBe('charte-a-accepter');
    await http
      .post('/api/moi/compte/charte')
      .set(...bearer(jwt))
      .send({ charterVersion: CHARTER_VERSION })
      .expect(201);
    await http
      .get('/api/essai-compte')
      .set(...bearer(jwt))
      .expect(200);
  });
});

describe('pseudonyme et profil', () => {
  it('changer de pseudonyme : l’ancien est bloqué 90 jours, puis plus de changement pendant 30 jours', async () => {
    const { http } = await start();
    const jwt = await token();
    const first = `ancien-${unique()}`;
    await firstVisit(http, jwt, { handle: first }).expect(201);
    const second = `nouveau-${unique()}`;
    const res = await http
      .put('/api/moi/compte/pseudonyme')
      .set(...bearer(jwt))
      .send({ handle: second })
      .expect(200);
    expect(MyAccount.parse(res.body).handleChangeableFrom).not.toBeNull();
    // L'ancien pseudonyme n'est pas réattribuable tout de suite.
    await firstVisit(http, await token(), { handle: first }).expect(409);
    // Nouveau changement trop tôt.
    const again = await http
      .put('/api/moi/compte/pseudonyme')
      .set(...bearer(jwt))
      .send({ handle: `encore-${unique()}` })
      .expect(409);
    expect(expectProblem(again.body, 409).type).toBe('pseudonyme-change-recemment');
    // Retoucher la casse reste possible.
    await http
      .put('/api/moi/compte/pseudonyme')
      .set(...bearer(jwt))
      .send({ handle: second.toUpperCase() })
      .expect(200);
  });

  it('profil : champs modifiables, champ inconnu refusé, texte vide effacé', async () => {
    const { app, http } = await start();
    const jwt = await readyToken(app);
    await http
      .patch('/api/moi/compte/profil')
      .set(...bearer(jwt))
      .send({ ageBand: '18+' })
      .expect(400);
    const res = await http
      .patch('/api/moi/compte/profil')
      .set(...bearer(jwt))
      .send({ displayName: 'Élise', pronouns: 'elle', bio: '' })
      .expect(200);
    expect(MyAccount.parse(res.body)).toMatchObject({
      displayName: 'Élise',
      pronouns: 'elle',
      bio: null,
    });
  });

  it('profil public : sans connexion, ni identifiant, ni âge, ni e-mail', async () => {
    const { http } = await start();
    const jwt = await token();
    const handle = `Public-${unique()}`;
    await firstVisit(http, jwt, { handle, age: '15-17' }).expect(201);
    await http
      .patch('/api/moi/compte/profil')
      .set(...bearer(jwt))
      .send({ bio: 'Je lis de la fantasy.' })
      .expect(200);
    const res = await http.get(`/api/pseudonymes/${handle.toLowerCase()}`).expect(200);
    expect(PublicProfile.parse(res.body)).toEqual({
      handle,
      displayName: null,
      pronouns: null,
      bio: 'Je lis de la fantasy.',
    });
  });

  it('profil public introuvable : inconnu, première visite non faite ou compte verrouillé', async () => {
    const { http } = await start();
    await http.get(`/api/pseudonymes/inconnu-${unique()}`).expect(404);
    const locked = await token();
    await firstVisit(http, locked, { handle: `verrou-${unique()}`, age: 'under-15' }).expect(403);
    const res = await http.get(`/api/pseudonymes/inconnu-${unique()}`).expect(404);
    expect(expectProblem(res.body, 404).type).toBe('introuvable');
  });
});
