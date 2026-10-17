import { z } from 'zod';
import { freeText, singleLine } from './account.js';
import { Author, StorySummary } from './stories.js';

/**
 * Sélections (#30) : étagères composées par les membres, privées par défaut, publiques
 * avec une page partageable. Une histoire peut figurer dans plusieurs sélections.
 */
export const SelectionVisibility = z.enum(['private', 'public']);
export type SelectionVisibility = z.infer<typeof SelectionVisibility>;

/** Sélections par personne, et histoires par sélection, au plus. */
export const MAX_SELECTIONS = 100;
export const MAX_SELECTION_STORIES = 200;

export const NewSelection = z.strictObject({
  title: singleLine(100).pipe(z.string().min(1, { message: 'Donnez un titre à la sélection.' })),
  description: freeText(1000).optional(),
  visibility: SelectionVisibility.default('private'),
});
export type NewSelection = z.infer<typeof NewSelection>;

export const UpdateSelection = z.strictObject({
  title: singleLine(100)
    .pipe(z.string().min(1, { message: 'Donnez un titre à la sélection.' }))
    .optional(),
  description: freeText(1000).optional(),
  visibility: SelectionVisibility.optional(),
});
export type UpdateSelection = z.infer<typeof UpdateSelection>;

/** Une sélection dans une liste (les siennes, ou les étagères publiques d’Explorer). */
export const SelectionSummary = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  visibility: SelectionVisibility,
  owner: Author,
  storyCount: z.int(),
  /** Les premières histoires (aperçu de l’étagère), visibles de la personne qui regarde. */
  preview: z.array(StorySummary),
  updatedAt: z.iso.datetime(),
  /** Mes sélections, filtrées sur une histoire : l’y trouve-t-on ? */
  contains: z.boolean().optional(),
});
export type SelectionSummary = z.infer<typeof SelectionSummary>;

export const Selection = SelectionSummary.omit({ preview: true, contains: true }).extend({
  stories: z.array(StorySummary),
  /** La sélection est à la personne qui regarde : elle peut la modifier. */
  mine: z.boolean(),
});
export type Selection = z.infer<typeof Selection>;

export const SelectionList = z.strictObject({
  items: z.array(SelectionSummary),
  nextCursor: z.string().nullable(),
});
export type SelectionList = z.infer<typeof SelectionList>;

/** Mes sélections ; `histoire` : dit pour chacune si elle contient cette histoire. */
export const MySelectionsQuery = z.strictObject({ histoire: z.uuid().optional() });
export type MySelectionsQuery = z.infer<typeof MySelectionsQuery>;

/** Étagères publiques, les plus récemment modifiées d’abord. */
export const PublicSelectionsQuery = z.strictObject({
  apres: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(20).default(6),
  /** Sélections publiques d’une personne (son profil). */
  pseudonyme: z.string().max(30).optional(),
});
export type PublicSelectionsQuery = z.infer<typeof PublicSelectionsQuery>;
