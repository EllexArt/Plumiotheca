import { HttpStatus, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ApiProblem } from '../common/problem.js';

/** Brouillon d'un chapitre (colonne jamais chargée par défaut). */
export async function loadDraft(db: EntityManager, chapterId: string): Promise<object> {
  const [row] = await db.query<{ draft: object }[]>('SELECT draft FROM chapters WHERE id = $1', [
    chapterId,
  ]);
  // Supprimé entre-temps (autre onglet, co-écriture) : 404, comme chapterOf().
  if (!row) throw new NotFoundException();
  return row.draft;
}

/**
 * Enregistre le brouillon seulement s'il n'a pas changé depuis sa lecture (version
 * attendue) : deux co-autrices ou co-auteurs ne peuvent pas s'écraser sans le savoir. Renvoie la nouvelle
 * version ; 409 si le brouillon a été modifié entre-temps.
 *
 * SQL direct : les colonnes du brouillon sont en `update: false` dans l'entité, pour qu'aucun
 * autre chemin (save, update) ne puisse les écrire.
 */
export async function saveDraft(
  db: EntityManager,
  chapterId: string,
  expectedVersion: number,
  draft: object,
): Promise<number> {
  const rows = await db.query<[{ draft_version: number }[], number]>(
    `UPDATE chapters SET draft = $1, draft_version = draft_version + 1, updated_at = now()
     WHERE id = $2 AND draft_version = $3
     RETURNING draft_version`,
    [JSON.stringify(draft), chapterId, expectedVersion],
  );
  const row = rows[0][0];
  if (!row) {
    throw new ApiProblem(
      HttpStatus.CONFLICT,
      'Ce chapitre a été modifié ailleurs entre-temps. Comparez les versions avant d’enregistrer.',
      'brouillon-modifie',
    );
  }
  return row.draft_version;
}
