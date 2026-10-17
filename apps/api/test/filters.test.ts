import { randomBytes } from 'node:crypto';
import { ChapterDraft, SearchPage, StoryDetail, StoryPage } from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { SearchService } from '../src/stories/search.service.js';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

// Douze lettres au hasard : jamais confondues par la tolérance aux fautes de Meilisearch.
const word = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');

/** Histoire publiée de `words` mots, indexée. */
async function story(ctx: Ctx, jwt: string, body: Record<string, unknown>, words: number) {
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
  const text = { type: 'paragraph', content: [{ type: 'text', text: 'mot '.repeat(words) }] };
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

const titles = (items: { title: string }[]) => items.map((s) => s.title.split(' ')[0]).sort();

/** Quatre histoires d'une même personne, différentes en langue, statut, longueur et tags. */
async function shelf(ctx: Ctx) {
  const jwt = await readyToken(ctx.app);
  const key = word();
  const [a, b] = [`Alpha ${key}`, `Beta ${key}`];
  const courte = await story(ctx, jwt, { title: `Courte ${key}`, tags: [a] }, 5);
  await story(ctx, jwt, { title: `Longue ${key}`, tags: [a, b], completion: 'completed' }, 40);
  await story(ctx, jwt, { title: `Anglaise ${key}`, language: 'en', tags: [b] }, 20);
  await story(ctx, jwt, { title: `Moyenne ${key}`, tags: [a, b] }, 20);
  return { key, a, b, handle: courte.author.handle };
}

describe('filtres de recherche (#32)', () => {
  it('liste : langues, statut, longueur, tags inclus (tous) ; nombre de résultats', async () => {
    const ctx = await start();
    const { a, b, handle } = await shelf(ctx);
    const list = async (params: string) =>
      StoryPage.parse(
        (await ctx.http.get(`/api/histoires?pseudonyme=${handle}&${params}`).expect(200)).body,
      );
    const enc = encodeURIComponent;

    expect(titles((await list('langues=en')).items)).toEqual(['Anglaise']);
    expect(titles((await list('langues=fr,en')).items)).toHaveLength(4);
    expect(titles((await list('statut=completed')).items)).toEqual(['Longue']);
    expect(titles((await list('motsMin=10&motsMax=30')).items)).toEqual(['Anglaise', 'Moyenne']);
    const both = await list(`tags=${enc(a)},${enc(b.toUpperCase())}`);
    expect(titles(both.items)).toEqual(['Longue', 'Moyenne']);
    expect(both.total).toBe(2);
  });

  it('liste : tris, avec la page suivante', async () => {
    const ctx = await start();
    const { handle } = await shelf(ctx);
    const page = async (params: string) =>
      StoryPage.parse(
        (await ctx.http.get(`/api/histoires?pseudonyme=${handle}&${params}`).expect(200)).body,
      );
    const first = await page('tri=longueur&limite=2');
    expect(first.items.map((s) => s.wordCount)).toEqual([40, 20]);
    expect(first.total).toBe(4);
    const second = await page(`tri=longueur&limite=2&apres=${first.nextCursor}`);
    expect(second.items.map((s) => s.wordCount)).toEqual([20, 5]);
    expect(second.total).toBeUndefined();
    expect(second.nextCursor).toBeNull();
    // Curseur d'un autre tri : refusé plutôt que mal interprété.
    await ctx.http.get(`/api/histoires?tri=lecteurs&apres=${first.nextCursor}`).expect(200);
    await ctx.http.get(`/api/histoires?tri=recentes&apres=${first.nextCursor}`).expect(400);
  });

  it('recherche : mêmes filtres, et tri par longueur', async () => {
    const ctx = await start();
    const { key, a, b } = await shelf(ctx);
    const find = async (params: string) =>
      SearchPage.parse((await ctx.http.get(`/api/recherche?q=${key}&${params}`).expect(200)).body);
    expect(titles((await find('statut=completed')).items)).toEqual(['Longue']);
    expect(titles((await find(`tags=${encodeURIComponent(`${a},${b}`)}`)).items)).toEqual([
      'Longue',
      'Moyenne',
    ]);
    expect(titles((await find('langues=en')).items)).toEqual(['Anglaise']);
    const sorted = await find('tri=longueur');
    expect(sorted.items.map((s) => s.wordCount)).toEqual([40, 20, 20, 5]);
  });

  it('valeurs impossibles : 400', async () => {
    const ctx = await start();
    for (const params of ['tri=hasard', 'statut=abandonnee', 'motsMin=-1', 'langues=français']) {
      await ctx.http.get(`/api/histoires?${params}`).expect(400);
    }
  });
});
