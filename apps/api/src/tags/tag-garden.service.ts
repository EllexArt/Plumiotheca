import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  GardenTag,
  TagJournal,
  TagJournalQuery,
  TagOperation,
  TagOperationKind,
} from '@plumiotheca/contracts';
import { DataSource, type EntityManager } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import type { User } from '../users/user.entity.js';
import { TagOperationEntry, type TagState } from './tag-operation.entity.js';
import { normalizeTag } from './tag-normalize.js';
import { escapeLike } from './tags.service.js';

type Row = {
  id: string;
  name: string;
  normalized: string;
  canonical_id: string | null;
  parent_id: string | null;
};

const toState = (r: Row): TagState => ({
  id: r.id,
  name: r.name,
  normalized: r.normalized,
  canonicalId: r.canonical_id,
  parentId: r.parent_id,
});

const same = (a: TagState, b: TagState | undefined) =>
  !!b &&
  a.name === b.name &&
  a.normalized === b.normalized &&
  a.canonicalId === b.canonicalId &&
  a.parentId === b.parentId;

const conflict = (message: string, type: string) =>
  new ApiProblem(HttpStatus.CONFLICT, message, type);

/**
 * Jardinage des tags (#78). Les histoires gardent leurs tags tels quels : un synonyme est
 * relié à son tag canonique au moment de chercher et d'afficher (TagsService). Une
 * opération ne touche donc que la table des tags, ce qui la rend simple à annuler.
 */
@Injectable()
export class TagGardenService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Tags dont le nom ressemble à la recherche, les plus utilisés d'abord. */
  async search(text: string): Promise<GardenTag[]> {
    const key = escapeLike(normalizeTag(text));
    const rows = await this.db.query<{ id: string }[]>(
      `SELECT t.id FROM tags t
       WHERE t.normalized LIKE '%' || $1 || '%'
       ORDER BY (t.normalized = $2) DESC,
                (SELECT count(*) FROM story_tags st WHERE st.tag_id = t.id) DESC, t.name
       LIMIT 30`,
      [key, normalizeTag(text)],
    );
    return this.views(
      this.db.manager,
      rows.map((r) => r.id),
    );
  }

  async get(id: string): Promise<GardenTag> {
    const [view] = await this.views(this.db.manager, [id]);
    if (!view) throw new NotFoundException();
    return view;
  }

  /** Fusion : ce tag devient synonyme de `into` ; ses synonymes et sous-tags le suivent. */
  async merge(actor: User, id: string, into: string): Promise<GardenTag> {
    await this.operate(actor, 'merge', async (tx) => {
      const source = await this.byId(tx, id);
      const target = await this.canonicalOf(tx, await this.byName(tx, into));
      if (target.id === source.id || source.canonical_id === target.id) {
        throw conflict(`« ${source.name} » est déjà ce tag ou son synonyme.`, 'deja-synonyme');
      }
      const related = await this.rows(
        tx,
        `SELECT * FROM tags WHERE (canonical_id = $1 OR parent_id = $1) AND id <> $2`,
        [source.id, target.id],
      );
      const before = [source, ...related].map(toState);
      const after = before.map((tag) =>
        tag.id === source.id
          ? { ...tag, canonicalId: target.id, parentId: null }
          : {
              ...tag,
              canonicalId: tag.canonicalId === source.id ? target.id : tag.canonicalId,
              parentId: tag.parentId === source.id ? target.id : tag.parentId,
            },
      );
      return {
        summary: `« ${source.name} » rattaché comme synonyme à « ${target.name} »`,
        before,
        after,
      };
    });
    return this.get(id);
  }

  /** Séparation : un synonyme redevient un tag à part entière. */
  async split(actor: User, id: string): Promise<GardenTag> {
    await this.operate(actor, 'split', async (tx) => {
      const source = await this.byId(tx, id);
      if (!source.canonical_id) {
        throw conflict(`« ${source.name} » n’est le synonyme d’aucun tag.`, 'pas-synonyme');
      }
      const canonical = await this.byId(tx, source.canonical_id);
      const before = [toState(source)];
      return {
        summary: `« ${source.name} » détaché de « ${canonical.name} »`,
        before,
        after: [{ ...before[0]!, canonicalId: null }],
      };
    });
    return this.get(id);
  }

  /** Range un tag canonique sous un parent (ou nulle part), sans jamais faire de boucle. */
  async setParent(actor: User, id: string, parentName: string | null): Promise<GardenTag> {
    await this.operate(actor, 'parent', async (tx) => {
      const source = await this.byId(tx, id);
      if (source.canonical_id) {
        throw conflict(
          `« ${source.name} » est un synonyme : rangez plutôt son tag canonique.`,
          'synonyme-sans-parent',
        );
      }
      const parent = parentName
        ? await this.canonicalOf(tx, await this.byName(tx, parentName))
        : null;
      if (parent) {
        const [loop] = await tx.query<{ found: boolean }[]>(
          `WITH RECURSIVE up(id) AS (
             SELECT $1::uuid UNION SELECT t.parent_id FROM tags t JOIN up ON t.id = up.id
             WHERE t.parent_id IS NOT NULL)
           SELECT EXISTS (SELECT 1 FROM up WHERE id = $2) AS found`,
          [parent.id, source.id],
        );
        if (loop?.found) {
          throw conflict(
            `« ${parent.name} » est déjà rangé sous « ${source.name} » : ce serait une boucle.`,
            'boucle-de-tags',
          );
        }
      }
      const before = [toState(source)];
      return {
        summary: parent
          ? `« ${source.name} » rangé sous « ${parent.name} »`
          : `« ${source.name} » n’a plus de parent`,
        before,
        after: [{ ...before[0]!, parentId: parent?.id ?? null }],
      };
    });
    return this.get(id);
  }

  /** Renomme un tag ; un nom déjà pris par un autre tag appelle plutôt une fusion. */
  async rename(actor: User, id: string, name: string): Promise<GardenTag> {
    await this.operate(actor, 'rename', async (tx) => {
      const source = await this.byId(tx, id);
      const normalized = normalizeTag(name);
      const [taken] = await this.rows(tx, 'SELECT * FROM tags WHERE normalized = $1 AND id <> $2', [
        normalized,
        source.id,
      ]);
      if (taken) {
        throw conflict(
          `« ${taken.name} » existe déjà : rattachez plutôt l’un à l’autre comme synonymes.`,
          'tag-existant',
        );
      }
      const before = [toState(source)];
      return {
        summary: `« ${source.name} » renommé « ${name.trim()} »`,
        before,
        after: [{ ...before[0]!, name: name.trim(), normalized }],
      };
    });
    return this.get(id);
  }

  /** Annule une opération : ses tags reviennent à leur état d’avant, s'ils n'ont pas bougé. */
  async revert(actor: User, operationId: string): Promise<void> {
    await this.operate(actor, 'revert', async (tx) => {
      const operation = await tx
        .getRepository(TagOperationEntry)
        .findOne({ where: { id: operationId }, lock: { mode: 'pessimistic_write' } });
      if (!operation) throw new NotFoundException();
      if (operation.revertedAt || operation.kind === 'revert') {
        throw conflict('Cette opération ne peut plus être annulée.', 'deja-annulee');
      }
      const current = await this.states(
        tx,
        operation.after.map((t) => t.id),
      );
      if (!operation.after.every((t) => same(t, current.get(t.id)))) {
        throw conflict(
          'Ces tags ont changé depuis : annulez d’abord les opérations plus récentes.',
          'tags-modifies',
        );
      }
      await tx.getRepository(TagOperationEntry).update(operation.id, { revertedAt: new Date() });
      return {
        summary: `Annulé : ${operation.summary}`,
        before: operation.after,
        after: operation.before,
      };
    });
  }

  async journal(query: TagJournalQuery): Promise<TagJournal> {
    const qb = this.db
      .getRepository(TagOperationEntry)
      .createQueryBuilder('op')
      .leftJoinAndSelect('op.actor', 'actor')
      .orderBy('op.id', 'DESC')
      .limit(query.limite + 1);
    if (query.apres) qb.where('op.id < :apres', { apres: query.apres });
    const rows = await qb.getMany();
    const page = rows.slice(0, query.limite);
    const current = await this.states(
      this.db.manager,
      page.flatMap((op) => op.after.map((t) => t.id)),
    );
    return {
      items: page.map((op): TagOperation => ({
        id: op.id,
        kind: op.kind,
        summary: op.summary,
        by: op.actor?.handle ?? null,
        at: op.createdAt.toISOString(),
        revertedAt: op.revertedAt?.toISOString() ?? null,
        revertible:
          !op.revertedAt &&
          op.kind !== 'revert' &&
          op.after.every((t) => same(t, current.get(t.id))),
      })),
      nextCursor: rows.length > query.limite ? page.at(-1)!.id : null,
    };
  }

  /**
   * Une opération, dans une transaction, une à la fois (verrou partagé par tous les
   * jardiniers) : applique l'état « après » et l'écrit au journal.
   */
  private async operate(
    actor: User,
    kind: TagOperationKind,
    plan: (
      tx: EntityManager,
    ) => Promise<{ summary: string; before: TagState[]; after: TagState[] }>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('jardinage-tags'))`);
      const { summary, before, after } = await plan(tx);
      try {
        for (const tag of after) {
          await tx.query(
            `UPDATE tags SET name = $2, normalized = $3, canonical_id = $4, parent_id = $5
             WHERE id = $1`,
            [tag.id, tag.name, tag.normalized, tag.canonicalId, tag.parentId],
          );
        }
      } catch (error) {
        // Nom repris entre-temps par un autre tag (annulation d'un renommage).
        if ((error as { code?: string }).code === '23505') {
          throw conflict('Un autre tag porte déjà ce nom.', 'tag-existant');
        }
        throw error;
      }
      await tx.getRepository(TagOperationEntry).insert({
        kind,
        summary: summary.slice(0, 300),
        actor: { id: actor.id },
        before,
        after,
      });
    });
  }

  private rows(tx: EntityManager, sql: string, params: unknown[]): Promise<Row[]> {
    return tx.query<Row[]>(sql, params);
  }

  private async byId(tx: EntityManager, id: string): Promise<Row> {
    const [row] = await this.rows(tx, 'SELECT * FROM tags WHERE id = $1', [id]);
    if (!row) throw new NotFoundException();
    return row;
  }

  private async byName(tx: EntityManager, name: string): Promise<Row> {
    const [row] = await this.rows(tx, 'SELECT * FROM tags WHERE normalized = $1', [
      normalizeTag(name),
    ]);
    if (!row) {
      throw new ApiProblem(HttpStatus.NOT_FOUND, `Aucun tag « ${name.trim()} ».`, 'tag-inconnu');
    }
    return row;
  }

  private async canonicalOf(tx: EntityManager, tag: Row): Promise<Row> {
    return tag.canonical_id ? this.byId(tx, tag.canonical_id) : tag;
  }

  private async states(tx: EntityManager, ids: string[]): Promise<Map<string, TagState>> {
    if (!ids.length) return new Map();
    const rows = await this.rows(tx, 'SELECT * FROM tags WHERE id = ANY($1)', [[...new Set(ids)]]);
    return new Map(rows.map((r) => [r.id, toState(r)]));
  }

  private async views(tx: EntityManager, ids: string[]): Promise<GardenTag[]> {
    if (!ids.length) return [];
    const rows = await tx.query<
      (Row & {
        canonical_name: string | null;
        parent_name: string | null;
        synonyms: { id: string; name: string }[];
        children: { id: string; name: string }[];
        stories: number;
      })[]
    >(
      `SELECT t.*, c.name AS canonical_name, p.name AS parent_name,
              coalesce((SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
                        FROM tags s WHERE s.canonical_id = t.id), '[]') AS synonyms,
              coalesce((SELECT json_agg(json_build_object('id', k.id, 'name', k.name) ORDER BY k.name)
                        FROM tags k WHERE k.parent_id = t.id), '[]') AS children,
              (SELECT count(DISTINCT st.story_id)::int FROM story_tags st JOIN tags f ON f.id = st.tag_id
               WHERE f.id = t.id OR f.canonical_id = t.id) AS stories
       FROM tags t
       LEFT JOIN tags c ON c.id = t.canonical_id
       LEFT JOIN tags p ON p.id = t.parent_id
       WHERE t.id = ANY($1)`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = byId.get(id);
      if (!r) return [];
      return [
        {
          id: r.id,
          name: r.name,
          normalized: r.normalized,
          canonical: r.canonical_id ? { id: r.canonical_id, name: r.canonical_name ?? '' } : null,
          parent: r.parent_id ? { id: r.parent_id, name: r.parent_name ?? '' } : null,
          synonyms: r.synonyms,
          children: r.children,
          stories: r.stories,
        },
      ];
    });
  }
}
