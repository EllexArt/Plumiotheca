import { HttpStatus } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import { Chapter } from './chapter.entity.js';

/**
 * Enregistre le brouillon seulement s'il n'a pas changé depuis sa lecture (version
 * attendue) : deux co-autrices ne peuvent pas s'écraser sans le savoir. Renvoie la nouvelle
 * version ; 409 si le brouillon a été modifié entre-temps.
 */
export async function saveDraft(
  db: EntityManager,
  chapterId: string,
  expectedVersion: number,
  draft: object,
): Promise<number> {
  const result = await db
    .createQueryBuilder()
    .update(Chapter)
    .set({ draft, draftVersion: () => 'draft_version + 1' })
    .where('id = :chapterId AND draft_version = :expectedVersion', { chapterId, expectedVersion })
    .returning(['draftVersion'])
    .execute();
  const row = (result.raw as { draft_version: number }[])[0];
  if (!row) {
    throw new ApiProblem(
      HttpStatus.CONFLICT,
      'Ce chapitre a été modifié ailleurs entre-temps. Comparez les versions avant d’enregistrer.',
      'brouillon-modifie',
    );
  }
  return row.draft_version;
}
