import { z } from 'zod';
import { Completion, MajorWarning, Rating, StoryStatus } from './domain.js';

/** Texte sur une ligne, sans caractère de contrôle ni caractère invisible. */
const line = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}]*$/u, { message: 'Caractères invisibles ou de contrôle interdits.' });

/** Langue de l'histoire (BCP 47 : « fr », « en », « pt-BR »). */
export const Language = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2}|-[A-Za-z]{4})?$/, {
  message: 'Code de langue attendu (ex. « fr »).',
});

/** Tag libre saisi par la personne qui écrit (normalisé côté API vers un tag existant). */
export const TagName = line(1, 100);

const MAX_TAGS = 30;
const Tags = z.array(TagName).max(MAX_TAGS, { message: `${MAX_TAGS} tags au maximum.` });

const Warnings = z
  .array(MajorWarning)
  .max(4)
  .refine((w) => new Set(w).size === w.length, { message: 'Avertissement en double' });

/** Nouvelle histoire : toujours un brouillon ; classement et avertissements à choisir avant publication. */
export const NewStory = z.strictObject({
  title: line(1, 200),
  summary: z.string().trim().max(4_000).default(''),
  language: Language,
  rating: Rating.nullable().optional(),
  completion: Completion.optional(),
  majorWarnings: Warnings.nullable().optional(),
  tags: Tags.optional(),
});
export type NewStory = z.infer<typeof NewStory>;

/** Champs modifiables (liste blanche) : ni identifiant, ni autrice ou auteur, ni statut, ni compteur. */
export const UpdateStory = NewStory.partial().extend({
  summary: z.string().trim().max(4_000).optional(),
});
export type UpdateStory = z.infer<typeof UpdateStory>;

export const Author = z.strictObject({
  handle: z.string(),
  displayName: z.string().nullable(),
});

/** Une histoire dans une liste : jamais le texte des chapitres. */
export const StorySummary = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  author: Author,
  language: z.string(),
  rating: Rating.nullable(),
  status: StoryStatus,
  completion: Completion,
  majorWarnings: z.array(MajorWarning).nullable(),
  tags: z.array(z.string()),
  wordCount: z.int(),
  /** Chapitres publiés. */
  chapterCount: z.int(),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type StorySummary = z.infer<typeof StorySummary>;

export const StoryPage = z.strictObject({
  items: z.array(StorySummary),
  /** À repasser en `apres` pour la page suivante ; null : dernière page. */
  nextCursor: z.string().nullable(),
});
export type StoryPage = z.infer<typeof StoryPage>;

/** Filtres de la liste publique. */
export const StoryQuery = z.strictObject({
  apres: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
  langue: Language.optional(),
  classement: Rating.optional(),
  /** Avertissements majeurs à exclure, séparés par des virgules (« Mes limites »). */
  exclure: z
    .string()
    .max(200)
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(MajorWarning))
    .optional(),
  /** Histoires d'une autrice ou d'un auteur (pseudonyme). */
  pseudonyme: z.string().max(30).optional(),
});
export type StoryQuery = z.infer<typeof StoryQuery>;

export const ChapterSummary = z.strictObject({
  id: z.uuid(),
  /** Numéro affiché (1, 2, 3…) : rang parmi les chapitres visibles. */
  number: z.int(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
  wordCount: z.int(),
  publishedAt: z.iso.datetime().nullable(),
});
export type ChapterSummary = z.infer<typeof ChapterSummary>;

export const StoryDetail = StorySummary.extend({ chapters: z.array(ChapterSummary) });
export type StoryDetail = z.infer<typeof StoryDetail>;

/** Chapitre publié, tel que les lecteurs le lisent. */
export const ChapterRead = z.strictObject({
  id: z.uuid(),
  storyId: z.uuid(),
  number: z.int(),
  title: z.string(),
  /** Révision lue : la reprise de lecture s'accroche aux identifiants de blocs. */
  revisionId: z.uuid(),
  content: z.unknown(),
  wordCount: z.int(),
  readingMinutes: z.int(),
  publishedAt: z.iso.datetime(),
  previousId: z.uuid().nullable(),
  nextId: z.uuid().nullable(),
});
export type ChapterRead = z.infer<typeof ChapterRead>;

export const NewChapter = z.strictObject({ title: line(0, 200).default('') });
export type NewChapter = z.infer<typeof NewChapter>;

export const UpdateChapter = z.strictObject({ title: line(0, 200) });
export type UpdateChapter = z.infer<typeof UpdateChapter>;

/** Brouillon vu par la personne qui écrit. */
export const ChapterDraft = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
  draft: z.unknown(),
  draftVersion: z.int(),
  wordCount: z.int(),
});
export type ChapterDraft = z.infer<typeof ChapterDraft>;

/**
 * Sauvegarde du brouillon : document TipTap (validé par @plumiotheca/editor-schema) et
 * version lue ; une version dépassée renvoie 409.
 */
export const SaveDraft = z.strictObject({
  draft: z.unknown(),
  version: z.int().min(1),
});
export type SaveDraft = z.infer<typeof SaveDraft>;

export const SavedDraft = z.strictObject({
  draftVersion: z.int(),
  wordCount: z.int(),
  /**
   * Document tel qu'enregistré, si le serveur l'a complété (identifiants de blocs ajoutés) :
   * l'éditeur doit le reprendre pour que les identifiants restent stables. Null sinon.
   */
  draft: z.unknown().nullable(),
});
export type SavedDraft = z.infer<typeof SavedDraft>;

/** Nouvel ordre : exactement tous les chapitres de l'histoire, une fois chacun. */
export const ReorderChapters = z.strictObject({
  chapterIds: z
    .array(z.uuid())
    .min(1)
    .max(2_000)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Chapitre en double' }),
});
export type ReorderChapters = z.infer<typeof ReorderChapters>;
