import { z } from 'zod';
import { TagName } from './stories.js';

/**
 * Jardinage des tags (#78) : rôle bénévole « jardinage-tags ». Les jardiniers rattachent un
 * tag à un autre comme synonyme (fusion), l'en détachent, le rangent sous un parent, ou le
 * renomment ; chaque opération est journalisée et peut être annulée.
 */
const TagRef = z.strictObject({ id: z.uuid(), name: z.string() });

export const GardenTag = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  normalized: z.string(),
  /** Tag canonique, pour un synonyme ; null : le tag est lui-même canonique. */
  canonical: TagRef.nullable(),
  parent: TagRef.nullable(),
  synonyms: z.array(TagRef),
  children: z.array(TagRef),
  /** Histoires (toutes, brouillons compris) qui portent ce tag ou l'un de ses synonymes. */
  stories: z.int(),
});
export type GardenTag = z.infer<typeof GardenTag>;

export const GardenTagList = z.strictObject({ items: z.array(GardenTag) });
export type GardenTagList = z.infer<typeof GardenTagList>;

export const GardenTagQuery = z.strictObject({ q: z.string().trim().min(1).max(100) });
export type GardenTagQuery = z.infer<typeof GardenTagQuery>;

/** Faire de ce tag un synonyme de `into` (par son nom ; son tag canonique s'il en a un). */
export const MergeTag = z.strictObject({ into: TagName });
export type MergeTag = z.infer<typeof MergeTag>;

/** Ranger ce tag sous `parent` (par son nom) ; null : plus de parent. */
export const SetTagParent = z.strictObject({ parent: TagName.nullable() });
export type SetTagParent = z.infer<typeof SetTagParent>;

export const RenameTag = z.strictObject({ name: TagName });
export type RenameTag = z.infer<typeof RenameTag>;

export const TagOperationKind = z.enum(['merge', 'split', 'parent', 'rename', 'revert']);
export type TagOperationKind = z.infer<typeof TagOperationKind>;

export const TagOperation = z.strictObject({
  id: z.uuid(),
  kind: TagOperationKind,
  /** Ce qui a été fait, en une phrase (« « slow-burn » rattaché à « Slow burn » »). */
  summary: z.string(),
  /** Jardinier ou jardinière (pseudonyme) ; null : compte supprimé. */
  by: z.string().nullable(),
  at: z.iso.datetime(),
  /** Annulée (par une opération « revert » du journal). */
  revertedAt: z.iso.datetime().nullable(),
  /** Peut encore être annulée : les tags touchés n'ont pas changé depuis. */
  revertible: z.boolean(),
});
export type TagOperation = z.infer<typeof TagOperation>;

export const TagJournal = z.strictObject({
  items: z.array(TagOperation),
  nextCursor: z.uuid().nullable(),
});
export type TagJournal = z.infer<typeof TagJournal>;

export const TagJournalQuery = z.strictObject({
  apres: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});
export type TagJournalQuery = z.infer<typeof TagJournalQuery>;
