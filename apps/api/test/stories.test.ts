import { randomUUID } from 'node:crypto';
import {
  ChapterDraft,
  ChapterRead,
  SavedDraft,
  StoryDetail,
  StoryPage,
} from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Chapter } from '../src/stories/chapter.entity.js';
import { User } from '../src/users/user.entity.js';
import { expectProblem, readyToken, start } from './support.js';

const bearer = (jwt: string) => ['Authorization', `Bearer ${jwt}`] as const;
type Ctx = Awaited<ReturnType<typeof start>>;

const p = (text: string, id?: string) => ({
  type: 'paragraph',
  ...(id ? { attrs: { id } } : {}),
  content: [{ type: 'text', text }],
});
const doc = (...content: unknown[]) => ({ type: 'doc', content });

async function newStory(ctx: Ctx, jwt: string, body: Record<string, unknown> = {}) {
  const res = await ctx.http
    .post('/api/histoires')
    .set(...bearer(jwt))
    .send({ title: 'Les Lucioles', language: 'fr', ...body })
    .expect(201);
  return StoryDetail.parse(res.body);
}

async function newChapter(ctx: Ctx, jwt: string, storyId: string, title = 'Un') {
  const res = await ctx.http
    .post(`/api/histoires/${storyId}/chapitres`)
    .set(...bearer(jwt))
    .send({ title })
    .expect(201);
  return ChapterDraft.parse(res.body);
}

const saveDraft = (
  ctx: Ctx,
  jwt: string,
  storyId: string,
  chapterId: string,
  draft: unknown,
  version: number,
) =>
  ctx.http
    .put(`/api/histoires/${storyId}/chapitres/${chapterId}/brouillon`)
    .set(...bearer(jwt))
    .send({ draft, version });

/** Histoire publiée avec un chapitre publié. */
async function publishedStory(ctx: Ctx, jwt: string, text = 'Il était une fois.') {
  const story = await newStory(ctx, jwt, { rating: 'teen', majorWarnings: [] });
  const chapter = await newChapter(ctx, jwt, story.id);
  await saveDraft(ctx, jwt, story.id, chapter.id, doc(p(text)), chapter.draftVersion).expect(200);
  await ctx.http
    .post(`/api/histoires/${story.id}/chapitres/${chapter.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  await ctx.http
    .post(`/api/histoires/${story.id}/publication`)
    .set(...bearer(jwt))
    .expect(201);
  return { story, chapter };
}

describe('histoires', () => {
  it('création : brouillon de la personne connectée, champs imposés refusés', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt, { tags: ['Slow Burn', 'slow  burn', 'Found family'] });
    expect(story).toMatchObject({
      status: 'draft',
      rating: null,
      majorWarnings: null,
      contentWarnings: [],
      chapterCount: 0,
    });
    expect(story.tags).toEqual(['Found family', 'Slow Burn']);
    for (const extra of [
      { authorId: randomUUID() },
      { status: 'published' },
      { wordCount: 99 },
      { id: randomUUID() },
    ]) {
      await ctx.http
        .post('/api/histoires')
        .set(...bearer(jwt))
        .send({ title: 'x', language: 'fr', ...extra })
        .expect(400);
    }
  });

  it('avertissements facultatifs : enregistrés, modifiés, visibles dans la liste publique', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const { story } = await publishedStory(ctx, jwt);
    expect(story.contentWarnings).toEqual([]);
    const res = await ctx.http
      .patch(`/api/histoires/${story.id}`)
      .set(...bearer(jwt))
      .send({ contentWarnings: ['addiction', 'grief'] })
      .expect(200);
    expect(StoryDetail.parse(res.body).contentWarnings).toEqual(['grief', 'addiction']);
    const list = await ctx.http.get('/api/histoires').expect(200);
    expect(StoryPage.parse(list.body).items[0]?.contentWarnings).toEqual(['grief', 'addiction']);
    await ctx.http
      .patch(`/api/histoires/${story.id}`)
      .set(...bearer(jwt))
      .send({ contentWarnings: [] })
      .expect(200);
  });

  it('le classement « Explicite » n’existe pas', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    await ctx.http
      .post('/api/histoires')
      .set(...bearer(jwt))
      .send({ title: 'x', language: 'fr', rating: 'explicit' })
      .expect(400);
  });

  it('impossible de modifier ou supprimer l’histoire d’une autre personne (faille d’origine)', async () => {
    const ctx = await start();
    const owner = await readyToken(ctx.app);
    const intruder = await readyToken(ctx.app);
    const draft = await newStory(ctx, owner);
    // Brouillon d'autrui : invisible (404), donc ni modifiable ni supprimable.
    await ctx.http
      .patch(`/api/histoires/${draft.id}`)
      .set(...bearer(intruder))
      .send({ title: 'Volée' })
      .expect(404);
    await ctx.http
      .delete(`/api/histoires/${draft.id}`)
      .set(...bearer(intruder))
      .expect(404);
    // Histoire publiée d'autrui : visible, mais 403.
    const { story } = await publishedStory(ctx, owner);
    const res = await ctx.http
      .patch(`/api/histoires/${story.id}`)
      .set(...bearer(intruder))
      .send({ title: 'Volée' })
      .expect(403);
    expect(expectProblem(res.body, 403).type).toBe('interdit');
    const after = await ctx.http.get(`/api/histoires/${story.id}`).expect(200);
    expect(StoryDetail.parse(after.body).title).toBe('Les Lucioles');
  });

  it('les brouillons n’apparaissent jamais publiquement', async () => {
    const ctx = await start();
    const owner = await readyToken(ctx.app);
    const draft = await newStory(ctx, owner, { title: `Brouillon secret ${randomUUID()}` });
    await ctx.http.get(`/api/histoires/${draft.id}`).expect(404);
    await ctx.http
      .get(`/api/histoires/${draft.id}`)
      .set(...bearer(await readyToken(ctx.app)))
      .expect(404);
    // L'autrice ou l'auteur la voit, sur la route publique aussi.
    await ctx.http
      .get(`/api/histoires/${draft.id}`)
      .set(...bearer(owner))
      .expect(200);
    const list = await ctx.http.get('/api/histoires?limite=50').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(draft.title);
    const mine = await ctx.http
      .get('/api/moi/histoires')
      .set(...bearer(owner))
      .expect(200);
    expect(JSON.stringify(mine.body)).toContain(draft.title);
  });

  it('« Mes histoires » : par curseur, la plus récemment modifiée d’abord, seulement les miennes', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const other = await readyToken(ctx.app);
    await newStory(ctx, other, { title: 'Pas à moi' });
    const [a, b, c] = [
      await newStory(ctx, jwt, { title: 'A' }),
      await newStory(ctx, jwt, { title: 'B' }),
      await newStory(ctx, jwt, { title: 'C' }),
    ];
    // Modifier A la fait remonter en tête.
    await ctx.http
      .patch(`/api/histoires/${a.id}`)
      .set(...bearer(jwt))
      .send({ summary: 'Retouchée.' })
      .expect(200);
    const page = async (query: string) =>
      StoryPage.parse(
        (
          await ctx.http
            .get(`/api/moi/histoires${query}`)
            .set(...bearer(jwt))
            .expect(200)
        ).body,
      );
    const first = await page('?limite=2');
    expect(first.items.map((s) => s.title)).toEqual(['A', 'C']);
    expect(first.nextCursor).not.toBeNull();
    const second = await page(`?limite=2&apres=${first.nextCursor}`);
    expect(second.items.map((s) => s.title)).toEqual(['B']);
    expect(second.nextCursor).toBeNull();
    // Brouillons compris, statut réel visible.
    expect(second.items[0]).toMatchObject({ id: b.id, status: 'draft' });
    expect((await page('')).items.map((s) => s.id)).toEqual([a.id, c.id, b.id]);
    await ctx.http
      .get('/api/moi/histoires?apres=nimporte-quoi')
      .set(...bearer(jwt))
      .expect(400);
    await ctx.http
      .get('/api/moi/histoires?limite=500')
      .set(...bearer(jwt))
      .expect(400);
  });

  it('« Mes histoires » : dates enregistrées avec des microsecondes, aucune histoire perdue entre deux pages', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await newStory(ctx, jwt, { title: `H${i}` })).id);
    // Écriture SQL avec des microsecondes (comme now()) : stockées à la milliseconde.
    await ctx.app
      .get(DataSource)
      .query(
        `UPDATE stories SET updated_at = '2026-10-08T10:00:00.123000Z'::timestamptz + (random() * interval '900 microseconds') WHERE id = ANY($1)`,
        [ids],
      );
    const seen: string[] = [];
    let cursor: string | null = '';
    while (cursor !== null) {
      const res = StoryPage.parse(
        (
          await ctx.http
            .get(`/api/moi/histoires?limite=2${cursor ? `&apres=${cursor}` : ''}`)
            .set(...bearer(jwt))
            .expect(200)
        ).body,
      );
      seen.push(...res.items.map((s) => s.id));
      cursor = res.nextCursor;
    }
    expect(seen.toSorted()).toEqual(ids.toSorted());
  });

  it('liste publique : dates de publication avec des microsecondes, aucune histoire perdue', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await publishedStory(ctx, jwt)).story.id);
    await ctx.app
      .get(DataSource)
      .query(
        `UPDATE stories SET published_at = '2026-10-08T10:00:00.123000Z'::timestamptz + (random() * interval '900 microseconds') WHERE id = ANY($1)`,
        [ids],
      );
    const { handle } = StoryDetail.parse(
      (await ctx.http.get(`/api/histoires/${ids[0]}`).expect(200)).body,
    ).author;
    const seen: string[] = [];
    let cursor: string | null = '';
    while (cursor !== null) {
      const res = StoryPage.parse(
        (
          await ctx.http
            .get(`/api/histoires?pseudonyme=${handle}&limite=2${cursor ? `&apres=${cursor}` : ''}`)
            .expect(200)
        ).body,
      );
      seen.push(...res.items.map((s) => s.id));
      cursor = res.nextCursor;
    }
    expect(seen.toSorted()).toEqual(ids.toSorted());
  });

  it('un chapitre en brouillon d’une histoire publiée reste invisible', async () => {
    const ctx = await start();
    const owner = await readyToken(ctx.app);
    const { story } = await publishedStory(ctx, owner);
    const hidden = await newChapter(ctx, owner, story.id, 'Pas encore');
    const detail = StoryDetail.parse(
      (await ctx.http.get(`/api/histoires/${story.id}`).expect(200)).body,
    );
    expect(detail.chapters.map((c) => c.title)).toEqual(['Un']);
    await ctx.http.get(`/api/histoires/${story.id}/chapitres/${hidden.id}`).expect(404);
    // Histoire visible, brouillon réservé : 403 pour une autre personne.
    await ctx.http
      .get(`/api/histoires/${story.id}/chapitres/${hidden.id}/brouillon`)
      .set(...bearer(await readyToken(ctx.app)))
      .expect(403);
  });

  it('la liste publique ne contient pas le texte des chapitres', async () => {
    const ctx = await start();
    const secret = `Texte-${randomUUID()}`;
    await publishedStory(ctx, await readyToken(ctx.app), secret);
    const list = await ctx.http.get('/api/histoires?limite=50').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(secret);
  });

  it('publication : classement, avertissements et un chapitre publié exigés', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt);
    const res = await ctx.http
      .post(`/api/histoires/${story.id}/publication`)
      .set(...bearer(jwt))
      .expect(409);
    const problem = expectProblem(res.body, 409);
    expect(problem.type).toBe('publication-incomplete');
    expect(problem.detail).toMatch(/classement.*avertissements.*chapitre/);
  });

  it('pagination par curseur et filtres (langue, avertissements exclus, pseudonyme)', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app, {});
    const lang = 'eo'; // espéranto : isole ce test des autres histoires
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await newStory(ctx, jwt, {
        language: lang,
        rating: 'general',
        majorWarnings: i === 0 ? ['character_death'] : [],
      });
      const c = await newChapter(ctx, jwt, s.id);
      await saveDraft(ctx, jwt, s.id, c.id, doc(p('x')), 1).expect(200);
      await ctx.http
        .post(`/api/histoires/${s.id}/chapitres/${c.id}/publication`)
        .set(...bearer(jwt))
        .expect(201);
      await ctx.http
        .post(`/api/histoires/${s.id}/publication`)
        .set(...bearer(jwt))
        .expect(201);
      ids.push(s.id);
    }
    const first = StoryPage.parse(
      (await ctx.http.get(`/api/histoires?langue=${lang}&limite=2`).expect(200)).body,
    );
    expect(first.items).toHaveLength(2);
    const second = StoryPage.parse(
      (
        await ctx.http
          .get(`/api/histoires?langue=${lang}&limite=2&apres=${first.nextCursor}`)
          .expect(200)
      ).body,
    );
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((s) => s.id).sort()).toEqual([...ids].sort());
    const safe = StoryPage.parse(
      (await ctx.http.get(`/api/histoires?langue=${lang}&exclure=character_death`).expect(200))
        .body,
    );
    expect(safe.items.map((s) => s.id)).not.toContain(ids[0]);
    await ctx.http.get('/api/histoires?apres=nimporte-quoi').expect(400);
  });

  it('filtre par tag : même normalisation que les tags (casse, accents, espaces)', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const a = await newStory(ctx, jwt, {
      title: 'Amour lent',
      rating: 'teen',
      majorWarnings: [],
      tags: ['Slow Burn'],
    });
    const b = await newStory(ctx, jwt, {
      title: 'Autre',
      rating: 'teen',
      majorWarnings: [],
      tags: ['fantasy'],
    });
    for (const story of [a, b]) {
      const chapter = await newChapter(ctx, jwt, story.id);
      await saveDraft(
        ctx,
        jwt,
        story.id,
        chapter.id,
        doc(p('Texte.')),
        chapter.draftVersion,
      ).expect(200);
      await ctx.http
        .post(`/api/histoires/${story.id}/chapitres/${chapter.id}/publication`)
        .set(...bearer(jwt))
        .expect(201);
      await ctx.http
        .post(`/api/histoires/${story.id}/publication`)
        .set(...bearer(jwt))
        .expect(201);
    }
    const titles = async (tag: string) =>
      StoryPage.parse(
        (await ctx.http.get(`/api/histoires?tag=${encodeURIComponent(tag)}`).expect(200)).body,
      ).items.map((s) => s.title);
    expect(await titles('slow  burn')).toEqual(['Amour lent']);
    expect(await titles('FANTASY')).toEqual(['Autre']);
    expect(await titles('inconnu')).toEqual([]);
    await ctx.http.get('/api/histoires?tag=').expect(400);
    // Un brouillon avec le même tag reste invisible.
    await newStory(ctx, jwt, { title: 'Brouillon', tags: ['slow burn'] });
    expect(await titles('Slow Burn')).toEqual(['Amour lent']);
  });

  it('les histoires d’un compte en cours de suppression disparaissent du public', async () => {
    const ctx = await start();
    const sub = randomUUID();
    const jwt = await readyToken(ctx.app, { sub });
    const { story } = await publishedStory(ctx, jwt);
    await ctx.app
      .get(DataSource)
      .getRepository(User)
      .update({ keycloakId: sub }, { status: 'deletion_pending' });
    await ctx.http.get(`/api/histoires/${story.id}`).expect(404);
  });
});

describe('chapitres', () => {
  it('vol de chapitre (faille C2) : impossible d’injecter un identifiant ou de déplacer le chapitre d’autrui', async () => {
    const ctx = await start();
    const victim = await readyToken(ctx.app);
    const thief = await readyToken(ctx.app);
    const { story: victimStory, chapter: victimChapter } = await publishedStory(ctx, victim);
    const thiefStory = await newStory(ctx, thief);
    // Création avec l'identifiant du chapitre d'autrui : champ refusé.
    await ctx.http
      .post(`/api/histoires/${thiefStory.id}/chapitres`)
      .set(...bearer(thief))
      .send({ id: victimChapter.id, title: 'à moi' })
      .expect(400);
    // Chapitre d'autrui adressé via sa propre histoire : introuvable.
    await saveDraft(ctx, thief, thiefStory.id, victimChapter.id, doc(p('écrasé')), 1).expect(404);
    await ctx.http
      .patch(`/api/histoires/${thiefStory.id}/chapitres/${victimChapter.id}`)
      .set(...bearer(thief))
      .send({ title: 'x' })
      .expect(404);
    await ctx.http
      .delete(`/api/histoires/${thiefStory.id}/chapitres/${victimChapter.id}`)
      .set(...bearer(thief))
      .expect(404);
    // Réordonner en y glissant le chapitre d'autrui : refusé.
    const mine = await newChapter(ctx, thief, thiefStory.id);
    await ctx.http
      .put(`/api/histoires/${thiefStory.id}/chapitres/ordre`)
      .set(...bearer(thief))
      .send({ chapterIds: [mine.id, victimChapter.id] })
      .expect(400);
    // Le chapitre de la victime n'a pas bougé.
    const row = await ctx.app
      .get(DataSource)
      .getRepository(Chapter)
      .findOneOrFail({ where: { id: victimChapter.id }, relations: { story: true } });
    expect(row.story.id).toBe(victimStory.id);
  });

  it('brouillon : validé, identifiants de blocs complétés, deux sauvegardes concurrentes → 409', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt);
    const chapter = await newChapter(ctx, jwt, story.id);
    await saveDraft(
      ctx,
      jwt,
      story.id,
      chapter.id,
      doc({ type: 'image', attrs: { src: 'x' } }),
      1,
    ).expect(400);
    const savedRes = await saveDraft(
      ctx,
      jwt,
      story.id,
      chapter.id,
      doc(p('Bonjour tout le monde')),
      1,
    ).expect(200);
    const saved = SavedDraft.parse(savedRes.body);
    expect(saved.draftVersion).toBe(2);
    expect(saved.wordCount).toBe(4);
    const blocks = (saved.draft as { content: { attrs: { id: string } }[] }).content;
    expect(blocks[0]?.attrs.id).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
    // Un second onglet resté sur la version 1.
    const stale = await saveDraft(ctx, jwt, story.id, chapter.id, doc(p('écrase')), 1).expect(409);
    expect(expectProblem(stale.body, 409).type).toBe('brouillon-modifie');
    // Renommer ne crée pas de faux conflit.
    await ctx.http
      .patch(`/api/histoires/${story.id}/chapitres/${chapter.id}`)
      .set(...bearer(jwt))
      .send({ title: 'Deux' })
      .expect(200);
    await saveDraft(ctx, jwt, story.id, chapter.id, saved.draft, 2).expect(200);
  });

  it('publier : version figée ; retravailler le brouillon ne change pas la lecture', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const { story, chapter } = await publishedStory(ctx, jwt, 'Version publiée.');
    const before = ChapterRead.parse(
      (await ctx.http.get(`/api/histoires/${story.id}/chapitres/${chapter.id}`).expect(200)).body,
    );
    await saveDraft(ctx, jwt, story.id, chapter.id, doc(p('Brouillon en cours')), 2).expect(200);
    const during = ChapterRead.parse(
      (await ctx.http.get(`/api/histoires/${story.id}/chapitres/${chapter.id}`).expect(200)).body,
    );
    expect(JSON.stringify(during.content)).toContain('Version publiée.');
    expect(during.revisionId).toBe(before.revisionId);
    await ctx.http
      .post(`/api/histoires/${story.id}/chapitres/${chapter.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    const after = ChapterRead.parse(
      (await ctx.http.get(`/api/histoires/${story.id}/chapitres/${chapter.id}`).expect(200)).body,
    );
    expect(JSON.stringify(after.content)).toContain('Brouillon en cours');
    expect(after.revisionId).not.toBe(before.revisionId);
    expect(after.wordCount).toBe(3);
  });

  it('réordonner : tous les numéros changent d’un coup ; un ordre incomplet est refusé', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt);
    const a = await newChapter(ctx, jwt, story.id, 'A');
    const b = await newChapter(ctx, jwt, story.id, 'B');
    const c = await newChapter(ctx, jwt, story.id, 'C');
    await ctx.http
      .put(`/api/histoires/${story.id}/chapitres/ordre`)
      .set(...bearer(jwt))
      .send({ chapterIds: [a.id, b.id] })
      .expect(400);
    const res = await ctx.http
      .put(`/api/histoires/${story.id}/chapitres/ordre`)
      .set(...bearer(jwt))
      .send({ chapterIds: [c.id, a.id, b.id] })
      .expect(200);
    expect(StoryDetail.parse(res.body).chapters.map((x) => x.title)).toEqual(['C', 'A', 'B']);
    // Suppression : numérotation sans trou.
    const removed = await ctx.http
      .delete(`/api/histoires/${story.id}/chapitres/${a.id}`)
      .set(...bearer(jwt))
      .expect(200);
    expect(StoryDetail.parse(removed.body).chapters.map((x) => [x.number, x.title])).toEqual([
      [1, 'C'],
      [2, 'B'],
    ]);
    const positions = await ctx.app
      .get(DataSource)
      .getRepository(Chapter)
      .find({ where: { story: { id: story.id } }, order: { position: 'ASC' } });
    expect(positions.map((x) => x.position)).toEqual([1, 2]);
  });

  it('chapitres créés en même temps : numéros distincts', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt);
    await Promise.all(Array.from({ length: 5 }, (_, i) => newChapter(ctx, jwt, story.id, `C${i}`)));
    const detail = StoryDetail.parse(
      (
        await ctx.http
          .get(`/api/histoires/${story.id}`)
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    expect(detail.chapters).toHaveLength(5);
  });

  it('nombre de mots de l’histoire : somme des chapitres publiés', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const { story } = await publishedStory(ctx, jwt, 'un deux trois');
    const c2 = await newChapter(ctx, jwt, story.id);
    await saveDraft(ctx, jwt, story.id, c2.id, doc(p('quatre cinq')), 1).expect(200);
    let detail = StoryDetail.parse(
      (await ctx.http.get(`/api/histoires/${story.id}`).expect(200)).body,
    );
    expect(detail.wordCount).toBe(3);
    await ctx.http
      .post(`/api/histoires/${story.id}/chapitres/${c2.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    detail = StoryDetail.parse((await ctx.http.get(`/api/histoires/${story.id}`).expect(200)).body);
    expect([detail.wordCount, detail.chapterCount]).toEqual([5, 2]);
  });
});

describe('suites de la revue de #133', () => {
  it('le brouillon n’est jamais chargé par défaut (lecture publique sans brouillons en mémoire)', async () => {
    const ctx = await start();
    const db = ctx.app.get(DataSource);
    expect(db.getMetadata(Chapter).findColumnWithPropertyName('draft')?.isSelect).toBe(false);
    // Et dans le SQL réellement envoyé par les routes publiques.
    const jwt = await readyToken(ctx.app);
    const { story, chapter } = await publishedStory(ctx, jwt);
    const runner = db.createQueryRunner();
    const proto = Object.getPrototypeOf(runner) as {
      query: (this: unknown, sql: string, ...rest: unknown[]) => Promise<unknown>;
    };
    await runner.release();
    const original = proto.query;
    const sent: string[] = [];
    proto.query = function (sql, ...rest) {
      sent.push(sql);
      return original.call(this, sql, ...rest);
    };
    try {
      await ctx.http.get(`/api/histoires/${story.id}/chapitres/${chapter.id}`).expect(200);
      await ctx.http.get(`/api/histoires/${story.id}`).expect(200);
      await ctx.http.get('/api/histoires').expect(200);
    } finally {
      proto.query = original;
    }
    expect(sent.length).toBeGreaterThan(3);
    expect(sent.filter((sql) => /"draft"|SELECT draft\b/.test(sql))).toEqual([]);
  });

  it('une révision ne change jamais de chapitre ; un chapitre publié a toujours sa révision', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const { story, chapter } = await publishedStory(ctx, jwt);
    const other = await newChapter(ctx, jwt, story.id);
    const db = ctx.app.get(DataSource);
    // Republier : la première révision n'est plus la révision courante. La déplacer ne
    // déclenche donc que la règle d'immuabilité (pas celle de la révision courante).
    const { draftVersion } = ChapterDraft.parse(
      (
        await ctx.http
          .get(`/api/histoires/${story.id}/chapitres/${chapter.id}/brouillon`)
          .set(...bearer(jwt))
          .expect(200)
      ).body,
    );
    await saveDraft(
      ctx,
      jwt,
      story.id,
      chapter.id,
      doc(p('Seconde version.')),
      draftVersion,
    ).expect(200);
    await ctx.http
      .post(`/api/histoires/${story.id}/chapitres/${chapter.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    await expect(
      db.query(
        'UPDATE chapter_revisions SET chapter_id = $1 WHERE chapter_id = $2 AND NOT current',
        [other.id, chapter.id],
      ),
    ).rejects.toThrow(/non modifiable/);
    await expect(
      db.query(`UPDATE chapters SET status = 'published' WHERE id = $1`, [other.id]),
    ).rejects.toThrow();
    await expect(
      db.query('UPDATE chapter_revisions SET current = false WHERE chapter_id = $1', [chapter.id]),
    ).rejects.toThrow();
  });

  it.each([
    ['date sans heure', `2020-01-01T00:00:00.000Z|${'-'.repeat(36)}`],
    ['date libre', `1 2|${randomUUID()}`],
    ['année 0000', `0000-01-01T00:00:00Z|${randomUUID()}`],
  ])('curseur forgé (%s) : 400', async (_, raw) => {
    const ctx = await start();
    await ctx.http
      .get(`/api/histoires?apres=${Buffer.from(raw).toString('base64url')}`)
      .expect(400);
  });

  it.each([
    ['un caractère nul dans le résumé', { summary: 'a\u0000b' }],
    ['un forçage du sens d’écriture dans le résumé', { summary: 'a\u202Eb' }],
    ['un tag qui se déplie une fois normalisé', { tags: ['ﷺ'.repeat(100)] }],
    ['un titre fait de liaisons invisibles', { title: '\u200D\u200C\u200D' }],
    ['un tag invisible', { tags: ['\u200D'] }],
    ['une liaison invisible en fin de titre', { title: 'Lucioles\u200D' }],
    ['une espace invisible dans le résumé', { summary: 'a\u200Bb' }],
    [
      '« ne pas préciser » combiné à un avertissement',
      { majorWarnings: ['unspecified', 'character_death'] },
    ],
    ['un avertissement facultatif en double', { contentWarnings: ['grief', 'grief'] }],
    ['un avertissement facultatif inconnu', { contentWarnings: ['noyade'] }],
  ])('refuse %s (400)', async (_, body) => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    await ctx.http
      .post('/api/histoires')
      .set(...bearer(jwt))
      .send({ title: 'x', language: 'fr', ...body })
      .expect(400);
  });

  it('un titre persan avec ZWNJ est accepté ; un tag avec liaison invisible = le même tag', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    await newStory(ctx, jwt, { title: 'می\u200Cخواهم', language: 'fa' });
    const story = await newStory(ctx, jwt, { tags: ['romance', 'roma\u200Cnce'] });
    expect(story.tags).toEqual(['romance']);
  });

  it('modifications simultanées des tags : jamais d’erreur 500', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        ctx.http
          .patch(`/api/histoires/${story.id}`)
          .set(...bearer(jwt))
          .send({ tags: [`tag-${i}`, 'commun'] }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
  });

  it('exclure un classement (« jusqu’à Ado »)', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const lang = 'ia';
    const s = await newStory(ctx, jwt, { language: lang, rating: 'mature', majorWarnings: [] });
    const c = await newChapter(ctx, jwt, s.id);
    await saveDraft(ctx, jwt, s.id, c.id, doc(p('x')), 1).expect(200);
    await ctx.http
      .post(`/api/histoires/${s.id}/chapitres/${c.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    await ctx.http
      .post(`/api/histoires/${s.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    const all = StoryPage.parse(
      (await ctx.http.get(`/api/histoires?langue=${lang}`).expect(200)).body,
    );
    expect(all.items.map((x) => x.id)).toContain(s.id);
    const teen = StoryPage.parse(
      (await ctx.http.get(`/api/histoires?langue=${lang}&exclureClassement=mature`).expect(200))
        .body,
    );
    expect(teen.items.map((x) => x.id)).not.toContain(s.id);
  });

  it('un chapitre vide ne se publie pas', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt);
    const chapter = await newChapter(ctx, jwt, story.id);
    const res = await ctx.http
      .post(`/api/histoires/${story.id}/chapitres/${chapter.id}/publication`)
      .set(...bearer(jwt))
      .expect(409);
    expect(expectProblem(res.body, 409).type).toBe('chapitre-vide');
  });

  it('route publique avec un jeton invalide : traitée en anonyme', async () => {
    const ctx = await start();
    const owner = await readyToken(ctx.app);
    const draft = await newStory(ctx, owner);
    await ctx.http.get('/api/histoires').set('Authorization', 'Bearer pas.un.jeton').expect(200);
    await ctx.http
      .get(`/api/histoires/${draft.id}`)
      .set('Authorization', 'Bearer pas.un.jeton')
      .expect(404);
  });

  it('compte verrouillé (moins de 15 ans découvert) : ses histoires disparaissent du public', async () => {
    const ctx = await start();
    const sub = randomUUID();
    const jwt = await readyToken(ctx.app, { sub });
    const { story } = await publishedStory(ctx, jwt);
    await ctx.app
      .get(DataSource)
      .getRepository(User)
      .update({ keycloakId: sub }, { ageBand: 'under-15' });
    await ctx.http.get(`/api/histoires/${story.id}`).expect(404);
  });

  it('PATCH : identifiant, compteur et statut refusés', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const story = await newStory(ctx, jwt);
    for (const body of [
      { id: randomUUID() },
      { wordCount: 9 },
      { status: 'published' },
      { authorId: randomUUID() },
    ]) {
      await ctx.http
        .patch(`/api/histoires/${story.id}`)
        .set(...bearer(jwt))
        .send(body)
        .expect(400);
    }
  });

  it('dépublier puis republier', async () => {
    const ctx = await start();
    const jwt = await readyToken(ctx.app);
    const { story } = await publishedStory(ctx, jwt);
    await ctx.http
      .post(`/api/histoires/${story.id}/depublication`)
      .set(...bearer(jwt))
      .expect(201);
    await ctx.http.get(`/api/histoires/${story.id}`).expect(404);
    await ctx.http
      .post(`/api/histoires/${story.id}/publication`)
      .set(...bearer(jwt))
      .expect(201);
    await ctx.http.get(`/api/histoires/${story.id}`).expect(200);
  });
});
