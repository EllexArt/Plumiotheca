import {
  ChapterDraft,
  MyAccount,
  NotificationPage,
  StoryDetail,
  UnreadNotifications,
} from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

/** Nouveau chapitre écrit et publié ; renvoie son identifiant. */
async function chapter(ctx: Ctx, jwt: string, storyId: string, title: string) {
  const created = ChapterDraft.parse(
    (
      await ctx.http
        .post(`/api/histoires/${storyId}/chapitres`)
        .set(...bearer(jwt))
        .send({ title })
        .expect(201)
    ).body,
  );
  const text = { type: 'paragraph', content: [{ type: 'text', text: 'Il était une fois.' }] };
  await ctx.http
    .put(`/api/histoires/${storyId}/chapitres/${created.id}/brouillon`)
    .set(...bearer(jwt))
    .send({ draft: { type: 'doc', content: [text] }, version: created.draftVersion })
    .expect(200);
  await publish(ctx, jwt, storyId, created.id);
  return created.id;
}

const publish = (ctx: Ctx, jwt: string, storyId: string, chapterId: string) =>
  ctx.http
    .post(`/api/histoires/${storyId}/chapitres/${chapterId}/publication`)
    .set(...bearer(jwt))
    .expect(201);

/** Histoire publiée d'un premier chapitre. */
async function story(ctx: Ctx, jwt: string) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ title: 'Le phare', language: 'fr', rating: 'general', majorWarnings: [] })
        .expect(201)
    ).body,
  );
  await chapter(ctx, jwt, created.id, 'Un');
  await ctx.http
    .post(`/api/histoires/${created.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  return created.id;
}

const shelve = (ctx: Ctx, jwt: string, storyId: string, shelf: string) =>
  ctx.http
    .put(`/api/moi/lectures/${storyId}`)
    .set(...bearer(jwt))
    .send({ shelf })
    .expect(200);

const mine = async (ctx: Ctx, jwt: string) =>
  NotificationPage.parse(
    (
      await ctx.http
        .get('/api/moi/notifications')
        .set(...bearer(jwt))
        .expect(200)
    ).body,
  );
const unread = async (ctx: Ctx, jwt: string) =>
  UnreadNotifications.parse(
    (
      await ctx.http
        .get('/api/moi/notifications/non-lues')
        .set(...bearer(jwt))
        .expect(200)
    ).body,
  ).unread;

describe('notifications de nouveaux chapitres (#33)', () => {
  it('toutes les étagères sont prévenues, une fois par chapitre ; jamais la personne qui écrit', async () => {
    const ctx = await start();
    const [author, reading, finished, stranger] = await Promise.all([
      readyToken(ctx.app),
      readyToken(ctx.app),
      readyToken(ctx.app),
      readyToken(ctx.app),
    ]);
    const storyId = await story(ctx, author);
    await shelve(ctx, reading, storyId, 'reading');
    await shelve(ctx, finished, storyId, 'finished');
    await shelve(ctx, author, storyId, 'reading');

    const second = await chapter(ctx, author, storyId, 'Deux');
    const page = await mine(ctx, reading);
    expect(page.items).toEqual([
      expect.objectContaining({
        kind: 'new_chapter',
        read: false,
        story: { id: storyId, title: 'Le phare', language: 'fr' },
        chapter: { id: second, number: 2, title: 'Deux' },
      }),
    ]);
    expect(await unread(ctx, finished)).toBe(1);
    expect(await unread(ctx, author)).toBe(0);
    expect(await unread(ctx, stranger)).toBe(0);

    // Republier (après une correction ou un retrait) ne renotifie pas.
    await ctx.http
      .post(`/api/histoires/${storyId}/chapitres/${second}/depublication`)
      .set(...bearer(author))
      .expect(201);
    // Chapitre retiré : la notification disparaît de la liste, sans être effacée.
    expect(await unread(ctx, reading)).toBe(0);
    await publish(ctx, author, storyId, second);
    expect((await mine(ctx, reading)).items).toHaveLength(1);

    // Lue : par elle seule (404 pour les autres), puis toutes.
    const id = page.items[0]!.id;
    await ctx.http
      .post(`/api/moi/notifications/${id}/lue`)
      .set(...bearer(stranger))
      .expect(404);
    await ctx.http
      .post(`/api/moi/notifications/${id}/lue`)
      .set(...bearer(reading))
      .expect(204);
    expect(await unread(ctx, reading)).toBe(0);
    expect((await mine(ctx, reading)).items[0]!.read).toBe(true);
    await ctx.http
      .post('/api/moi/notifications/tout-lu')
      .set(...bearer(finished))
      .expect(204);
    expect(await unread(ctx, finished)).toBe(0);
  });

  it('histoire dépubliée : notifications cachées ; après 90 jours : supprimées', async () => {
    const ctx = await start();
    const [author, reader] = await Promise.all([readyToken(ctx.app), readyToken(ctx.app)]);
    const storyId = await story(ctx, author);
    await shelve(ctx, reader, storyId, 'to_read');
    await chapter(ctx, author, storyId, 'Deux');
    await chapter(ctx, author, storyId, 'Trois');
    expect((await mine(ctx, reader)).items.map((n) => n.chapter.number)).toEqual([3, 2]);

    await ctx.http
      .post(`/api/histoires/${storyId}/depublication`)
      .set(...bearer(author))
      .expect(201);
    expect(await mine(ctx, reader)).toEqual({ items: [], nextCursor: null });
    await ctx.http
      .post(`/api/histoires/${storyId}/publication`)
      .set(...bearer(author))
      .expect(201);
    const [newest, oldest] = (await mine(ctx, reader)).items;

    await ctx.app
      .get(DataSource)
      .query(`UPDATE notifications SET created_at = now() - interval '91 days' WHERE id = $1`, [
        oldest!.id,
      ]);
    expect(await ctx.app.get(NotificationsService).purge()).toBeGreaterThanOrEqual(1);
    expect((await mine(ctx, reader)).items.map((n) => n.id)).toEqual([newest!.id]);
  });

  it('pages : curseur', async () => {
    const ctx = await start();
    const [author, reader] = await Promise.all([readyToken(ctx.app), readyToken(ctx.app)]);
    const storyId = await story(ctx, author);
    await shelve(ctx, reader, storyId, 'reading');
    for (const title of ['Deux', 'Trois', 'Quatre']) await chapter(ctx, author, storyId, title);
    const first = NotificationPage.parse(
      (
        await ctx.http
          .get('/api/moi/notifications?limite=2')
          .set(...bearer(reader))
          .expect(200)
      ).body,
    );
    expect(first.items.map((n) => n.chapter.title)).toEqual(['Quatre', 'Trois']);
    const second = NotificationPage.parse(
      (
        await ctx.http
          .get(`/api/moi/notifications?limite=2&apres=${first.nextCursor}`)
          .set(...bearer(reader))
          .expect(200)
      ).body,
    );
    expect(second).toMatchObject({ items: [{ chapter: { title: 'Deux' } }], nextCursor: null });
    await ctx.http.get('/api/moi/notifications').expect(401);
  });

  it('e-mail récapitulatif : jamais par défaut ; chaque jour ou chaque semaine au choix', async () => {
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
    expect(me.emailDigest).toBe('never');
    const saved = MyAccount.parse(
      (
        await ctx.http
          .put('/api/moi/compte/notifications')
          .set(...bearer(jwt))
          .send({ emailDigest: 'weekly' })
          .expect(200)
      ).body,
    );
    expect(saved.emailDigest).toBe('weekly');
    await ctx.http
      .put('/api/moi/compte/notifications')
      .set(...bearer(jwt))
      .send({ emailDigest: 'hourly' })
      .expect(400);
  });
});
