import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { StoryTag } from '../stories/story-tag.entity.js';
import { Tag } from './tag.entity.js';
import { normalizeTag } from './tag-normalize.js';

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

  /** Libellés des tags de plusieurs histoires, par histoire. */
  async labels(tx: EntityManager, storyIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>(storyIds.map((id) => [id, []]));
    if (!storyIds.length) return result;
    const rows = await tx.query<{ story_id: string; name: string }[]>(
      `SELECT st.story_id, t.name FROM story_tags st JOIN tags t ON t.id = st.tag_id
       WHERE st.story_id = ANY($1) ORDER BY t.name`,
      [storyIds],
    );
    for (const row of rows) result.get(row.story_id)?.push(row.name);
    return result;
  }
}
