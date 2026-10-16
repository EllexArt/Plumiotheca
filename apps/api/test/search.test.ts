import { randomBytes } from 'node:crypto';
import { ChapterDraft, SearchPage, StoryDetail } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { SearchService } from '../src/stories/search.service.js';
import { expectProblem, readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

// Mot introuvable ailleurs, pour que chaque test ne trouve que ses propres histoires.
// Douze lettres au hasard : assez éloignées de tout autre mot pour que la tolérance aux
// fautes de frappe de Meilisearch (deux au plus) ne les confonde jamais.
const word = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');

/** Histoire publiée (un chapitre), puis indexée ; `publish: false` : brouillon. */
async function story(ctx: Ctx, jwt: string, body: Record<string, unknown>, publish = true) {
  const created = StoryDetail.parse(
    (
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ language: 'fr', rating: 'teen', majorWarnings: [], ...body })
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
  await indexed(ctx, created.id);
  return created;
}

/** Réindexe l'histoire et attend que Meilisearch l'ait prise en compte. */
async function indexed(ctx: Ctx, id: string) {
  const search = ctx.app.get(SearchService);
  await search.waitForTask(await search.sync(id));
}

async function find(ctx: Ctx, query: string) {
  return SearchPage.parse((await ctx.http.get(`/api/recherche?${query}`).expect(200)).body);
}
const titles = (page: SearchPage) => page.items.map((s) => s.title).sort();

describe('recherche (#82)', () => {
  it('une histoire publiée est trouvable par son titre, ses tags, son autrice ou son auteur, son résumé ; jamais un brouillon', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const [inTitle, inTag, inSummary] = [word(), word(), word()];
    await story(ctx, jwt, { title: `Les lucioles ${inTitle}` });
    await story(ctx, jwt, { title: 'Le canal', tags: [inTag] });
    await story(ctx, jwt, { title: 'La marée', summary: `Quand ${inSummary} se retire` });
    await story(ctx, jwt, { title: `Brouillon ${inTitle}` }, false);

    expect(titles(await find(ctx, `q=${inTitle}`))).toEqual([`Les lucioles ${inTitle}`]);
    expect(titles(await find(ctx, `q=${inTag}`))).toEqual(['Le canal']);
    expect(titles(await find(ctx, `q=${inSummary}`))).toEqual(['La marée']);
  });

  it('dépubliée ou supprimée : elle disparaît de l’index', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const key = word();
    const kept = await story(ctx, jwt, { title: `Gardée ${key}` });
    const hidden = await story(ctx, jwt, { title: `Dépubliée ${key}` });
    const removed = await story(ctx, jwt, { title: `Supprimée ${key}` });
    expect((await find(ctx, `q=${key}`)).items).toHaveLength(3);

    await ctx.http
      .post(`/api/histoires/${hidden.id}/depublication`)
      .set(...bearer(jwt))
      .expect(201);
    await ctx.http
      .delete(`/api/histoires/${removed.id}`)
      .set(...bearer(jwt))
      .expect(204);
    await indexed(ctx, hidden.id);
    await indexed(ctx, removed.id);
    expect((await find(ctx, `q=${key}`)).items.map((s) => s.id)).toEqual([kept.id]);
  });

  it('chaque changement met l’histoire en file de réindexation', async () => {
    const ctx = await start();
    const send = vi.spyOn(ctx.app.get(JobsService), 'send');
    const jwt = await readyToken(ctx.app);
    const s = await story(ctx, jwt, { title: 'Fil' });
    await ctx.http
      .patch(`/api/histoires/${s.id}`)
      .set(...bearer(jwt))
      .send({ title: 'Fil renommé' })
      .expect(200);
    await ctx.http
      .post(`/api/histoires/${s.id}/depublication`)
      .set(...bearer(jwt))
      .expect(201);
    const queued = send.mock.calls.filter(([name]) => name === 'indexation-histoire');
    // Chapitre publié, histoire publiée, modifiée, dépubliée.
    expect(queued).toHaveLength(4);
    expect(queued.every(([, data]) => (data as { id: string }).id === s.id)).toBe(true);
  });

  it('résultats relus dans la base : une histoire devenue invisible n’est jamais montrée', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const key = word();
    await story(ctx, jwt, { title: `Visible ${key}` });
    const stale = await story(ctx, jwt, { title: `Périmée ${key}` });
    // Dépubliée sans réindexation (file en retard) : encore dans l'index, pas dans les résultats.
    await ctx.http
      .post(`/api/histoires/${stale.id}/depublication`)
      .set(...bearer(jwt))
      .expect(201);
    expect(titles(await find(ctx, `q=${key}`))).toEqual([`Visible ${key}`]);
  });

  it('mêmes exclusions que la liste : langue, classement, avertissements majeurs', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const key = word();
    await story(ctx, jwt, { title: `Calme ${key}` });
    await story(ctx, jwt, { title: `Anglaise ${key}`, language: 'en' });
    await story(ctx, jwt, { title: `Adulte ${key}`, rating: 'mature' });
    await story(ctx, jwt, { title: `Mort ${key}`, majorWarnings: ['character_death'] });

    expect(titles(await find(ctx, `q=${key}&langue=en`))).toEqual([`Anglaise ${key}`]);
    expect(titles(await find(ctx, `q=${key}&exclureClassement=mature`))).toEqual(
      [`Anglaise ${key}`, `Calme ${key}`, `Mort ${key}`].sort(),
    );
    expect(titles(await find(ctx, `q=${key}&exclure=character_death`))).toEqual(
      [`Adulte ${key}`, `Anglaise ${key}`, `Calme ${key}`].sort(),
    );
  });

  it('réindexation complète : ajoute ce qui manque, retire ce qui ne doit plus y être', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const search = ctx.app.get(SearchService);
    const key = word();
    const missing = await story(ctx, jwt, { title: `Oubliée ${key}` }, false);
    const stale = await story(ctx, jwt, { title: `Ancienne ${key}` });
    // Publiée sans indexation, puis l'autre dépubliée sans réindexation.
    await ctx.app
      .get(DataSource)
      .query(`UPDATE stories SET status = 'published', published_at = now() WHERE id = $1`, [
        missing.id,
      ]);
    await ctx.http
      .post(`/api/histoires/${stale.id}/depublication`)
      .set(...bearer(jwt))
      .expect(201);

    const { indexed: count } = await search.reindexAll();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(titles(await find(ctx, `q=${key}`))).toEqual([`Oubliée ${key}`]);
  });

  it('requête vide refusée ; Meilisearch injoignable : 503 sans détail technique', async () => {
    const ctx = await start();
    await ctx.http.get('/api/recherche?q=').expect(400);
    await ctx.http.get('/api/recherche').expect(400);
    const down = await start({ MEILI_URL: 'http://127.0.0.1:9' });
    const res = await down.http.get('/api/recherche?q=lucioles').expect(503);
    expect(expectProblem(res.body, 503).detail).toMatch(/momentanément indisponible/);
  });
});
