import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { ApiProblem } from './problem.js';

/**
 * Curseur opaque de pagination : date de tri (publication pour la liste publique,
 * dernière modification pour « Mes histoires », dernière lecture pour « Mes lectures ») et identifiant de la dernière ligne.
 */
export const encodeCursor = (date: Date, id: string) =>
  Buffer.from(`${date.toISOString()}|${id}`).toString('base64url');

// Bornes de date : PostgreSQL refuse l'année 0000, que la norme ISO accepte.
const Cursor = z.tuple([
  z.iso.datetime().refine((d) => Date.parse(d) >= Date.UTC(2000, 0, 1)),
  z.uuid(),
]);

export function decodeCursor(cursor: string): [string, string] {
  const parsed = Cursor.safeParse(Buffer.from(cursor, 'base64url').toString().split('|'));
  if (!parsed.success) {
    throw new ApiProblem(HttpStatus.BAD_REQUEST, 'Curseur de pagination invalide.');
  }
  return parsed.data;
}
