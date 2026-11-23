import { z } from 'zod';

/** Recherches enregistrées par personne (#80). */
export const MAX_SAVED_SEARCHES = 20;

/**
 * Recherche enregistrée (#80) : ses paramètres sont ceux de l’adresse d’Explorer (texte,
 * tags, filtres), pour la rouvrir telle quelle. Les alertes préviennent, au plus une fois par
 * jour, des nouvelles histoires publiées qui y correspondent.
 */
export const SavedSearch = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  query: z.string(),
  alerts: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type SavedSearch = z.infer<typeof SavedSearch>;

export const SavedSearchList = z.strictObject({ items: z.array(SavedSearch) });
export type SavedSearchList = z.infer<typeof SavedSearchList>;

const Name = z.string().trim().min(1).max(100);
/** Paramètres d’adresse (« q=marée&tags=fantasy ») ; vérifiés au moment de chercher. */
const Query = z
  .string()
  .max(2000)
  .regex(/^[^\s#]*$/, { message: 'Paramètres d’adresse attendus.' });

export const NewSavedSearch = z.strictObject({
  name: Name,
  query: Query,
  alerts: z.boolean().default(true),
});
export type NewSavedSearch = z.infer<typeof NewSavedSearch>;

export const UpdateSavedSearch = z.strictObject({
  name: Name.optional(),
  alerts: z.boolean().optional(),
});
export type UpdateSavedSearch = z.infer<typeof UpdateSavedSearch>;
