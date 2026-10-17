import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  NewStory,
  StoryDetail,
  StoryPage,
  MyStoriesQuery,
  StoryQuery,
  StorySummary,
  UpdateStory,
} from '@plumiotheca/contracts';
import { handleKey } from '@plumiotheca/contracts';
import { DataSource, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import {
  decodeCursor,
  decodeNumberCursor,
  encodeCursor,
  encodeNumberCursor,
} from '../common/cursor.js';
import { ApiProblem } from '../common/problem.js';
import { normalizeTag } from '../tags/tag-normalize.js';
import { TagsService } from '../tags/tags.service.js';
import type { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { lockStory, ownedStory, publicStories, visibleStory } from './story-access.js';
import { Story } from './story.entity.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Tris de la liste publique (#32), chacun avec son curseur (valeur de tri, identifiant). */
const SORTS = {
  recentes: {
    column: 'story.published_at',
    kind: 'date',
    cursor: (s: Story) => encodeCursor(s.publishedAt!, s.id),
  },
  mises_a_jour: {
    column: 'story.updated_at',
    kind: 'date',
    cursor: (s: Story) => encodeCursor(s.updatedAt, s.id),
  },
  lecteurs: {
    column: 'story.read_count',
    kind: 'number',
    cursor: (s: Story) => encodeNumberCursor(s.readCount, s.id),
  },
  longueur: {
    column: 'story.word_count',
    kind: 'number',
    cursor: (s: Story) => encodeNumberCursor(s.wordCount, s.id),
  },
} as const;

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
        contentWarnings: input.contentWarnings ?? [],
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

  /**
   * Liste publique, la plus récente d'abord, par curseur (jamais par numéro de page). Avec
   * des avertissements exclus, la première page dit aussi combien d'histoires sont masquées.
   */
  async list(query: StoryQuery): Promise<StoryPage> {
    const base = () =>
      this.filtered(
        publicStories(
          this.db
            .getRepository(Story)
            .createQueryBuilder('story')
            .innerJoinAndSelect('story.author', 'author'),
        ),
        query,
      );
    const exclude = {
      exclure: query.exclure?.length ? query.exclure : null,
      autres: query.exclureAutres?.length ? query.exclureAutres : null,
      tags: query.masquerTags?.length ? query.masquerTags.map(normalizeTag) : null,
    };
    const tagged = `EXISTS (SELECT 1 FROM story_tags st JOIN tags t ON t.id = st.tag_id
                     WHERE st.story_id = story.id AND t.normalized = ANY(:tags))`;
    const qb = base();
    if (exclude.exclure) {
      qb.andWhere('NOT (story.major_warnings && CAST(:exclure AS major_warning[]))', exclude);
    }
    if (exclude.autres) {
      qb.andWhere('NOT (story.content_warnings && CAST(:autres AS content_warning[]))', exclude);
    }
    if (exclude.tags) qb.andWhere(`NOT ${tagged}`, exclude);
    // Nombre de résultats (#32), avant le curseur : sur la première page seulement.
    const total = query.apres ? undefined : await qb.clone().getCount();
    const sort = SORTS[query.tri];
    if (query.apres) {
      const [value, id] =
        sort.kind === 'date' ? decodeCursor(query.apres) : decodeNumberCursor(query.apres);
      qb.andWhere(`(${sort.column}, story.id) < (:value, :id)`, { value, id });
    }
    const rows = await qb
      .orderBy(sort.column, 'DESC')
      .addOrderBy('story.id', 'DESC')
      // limit (et non take) : la jointure vers l'autrice ou l'auteur ne duplique pas de ligne.
      .limit(query.limite + 1)
      .getMany();
    const page = rows.slice(0, query.limite);
    // Ce qui a été masqué, pour le dire (et pouvoir le montrer) : mêmes filtres, sauf les
    // avertissements et tags exclus, inversés.
    const hidden =
      !query.apres && (exclude.exclure || exclude.autres || exclude.tags)
        ? await base()
            .andWhere(
              `(${[
                exclude.exclure && 'story.major_warnings && CAST(:exclure AS major_warning[])',
                exclude.autres && 'story.content_warnings && CAST(:autres AS content_warning[])',
                exclude.tags && tagged,
              ]
                .filter(Boolean)
                .join(' OR ')})`,
              exclude,
            )
            .getCount()
        : undefined;
    return {
      items: await this.summaries(this.db.manager, page, false),
      nextCursor: rows.length > query.limite ? sort.cursor(page.at(-1)!) : null,
      ...(total === undefined ? {} : { total }),
      ...(hidden === undefined ? {} : { hidden }),
    };
  }

  /** Filtres de la liste publique, hors avertissements exclus et curseur. */
  private filtered(qb: SelectQueryBuilder<Story>, query: StoryQuery) {
    if (query.langues?.length) qb.andWhere('story.language IN (:...langues)', query);
    if (query.statut) qb.andWhere('story.completion = :statut', query);
    if (query.motsMin !== undefined) qb.andWhere('story.word_count >= :motsMin', query);
    if (query.motsMax !== undefined) qb.andWhere('story.word_count <= :motsMax', query);
    if (query.tags?.length) {
      // Tous les tags demandés (forme normalisée), et pas seulement l'un d'eux.
      const inclure = [...new Set(query.tags.map(normalizeTag))];
      qb.andWhere(
        `(SELECT count(DISTINCT t.normalized) FROM story_tags st JOIN tags t ON t.id = st.tag_id
          WHERE st.story_id = story.id AND t.normalized = ANY(:inclure)) = :nInclure`,
        { inclure, nInclure: inclure.length },
      );
    }
    if (query.langue) qb.andWhere('story.language = :langue', { langue: query.langue });
    if (query.classement) {
      qb.andWhere('story.rating = :classement', { classement: query.classement });
    }
    if (query.exclureClassement?.length) {
      qb.andWhere('story.rating <> ALL(CAST(:exclus AS rating[]))', {
        exclus: query.exclureClassement,
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
    return qb;
  }

  /** Mes histoires, brouillons compris, la plus récemment modifiée d'abord, par curseur. */
  async mine(account: User, query: MyStoriesQuery): Promise<StoryPage> {
    // updated_at est stocké à la milliseconde (timestamptz(3)) : la date JavaScript du
    // curseur le reproduit exactement, rien ne se perd entre deux pages (index stories_mine).
    // Une histoire modifiée ailleurs (autre onglet) pendant qu'on parcourt les pages remonte
    // en tête : elle n'apparaît qu'au prochain rechargement de la liste.
    const qb = this.db
      .getRepository(Story)
      .createQueryBuilder('story')
      .innerJoinAndSelect('story.author', 'author')
      .where('story.author_id = :author', { author: account.id });
    if (query.apres) {
      const [date, id] = decodeCursor(query.apres);
      qb.andWhere('(story.updated_at, story.id) < (:date, :id)', { date, id });
    }
    const rows = await qb
      .orderBy('story.updated_at', 'DESC')
      .addOrderBy('story.id', 'DESC')
      .limit(query.limite + 1)
      .getMany();
    const page = rows.slice(0, query.limite);
    return {
      items: await this.summaries(this.db.manager, page, true),
      nextCursor:
        rows.length > query.limite ? encodeCursor(page.at(-1)!.updatedAt, page.at(-1)!.id) : null,
    };
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

  /** Fiches de ces histoires (tags, nombre de chapitres publiés), dans le même ordre. */
  async summaries(tx: EntityManager, stories: Story[], own: boolean): Promise<StorySummary[]> {
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
      contentWarnings: s.contentWarnings,
      tags: labels.get(s.id) ?? [],
      wordCount: s.wordCount,
      chapterCount: counts.get(s.id) ?? 0,
      readCount: s.readCount,
      publishedAt: iso(s.publishedAt),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }
}
