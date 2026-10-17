import { z } from 'zod';
import { StorySummary } from './stories.js';

/**
 * « Mes lectures » (#30) : les histoires de chaque personne, rangées sur trois étagères,
 * avec la position de lecture (chapitre et paragraphe), gardées sur le compte pour les
 * retrouver sur tous les appareils (décision 54, amendée).
 */
export const Shelf = z.enum(['reading', 'to_read', 'finished']);
export type Shelf = z.infer<typeof Shelf>;

/** Identifiant d’un bloc du texte (paragraphe), comme dans les documents de l’éditeur. */
const BlockId = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/);

/** Position de lecture : chapitre ouvert et, s’il est connu, paragraphe en cours. */
export const ReadingPosition = z.strictObject({
  chapterId: z.uuid(),
  blockId: BlockId.nullable(),
});
export type ReadingPosition = z.infer<typeof ReadingPosition>;

export const SetShelf = z.strictObject({ shelf: Shelf });
export type SetShelf = z.infer<typeof SetShelf>;

/** Une histoire de Mes lectures, telle que la personne la voit. */
export const LibraryEntry = z.strictObject({
  shelf: Shelf,
  /** Chapitre où reprendre ; null s’il n’a pas été ouvert (ou n’est plus publié). */
  chapterId: z.uuid().nullable(),
  blockId: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type LibraryEntry = z.infer<typeof LibraryEntry>;

/** Place d’une histoire dans Mes lectures ; entry null : pas dans Mes lectures. */
export const LibraryStatus = z.strictObject({ entry: LibraryEntry.nullable() });
export type LibraryStatus = z.infer<typeof LibraryStatus>;

export const LibraryItem = LibraryEntry.extend({ story: StorySummary });
export type LibraryItem = z.infer<typeof LibraryItem>;

export const LibraryPage = z.strictObject({
  items: z.array(LibraryItem),
  nextCursor: z.string().nullable(),
});
export type LibraryPage = z.infer<typeof LibraryPage>;

/** Une étagère, la plus récemment lue ou rangée d’abord, par curseur. */
export const LibraryQuery = z.strictObject({
  etagere: Shelf.default('reading'),
  apres: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});
export type LibraryQuery = z.infer<typeof LibraryQuery>;
