import { randomBytes } from 'node:crypto';
import {
  ChapterDraft,
  SearchPage,
  StoryDetail,
  StoryPage,
  Suggestions,
} from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { SearchService } from '../src/stories/search.service.js';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

// Douze lettres au hasard : jamais confondues par la tolérance aux fautes de Meilisearch.
const word = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');

/** Histoire publiée (un chapitre), indexée ; `publish: false` : brouillon. */
async function story(
  ctx: Ctx,
  jwt: string,
  body: Record<string, unknown>,
  { publish = true } = {},
) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ language: 'fr', rating: 'teen', majorWarnings: [], ...body })
        .expect(201)
    ).body,
  );
  if (!publish) return created;
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

/** Déclare `synonym` synonyme de `canonical` (travail des jardiniers des tags). */
async function synonym(ctx: Ctx, synonym: string, canonical: string) {
  await ctx.app.get(DataSource).query(
    `UPDATE tags SET canonical_id = (SELECT id FROM tags WHERE normalized = $2)
       WHERE normalized = $1`,
    [synonym, canonical],
  );
}

const titles = (items: { title: string }[]) => items.map((s) => s.title.split(' ')[0]).sort();

describe('saisie intelligente (#31)', () => {
  it('un tag exclu (ou demandé) vaut aussi pour ses synonymes, avant comme après leur déclaration', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const key = word();
    const [angst, angoisse] = [`angst ${key}`, `angoisse ${key}`];
    const first = await story(ctx, jwt, { title: `Avant ${key}`, tags: [angoisse] });
    await story(ctx, jwt, { title: `Canonique ${key}`, tags: [angst] });
    await synonym(ctx, angoisse, angst);
    await story(ctx, jwt, { title: `Après ${key}`, tags: ['Angoisse ' + key] });
    await story(ctx, jwt, { title: `Neutre ${key}`, tags: [] });
    const handle = first.author.handle;
    const list = async (params: string) =>
      StoryPage.parse(
        (await ctx.http.get(`/api/histoires?pseudonyme=${handle}&${params}`).expect(200)).body,
      );

    for (const tag of [angst, angoisse]) {
      const masked = await list(`masquerTags=${encodeURIComponent(tag)}`);
      expect(titles(masked.items)).toEqual(['Neutre']);
      expect(masked.hidden).toBe(3);
      expect(titles((await list(`tags=${encodeURIComponent(tag)}`)).items)).toEqual([
        'Après',
        'Avant',
        'Canonique',
      ]);
    }
    expect(titles((await list(`tag=${encodeURIComponent('Angoisse ' + key)}`)).items)).toHaveLength(
      3,
    );

    const find = async (params: string) =>
      SearchPage.parse((await ctx.http.get(`/api/recherche?q=${key}&${params}`).expect(200)).body);
    expect(titles((await find(`masquerTags=${encodeURIComponent(angoisse)}`)).items)).toEqual([
      'Neutre',
    ]);
    expect(titles((await find(`tags=${encodeURIComponent(angst)}`)).items)).toHaveLength(3);
  });

  it('suggestions : tags (synonyme → tag canonique, fautes et accents), histoires, personnes', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const key = word();
    const created = await story(ctx, jwt, {
      title: `Mélancolie ${key}`,
      tags: [`Éphémère ${key}`, `Brume ${key}`],
    });
    // Le tag d'un brouillon n'est jamais suggéré : il dirait qu'un brouillon existe.
    await story(
      ctx,
      jwt,
      { title: `Brouillon ${key}`, tags: [`Secret ${key}`] },
      { publish: false },
    );
    await story(ctx, jwt, { title: `Masquée ${key}`, tags: [`Interdit ${key}`] });
    await synonym(ctx, `brume ${key}`, `ephemere ${key}`);
    const suggest = async (q: string, extra = '') =>
      Suggestions.parse(
        (
          await ctx.http
            .get(`/api/recherche/suggestions?q=${encodeURIComponent(q)}${extra}`)
            .expect(200)
        ).body,
      );

    // Sans accent, et avec le préfixe seulement.
    const prefix = await suggest(`ephem ${key.slice(0, 6)}`);
    expect(prefix.tags).toContainEqual({ name: `Éphémère ${key}`, stories: 1 });
    // Un synonyme mène au tag canonique (avec les histoires taguées du synonyme).
    expect((await suggest(`brume ${key}`)).tags[0]).toEqual({
      name: `Éphémère ${key}`,
      stories: 1,
    });
    // Une faute de frappe (lettre doublée).
    const typo = `ephemmere ${key}`;
    expect((await suggest(typo)).tags.map((t) => t.name)).toContain(`Éphémère ${key}`);
    expect((await suggest(`secret ${key}`)).tags.map((t) => t.name)).not.toContain(`Secret ${key}`);

    // Histoires : Meilisearch, accents et fautes tolérés ; les exclusions s'appliquent.
    const stories = await suggest(`melancolie ${key}`);
    expect(stories.stories.map((s) => s.id)).toContain(created.id);
    expect(stories.stories[0]).toMatchObject({ language: 'fr', author: created.author });
    const masked = await suggest(key, `&masquerTags=${encodeURIComponent(`interdit ${key}`)}`);
    expect(masked.stories.map((s) => s.title.split(' ')[0])).toEqual(['Mélancolie']);

    // Personnes : début du pseudonyme.
    const handle = created.author.handle;
    expect((await suggest(handle.slice(0, 12))).authors).toContainEqual({
      handle,
      displayName: null,
    });
  });

  it('suggestions : saisie vide ou trop longue refusée', async () => {
    const ctx = await start();
    await ctx.http.get('/api/recherche/suggestions?q=%20').expect(400);
    await ctx.http.get(`/api/recherche/suggestions?q=${'a'.repeat(101)}`).expect(400);
  });
});
