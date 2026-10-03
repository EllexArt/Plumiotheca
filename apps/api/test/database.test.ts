import { randomUUID } from 'node:crypto';
import { Controller, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Public } from '../src/auth/decorators.js';
import { ChapterRevision } from '../src/stories/chapter-revision.entity.js';
import { Chapter } from '../src/stories/chapter.entity.js';
import { Story } from '../src/stories/story.entity.js';
import { User } from '../src/users/user.entity.js';
import { expectProblem, start } from './support.js';

/** Route d'essai : crée deux comptes avec le même pseudonyme (contrainte d'unicité). */
@Public()
@Controller('essai-base')
class DuplicateController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Post('doublon')
  async doublon() {
    const users = this.db.getRepository(User);
    await users.insert({ handle: 'Camille', handleKey: 'camille-doublon' });
    await users.insert({ handle: 'Camille', handleKey: 'camille-doublon' });
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

  it('« anonymiser » : le compte devient « compte supprimé », sans aucune donnée personnelle', async () => {
    const db = await dataSource();
    const users = db.getRepository(User);
    const first = await createUser(db);
    const second = await createUser(db);
    for (const user of [first, second]) {
      await users.update(user.id, {
        keycloakId: null,
        handle: null,
        handleKey: null,
        displayName: null,
        pronouns: null,
        bio: null,
        ageBand: null,
        status: 'deleted',
      });
    }
    // Plusieurs comptes anonymisés coexistent malgré les index uniques.
    const gone = await users.findBy([{ id: first.id }, { id: second.id }]);
    expect(gone.map((u) => [u.status, u.keycloakId, u.handleKey])).toEqual([
      ['deleted', null, null],
      ['deleted', null, null],
    ]);
  });
});

describe('contraintes', () => {
  it('une histoire ne peut pas être publiée sans avertissements majeurs renseignés', async () => {
    const db = await dataSource();
    const author = await createUser(db);
    const story = await createStory(db, author);
    const stories = db.getRepository(Story);
    await expect(stories.update(story.id, { status: 'published' })).rejects.toThrow(
      QueryFailedError,
    );
    await stories.update(story.id, { status: 'published', majorWarnings: [] });
    expect((await stories.findOneByOrFail({ id: story.id })).majorWarnings).toEqual([]);
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

  it('un brouillon de chapitre démarre vide et versionné', async () => {
    const db = await dataSource();
    const story = await createStory(db, await createUser(db));
    const chapter = await db.getRepository(Chapter).save({ story, position: 1 });
    const saved = await db.getRepository(Chapter).findOneByOrFail({ id: chapter.id });
    expect(saved.draft).toEqual({ type: 'doc', content: [] });
    expect(saved.version).toBe(1);
  });

  it('erreur de contrainte : 500 sans aucune valeur dans la réponse ni les journaux', async () => {
    const { http, logs } = await start({}, [DuplicateController]);
    const res = await http.post('/api/essai-base/doublon').expect(500);
    expect(expectProblem(res.body, 500).type).toBe('interne');
    expect(JSON.stringify(res.body)).not.toMatch(/camille|duplicate|users/i);
    expect(logs()).toContain('Erreur non gérée');
    expect(logs()).not.toMatch(/camille-doublon|Key \(handle_key\)/);
  });
});

describe('démarrage', () => {
  it('base injoignable : échec immédiat, sans afficher le mot de passe', async () => {
    const error = await start({ DB_PORT: '1', DB_PASSWORD: 'mot-de-passe-secret' }).catch(
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('mot-de-passe-secret');
  });
});
