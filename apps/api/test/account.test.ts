import { randomUUID } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import { CHARTER_VERSION, MyAccount, PublicProfile } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { HandleHistory } from '../src/users/handle-history.entity.js';
import { HandleRelease } from '../src/users/handle-release.entity.js';
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

  it('« moins de 15 ans » et « 18+ » au même instant : jamais un compte prêt après un refus', async () => {
    const { app, http } = await start();
    for (let i = 0; i < 10; i++) {
      const sub = randomUUID();
      const jwt = await token({ sub });
      const [young, adult] = await Promise.all([
        firstVisit(http, jwt, { handle: `course-${unique()}`, age: 'under-15' }),
        firstVisit(http, jwt, { handle: `course-${unique()}`, age: '18+' }),
      ]);
      const row = await app
        .get(DataSource)
        .getRepository(User)
        .findOneByOrFail({ keycloakId: sub });
      if (young.status === 403) {
        // Le refus a été prononcé : le compte doit rester verrouillé.
        expect(row.ageBand).toBe('under-15');
        expect(adult.status).not.toBe(201);
      } else {
        expect([adult.status, row.ageBand]).toEqual([201, '18+']);
      }
    }
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
      'equipe-plumiotheca',
      'moderation_officielle',
      'p1umi0theca',
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

  it('les délais passés, le pseudonyme se change et l’ancien se libère', async () => {
    const { app, http } = await start();
    const db = app.get(DataSource);
    const sub = randomUUID();
    const jwt = await token({ sub });
    const first = `delai-${unique()}`;
    await firstVisit(http, jwt, { handle: first }).expect(201);
    await http
      .put('/api/moi/compte/pseudonyme')
      .set(...bearer(jwt))
      .send({ handle: `delai-b-${unique()}` })
      .expect(200);
    // 31 jours plus tard : nouveau changement permis.
    await db
      .getRepository(User)
      .update({ keycloakId: sub }, { handleChangedAt: new Date(Date.now() - 31 * 86_400_000) });
    await http
      .put('/api/moi/compte/pseudonyme')
      .set(...bearer(jwt))
      .send({ handle: `delai-c-${unique()}` })
      .expect(200);
    // 90 jours plus tard : l'ancien pseudonyme est réattribuable.
    await db
      .getRepository(HandleRelease)
      .update({ handleKey: first }, { reusableAt: new Date(Date.now() - 1000) });
    await firstVisit(http, await token(), { handle: first }).expect(201);
  });

  it('les anciens pseudonymes restent rattachés au compte, pour la modération seule', async () => {
    const { app, http } = await start();
    const sub = randomUUID();
    const jwt = await token({ sub });
    const first = `histo-${unique()}`;
    await firstVisit(http, jwt, { handle: first }).expect(201);
    await http
      .put('/api/moi/compte/pseudonyme')
      .set(...bearer(jwt))
      .send({ handle: `histo-b-${unique()}` })
      .expect(200);
    const db = app.get(DataSource);
    const user = await db.getRepository(User).findOneByOrFail({ keycloakId: sub });
    const history = await db
      .getRepository(HandleHistory)
      .find({ where: { user: { id: user.id } } });
    expect(history.map((h) => h.handle)).toEqual([first]);
    // Rien de l'historique dans « mon compte » (ni, a fortiori, dans le profil public).
    const mine = await http
      .get('/api/moi/compte')
      .set(...bearer(jwt))
      .expect(200);
    expect(JSON.stringify(mine.body)).not.toContain(first);
  });

  it('changement vers un nom réservé refusé', async () => {
    const { app, http } = await start();
    const jwt = await readyToken(app);
    await http
      .put('/api/moi/compte/pseudonyme')
      .set(...bearer(jwt))
      .send({ handle: 'Equipe_Moderation' })
      .expect(409);
  });

  it('compte verrouillé ou première visite non faite : ni pseudonyme ni profil modifiables', async () => {
    const { http } = await start();
    const fresh = await token();
    const locked = await token();
    await firstVisit(http, locked, { handle: `v-${unique()}`, age: 'under-15' }).expect(403);
    for (const jwt of [fresh, locked]) {
      await http
        .put('/api/moi/compte/pseudonyme')
        .set(...bearer(jwt))
        .send({ handle: `x-${unique()}` })
        .expect(403);
      await http
        .patch('/api/moi/compte/profil')
        .set(...bearer(jwt))
        .send({ bio: 'coucou' })
        .expect(403);
    }
  });

  it('nom affiché : pas d’imitation de l’équipe, pas de caractères invisibles', async () => {
    const { app, http } = await start();
    const jwt = await readyToken(app);
    const reserved = await http
      .patch('/api/moi/compte/profil')
      .set(...bearer(jwt))
      .send({ displayName: 'Équipe de modération Plumiotheca' })
      .expect(409);
    expect(expectProblem(reserved.body, 409).type).toBe('nom-reserve');
    await http
      .patch('/api/moi/compte/profil')
      .set(...bearer(jwt))
      .send({ displayName: 'Élise\u202Eesilé' })
      .expect(400);
    await http
      .patch('/api/moi/compte/profil')
      .set(...bearer(jwt))
      .send({ bio: 'Première ligne\nDeuxième ligne' })
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

  it('profil public introuvable : inconnu, ou compte verrouillé ensuite', async () => {
    const { app, http } = await start();
    const res = await http.get(`/api/pseudonymes/inconnu-${unique()}`).expect(404);
    expect(expectProblem(res.body, 404).type).toBe('introuvable');
    // Un compte prêt puis verrouillé (âge découvert) disparaît du public.
    const sub = randomUUID();
    const handle = `verrou-${unique()}`;
    await firstVisit(http, await token({ sub }), { handle }).expect(201);
    await http.get(`/api/pseudonymes/${handle}`).expect(200);
    await app
      .get(DataSource)
      .getRepository(User)
      .update({ keycloakId: sub }, { ageBand: 'under-15' });
    await http.get(`/api/pseudonymes/${handle}`).expect(404);
  });

  it('une route publique reste accessible avec le jeton d’un compte incomplet', async () => {
    const { http } = await start();
    const handle = `pub-${unique()}`;
    await firstVisit(http, await token(), { handle }).expect(201);
    await http
      .get(`/api/pseudonymes/${handle}`)
      .set(...bearer(await token()))
      .expect(200);
  });
});
