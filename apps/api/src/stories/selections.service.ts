import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  MAX_SELECTION_STORIES,
  MAX_SELECTIONS,
  type NewSelection,
  type PublicSelectionsQuery,
  type Selection as SelectionView,
  type SelectionList,
  type SelectionSummary,
  type StorySummary,
  type UpdateSelection,
  handleKey,
} from '@plumiotheca/contracts';
import { DataSource, In } from 'typeorm';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { ApiProblem } from '../common/problem.js';
import type { User } from '../users/user.entity.js';
import { Selection, SelectionItem } from './selection.entity.js';
import { StoriesService } from './stories.service.js';
import { isPublic, visibleStory } from './story-access.js';
import { Story } from './story.entity.js';

/** Histoires montrées en aperçu d'une étagère. */
const PREVIEW = 4;

/** Compte dont les contenus publics sont visibles (même règle que pour les histoires). */
const PUBLIC_OWNER = `owner.status = 'active' AND owner.age_band IN ('15-17', '18+')
  AND owner.handle IS NOT NULL`;

/**
 * Sélections (#30) : privées par défaut, publiques avec une page partageable. Une sélection
 * privée n'existe pour personne d'autre (404) ; une sélection publique d'un compte verrouillé
 * ou supprimé non plus. Seules les histoires visibles de la personne qui regarde y figurent.
 */
@Injectable()
export class SelectionsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly stories: StoriesService,
  ) {}

  private get repo() {
    return this.db.getRepository(Selection);
  }

  /** Mes sélections, la plus récente d'abord ; `storyId` : dit si chacune la contient. */
  async mine(user: User, storyId?: string): Promise<SelectionList> {
    const selections = await this.repo.find({
      where: { ownerId: user.id },
      relations: { owner: true },
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: MAX_SELECTIONS,
    });
    const items = await this.summaries(user, selections);
    if (storyId) {
      const containing = new Set(
        (
          await this.db.getRepository(SelectionItem).find({
            select: { selectionId: true },
            where: { storyId, selectionId: In(selections.map((s) => s.id)) },
          })
        ).map((i) => i.selectionId),
      );
      for (const item of items) item.contains = containing.has(item.id);
    }
    return { items, nextCursor: null };
  }

  async create(user: User, input: NewSelection): Promise<SelectionView> {
    if ((await this.repo.countBy({ ownerId: user.id })) >= MAX_SELECTIONS) {
      throw new ApiProblem(
        HttpStatus.CONFLICT,
        `${MAX_SELECTIONS} sélections au plus : supprimez-en une pour en créer une autre.`,
      );
    }
    const saved = await this.repo.save(
      this.repo.create({
        ownerId: user.id,
        title: input.title,
        description: input.description ?? '',
        visibility: input.visibility,
      }),
    );
    return this.get(user, saved.id);
  }

  async update(user: User, id: string, input: UpdateSelection): Promise<SelectionView> {
    await this.owned(user, id);
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    await this.repo.update(id, { ...changes, updatedAt: new Date() });
    return this.get(user, id);
  }

  async remove(user: User, id: string): Promise<void> {
    await this.owned(user, id);
    await this.repo.delete(id);
  }

  /** Ajoute une histoire (visible de la personne) à la fin de la sélection ; sans doublon. */
  async addStory(user: User, id: string, storyId: string): Promise<SelectionView> {
    await this.owned(user, id);
    await visibleStory(this.db.manager, storyId, user);
    await this.db.transaction(async (tx) => {
      // Une seule écriture à la fois par sélection : la position et le plafond restent justes.
      await tx.query('SELECT id FROM selections WHERE id = $1 FOR UPDATE', [id]);
      const [count] = await tx.query<{ n: number; last: number | null }[]>(
        `SELECT count(*)::int AS n, max(position) AS last FROM selection_items
         WHERE selection_id = $1`,
        [id],
      );
      const { n, last } = count!;
      if (n >= MAX_SELECTION_STORIES) {
        throw new ApiProblem(
          HttpStatus.CONFLICT,
          `${MAX_SELECTION_STORIES} histoires au plus dans une sélection.`,
        );
      }
      const inserted = await tx.query<unknown[]>(
        `INSERT INTO selection_items (selection_id, story_id, position) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING story_id`,
        [id, storyId, (last ?? 0) + 1],
      );
      if (inserted.length) await tx.getRepository(Selection).update(id, { updatedAt: new Date() });
    });
    return this.get(user, id);
  }

  async removeStory(user: User, id: string, storyId: string): Promise<SelectionView> {
    await this.owned(user, id);
    const result = await this.db.getRepository(SelectionItem).delete({ selectionId: id, storyId });
    if (result.affected) await this.repo.update(id, { updatedAt: new Date() });
    return this.get(user, id);
  }

  /** Page d'une sélection : publique, ou la sienne. */
  async get(viewer: User | null, id: string): Promise<SelectionView> {
    const selection = await this.repo
      .createQueryBuilder('selection')
      .innerJoinAndSelect('selection.owner', 'owner')
      .where('selection.id = :id', { id })
      .andWhere(
        `(selection.owner_id = :viewer OR (selection.visibility = 'public' AND ${PUBLIC_OWNER}))`,
        { viewer: viewer?.id ?? null },
      )
      .getOne();
    if (!selection) throw new NotFoundException();
    const stories = await this.visibleStories(viewer, [selection.id]);
    const list = stories.get(selection.id) ?? [];
    return {
      ...this.base(selection, list.length),
      stories: list,
      mine: viewer?.id === selection.ownerId,
    };
  }

  /** Étagères publiques (Explorer, profil), non vides, les plus récentes d'abord. */
  async publicList(viewer: User | null, query: PublicSelectionsQuery): Promise<SelectionList> {
    const qb = this.repo
      .createQueryBuilder('selection')
      .innerJoinAndSelect('selection.owner', 'owner')
      .where(`selection.visibility = 'public' AND ${PUBLIC_OWNER}`)
      // Au moins une histoire publique : pas d'étagère vide.
      .andWhere(
        `EXISTS (SELECT 1 FROM selection_items si JOIN stories st ON st.id = si.story_id
                 JOIN users a ON a.id = st.author_id
                 WHERE si.selection_id = selection.id AND st.status = 'published'
                   AND a.status = 'active' AND a.age_band IN ('15-17', '18+')
                   AND a.handle IS NOT NULL)`,
      );
    if (query.pseudonyme) {
      qb.andWhere('owner.handle_key = :key', { key: handleKey(query.pseudonyme) });
    }
    if (query.apres) {
      const [date, id] = decodeCursor(query.apres);
      qb.andWhere('(selection.updated_at, selection.id) < (:date, :id)', { date, id });
    }
    const rows = await qb
      .orderBy('selection.updated_at', 'DESC')
      .addOrderBy('selection.id', 'DESC')
      .limit(query.limite + 1)
      .getMany();
    const page = rows.slice(0, query.limite);
    return {
      items: await this.summaries(viewer, page),
      nextCursor:
        rows.length > query.limite ? encodeCursor(page.at(-1)!.updatedAt, page.at(-1)!.id) : null,
    };
  }

  /** La sélection si elle est à vous ; 404 si vous ne la voyez pas, 403 sinon. */
  private async owned(user: User, id: string): Promise<Selection> {
    const selection = await this.repo.findOneBy({ id });
    if (!selection || (selection.ownerId !== user.id && selection.visibility === 'private')) {
      throw new NotFoundException();
    }
    if (selection.ownerId !== user.id) {
      throw new ForbiddenException();
    }
    return selection;
  }

  private base(selection: Selection, storyCount: number) {
    return {
      id: selection.id,
      title: selection.title,
      description: selection.description,
      visibility: selection.visibility,
      owner: { handle: selection.owner.handle ?? '', displayName: selection.owner.displayName },
      storyCount,
      updatedAt: selection.updatedAt.toISOString(),
    };
  }

  private async summaries(viewer: User | null, selections: Selection[]) {
    const stories = await this.visibleStories(
      viewer,
      selections.map((s) => s.id),
    );
    return selections.map((selection): SelectionSummary => {
      const list = stories.get(selection.id) ?? [];
      return { ...this.base(selection, list.length), preview: list.slice(0, PREVIEW) };
    });
  }

  /** Histoires de ces sélections visibles de la personne qui regarde, dans l'ordre. */
  private async visibleStories(
    viewer: User | null,
    selectionIds: string[],
  ): Promise<Map<string, StorySummary[]>> {
    const result = new Map<string, StorySummary[]>();
    if (!selectionIds.length) return result;
    const items = await this.db.getRepository(SelectionItem).find({
      where: { selectionId: In(selectionIds) },
      order: { position: 'ASC' },
    });
    const ids = [...new Set(items.map((i) => i.storyId))];
    if (!ids.length) return result;
    const visible = await this.db
      .getRepository(Story)
      .createQueryBuilder('story')
      .innerJoinAndSelect('story.author', 'author')
      .where({ id: In(ids) })
      .getMany();
    const allowed = visible.filter((s) => (viewer && s.author.id === viewer.id) || isPublic(s));
    const summaries = new Map(
      (await this.stories.summaries(this.db.manager, allowed, false)).map((s) => [s.id, s]),
    );
    for (const item of items) {
      const story = summaries.get(item.storyId);
      if (!story) continue;
      const list = result.get(item.selectionId) ?? [];
      list.push(story);
      result.set(item.selectionId, list);
    }
    return result;
  }
}
