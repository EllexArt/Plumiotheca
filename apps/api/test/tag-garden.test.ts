import { randomBytes } from 'node:crypto';
import {
  ChapterDraft,
  GardenTag,
  GardenTagList,
  StoryDetail,
  StoryPage,
  TagJournal,
} from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { expectProblem, readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;
const word = () => Array.from(randomBytes(10), (b) => String.fromCharCode(97 + (b % 26))).join('');

/** Histoire publiée portant ces tags. */
async function story(ctx: Ctx, jwt: string, title: string, tags: string[]) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ title, language: 'fr', rating: 'general', majorWarnings: [], tags })
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
  return created;
}

async function setup() {
  const ctx = await start();
  const author = await readyToken(ctx.app);
  const gardener = await readyToken(ctx.app, { realm_access: { roles: ['jardinage-tags'] } });
  const find = async (name: string) => {
    const { items } = GardenTagList.parse(
      (
        await ctx.http
          .get(`/api/jardinage/tags?q=${encodeURIComponent(name)}`)
          .set(...bearer(gardener))
          .expect(200)
      ).body,
    );
    return items.find((t) => t.name === name)!;
  };
  const titles = async (params: string, handle: string) =>
    StoryPage.parse(
      (await ctx.http.get(`/api/histoires?pseudonyme=${handle}&${params}`).expect(200)).body,
    )
      .items.map((s) => s.title.split(' ')[0])
      .sort();
  const journal = async () =>
    TagJournal.parse(
      (
        await ctx.http
          .get('/api/jardinage/journal')
          .set(...bearer(gardener))
          .expect(200)
      ).body,
    ).items;
  return { ctx, author, gardener, find, titles, journal };
}

describe('tags : normalisation et jardinage (#78)', () => {
  it('« slowburn », « Slow-Burn » et « slow burn » mènent au même tag', async () => {
    const { ctx, author, find } = await setup();
    const key = word();
    const created = await story(ctx, author, `Un ${key}`, [
      `slow${key}`,
      `Slow-${key}`,
      `slow ${key}`,
    ]);
    expect(created.tags).toEqual([`slow${key}`]);
    expect((await find(`slow${key}`)).normalized).toBe(`slow${key}`);
  });

  it('fusion : synonyme affiché sous le tag canonique, inclus dans les filtres ; réservée aux jardiniers ; annulable', async () => {
    const { ctx, author, gardener, find, titles, journal } = await setup();
    const [a, b] = [`Alpha ${word()}`, `Beta ${word()}`];
    const first = await story(ctx, author, `Premier ${a}`, [a]);
    await story(ctx, author, `Second ${b}`, [b]);
    const handle = first.author.handle;
    const tagB = await find(b);

    await ctx.http
      .post(`/api/jardinage/tags/${tagB.id}/fusion`)
      .set(...bearer(author))
      .send({ into: a })
      .expect(403);
    const merged = GardenTag.parse(
      (
        await ctx.http
          .post(`/api/jardinage/tags/${tagB.id}/fusion`)
          .set(...bearer(gardener))
          .send({ into: a })
          .expect(200)
      ).body,
    );
    expect(merged.canonical?.name).toBe(a);
    expect((await find(a)).synonyms.map((s) => s.name)).toEqual([b]);
    expect((await find(a)).stories).toBe(2);

    // Affichage : le tag canonique ; filtres et masquage : toute la famille.
    const listed = StoryPage.parse(
      (await ctx.http.get(`/api/histoires?pseudonyme=${handle}`).expect(200)).body,
    );
    expect(listed.items.map((s) => s.tags)).toEqual([[a], [a]]);
    expect(await titles(`tags=${encodeURIComponent(a)}`, handle)).toEqual(['Premier', 'Second']);
    expect(await titles(`masquerTags=${encodeURIComponent(b)}`, handle)).toEqual([]);

    // Journal : qui, quoi ; annulation, une seule fois.
    const [entry] = await journal();
    expect(entry).toMatchObject({
      kind: 'merge',
      summary: `« ${b} » rattaché comme synonyme à « ${a} »`,
      revertedAt: null,
      revertible: true,
    });
    expect(entry!.by).toMatch(/^essai-/);
    await ctx.http
      .post(`/api/jardinage/journal/${entry!.id}/annulation`)
      .set(...bearer(gardener))
      .expect(204);
    expect((await find(b)).canonical).toBeNull();
    expect(await titles(`tags=${encodeURIComponent(a)}`, handle)).toEqual(['Premier']);
    const after = await journal();
    expect(after[0]).toMatchObject({ kind: 'revert', revertible: false });
    expect(after[1]).toMatchObject({ id: entry!.id, revertible: false });
    expect(after[1]!.revertedAt).not.toBeNull();
    await ctx.http
      .post(`/api/jardinage/journal/${entry!.id}/annulation`)
      .set(...bearer(gardener))
      .expect(409);
  });

  it('hiérarchie : les sous-tags héritent du parent ; ni boucle, ni parent pour un synonyme', async () => {
    const { ctx, author, gardener, find, titles } = await setup();
    const [parent, child, other] = [`Parent ${word()}`, `Enfant ${word()}`, `Autre ${word()}`];
    const first = await story(ctx, author, `Large ${parent}`, [parent]);
    await story(ctx, author, `Precis ${child}`, [child]);
    await story(ctx, author, `Hors ${other}`, [other]);
    const handle = first.author.handle;
    const put = async (name: string, body: object, status: number) => {
      const tag = await find(name);
      return ctx.http
        .put(`/api/jardinage/tags/${tag.id}/parent`)
        .set(...bearer(gardener))
        .send(body)
        .expect(status);
    };

    await put(child, { parent }, 200);
    expect((await find(parent)).children.map((c) => c.name)).toEqual([child]);
    expect(await titles(`tags=${encodeURIComponent(parent)}`, handle)).toEqual(['Large', 'Precis']);
    expect(await titles(`masquerTags=${encodeURIComponent(parent)}`, handle)).toEqual(['Hors']);
    // Boucle : le parent ne peut pas passer sous son propre sous-tag.
    expect(expectProblem((await put(parent, { parent: child }, 409)).body, 409).type).toBe(
      'boucle-de-tags',
    );
    // Un synonyme n'a pas de parent.
    const tagOther = await find(other);
    await ctx.http
      .post(`/api/jardinage/tags/${tagOther.id}/fusion`)
      .set(...bearer(gardener))
      .send({ into: parent })
      .expect(200);
    await put(other, { parent: child }, 409);
    await put(child, { parent: null }, 200);
    expect((await find(child)).parent).toBeNull();
  });

  it('renommer : un nom pris appelle une fusion ; une opération dépassée ne s’annule pas', async () => {
    const { ctx, author, gardener, find, journal } = await setup();
    const [a, b] = [`Gamma ${word()}`, `Delta ${word()}`];
    await story(ctx, author, `Un ${a}`, [a, b]);
    const tagA = await find(a);
    const rename = (name: string) =>
      ctx.http
        .put(`/api/jardinage/tags/${tagA.id}/nom`)
        .set(...bearer(gardener))
        .send({ name });

    expect(expectProblem((await rename(b.toUpperCase()).expect(409)).body, 409).type).toBe(
      'tag-existant',
    );
    const renamed = `${a} (traduction)`;
    await rename(renamed).expect(200);
    const [renaming] = await journal();
    // Fusion du même tag ensuite : le renommage n'est plus annulable.
    await ctx.http
      .post(`/api/jardinage/tags/${tagA.id}/fusion`)
      .set(...bearer(gardener))
      .send({ into: b })
      .expect(200);
    const items = await journal();
    expect(items.find((i) => i.id === renaming!.id)?.revertible).toBe(false);
    const stale = await ctx.http
      .post(`/api/jardinage/journal/${renaming!.id}/annulation`)
      .set(...bearer(gardener))
      .expect(409);
    expect(expectProblem(stale.body, 409).type).toBe('tags-modifies');
  });
});
