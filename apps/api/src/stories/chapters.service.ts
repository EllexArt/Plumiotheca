import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  ChapterDraft,
  ChapterRead,
  NewChapter,
  SaveDraft,
  SavedDraft,
  StoryDetail,
} from '@plumiotheca/contracts';
import {
  type ChapterDocument,
  ensureBlockIds,
  parseDocument,
  readingMinutes,
  wordCount,
} from '@plumiotheca/editor-schema';
import { DataSource, type EntityManager } from 'typeorm';
import { ApiProblem, ValidationFailed } from '../common/problem.js';
import type { User } from '../users/user.entity.js';
import { loadDraft, saveDraft } from './chapter-drafts.js';
import { ChapterRevision } from './chapter-revision.entity.js';
import { Chapter } from './chapter.entity.js';
import { StoriesService } from './stories.service.js';
import { lockStory, ownedStory, visibleStory } from './story-access.js';
import { Story } from './story.entity.js';

/** Un chapitre très long tient en un chapitre : au-delà, découper l'histoire. */
export const MAX_CHAPTERS = 2_000;

/**
 * Chapitre de CETTE histoire, sinon 404 : un identifiant de chapitre pris dans une autre
 * histoire ne permet jamais de le lire, le modifier ni le déplacer (faille C2, #104).
 */
async function chapterOf(tx: EntityManager, storyId: string, chapterId: string): Promise<Chapter> {
  const chapter = await tx
    .getRepository(Chapter)
    .findOneBy({ id: chapterId, story: { id: storyId } });
  if (!chapter) throw new NotFoundException();
  return chapter;
}

function validDocument(input: unknown): ChapterDocument {
  const parsed = parseDocument(input);
  if (!parsed.success) {
    throw new ValidationFailed(
      parsed.issues.map((issue) => ({
        path: issue.path ? `draft.${issue.path}` : 'draft',
        message: issue.message,
        code: issue.code,
      })),
    );
  }
  return parsed.data;
}

/** Nombre de mots de l'histoire : somme des chapitres publiés. */
const recountStory = (tx: EntityManager, storyId: string) =>
  tx.query(
    `UPDATE stories SET word_count = (
       SELECT coalesce(sum(word_count), 0) FROM chapters
       WHERE story_id = $1 AND status = 'published')
     WHERE id = $1`,
    [storyId],
  );

@Injectable()
export class ChaptersService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly stories: StoriesService,
  ) {}

  /** Nouveau chapitre en fin d'histoire ; la position est toujours choisie par le serveur. */
  async create(account: User, storyId: string, input: NewChapter): Promise<ChapterDraft> {
    const id = await this.db.transaction(async (tx) => {
      await ownedStory(tx, storyId, account);
      await lockStory(tx, storyId);
      const count = await tx.getRepository(Chapter).countBy({ story: { id: storyId } });
      if (count >= MAX_CHAPTERS) {
        throw new ApiProblem(
          HttpStatus.CONFLICT,
          `Une histoire compte ${MAX_CHAPTERS} chapitres au plus : commencez un tome suivant.`,
          'trop-de-chapitres',
        );
      }
      const [{ next }] = await tx.query<[{ next: number }]>(
        'SELECT coalesce(max(position), 0) + 1 AS next FROM chapters WHERE story_id = $1',
        [storyId],
      );
      const { identifiers } = await tx
        .getRepository(Chapter)
        .insert({ story: { id: storyId }, position: next, title: input.title });
      return (identifiers[0] as { id: string }).id;
    });
    return this.draft(account, storyId, id);
  }

  async draft(account: User, storyId: string, chapterId: string): Promise<ChapterDraft> {
    const story = await ownedStory(this.db.manager, storyId, account);
    const chapter = await chapterOf(this.db.manager, storyId, chapterId);
    const draft = await loadDraft(this.db.manager, chapterId);
    return {
      id: chapter.id,
      title: chapter.title,
      status: chapter.status,
      draft,
      draftVersion: chapter.draftVersion,
      wordCount: wordCount(draft as ChapterDocument, story.language),
    };
  }

  /** Sauvegarde du brouillon (validé, identifiants de blocs complétés, version vérifiée). */
  async saveDraft(
    account: User,
    storyId: string,
    chapterId: string,
    input: SaveDraft,
  ): Promise<SavedDraft> {
    const story = await ownedStory(this.db.manager, storyId, account);
    await chapterOf(this.db.manager, storyId, chapterId);
    const received = validDocument(input.draft);
    // Les doublons d'identifiants (copier-coller) se départagent avec le brouillon précédent.
    const previous = (await loadDraft(this.db.manager, chapterId)) as ChapterDocument;
    const draft = ensureBlockIds(received, { previous });
    const draftVersion = await saveDraft(this.db.manager, chapterId, input.version, draft);
    const changed = JSON.stringify(draft) !== JSON.stringify(received);
    return {
      draftVersion,
      wordCount: wordCount(draft, story.language),
      draft: changed ? draft : null,
    };
  }

  async rename(
    account: User,
    storyId: string,
    chapterId: string,
    title: string,
  ): Promise<ChapterDraft> {
    await ownedStory(this.db.manager, storyId, account);
    await chapterOf(this.db.manager, storyId, chapterId);
    await this.db.getRepository(Chapter).update(chapterId, { title });
    return this.draft(account, storyId, chapterId);
  }

  /**
   * Publier le brouillon : une révision figée devient la version lue, dans la même
   * transaction que le passage du chapitre en « publié ». Les lecteurs passent d'une version
   * complète à l'autre, sans jamais voir un brouillon en cours.
   */
  async publish(account: User, storyId: string, chapterId: string): Promise<StoryDetail> {
    await this.db.transaction(async (tx) => {
      const story = await ownedStory(tx, storyId, account);
      await lockStory(tx, storyId);
      await chapterOf(tx, storyId, chapterId);
      await tx.query('SELECT id FROM chapters WHERE id = $1 FOR UPDATE', [chapterId]);
      const chapter = await tx.getRepository(Chapter).findOneByOrFail({ id: chapterId });
      const content = validDocument(await loadDraft(tx, chapterId));
      const words = wordCount(content, story.language);
      if (!words) {
        throw new ApiProblem(
          HttpStatus.CONFLICT,
          'Ce chapitre est vide : écrivez-le avant de le publier.',
          'chapitre-vide',
        );
      }
      await tx
        .getRepository(ChapterRevision)
        .update({ chapter: { id: chapterId }, current: true }, { current: false });
      await tx.getRepository(ChapterRevision).insert({
        chapterId,
        kind: 'published',
        current: true,
        content,
        wordCount: words,
        createdBy: { id: account.id },
      });
      await tx.getRepository(Chapter).update(chapterId, {
        status: 'published',
        publishedAt: chapter.publishedAt ?? new Date(),
        wordCount: words,
      });
      await recountStory(tx, storyId);
    });
    return this.stories.detail(storyId, account);
  }

  /** Retirer un chapitre de la lecture ; une histoire sans chapitre publié repasse en brouillon. */
  async unpublish(account: User, storyId: string, chapterId: string): Promise<StoryDetail> {
    await this.db.transaction(async (tx) => {
      await ownedStory(tx, storyId, account);
      await lockStory(tx, storyId);
      await chapterOf(tx, storyId, chapterId);
      await tx
        .getRepository(ChapterRevision)
        .update({ chapter: { id: chapterId }, current: true }, { current: false });
      await tx.getRepository(Chapter).update(chapterId, { status: 'draft' });
      await recountStory(tx, storyId);
      const remaining = await tx
        .getRepository(Chapter)
        .countBy({ story: { id: storyId }, status: 'published' });
      if (!remaining) await tx.getRepository(Story).update(storyId, { status: 'draft' });
    });
    return this.stories.detail(storyId, account);
  }

  /** Nouvel ordre complet, appliqué d'un seul coup (contrainte d'unicité vérifiée en fin de transaction). */
  async reorder(account: User, storyId: string, chapterIds: string[]): Promise<StoryDetail> {
    await this.db.transaction(async (tx) => {
      await ownedStory(tx, storyId, account);
      await lockStory(tx, storyId);
      const existing = await tx.query<{ id: string }[]>(
        'SELECT id FROM chapters WHERE story_id = $1',
        [storyId],
      );
      const known = new Set(existing.map((c) => c.id));
      if (chapterIds.length !== known.size || chapterIds.some((id) => !known.has(id))) {
        throw new ApiProblem(
          HttpStatus.BAD_REQUEST,
          'Le nouvel ordre doit contenir chaque chapitre de l’histoire, une seule fois.',
          'ordre-invalide',
        );
      }
      await tx.query(
        `UPDATE chapters c SET position = o.position, updated_at = now()
         FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, position)
         WHERE c.id = o.id AND c.story_id = $2`,
        [chapterIds, storyId],
      );
    });
    return this.stories.detail(storyId, account);
  }

  async remove(account: User, storyId: string, chapterId: string): Promise<StoryDetail> {
    await this.db.transaction(async (tx) => {
      await ownedStory(tx, storyId, account);
      await lockStory(tx, storyId);
      await chapterOf(tx, storyId, chapterId);
      await tx.getRepository(Chapter).delete(chapterId);
      // Numérotation sans trou.
      await tx.query(
        `UPDATE chapters c SET position = r.n FROM (
           SELECT id, row_number() OVER (ORDER BY position) AS n FROM chapters WHERE story_id = $1
         ) r WHERE c.id = r.id`,
        [storyId],
      );
      await recountStory(tx, storyId);
      const remaining = await tx
        .getRepository(Chapter)
        .countBy({ story: { id: storyId }, status: 'published' });
      if (!remaining) await tx.getRepository(Story).update(storyId, { status: 'draft' });
    });
    return this.stories.detail(storyId, account);
  }

  /** Lecture publique d'un chapitre publié (version figée), avec ses voisins. */
  async read(viewer: User | null, storyId: string, chapterId: string): Promise<ChapterRead> {
    await visibleStory(this.db.manager, storyId, viewer);
    const published = await this.db.getRepository(Chapter).find({
      where: { story: { id: storyId }, status: 'published' },
      order: { position: 'ASC' },
    });
    const index = published.findIndex((c) => c.id === chapterId);
    const chapter = published[index];
    if (!chapter) throw new NotFoundException();
    const revision = await this.db
      .getRepository(ChapterRevision)
      .findOneBy({ chapterId, current: true });
    if (!revision) throw new NotFoundException();
    return {
      id: chapter.id,
      storyId,
      number: index + 1,
      title: chapter.title,
      revisionId: revision.id,
      content: revision.content,
      wordCount: revision.wordCount,
      readingMinutes: readingMinutes(revision.wordCount),
      publishedAt: (chapter.publishedAt ?? revision.createdAt).toISOString(),
      previousId: published[index - 1]?.id ?? null,
      nextId: published[index + 1]?.id ?? null,
    };
  }
}
