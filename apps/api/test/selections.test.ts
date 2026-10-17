import { ChapterDraft, Selection, SelectionList, StoryDetail } from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

/** Histoire (publiée ou brouillon) ; renvoie son identifiant. */
async function story(ctx: Ctx, jwt: string, title: string, publish = true) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ title, language: 'fr', rating: 'teen', majorWarnings: [] })
        .expect(201)
    ).body,
  );
  if (publish) {
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
  }
  return created.id;
}

async function create(ctx: Ctx, jwt: string, body: object) {
  return Selection.parse(
    (
      await ctx.http
        .post('/api/moi/selections')
        .set(...bearer(jwt))
        .send(body)
        .expect(201)
    ).body,
  );
}

const add = (ctx: Ctx, jwt: string, id: string, storyId: string) =>
  ctx.http.put(`/api/moi/selections/${id}/histoires/${storyId}`).set(...bearer(jwt));

describe('sélections (#30)', () => {
  it('privée par défaut : invisible des autres ; publique : page partageable, même sans compte', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const lanterne = await story(ctx, author, 'La lanterne');
    const owner = await readyToken(ctx.app);
    const selection = await create(ctx, owner, { title: 'Pour les nuits blanches' });
    expect(selection.visibility).toBe('private');
    await add(ctx, owner, selection.id, lanterne).expect(200);

    await ctx.http.get(`/api/selections/${selection.id}`).expect(404);
    const other = await readyToken(ctx.app);
    await ctx.http
      .get(`/api/selections/${selection.id}`)
      .set(...bearer(other))
      .expect(404);

    await ctx.http
      .patch(`/api/moi/selections/${selection.id}`)
      .set(...bearer(owner))
      .send({ visibility: 'public', description: 'Des histoires à lire tard.' })
      .expect(200);
    const page = Selection.parse(
      (await ctx.http.get(`/api/selections/${selection.id}`).expect(200)).body,
    );
    expect(page).toMatchObject({
      title: 'Pour les nuits blanches',
      description: 'Des histoires à lire tard.',
      storyCount: 1,
      mine: false,
    });
    expect(page.stories.map((s) => s.title)).toEqual(['La lanterne']);
  });

  it('une histoire peut figurer dans plusieurs sélections ; sans doublon ; retirée', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const lanterne = await story(ctx, author, 'La lanterne');
    const owner = await readyToken(ctx.app);
    const first = await create(ctx, owner, { title: 'Une' });
    const second = await create(ctx, owner, { title: 'Deux' });
    await add(ctx, owner, first.id, lanterne).expect(200);
    await add(ctx, owner, first.id, lanterne).expect(200);
    await add(ctx, owner, second.id, lanterne).expect(200);

    const mine = SelectionList.parse(
      (
        await ctx.http
          .get(`/api/moi/selections?histoire=${lanterne}`)
          .set(...bearer(owner))
          .expect(200)
      ).body,
    );
    expect(mine.items.map((s) => [s.title, s.storyCount, s.contains])).toEqual([
      ['Deux', 1, true],
      ['Une', 1, true],
    ]);

    const removed = Selection.parse(
      (
        await ctx.http
          .delete(`/api/moi/selections/${first.id}/histoires/${lanterne}`)
          .set(...bearer(owner))
          .expect(200)
      ).body,
    );
    expect(removed.stories).toEqual([]);
  });

  it('seules les histoires visibles y entrent et y apparaissent', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const published = await story(ctx, author, 'Publiée');
    const draft = await story(ctx, author, 'Brouillon', false);
    const owner = await readyToken(ctx.app);
    const selection = await create(ctx, owner, { title: 'Mes préférées', visibility: 'public' });
    await add(ctx, owner, selection.id, draft).expect(404);
    await add(ctx, owner, selection.id, published).expect(200);
    await ctx.http
      .post(`/api/histoires/${published}/depublication`)
      .set(...bearer(author))
      .expect(201);
    const page = Selection.parse(
      (await ctx.http.get(`/api/selections/${selection.id}`).expect(200)).body,
    );
    expect(page.stories).toEqual([]);
  });

  it('étagères publiques d’Explorer : publiques et non vides seulement ; par personne', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const lanterne = await story(ctx, author, 'La lanterne');
    const owner = await readyToken(ctx.app);
    const shown = await create(ctx, owner, { title: 'Montrée', visibility: 'public' });
    await add(ctx, owner, shown.id, lanterne).expect(200);
    await create(ctx, owner, { title: 'Vide', visibility: 'public' });
    const hidden = await create(ctx, owner, { title: 'Privée' });
    await add(ctx, owner, hidden.id, lanterne).expect(200);

    const list = SelectionList.parse(
      (await ctx.http.get(`/api/selections?pseudonyme=${shown.owner.handle}`).expect(200)).body,
    );
    expect(list.items.map((s) => s.title)).toEqual(['Montrée']);
    expect(list.items[0]!.preview.map((s) => s.title)).toEqual(['La lanterne']);
  });

  it('personne d’autre ne modifie une sélection ; titres et champs vérifiés', async () => {
    const ctx = await start();
    const owner = await readyToken(ctx.app);
    const publicOne = await create(ctx, owner, { title: 'Publique', visibility: 'public' });
    const privateOne = await create(ctx, owner, { title: 'Privée' });
    const other = await readyToken(ctx.app);
    await ctx.http
      .patch(`/api/moi/selections/${publicOne.id}`)
      .set(...bearer(other))
      .send({ title: 'Volée' })
      .expect(403);
    await ctx.http
      .delete(`/api/moi/selections/${privateOne.id}`)
      .set(...bearer(other))
      .expect(404);
    for (const body of [{ title: '' }, { title: 'x'.repeat(101) }, { title: 'A', couleur: 'or' }]) {
      await ctx.http
        .post('/api/moi/selections')
        .set(...bearer(owner))
        .send(body)
        .expect(400);
    }
    await ctx.http
      .delete(`/api/moi/selections/${privateOne.id}`)
      .set(...bearer(owner))
      .expect(204);
    await ctx.http.post('/api/moi/selections').send({ title: 'A' }).expect(401);
  });
});
