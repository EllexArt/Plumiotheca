import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  NewStory,
  StoryDetail,
  StoryPage,
  StoryQuery,
  StorySummary,
  UpdateStory,
} from '@plumiotheca/contracts';
import { handleKey } from '@plumiotheca/contracts';
import { DataSource, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { ApiProblem } from '../common/problem.js';
import { normalizeTag } from '../tags/tag-normalize.js';
import { TagsService } from '../tags/tags.service.js';
import type { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { lockStory, ownedStory, publicStories, visibleStory } from './story-access.js';
import { Story } from './story.entity.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Curseur opaque de pagination : date de publication et identifiant de la dernière ligne. */
const encodeCursor = (story: Story) =>
  Buffer.from(`${story.publishedAt!.toISOString()}|${story.id}`).toString('base64url');

// Bornes de date : PostgreSQL refuse l'année 0000, que la norme ISO accepte.
const Cursor = z.tuple([
  z.iso.datetime().refine((d) => Date.parse(d) >= Date.UTC(2000, 0, 1)),
  z.uuid(),
]);

function decodeCursor(cursor: string): [string, string] {
  const parsed = Cursor.safeParse(Buffer.from(cursor, 'base64url').toString().split('|'));
  if (!parsed.success) {
    throw new ApiProblem(HttpStatus.BAD_REQUEST, 'Curseur de pagination invalide.');
  }
  return parsed.data;
}

@Injectable()
export class StoriesService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly tags: TagsService,
  ) {}

  async create(author: User, input: NewStory): Promise<StoryDetail> {
    const id = await this.db.transaction(async (tx) => {
      const { identifiers } = await tx.getRepository(Story).insert({
        author: { id: author.id },
        title: input.title,
        summary: input.summary,
        language: input.language,
        rating: input.rating ?? null,
        completion: input.completion ?? 'in_progress',
        majorWarnings: input.majorWarnings ?? null,
      });
      const storyId = (identifiers[0] as { id: string }).id;
      if (input.tags) await this.tags.setStoryTags(tx, storyId, input.tags);
      return storyId;
    });
    return this.detail(id, author);
  }

  /** Mise à jour partielle sur la liste blanche des champs (jamais `save()`). */
  async update(account: User, id: string, input: UpdateStory): Promise<StoryDetail> {
    await this.db.transaction(async (tx) => {
      await ownedStory(tx, id, account);
      // Deux modifications simultanées (double clic, deux onglets) s'enchaînent ; l'état est
      // relu après le verrou (une publication a pu passer entre-temps).
      await lockStory(tx, id);
      const story = await ownedStory(tx, id, account);
      const { tags, ...fields } = input;
      const changes = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      if (
        story.status === 'published' &&
        (changes.rating === null || changes.majorWarnings === null)
      ) {
        throw new ApiProblem(
          HttpStatus.CONFLICT,
          'Une histoire publiée garde son classement et ses avertissements.',
          'publication-incomplete',
        );
      }
      if (Object.keys(changes).length) await tx.getRepository(Story).update(id, changes);
      if (tags) await this.tags.setStoryTags(tx, id, tags);
    });
    return this.detail(id, account);
  }

  async remove(account: User, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await ownedStory(tx, id, account);
      await lockStory(tx, id);
      await tx.getRepository(Story).delete(id);
    });
  }

  /** Publier : classement et avertissements choisis, au moins un chapitre publié. */
  async publish(account: User, id: string): Promise<StoryDetail> {
    await this.db.transaction(async (tx) => {
      await ownedStory(tx, id, account);
      // Verrou d'abord, puis relecture : l'état ne peut plus changer d'ici la fin.
      await lockStory(tx, id);
      const story = await ownedStory(tx, id, account);
      const missing: string[] = [];
      if (!story.rating) missing.push('le classement');
      if (!story.majorWarnings) missing.push('les avertissements majeurs');
      const published = await tx
        .getRepository(Chapter)
        .countBy({ story: { id }, status: 'published' });
      if (!published) missing.push('au moins un chapitre publié');
      if (missing.length) {
        throw new ApiProblem(
          HttpStatus.CONFLICT,
          `Avant de publier, il manque ${missing.join(', ')}.`,
          'publication-incomplete',
        );
      }
      await tx
        .getRepository(Story)
        .update(id, { status: 'published', publishedAt: story.publishedAt ?? new Date() });
    });
    return this.detail(id, account);
  }

  /** Repasser en brouillon : l'histoire disparaît des listes et de la lecture publique. */
  async unpublish(account: User, id: string): Promise<StoryDetail> {
    await this.db.transaction(async (tx) => {
      await ownedStory(tx, id, account);
      await lockStory(tx, id);
      await tx.getRepository(Story).update(id, { status: 'draft' });
    });
    return this.detail(id, account);
  }

  /** Liste publique, la plus récente d'abord, par curseur (jamais par numéro de page). */
  async list(query: StoryQuery): Promise<StoryPage> {
    const qb = publicStories(
      this.db
        .getRepository(Story)
        .createQueryBuilder('story')
        .innerJoinAndSelect('story.author', 'author'),
    );
    if (query.langue) qb.andWhere('story.language = :langue', { langue: query.langue });
    if (query.classement) {
      qb.andWhere('story.rating = :classement', { classement: query.classement });
    }
    if (query.exclureClassement?.length) {
      qb.andWhere('story.rating <> ALL(CAST(:exclus AS rating[]))', {
        exclus: query.exclureClassement,
      });
    }
    if (query.exclure?.length) {
      qb.andWhere('NOT (story.major_warnings && CAST(:exclure AS major_warning[]))', {
        exclure: query.exclure,
      });
    }
    if (query.pseudonyme) {
      qb.andWhere('author.handle_key = :key', { key: handleKey(query.pseudonyme) });
    }
    if (query.tag) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM story_tags st JOIN tags t ON t.id = st.tag_id
                 WHERE st.story_id = story.id AND t.normalized = :tag)`,
        { tag: normalizeTag(query.tag) },
      );
    }
    if (query.apres) {
      const [date, id] = decodeCursor(query.apres);
      qb.andWhere('(story.published_at, story.id) < (:date, :id)', { date, id });
    }
    const rows = await qb
      .orderBy('story.published_at', 'DESC')
      .addOrderBy('story.id', 'DESC')
      // limit (et non take) : la jointure vers l'autrice ou l'auteur ne duplique pas de ligne.
      .limit(query.limite + 1)
      .getMany();
    const page = rows.slice(0, query.limite);
    return {
      items: await this.summaries(this.db.manager, page, false),
      nextCursor: rows.length > query.limite ? encodeCursor(page[page.length - 1]!) : null,
    };
  }

  /** Mes histoires, brouillons compris. */
  async mine(account: User): Promise<StorySummary[]> {
    const stories = await this.db.getRepository(Story).find({
      where: { author: { id: account.id } },
      relations: { author: true },
      order: { updatedAt: 'DESC' },
    });
    return this.summaries(this.db.manager, stories, true);
  }

  async detail(id: string, viewer: User | null): Promise<StoryDetail> {
    const story = await visibleStory(this.db.manager, id, viewer);
    const own = viewer?.id === story.author.id;
    const [summary] = await this.summaries(this.db.manager, [story], own);
    const chapters = await this.db.getRepository(Chapter).find({
      where: own ? { story: { id } } : { story: { id }, status: 'published' },
      order: { position: 'ASC' },
    });
    return {
      ...summary!,
      chapters: chapters.map((c, index) => ({
        id: c.id,
        number: index + 1,
        title: c.title,
        status: c.status,
        wordCount: c.wordCount,
        publishedAt: iso(c.publishedAt),
      })),
    };
  }

  private async summaries(
    tx: EntityManager,
    stories: Story[],
    own: boolean,
  ): Promise<StorySummary[]> {
    const ids = stories.map((s) => s.id);
    const labels = await this.tags.labels(tx, ids);
    const counts = new Map<string, number>();
    if (ids.length) {
      const rows = await tx.query<{ story_id: string; n: number }[]>(
        `SELECT story_id, count(*)::int AS n FROM chapters
         WHERE story_id = ANY($1) AND status = 'published' GROUP BY story_id`,
        [ids],
      );
      for (const row of rows) counts.set(row.story_id, row.n);
    }
    return stories.map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      author: { handle: s.author.handle ?? '', displayName: s.author.displayName },
      language: s.language,
      rating: s.rating,
      status: own ? s.status : 'published',
      completion: s.completion,
      majorWarnings: s.majorWarnings,
      tags: labels.get(s.id) ?? [],
      wordCount: s.wordCount,
      chapterCount: counts.get(s.id) ?? 0,
      publishedAt: iso(s.publishedAt),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }
}
