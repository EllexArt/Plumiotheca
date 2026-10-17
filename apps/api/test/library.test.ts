import { ChapterDraft, LibraryPage, LibraryStatus, StoryDetail } from '@plumiotheca/contracts';
import { describe, expect, it } from 'vitest';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;
const BLOCK = 'paragraphe-deux';

/** Histoire publiée avec deux chapitres publiés ; renvoie ses identifiants. */
async function published(ctx: Ctx, jwt: string, title = 'Les Lucioles') {
  const story = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ title, language: 'fr', rating: 'teen', majorWarnings: [] })
        .expect(201)
    ).body,
  );
  const chapters: string[] = [];
  for (const name of ['Un', 'Deux']) {
    const chapter = ChapterDraft.parse(
      (
        await ctx.http
          .post(`/api/histoires/${story.id}/chapitres`)
          .set(...bearer(jwt))
          .send({ title: name })
          .expect(201)
      ).body,
    );
    const text = {
      type: 'paragraph',
      attrs: { id: BLOCK },
      content: [{ type: 'text', text: 'Il était une fois.' }],
    };
    await ctx.http
      .put(`/api/histoires/${story.id}/chapitres/${chapter.id}/brouillon`)
      .set(...bearer(jwt))
      .send({ draft: { type: 'doc', content: [text] }, version: chapter.draftVersion })
      .expect(200);
    await ctx.http
      .post(`/api/histoires/${story.id}/chapitres/${chapter.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    chapters.push(chapter.id);
  }
  await ctx.http
    .post(`/api/histoires/${story.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  return { story: story.id, chapters };
}

describe('Mes lectures (#30)', () => {
  it('ouvrir une histoire l’ajoute en cours, avec la position ; retrouvée « sur un autre appareil »', async () => {
    const ctx = await start();
    const { story, chapters } = await published(ctx, await readyToken(ctx.app));
    const reader = await readyToken(ctx.app);
    const status = async () =>
      LibraryStatus.parse(
        (
          await ctx.http
            .get(`/api/moi/lectures/${story}`)
            .set(...bearer(reader))
            .expect(200)
        ).body,
      ).entry;
    expect(await status()).toBeNull();

    await ctx.http
      .put(`/api/moi/lectures/${story}/position`)
      .set(...bearer(reader))
      .send({ chapterId: chapters[1], blockId: BLOCK })
      .expect(200);
    expect(await status()).toMatchObject({
      shelf: 'reading',
      chapterId: chapters[1],
      blockId: BLOCK,
    });

    const page = LibraryPage.parse(
      (
        await ctx.http
          .get('/api/moi/lectures?etagere=reading')
          .set(...bearer(reader))
          .expect(200)
      ).body,
    );
    expect(page.items.map((i) => [i.story.id, i.chapterId])).toEqual([[story, chapters[1]]]);
  });

  it('étagères : à lire passe en cours à la lecture ; terminée le reste ; retirée', async () => {
    const ctx = await start();
    const { story, chapters } = await published(ctx, await readyToken(ctx.app));
    const reader = await readyToken(ctx.app);
    const put = (path: string, body: object) =>
      ctx.http
        .put(`/api/moi/lectures/${story}${path}`)
        .set(...bearer(reader))
        .send(body)
        .expect(200);
    const shelfOf = async (res: Promise<{ body: unknown }>) =>
      LibraryStatus.parse((await res).body).entry?.shelf;

    expect(await shelfOf(put('', { shelf: 'to_read' }))).toBe('to_read');
    expect(await shelfOf(put('/position', { chapterId: chapters[0], blockId: null }))).toBe(
      'reading',
    );
    expect(await shelfOf(put('', { shelf: 'finished' }))).toBe('finished');
    expect(await shelfOf(put('/position', { chapterId: chapters[0], blockId: null }))).toBe(
      'finished',
    );
    await ctx.http
      .delete(`/api/moi/lectures/${story}`)
      .set(...bearer(reader))
      .expect(204);
    expect(
      LibraryStatus.parse(
        (
          await ctx.http
            .get(`/api/moi/lectures/${story}`)
            .set(...bearer(reader))
            .expect(200)
        ).body,
      ).entry,
    ).toBeNull();
  });

  it('dépubliée : retirée des étagères, et revient si elle est republiée ; chapitre dépublié : pas de reprise', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const { story, chapters } = await published(ctx, author);
    const reader = await readyToken(ctx.app);
    await ctx.http
      .put(`/api/moi/lectures/${story}/position`)
      .set(...bearer(reader))
      .send({ chapterId: chapters[1], blockId: BLOCK })
      .expect(200);
    const shelf = async () =>
      LibraryPage.parse(
        (
          await ctx.http
            .get('/api/moi/lectures')
            .set(...bearer(reader))
            .expect(200)
        ).body,
      ).items;

    await ctx.http
      .post(`/api/histoires/${story}/depublication`)
      .set(...bearer(author))
      .expect(201);
    expect(await shelf()).toEqual([]);
    await ctx.http
      .get(`/api/moi/lectures/${story}`)
      .set(...bearer(reader))
      .expect(404);

    await ctx.http
      .post(`/api/histoires/${story}/publication`)
      .set(...bearer(author))
      .expect(201);
    await ctx.http
      .post(`/api/histoires/${story}/chapitres/${chapters[1]}/depublication`)
      .set(...bearer(author))
      .expect(201);
    const [item] = await shelf();
    expect(item).toMatchObject({ shelf: 'reading', chapterId: null, blockId: null });
  });

  it('personne d’autre ne voit Mes lectures ; chapitre d’une autre histoire refusé', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const first = await published(ctx, author, 'Une');
    const second = await published(ctx, author, 'Deux');
    const reader = await readyToken(ctx.app);
    await ctx.http
      .put(`/api/moi/lectures/${first.story}/position`)
      .set(...bearer(reader))
      .send({ chapterId: second.chapters[0], blockId: null })
      .expect(404);
    await ctx.http
      .put(`/api/moi/lectures/${first.story}/position`)
      .set(...bearer(reader))
      .send({ chapterId: first.chapters[0], blockId: 'pas un bloc !' })
      .expect(400);
    await ctx.http
      .put(`/api/moi/lectures/${first.story}`)
      .set(...bearer(reader))
      .send({ shelf: 'reading' })
      .expect(200);
    const other = await readyToken(ctx.app);
    const page = LibraryPage.parse(
      (
        await ctx.http
          .get('/api/moi/lectures')
          .set(...bearer(other))
          .expect(200)
      ).body,
    );
    expect(page.items).toEqual([]);
    await ctx.http.get('/api/moi/lectures').expect(401);
  });
});
