import { randomBytes } from 'node:crypto';
import {
  ChapterDraft,
  MyAccount,
  SearchPage,
  StoryDetail,
  StoryPage,
} from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { SearchService } from '../src/stories/search.service.js';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

// Douze lettres au hasard : jamais confondues par la tolérance aux fautes de Meilisearch.
const word = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');

/** Histoire publiée (un chapitre) et indexée. */
async function story(ctx: Ctx, jwt: string, body: Record<string, unknown>) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ language: 'fr', rating: 'teen', majorWarnings: [], ...body })
        .expect(201)
    ).body,
  );
  const chapter = ChapterDraft.parse(
    (
      await ctx.http
        .post(`/api/histoires/${created.id}/chapitres`)
        .set(...bearer(jwt))
        .send({ title: 'Un' })
        .expect(201)
    ).body,
  );
  const text = { type: 'paragraph', content: [{ type: 'text', text: 'Il était une fois.' }] };
  await ctx.http
    .put(`/api/histoires/${created.id}/chapitres/${chapter.id}/brouillon`)
    .set(...bearer(jwt))
    .send({ draft: { type: 'doc', content: [text] }, version: chapter.draftVersion })
    .expect(200);
  await ctx.http
    .post(`/api/histoires/${created.id}/chapitres/${chapter.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  await ctx.http
    .post(`/api/histoires/${created.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  const search = ctx.app.get(SearchService);
  await search.waitForTask(await search.sync(created.id));
  return created;
}

/** Une personne et quatre histoires : sans avertissement, deuil, suicide, mort d'un personnage. */
async function shelf(ctx: Ctx) {
  const jwt = await readyToken(ctx.app);
  const key = word();
  const calm = await story(ctx, jwt, { title: `Calme ${key}` });
  await story(ctx, jwt, { title: `Deuil ${key}`, contentWarnings: ['grief'] });
  await story(ctx, jwt, { title: `Suicide ${key}`, contentWarnings: ['suicide', 'grief'] });
  await story(ctx, jwt, { title: `Mort ${key}`, majorWarnings: ['character_death'] });
  return { key, handle: calm.author.handle };
}

const titles = (items: { title: string }[]) => items.map((s) => s.title.split(' ')[0]).sort();

describe('avertissements facultatifs masqués (#152)', () => {
  it('liste : masquées, combinées avec les avertissements majeurs et le classement ; nombre dit', async () => {
    const ctx = await start();
    const { handle } = await shelf(ctx);
    const list = async (params: string) =>
      StoryPage.parse(
        (await ctx.http.get(`/api/histoires?pseudonyme=${handle}&${params}`).expect(200)).body,
      );

    const grief = await list('exclureAutres=grief');
    expect(titles(grief.items)).toEqual(['Calme', 'Mort']);
    expect(grief.hidden).toBe(2);

    const both = await list('exclureAutres=suicide&exclure=character_death');
    expect(titles(both.items)).toEqual(['Calme', 'Deuil']);
    expect(both.hidden).toBe(2);

    const rated = await list('exclureAutres=grief&exclureClassement=teen');
    expect(rated.items).toEqual([]);
    // Masquées par l'avertissement : celles que le classement laisserait passer, aucune ici.
    expect(rated.hidden).toBe(0);

    // Sans exclusion, rien à dire ; page suivante (curseur) : pas de nouveau décompte.
    expect((await list('')).hidden).toBeUndefined();
    const paged = await list('exclureAutres=grief&limite=1');
    expect(paged.hidden).toBe(2);
    const next = await list(`exclureAutres=grief&limite=1&apres=${paged.nextCursor}`);
    expect(titles(next.items)).toEqual(['Calme']);
    expect(next.hidden).toBeUndefined();
  });

  it('recherche : masquées aussi, avec leur nombre', async () => {
    const ctx = await start();
    const { key } = await shelf(ctx);
    const res = SearchPage.parse(
      (
        await ctx.http
          .get(`/api/recherche?q=${key}&exclureAutres=grief&exclure=character_death`)
          .expect(200)
      ).body,
    );
    expect(titles(res.items)).toEqual(['Calme']);
    expect(res.hidden).toBe(3);
  });

  it('avertissement inconnu : 400', async () => {
    const ctx = await start();
    await ctx.http.get('/api/histoires?exclureAutres=sepia').expect(400);
    await ctx.http.get('/api/recherche?q=a&exclureAutres=sepia').expect(400);
  });
});

describe('Mes limites sur le compte (#152)', () => {
  it('gardées, sans doublon ; aucune limite : rien n’est gardé', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const put = (body: unknown) =>
      ctx.http
        .put('/api/moi/compte/limites')
        .set(...bearer(jwt))
        .send(body as object);
    const saved = MyAccount.parse(
      (await put({ hiddenContentWarnings: ['suicide', 'grief', 'suicide'] }).expect(200)).body,
    );
    expect(saved.limits).toEqual({
      hiddenContentWarnings: ['grief', 'suicide'],
      hiddenMajorWarnings: [],
      hiddenTags: [],
    });
    const cleared = MyAccount.parse((await put({ hiddenContentWarnings: [] }).expect(200)).body);
    expect(cleared.limits).toBeNull();
    await put({ hiddenContentWarnings: ['sepia'] }).expect(400);
    await put({ hiddenContentWarnings: [], tags: ['x'] }).expect(400);
    await ctx.http.put('/api/moi/compte/limites').send({ hiddenContentWarnings: [] }).expect(401);
  });
});

describe('Mes limites permanentes : avertissements majeurs et tags (#81)', () => {
  it('tags masqués (casse et accents ignorés) dans la liste et la recherche, avec leur nombre', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const key = word();
    // Tags propres au test : la table des tags est commune aux fichiers qui tournent en parallèle.
    const shared = `Commun ${key}`;
    const kept = await story(ctx, jwt, { title: `Gardée ${key}`, tags: [shared] });
    await story(ctx, jwt, { title: `Masquée ${key}`, tags: [`Feu Lent ${key}`, shared] });
    const list = StoryPage.parse(
      (
        await ctx.http
          .get(`/api/histoires?pseudonyme=${kept.author.handle}&masquerTags=feu%20lent%20${key}`)
          .expect(200)
      ).body,
    );
    expect(titles(list.items)).toEqual(['Gardée']);
    expect(list.hidden).toBe(1);
    const found = SearchPage.parse(
      (await ctx.http.get(`/api/recherche?q=${key}&masquerTags=F%C3%8AU-LENT%20${key}`).expect(200))
        .body,
    );
    expect(titles(found.items)).toEqual(['Gardée']);
    expect(found.hidden).toBe(1);
  });

  it('limites du compte : avertissements majeurs et tags, normalisés et sans doublon ; ancien format accepté', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const put = (body: unknown) =>
      ctx.http
        .put('/api/moi/compte/limites')
        .set(...bearer(jwt))
        .send(body as object);
    const saved = MyAccount.parse(
      (
        await put({
          hiddenContentWarnings: [],
          hiddenMajorWarnings: ['unspecified', 'character_death', 'unspecified'],
          hiddenTags: ['Slow Burn', 'slow  burn', 'Énemies to lovers'],
        }).expect(200)
      ).body,
    );
    expect(saved.limits).toEqual({
      hiddenContentWarnings: [],
      hiddenMajorWarnings: ['character_death', 'unspecified'],
      hiddenTags: ['slow burn', 'enemies to lovers'],
    });
    const old = MyAccount.parse((await put({ hiddenContentWarnings: ['grief'] }).expect(200)).body);
    expect(old.limits).toEqual({
      hiddenContentWarnings: ['grief'],
      hiddenMajorWarnings: [],
      hiddenTags: [],
    });
  });
});
