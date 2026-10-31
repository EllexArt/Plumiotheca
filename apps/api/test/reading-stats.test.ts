import { ChapterDraft, MyAccount, ReadingStats, StoryDetail } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

/** Histoire publiée de chapitres de `words` mots chacun ; identifiants des chapitres. */
async function story(ctx: Ctx, jwt: string, words: number[]) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ title: 'Le phare', language: 'fr', rating: 'general', majorWarnings: [] })
        .expect(201)
    ).body,
  );
  const ids: string[] = [];
  for (const [i, n] of words.entries()) {
    const chapter = ChapterDraft.parse(
      (
        await ctx.http
          .post(`/api/histoires/${created.id}/chapitres`)
          .set(...bearer(jwt))
          .send({ title: `Chapitre ${i + 1}` })
          .expect(201)
      ).body,
    );
    const text = { type: 'paragraph', content: [{ type: 'text', text: 'mot '.repeat(n) }] };
    await ctx.http
      .put(`/api/histoires/${created.id}/chapitres/${chapter.id}/brouillon`)
      .set(...bearer(jwt))
      .send({ draft: { type: 'doc', content: [text] }, version: chapter.draftVersion })
      .expect(200);
    await ctx.http
      .post(`/api/histoires/${created.id}/chapitres/${chapter.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    ids.push(chapter.id);
  }
  await ctx.http
    .post(`/api/histoires/${created.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  return { id: created.id, chapters: ids };
}

const stats = async (ctx: Ctx, jwt: string) =>
  ReadingStats.parse(
    (
      await ctx.http
        .get('/api/moi/bilan')
        .set(...bearer(jwt))
        .expect(200)
    ).body,
  );
const addTime = (ctx: Ctx, jwt: string, seconds: number) =>
  ctx.http
    .post('/api/moi/bilan/temps')
    .set(...bearer(jwt))
    .send({ seconds });

describe('bilan de lecture (#34)', () => {
  it('étagères, chapitres et mots lus (avant la position de reprise ; tout pour une terminée)', async () => {
    const ctx = await start();
    const [author, reader] = await Promise.all([readyToken(ctx.app), readyToken(ctx.app)]);
    const long = await story(ctx, author, [10, 20, 30]);
    const done = await story(ctx, author, [5, 5]);
    const later = await story(ctx, author, [7]);
    await ctx.http
      .put(`/api/moi/lectures/${long.id}/position`)
      .set(...bearer(reader))
      .send({ chapterId: long.chapters[2], blockId: null })
      .expect(200);
    for (const [id, shelf] of [
      [done.id, 'finished'],
      [later.id, 'to_read'],
    ] as const) {
      await ctx.http
        .put(`/api/moi/lectures/${id}`)
        .set(...bearer(reader))
        .send({ shelf })
        .expect(200);
    }
    expect(await stats(ctx, reader)).toMatchObject({
      finished: 1,
      reading: 1,
      toRead: 1,
      // Chapitres 1 et 2 de la première (en cours au 3e), et les deux de la terminée.
      chaptersRead: 4,
      wordsRead: 10 + 20 + 5 + 5,
      minutesTotal: 0,
    });
  });

  it('temps de lecture cumulé par mois ; douze mois, mois vides compris', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    await addTime(ctx, jwt, 120).expect(204);
    await addTime(ctx, jwt, 61).expect(204);
    // Un mois plus ancien, posé directement (pas d'horloge à avancer).
    const db = ctx.app.get(DataSource);
    const { handle } = MyAccount.parse(
      (
        await ctx.http
          .get('/api/moi/compte')
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    await db.query(
      `INSERT INTO reading_times (user_id, month, seconds)
       VALUES ((SELECT id FROM users WHERE handle = $1),
               (date_trunc('month', now() AT TIME ZONE 'Europe/Paris') - interval '2 months')::date, 600)`,
      [handle],
    );
    const s = await stats(ctx, jwt);
    expect(s.minutesThisMonth).toBe(3);
    expect(s.minutesTotal).toBe(13);
    expect(s.months).toHaveLength(12);
    expect(s.months.at(-1)!.minutes).toBe(3);
    expect(s.months.at(-3)!.minutes).toBe(10);
    expect(s.months.at(-2)!.minutes).toBe(0);
    await addTime(ctx, jwt, 0).expect(400);
    await addTime(ctx, jwt, 3601).expect(400);
  });

  it('désactivé : plus rien n’est compté, le temps mesuré est effacé ; activé par défaut', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const me = MyAccount.parse(
      (
        await ctx.http
          .get('/api/moi/compte')
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    expect(me.readingStats).toBe(true);
    await addTime(ctx, jwt, 120).expect(204);
    const off = MyAccount.parse(
      (
        await ctx.http
          .put('/api/moi/compte/bilan')
          .set(...bearer(jwt))
          .send({ readingStats: false })
          .expect(200)
      ).body,
    );
    expect(off.readingStats).toBe(false);
    await addTime(ctx, jwt, 60).expect(409);
    await ctx.http
      .get('/api/moi/bilan')
      .set(...bearer(jwt))
      .expect(409);
    await ctx.http
      .put('/api/moi/compte/bilan')
      .set(...bearer(jwt))
      .send({ readingStats: true })
      .expect(200);
    expect((await stats(ctx, jwt)).minutesTotal).toBe(0);
    await ctx.http.get('/api/moi/bilan').expect(401);
  });
});
