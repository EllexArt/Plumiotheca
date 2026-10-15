import { z } from 'zod';

/** Usage d'une image : il fixe le recadrage et la taille après traitement. */
export const MediaKind = z.enum(['avatar', 'cover']);
export type MediaKind = z.infer<typeof MediaKind>;

/** Taille maximale d'un fichier téléversé : 10 Mo (décision 56). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Formats acceptés au téléversement ; les images sont toujours republiées en WebP. */
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const NewUpload = z.strictObject({ kind: MediaKind });
export type NewUpload = z.infer<typeof NewUpload>;

/**
 * Autorisation de téléverser un fichier, directement du navigateur vers le stockage :
 * formulaire `multipart/form-data` à envoyer en POST à `url`, avec `fields` puis le
 * fichier dans le champ `file` (en dernier). Valable quelques minutes.
 */
export const UploadTicket = z.strictObject({
  id: z.uuid(),
  url: z.url(),
  fields: z.record(z.string(), z.string()),
  maxBytes: z.int(),
  expiresAt: z.iso.datetime(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

/**
 * Raison d'un refus, à expliquer à la personne : type de fichier, taille, ou image
 * illisible (fichier abîmé, dimensions démesurées) ; « absent » : rien n'a été téléversé.
 */
export const MediaRejection = z.enum(['format', 'taille', 'illisible', 'absent']);
export type MediaRejection = z.infer<typeof MediaRejection>;

export const MediaStatus = z.enum(['pending', 'processing', 'ready', 'rejected']);
export type MediaStatus = z.infer<typeof MediaStatus>;

/** Une image de la personne connectée, et où en est son traitement. */
export const Media = z.strictObject({
  id: z.uuid(),
  kind: MediaKind,
  status: MediaStatus,
  /** Adresse publique de l'image traitée (WebP, sans métadonnées) ; null tant qu'elle n'est pas prête. */
  url: z.url().nullable(),
  width: z.int().nullable(),
  height: z.int().nullable(),
  rejection: MediaRejection.nullable(),
});
export type Media = z.infer<typeof Media>;
