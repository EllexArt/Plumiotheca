import { Injectable } from '@nestjs/common';
import {
  formatRelationship,
  normalizeCharacter,
  parseRelationship,
  relationshipKey,
  type RelationshipKind,
} from '@plumiotheca/contracts';
import type { EntityManager } from 'typeorm';
import { Character, Relationship, StoryCharacter, StoryRelationship } from './character.entity.js';

/** Personnages et relations d'histoires (#79). */
export interface Cast {
  relationships: string[];
  characters: string[];
}

@Injectable()
export class CharactersService {
  /**
   * Remplace les personnages et relations d'une histoire. Les personnages des relations
   * s'ajoutent à la liste (après ceux saisis) ; chaque nom est ramené à un personnage
   * existant (forme normalisée), créé sinon ; de même pour les relations.
   */
  async setStoryCast(
    tx: EntityManager,
    storyId: string,
    characters: string[] | undefined,
    relationships: string[] | undefined,
  ): Promise<void> {
    if (characters === undefined && relationships === undefined) return;
    // Partie non fournie : celle déjà enregistrée (une mise à jour ne touche qu'à une liste).
    const current = (await this.cast(tx, [storyId])).get(storyId)!;
    const wantedRelations = new Map<string, { kind: RelationshipKind; names: string[] }>();
    for (const text of relationships ?? current.relationships) {
      const parsed = parseRelationship(text);
      if (parsed) wantedRelations.set(relationshipKey(parsed.kind, parsed.names), parsed);
    }
    const names = new Map<string, string>();
    for (const name of [
      ...(characters ?? current.characters),
      ...[...wantedRelations.values()].flatMap((r) => r.names),
    ]) {
      const key = normalizeCharacter(name);
      if (key && !names.has(key)) names.set(key, name.trim());
    }

    await tx.getRepository(StoryCharacter).delete({ storyId });
    await tx.getRepository(StoryRelationship).delete({ storyId });
    if (names.size) {
      await tx
        .createQueryBuilder()
        .insert()
        .into(Character)
        .values([...names].map(([normalized, name]) => ({ normalized, name })))
        .orIgnore()
        .execute();
      const rows = await tx
        .getRepository(Character)
        .createQueryBuilder('c')
        .where('c.normalized IN (:...keys)', { keys: [...names.keys()] })
        .getMany();
      const ids = new Map(rows.map((c) => [c.normalized, c.id]));
      await tx.getRepository(StoryCharacter).insert(
        [...names.keys()].map((key, position) => ({
          storyId,
          characterId: ids.get(key)!,
          position,
        })),
      );
    }
    if (wantedRelations.size) {
      await tx
        .createQueryBuilder()
        .insert()
        .into(Relationship)
        .values(
          [...wantedRelations].map(([key, r]) => ({
            key,
            kind: r.kind,
            name: formatRelationship(r.kind, r.names),
          })),
        )
        .orIgnore()
        .execute();
      const rows = await tx
        .getRepository(Relationship)
        .createQueryBuilder('r')
        .where('r.key IN (:...keys)', { keys: [...wantedRelations.keys()] })
        .getMany();
      const ids = new Map(rows.map((r) => [r.key, r.id]));
      await tx.getRepository(StoryRelationship).insert(
        [...wantedRelations.keys()].map((key, position) => ({
          storyId,
          relationshipId: ids.get(key)!,
          position,
        })),
      );
    }
  }

  /** Relations et personnages de plusieurs histoires, dans l'ordre choisi. */
  async cast(tx: EntityManager, storyIds: string[]): Promise<Map<string, Cast>> {
    const result = new Map<string, Cast>(
      storyIds.map((id) => [id, { relationships: [], characters: [] }]),
    );
    if (!storyIds.length) return result;
    const [relations, characters] = await Promise.all([
      tx.query<{ story_id: string; name: string }[]>(
        `SELECT sr.story_id, r.name FROM story_relationships sr
         JOIN relationships r ON r.id = sr.relationship_id
         WHERE sr.story_id = ANY($1) ORDER BY sr.position`,
        [storyIds],
      ),
      tx.query<{ story_id: string; name: string }[]>(
        `SELECT sc.story_id, c.name FROM story_characters sc
         JOIN characters c ON c.id = sc.character_id
         WHERE sc.story_id = ANY($1) ORDER BY sc.position`,
        [storyIds],
      ),
    ]);
    for (const row of relations) result.get(row.story_id)?.relationships.push(row.name);
    for (const row of characters) result.get(row.story_id)?.characters.push(row.name);
    return result;
  }

  /** Clés des relations demandées (invalides ignorées). */
  relationKeys(texts: string[]): string[] {
    return [
      ...new Set(
        texts.flatMap((text) => {
          const parsed = parseRelationship(text);
          return parsed ? [relationshipKey(parsed.kind, parsed.names)] : [];
        }),
      ),
    ];
  }

  characterKeys(names: string[]): string[] {
    return [...new Set(names.map(normalizeCharacter).filter(Boolean))];
  }
}
