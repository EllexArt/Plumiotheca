import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiProblem } from '../common/problem.js';
import type { EntityManager } from 'typeorm';
import { StoryTag } from '../stories/story-tag.entity.js';
import { Tag } from './tag.entity.js';
import { normalizeTag } from './tag-normalize.js';

/** Texte saisi dans un motif LIKE : « % », « _ » et « \ » pris tels quels. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class TagsService {
  /**
   * Remplace les tags d'une histoire. Chaque nom est ramené à un tag existant (forme
   * normalisée, puis son tag canonique s'il est synonyme), créé sinon.
   */
  async setStoryTags(tx: EntityManager, storyId: string, names: string[]): Promise<void> {
    const wanted = new Map<string, string>();
    for (const name of names) {
      const normalized = normalizeTag(name);
      // Certains caractères se déplient une fois normalisés (« ﷺ » : 18 lettres).
      if (normalized.length > 100) {
        throw new ApiProblem(
          HttpStatus.BAD_REQUEST,
          'Tag trop long : 100 caractères au plus.',
          'tag-trop-long',
        );
      }
      if (normalized && !wanted.has(normalized)) wanted.set(normalized, name.trim());
    }
    await tx.getRepository(StoryTag).delete({ storyId });
    if (!wanted.size) return;
    await tx
      .createQueryBuilder()
      .insert()
      .into(Tag)
      .values([...wanted].map(([normalized, name]) => ({ normalized, name })))
      .orIgnore()
      .execute();
    const tags = await tx
      .getRepository(Tag)
      .createQueryBuilder('tag')
      .leftJoinAndSelect('tag.canonical', 'canonical')
      .where('tag.normalized IN (:...keys)', { keys: [...wanted.keys()] })
      .getMany();
    const ids = new Set(tags.map((t) => t.canonical?.id ?? t.id));
    await tx.getRepository(StoryTag).insert([...ids].map((tagId) => ({ storyId, tagId })));
  }

  /**
   * Libellés des tags de plusieurs histoires, par histoire : le tag canonique pour un
   * synonyme (#78), pour que toutes les histoires affichent le même libellé.
   */
  async labels(tx: EntityManager, storyIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>(storyIds.map((id) => [id, []]));
    if (!storyIds.length) return result;
    const rows = await tx.query<{ story_id: string; name: string }[]>(
      `SELECT DISTINCT st.story_id, coalesce(c.name, t.name) AS name
       FROM story_tags st JOIN tags t ON t.id = st.tag_id
       LEFT JOIN tags c ON c.id = t.canonical_id
       WHERE st.story_id = ANY($1) ORDER BY name`,
      [storyIds],
    );
    for (const row of rows) result.get(row.story_id)?.push(row.name);
    return result;
  }

  /**
   * Familles de tags (#31, #78) : pour chaque tag demandé, sa forme normalisée, celle de son
   * tag canonique, de ses synonymes, et de tous ses sous-tags (avec leurs synonymes), qui
   * héritent de lui. Exclure « angst » exclut aussi ses synonymes, même sur une histoire
   * taguée avant leur déclaration ; chercher « fantasy » trouve aussi « dark fantasy ».
   */
  async families(tx: EntityManager, names: string[]): Promise<string[][]> {
    const keys = [...new Set(names.map(normalizeTag).filter(Boolean))];
    if (!keys.length) return [];
    // UNION (et non UNION ALL) : une hiérarchie en boucle s'arrête d'elle-même.
    const rows = await tx.query<{ key: string; family: string[] }[]>(
      `WITH RECURSIVE tree(key, id) AS (
         SELECT k.key, coalesce(t.canonical_id, t.id)
         FROM unnest($1::text[]) AS k(key) JOIN tags t ON t.normalized = k.key
         UNION
         SELECT tree.key, child.id FROM tree JOIN tags child ON child.parent_id = tree.id
       )
       SELECT tree.key, array_agg(DISTINCT f.normalized) AS family
       FROM tree JOIN tags f ON f.id = tree.id OR f.canonical_id = tree.id
       GROUP BY tree.key`,
      [keys],
    );
    const found = new Map(rows.map((r) => [r.key, r.family]));
    return keys.map((key) => [...new Set([key, ...(found.get(key) ?? [])])]);
  }

  /**
   * Tags suggérés pendant la saisie (#31) : début du mot d'abord, puis mot contenu, puis
   * ressemblance (fautes de frappe, trigrammes) ; un synonyme mène à son tag canonique. Seuls
   * les tags d'au moins une histoire publique, les plus utilisés d'abord à rang égal.
   */
  async suggest(
    tx: EntityManager,
    text: string,
    limit: number,
  ): Promise<{ name: string; stories: number }[]> {
    const key = normalizeTag(text);
    if (!key) return [];
    const like = escapeLike(key);
    return tx.query(
      `WITH matches AS (
         SELECT coalesce(t.canonical_id, t.id) AS id,
                max(CASE WHEN t.normalized LIKE $2 || '%' THEN 2
                         WHEN t.normalized LIKE '%' || $2 || '%' THEN 1 ELSE 0 END) AS rank,
                max(similarity(t.normalized, $1)) AS likeness
         FROM tags t
         WHERE t.normalized LIKE '%' || $2 || '%' OR t.normalized % $1
         GROUP BY 1
       )
       SELECT c.name, count(DISTINCT s.id)::int AS stories
       FROM matches m
       JOIN tags c ON c.id = m.id
       -- Histoires du tag et de ses synonymes (taguées avant la déclaration du synonyme).
       JOIN tags f ON f.id = c.id OR f.canonical_id = c.id
       JOIN story_tags st ON st.tag_id = f.id
       JOIN stories s ON s.id = st.story_id AND s.status = 'published'
       JOIN users u ON u.id = s.author_id AND u.status = 'active'
                   AND u.age_band IN ('15-17', '18+') AND u.handle IS NOT NULL
       GROUP BY c.id, c.name, m.rank, m.likeness
       ORDER BY m.rank DESC, stories DESC, m.likeness DESC, c.name
       LIMIT $3`,
      [key, like, limit],
    );
  }
}
