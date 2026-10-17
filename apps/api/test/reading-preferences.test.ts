import { DEFAULT_READING, MyAccount } from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;

describe('réglages de lecture (#28)', () => {
  it('gardés sur le compte, relus avec lui ; retour aux réglages de l’appareil', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const me = async () =>
      MyAccount.parse(
        (
          await ctx.http
            .get('/api/moi/compte')
            .set(...bearer(jwt))
            .expect(200)
        ).body,
      );
    expect((await me()).readingPreferences).toBeNull();

    const chosen = { font: 'sans', size: 130, lineHeight: 'aere', width: 'etroite' } as const;
    const saved = MyAccount.parse(
      (
        await ctx.http
          .put('/api/moi/compte/lecture')
          .set(...bearer(jwt))
          .send(chosen)
          .expect(200)
      ).body,
    );
    expect(saved.readingPreferences).toEqual(chosen);
    // Un autre appareil relit le compte : mêmes réglages.
    expect((await me()).readingPreferences).toEqual(chosen);

    await ctx.http
      .delete('/api/moi/compte/lecture')
      .set(...bearer(jwt))
      .expect(200);
    expect((await me()).readingPreferences).toBeNull();
  });

  it.each([
    ['taille hors pas de 10', { ...DEFAULT_READING, size: 85 }],
    ['taille trop grande', { ...DEFAULT_READING, size: 300 }],
    ['police inconnue', { ...DEFAULT_READING, font: 'comic' }],
    ['réglage incomplet', { font: 'sans' }],
    ['champ inconnu', { ...DEFAULT_READING, couleur: 'sepia' }],
  ])('%s : refusé (400)', async (_, body) => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    await ctx.http
      .put('/api/moi/compte/lecture')
      .set(...bearer(jwt))
      .send(body)
      .expect(400);
  });

  it('sans compte : 401', async () => {
    const ctx = await start();
    await ctx.http.put('/api/moi/compte/lecture').send(DEFAULT_READING).expect(401);
  });
});

describe('apparence du site (#77)', () => {
  it('ambiance et mode gardés sur le compte ; valeurs impossibles refusées', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const put = (body: unknown) =>
      ctx.http
        .put('/api/moi/compte/apparence')
        .set(...bearer(jwt))
        .send(body as object);
    const saved = MyAccount.parse(
      (await put({ palette: 'bougie', mode: 'dark' }).expect(200)).body,
    );
    expect(saved.appearance).toEqual({ palette: 'bougie', mode: 'dark' });
    await put({ palette: 'Bougie !', mode: 'dark' }).expect(400);
    await put({ palette: 'bougie', mode: 'sepia' }).expect(400);
    await put({ palette: 'bougie' }).expect(400);
    await ctx.http
      .put('/api/moi/compte/apparence')
      .send({ palette: 'lueur', mode: 'light' })
      .expect(401);
  });

  it('le lecteur peut imposer une ambiance', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const prefs = { ...DEFAULT_READING, ambiance: 'indigo' };
    const saved = MyAccount.parse(
      (
        await ctx.http
          .put('/api/moi/compte/lecture')
          .set(...bearer(jwt))
          .send(prefs)
          .expect(200)
      ).body,
    );
    expect(saved.readingPreferences).toEqual(prefs);
  });
});
