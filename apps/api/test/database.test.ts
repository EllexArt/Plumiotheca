import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Controller, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Public } from '../src/auth/decorators.js';
import { saveDraft } from '../src/stories/chapter-drafts.js';
import { ChapterRevision } from '../src/stories/chapter-revision.entity.js';
import { Chapter } from '../src/stories/chapter.entity.js';
import { StoryTag } from '../src/stories/story-tag.entity.js';
import { Story } from '../src/stories/story.entity.js';
import { Tag } from '../src/tags/tag.entity.js';
import {
  anonymizedUser,
  NON_PERSONAL_FIELDS,
  PERSONAL_FIELDS,
  User,
} from '../src/users/user.entity.js';
import { testDbEnv } from './db-env.js';
import { expectProblem, start } from './support.js';

/** Route d'essai : crée deux comptes avec le même pseudonyme (contrainte d'unicité). */
@Public()
@Controller('essai-base')
class DuplicateController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Post('doublon')
  async doublon() {
    const users = this.db.getRepository(User);
    await users.insert({
      keycloakId: randomUUID(),
      handle: 'Camille',
      handleKey: 'camille-doublon',
    });
    await users.insert({
      keycloakId: randomUUID(),
      handle: 'Camille',
      handleKey: 'camille-doublon',
    });
  }

  @Post('valeur-invalide')
  async valeurInvalide() {
    // PostgreSQL cite la valeur reçue dans son message : elle ne doit pas être journalisée.
    await this.db.query('SELECT $1::uuid', ['camille@exemple.fr']);
  }
}

const dataSource = async () => {
  const { app } = await start();
  return app.get(DataSource);
};

async function createUser(db: DataSource, handle = `pseudo-${randomUUID().slice(0, 8)}`) {
  return db.getRepository(User).save({
    keycloakId: randomUUID(),
    handle,
    handleKey: handle.toLowerCase(),
  });
}

async function createStory(db: DataSource, author: User) {
  return db.getRepository(Story).save({ author, title: 'Les Lucioles', language: 'fr' });
}

describe('schéma', () => {
  it('correspond exactement aux entités (aucune migration ne manque)', async () => {
    const db = await dataSource();
    const pending = await db.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((q) => q.query)).toEqual([]);
    expect(await db.showMigrations()).toBe(false);
  });

  it('génère des identifiants UUID v7', async () => {
    const db = await dataSource();
    const user = await createUser(db);
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });
});

describe('suppression de compte', () => {
  it('« effacer » : histoires, chapitres et révisions partent avec le compte', async () => {
    const db = await dataSource();
    const author = await createUser(db);
    const other = await createUser(db);
    const story = await createStory(db, author);
    const chapter = await db.getRepository(Chapter).save({ story, position: 1 });
    await db.getRepository(ChapterRevision).save({
      chapter,
      kind: 'named',
      content: { type: 'doc', content: [] },
      createdBy: author,
    });
    // Révision faite par l'autrice sur l'histoire d'une autre personne (co-écriture).
    const otherStory = await createStory(db, other);
    const otherChapter = await db.getRepository(Chapter).save({ story: otherStory, position: 1 });
    const shared = await db.getRepository(ChapterRevision).save({
      chapter: otherChapter,
      kind: 'autosave',
      content: { type: 'doc', content: [] },
      createdBy: author,
    });

    await db.getRepository(User).delete(author.id);

    expect(await db.getRepository(Story).findOneBy({ id: story.id })).toBeNull();
    expect(await db.getRepository(Chapter).findOneBy({ id: chapter.id })).toBeNull();
    const kept = await db
      .getRepository(ChapterRevision)
      .findOne({ where: { id: shared.id }, relations: { createdBy: true } });
    expect(kept?.createdBy).toBeNull();
  });

  it('chaque colonne de « users » est classée personnelle ou non', async () => {
    const db = await dataSource();
    const columns = db
      .getMetadata(User)
      .columns.map((c) => c.propertyName)
      .sort();
    expect(columns).toEqual([...PERSONAL_FIELDS, ...NON_PERSONAL_FIELDS].sort());
  });

  it('« anonymiser » vide toutes les colonnes personnelles', async () => {
    const db = await dataSource();
    const users = db.getRepository(User);
    const user = await createUser(db);
    await users.update(user.id, {
      displayName: 'Camille',
      pronouns: 'elle',
      bio: 'Lectrice de fantasy',
      ageBand: '18+',
      charterVersion: '1',
      charterAcceptedAt: new Date(),
    });
    await users.update(user.id, anonymizedUser());
    const gone = await users.findOneByOrFail({ id: user.id });
    for (const field of PERSONAL_FIELDS) expect(gone[field], field).toBeNull();
    expect(gone.status).toBe('deleted');
  });

  it('la base refuse un compte « supprimé » qui garde une donnée personnelle', async () => {
    const db = await dataSource();
    const user = await createUser(db);
    await expect(db.getRepository(User).update(user.id, { status: 'deleted' })).rejects.toThrow(
      QueryFailedError,
    );
  });

  it('la base refuse un compte actif sans identifiant Keycloak', async () => {
    const db = await dataSource();
    await expect(db.getRepository(User).insert({ handle: 'sans-lien' })).rejects.toThrow(
      QueryFailedError,
    );
  });
});

describe('contraintes', () => {
  it('une histoire ne peut pas être publiée sans classement ni avertissements choisis', async () => {
    const db = await dataSource();
    const author = await createUser(db);
    const story = await createStory(db, author);
    const stories = db.getRepository(Story);
    expect(story.rating ?? null).toBeNull();
    await expect(
      stories.update(story.id, { status: 'published', majorWarnings: [] }),
    ).rejects.toThrow(QueryFailedError);
    await expect(
      stories.update(story.id, { status: 'published', rating: 'mature' }),
    ).rejects.toThrow(QueryFailedError);
    await stories.update(story.id, { status: 'published', rating: 'mature', majorWarnings: [] });
    const published = await stories.findOneByOrFail({ id: story.id });
    expect([published.rating, published.majorWarnings]).toEqual(['mature', []]);
  });

  it('une seule révision publiée courante par chapitre, forcément publiée', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    const chapter = await db.getRepository(Chapter).save({ story, position: 1 });
    const revisions = db.getRepository(ChapterRevision);
    const content = { type: 'doc', content: [] };
    await expect(
      revisions.save({ chapter, kind: 'autosave', content, current: true }),
    ).rejects.toThrow(QueryFailedError);
    await revisions.save({ chapter, kind: 'published', content, current: true });
    await expect(
      revisions.save({ chapter, kind: 'published', content, current: true }),
    ).rejects.toThrow(QueryFailedError);
  });

  it('valeurs aberrantes refusées (position, nombre de mots, tag synonyme de lui-même)', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    await expect(db.getRepository(Chapter).save({ story, position: 0 })).rejects.toThrow(
      QueryFailedError,
    );
    await expect(db.getRepository(Story).update(story.id, { wordCount: -1 })).rejects.toThrow(
      QueryFailedError,
    );
    const tag = await db
      .getRepository(Tag)
      .save({ name: 'Slow burn', normalized: `slow-burn-${randomUUID()}` });
    await expect(db.getRepository(Tag).update(tag.id, { canonical: tag })).rejects.toThrow(
      QueryFailedError,
    );
  });

  it('un tag encore utilisé ne peut pas être supprimé', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    const tag = await db
      .getRepository(Tag)
      .save({ name: 'Found family', normalized: `found-family-${randomUUID()}` });
    await db.getRepository(StoryTag).save({ storyId: story.id, tagId: tag.id });
    await expect(db.getRepository(Tag).delete(tag.id)).rejects.toThrow(QueryFailedError);
    await db.getRepository(Story).delete(story.id);
    await db.getRepository(Tag).delete(tag.id);
  });

  it('les chapitres se réordonnent dans une transaction, sans doublon de position', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    const chapters = db.getRepository(Chapter);
    const one = await chapters.save({ story, position: 1 });
    const two = await chapters.save({ story, position: 2 });

    await db.transaction(async (tx) => {
      await tx.getRepository(Chapter).update(one.id, { position: 2 });
      await tx.getRepository(Chapter).update(two.id, { position: 1 });
    });
    expect((await chapters.findOneByOrFail({ id: one.id })).position).toBe(2);

    await expect(chapters.save({ story, position: 1 })).rejects.toThrow(QueryFailedError);
  });

  it('deux sauvegardes concurrentes du brouillon : la seconde est refusée (409)', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    const chapter = await db.getRepository(Chapter).save({ story, position: 1 });
    // Deux onglets ouverts sur la version 1 ; B enregistre d'abord.
    const draftB = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(await saveDraft(db.manager, chapter.id, 1, draftB)).toBe(2);
    await expect(
      saveDraft(db.manager, chapter.id, 1, { type: 'doc', content: [] }),
    ).rejects.toMatchObject({ problemType: 'brouillon-modifie' });
    const saved = await db.getRepository(Chapter).findOneByOrFail({ id: chapter.id });
    expect([saved.draftVersion, saved.draft]).toEqual([2, draftB]);
    // Renommer le chapitre ne change pas la version du brouillon (pas de faux conflit).
    await db.getRepository(Chapter).update(chapter.id, { title: 'Nouveau titre' });
    expect((await db.getRepository(Chapter).findOneByOrFail({ id: chapter.id })).draftVersion).toBe(
      2,
    );
  });

  it('un save() d’une entité lue trop tôt n’écrase ni le brouillon ni sa version', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    const chapters = db.getRepository(Chapter);
    const created = await chapters.save({ story, position: 1 });
    const stale = await chapters.findOneByOrFail({ id: created.id });
    const draft = { type: 'doc', content: [{ type: 'paragraph' }] };
    await saveDraft(db.manager, created.id, 1, draft);
    stale.title = 'Titre changé ailleurs';
    await chapters.save(stale);
    const after = await chapters.findOneByOrFail({ id: created.id });
    expect([after.draftVersion, after.draft, after.title]).toEqual([
      2,
      draft,
      'Titre changé ailleurs',
    ]);
  });

  it('un brouillon de chapitre démarre vide et versionné', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    const chapter = await db.getRepository(Chapter).save({ story, position: 1 });
    const saved = await db.getRepository(Chapter).findOneByOrFail({ id: chapter.id });
    expect(saved.draft).toEqual({ type: 'doc', content: [] });
    expect(saved.draftVersion).toBe(1);
  });

  it('erreur de contrainte : 500 sans aucune valeur dans la réponse ni les journaux', async () => {
    const { http, logs } = await start({}, [DuplicateController]);
    const res = await http.post('/api/essai-base/doublon').expect(500);
    expect(expectProblem(res.body, 500).type).toBe('interne');
    expect(JSON.stringify(res.body)).not.toMatch(/camille|duplicate|users/i);
    expect(logs()).toContain('Erreur non gérée');
    expect(logs()).not.toMatch(/camille-doublon|Key \(handle_key\)/);
  });

  it('erreur SQL citant la valeur reçue : rien dans les journaux', async () => {
    const { http, logs } = await start({}, [DuplicateController]);
    await http.post('/api/essai-base/valeur-invalide').expect(500);
    expect(logs()).toContain('"code":"22P02"');
    expect(logs()).not.toContain('camille@exemple.fr');
  });
});

describe('démarrage', () => {
  // Le vrai point d'entrée (code compilé) : la CI compile avant les tests.
  it.runIf(existsSync('dist/main.js'))(
    'base injoignable : le serveur s’arrête avec le code 1, sans mot de passe',
    () => {
      const run = spawnSync(process.execPath, ['dist/main.js'], {
        env: {
          ...process.env,
          ...testDbEnv(),
          NODE_ENV: 'test',
          PORT: '3994',
          DB_PORT: '1',
          DB_PASSWORD: 'mot-de-passe-temoin',
        },
        encoding: 'utf8',
        timeout: 20_000,
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('Démarrage impossible');
      expect(run.stdout + run.stderr).not.toContain('mot-de-passe-temoin');
    },
  );

  it('base injoignable : échec immédiat, sans afficher le mot de passe', async () => {
    const error = await start({ DB_PORT: '1', DB_PASSWORD: 'mot-de-passe-secret' }).catch(
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('mot-de-passe-secret');
  });
});
