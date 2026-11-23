import { randomBytes } from 'node:crypto';
import {
  ChapterDraft,
  NotificationPage,
  SavedSearch,
  SavedSearchList,
  StoryDetail,
  UnreadNotifications,
} from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { SavedSearchesService } from '../src/stories/saved-searches.service.js';
import { SearchService } from '../src/stories/search.service.js';
import { readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;
const word = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');

/** Histoire publiée (un chapitre), indexée. */
async function story(ctx: Ctx, jwt: string, body: Record<string, unknown>) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ language: 'fr', rating: 'general', majorWarnings: [], ...body })
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

const save = async (ctx: Ctx, jwt: string, body: object) =>
  SavedSearch.parse(
    (
      await ctx.http
        .post('/api/moi/recherches')
        .set(...bearer(jwt))
        .send(body)
        .expect(201)
    ).body,
  );

/** La dernière vérification remonte à une heure : les histoires publiées depuis comptent. */
const rewind = (ctx: Ctx, id: string) =>
  ctx.app
    .get(DataSource)
    .query(`UPDATE saved_searches SET checked_at = now() - interval '1 hour' WHERE id = $1`, [id]);

const alertsOf = async (ctx: Ctx, jwt: string) =>
  NotificationPage.parse(
    (
      await ctx.http
        .get('/api/moi/notifications')
        .set(...bearer(jwt))
        .expect(200)
    ).body,
  ).items.filter((n) => n.kind === 'saved_search');

describe('recherches enregistrées (#80)', () => {
  it('enregistrer, renommer, couper les alertes, supprimer ; seulement les siennes', async () => {
    const ctx = await start();
    const [jwt, other] = await Promise.all([readyToken(ctx.app), readyToken(ctx.app)]);
    const saved = await save(ctx, jwt, {
      name: 'Fantasy courte',
      query: 'tags=fantasy&longueur=courte',
    });
    expect(saved).toMatchObject({ name: 'Fantasy courte', alerts: true });

    const patch = (who: string, body: object) =>
      ctx.http
        .patch(`/api/moi/recherches/${saved.id}`)
        .set(...bearer(who))
        .send(body);
    await patch(other, { alerts: false }).expect(404);
    expect(
      SavedSearch.parse((await patch(jwt, { alerts: false, name: 'Courtes' }).expect(200)).body),
    ).toMatchObject({ name: 'Courtes', alerts: false });
    const list = SavedSearchList.parse(
      (
        await ctx.http
          .get('/api/moi/recherches')
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    expect(list.items.map((s) => s.name)).toEqual(['Courtes']);

    await ctx.http
      .delete(`/api/moi/recherches/${saved.id}`)
      .set(...bearer(other))
      .expect(404);
    await ctx.http
      .delete(`/api/moi/recherches/${saved.id}`)
      .set(...bearer(jwt))
      .expect(204);
    await ctx.http
      .post('/api/moi/recherches')
      .set(...bearer(jwt))
      .send({ name: 'x', query: 'q=deux mots' })
      .expect(400);
  });

  it('vingt au plus', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    for (let i = 0; i < 20; i++) await save(ctx, jwt, { name: `R${i}`, query: `q=r${i}` });
    await ctx.http
      .post('/api/moi/recherches')
      .set(...bearer(jwt))
      .send({ name: 'De trop', query: 'q=trop' })
      .expect(409);
  });

  it('alerte : une notification groupée par vérification, avec les filtres et Mes limites', async () => {
    const ctx = await start();
    const [author, reader] = await Promise.all([readyToken(ctx.app), readyToken(ctx.app)]);
    const [tag, hidden] = [`Tag ${word()}`, `Cache ${word()}`];
    const search = await save(ctx, reader, {
      name: 'Mes tags',
      query: `tags=${encodeURIComponent(tag)}&classementMax=teen`,
    });
    const off = await save(ctx, reader, {
      name: 'Coupée',
      query: `tags=${encodeURIComponent(tag)}`,
      alerts: false,
    });
    await rewind(ctx, search.id);
    await rewind(ctx, off.id);
    // Mes limites de la personne qui cherche : ce tag est masqué.
    await ctx.http
      .put('/api/moi/compte/limites')
      .set(...bearer(reader))
      .send({ hiddenContentWarnings: [], hiddenMajorWarnings: [], hiddenTags: [hidden] })
      .expect(200);

    const shown = await story(ctx, author, { title: 'Premiere', tags: [tag] });
    await story(ctx, author, { title: 'Deuxieme', tags: [tag] });
    await story(ctx, author, { title: 'Masquee', tags: [tag, hidden] });
    await story(ctx, author, { title: 'Mature', tags: [tag], rating: 'mature' });

    const service = ctx.app.get(SavedSearchesService);
    await service.runAlerts();
    const [alert, ...others] = await alertsOf(ctx, reader);
    expect(others).toEqual([]);
    expect(alert).toMatchObject({
      kind: 'saved_search',
      read: false,
      search: { id: search.id, name: 'Mes tags', alerts: true },
      count: 2,
    });
    expect(alert?.kind === 'saved_search' && alert.stories.map((s) => s.title).sort()).toEqual([
      'Deuxieme',
      'Premiere',
    ]);
    expect(
      UnreadNotifications.parse(
        (
          await ctx.http
            .get('/api/moi/notifications/non-lues')
            .set(...bearer(reader))
            .expect(200)
        ).body,
      ).unread,
    ).toBe(1);

    // Vérifiée : plus rien de nouveau, pas de seconde alerte.
    await service.runAlerts();
    expect(await alertsOf(ctx, reader)).toHaveLength(1);
    expect(shown.id).toBeTruthy();

    // Couper l'alerte (un clic) : l'alerte déjà reçue le dit.
    await ctx.http
      .patch(`/api/moi/recherches/${search.id}`)
      .set(...bearer(reader))
      .send({ alerts: false })
      .expect(200);
    const [after] = await alertsOf(ctx, reader);
    expect(after).toMatchObject({ search: { alerts: false } });
  });

  it('alerte d’une recherche plein texte (Meilisearch)', async () => {
    const ctx = await start();
    const [author, reader] = await Promise.all([readyToken(ctx.app), readyToken(ctx.app)]);
    const key = word();
    const search = await save(ctx, reader, { name: 'Mot', query: `q=${key}` });
    await rewind(ctx, search.id);
    await story(ctx, author, { title: `Le ${key}` });
    await ctx.app.get(SavedSearchesService).runAlerts();
    expect(await alertsOf(ctx, reader)).toMatchObject([
      { count: 1, stories: [{ title: `Le ${key}` }] },
    ]);
  });
});
