import { randomUUID } from 'node:crypto';
import { ChapterDraft, StoryDetail } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

/** Histoire publiée avec un chapitre publié. */
async function publishedStory(ctx: Ctx, jwt: string) {
  const story = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ title: 'Les Lucioles', language: 'fr', rating: 'teen', majorWarnings: [] })
        .expect(201)
    ).body,
  );
  const chapter = ChapterDraft.parse(
    (
      await ctx.http
        .post(`/api/histoires/${story.id}/chapitres`)
        .set(...bearer(jwt))
        .send({ title: 'Un' })
        .expect(201)
    ).body,
  );
  const text = { type: 'paragraph', content: [{ type: 'text', text: 'Il était une fois.' }] };
  await ctx.http
    .put(`/api/histoires/${story.id}/chapitres/${chapter.id}/brouillon`)
    .set(...bearer(jwt))
    .send({ draft: { type: 'doc', content: [text] }, version: chapter.draftVersion })
    .expect(200);
  await ctx.http
    .post(`/api/histoires/${story.id}/chapitres/${chapter.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  await ctx.http
    .post(`/api/histoires/${story.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);

  const read = (who: { jwt?: string; ip?: string } = {}) => {
    const req = ctx.http.get(`/api/histoires/${story.id}/chapitres/${chapter.id}`);
    if (who.jwt) req.set(...bearer(who.jwt));
    if (who.ip) req.set('X-Forwarded-For', who.ip);
    return req.expect(200);
  };
  const count = async () =>
    StoryDetail.parse((await ctx.http.get(`/api/histoires/${story.id}`).expect(200)).body)
      .readCount;
  return { story, read, count };
}

describe('lectures uniques (#17)', () => {
  it('une par compte et par jour ; la personne qui a écrit l’histoire ne compte pas', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const { read, count } = await publishedStory(ctx, author);
    expect(await count()).toBe(0);

    await read({ jwt: author });
    expect(await count()).toBe(0);

    const reader = await readyToken(ctx.app);
    await read({ jwt: reader });
    // Recharger la page ne compte pas une seconde fois.
    await read({ jwt: reader });
    expect(await count()).toBe(1);

    await read({ jwt: await readyToken(ctx.app) });
    expect(await count()).toBe(2);
  });

  it('sans compte : une par adresse et par jour, sans garder l’adresse ni le compte', async () => {
    const ctx = await start({ TRUST_PROXY: '1' });
    const author = await readyToken(ctx.app);
    const { story, read, count } = await publishedStory(ctx, author);
    const sub = randomUUID();
    const reader = await readyToken(ctx.app, { sub });

    await read({ ip: '203.0.113.7' });
    await read({ ip: '203.0.113.7' });
    await read({ ip: '198.51.100.4' });
    await read({ jwt: reader, ip: '203.0.113.7' });
    expect(await count()).toBe(3);

    const marks = await ctx.app
      .get(DataSource)
      .query<{ reader: Buffer }[]>(`SELECT reader FROM read_marks WHERE story_id = $1`, [story.id]);
    expect(marks).toHaveLength(3);
    const userId = (
      await ctx.app
        .get(DataSource)
        .query<{ id: string }[]>(`SELECT id FROM users WHERE keycloak_id = $1`, [sub])
    )[0]!.id;
    for (const { reader: mark } of marks) {
      expect(mark).toHaveLength(32);
      for (const clear of ['203.0.113.7', '198.51.100.4', userId, sub]) {
        expect(mark.includes(Buffer.from(clear))).toBe(false);
      }
    }
  });

  it('le lendemain : la même personne compte de nouveau ; sel et empreintes de la veille effacés', async () => {
    const ctx = await start();
    const author = await readyToken(ctx.app);
    const { story, read, count } = await publishedStory(ctx, author);
    const reader = await readyToken(ctx.app);
    await read({ jwt: reader });
    expect(await count()).toBe(1);

    // Tout ce qui date d'aujourd'hui passe à hier : le prochain comptage ouvre un nouveau jour.
    const db = ctx.app.get(DataSource);
    await db.transaction(async (tx) => {
      await tx.query(`UPDATE read_marks SET day = day - 1`);
      await tx.query(`UPDATE read_salts SET day = day - 1`);
    });
    await read({ jwt: reader });
    expect(await count()).toBe(2);

    const today = `(now() AT TIME ZONE 'Europe/Paris')::date`;
    expect(await db.query(`SELECT 1 FROM read_salts WHERE day < ${today}`)).toEqual([]);
    expect(await db.query(`SELECT 1 FROM read_marks WHERE day < ${today}`)).toEqual([]);
    expect(await db.query(`SELECT 1 FROM read_marks WHERE story_id = $1`, [story.id])).toHaveLength(
      1,
    );
  });
});
