import { z } from 'zod';
import { DeclaredAge } from './domain.js';

// Pseudonyme public (@handle) : 3 à 30 caractères, lettres latines (accents compris),
// chiffres, point, tiret, tiret bas. L'unicité ignore la casse et les accents
// (« Élise » = « elise »). Alphabet latin seulement pour la v1 (décision 43) : pas de
// sosies venus d'autres alphabets (« аdmin » cyrillique), pas de caractères invisibles,
// lecture claire par les lecteurs d'écran.
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
/** Délai minimal entre deux changements de pseudonyme. */
export const HANDLE_CHANGE_DAYS = 30;
/** Un pseudonyme abandonné n'est réattribuable qu'après ce délai (anti-usurpation). */
export const HANDLE_RELEASE_DAYS = 90;

/** Forme de comparaison d'un pseudonyme : sans accents, en minuscules. */
export function handleKey(handle: string): string {
  return handle.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Lettres latines accentuées (Latin-1 et Latin étendu A/B, sans × ni ÷ ni les clics
 * U+01C0-U+01C3 qui imitent « l » et « ! »), chiffres, `._-`.
 */
const HANDLE_CHARS = /^[A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u01BF\u01C4-\u024F._-]+$/;

export const Handle = z
  .string()
  .trim()
  // Forme composée : un « é » collé en deux morceaux (e + accent) devient un seul caractère.
  .transform((h) => h.normalize('NFC'))
  .pipe(
    z
      .string()
      .min(HANDLE_MIN)
      .max(HANDLE_MAX)
      .regex(HANDLE_CHARS, {
        message: 'Lettres (accents compris), chiffres, point, tiret et tiret bas uniquement.',
      })
      .refine((h) => /[A-Za-z0-9\u00C0-\u024F]/.test(h), {
        message: 'Au moins une lettre ou un chiffre.',
      })
      // Certaines lettres s'écrivent en deux une fois normalisées (« ǆ » → « dz ») :
      // la forme de comparaison doit tenir, elle aussi, en 30 caractères.
      .refine((h) => handleKey(h).length <= HANDLE_MAX, {
        message: `${HANDLE_MAX} caractères au maximum.`,
      }),
  );

/**
 * Première visite : âge déclaré, puis pseudonyme et charte acceptée (version lue). « Moins
 * de 15 ans » : la réponse seule (minimisation) ; le compte est verrouillé sans pseudonyme
 * ni charte, et le pseudonyme n'est jamais envoyé.
 */
export const FirstVisit = z.discriminatedUnion(
  'age',
  [
    z.strictObject({ age: z.literal(DeclaredAge.enum['under-15']) }),
    z.strictObject({
      age: DeclaredAge.exclude(['under-15']),
      handle: Handle,
      charterVersion: z.string().min(1).max(20),
    }),
  ],
  // Âge absent ou inconnu : message explicite plutôt que « Entrée invalide ».
  { error: `Âge attendu : ${DeclaredAge.options.join(', ')}.` },
);
export type FirstVisit = z.infer<typeof FirstVisit>;

export const AcceptCharter = z.strictObject({ charterVersion: z.string().min(1).max(20) });
export type AcceptCharter = z.infer<typeof AcceptCharter>;

export const ChangeHandle = z.strictObject({ handle: Handle });
export type ChangeHandle = z.infer<typeof ChangeHandle>;

/** Texte court sur une ligne : ni caractère de contrôle, ni caractère invisible de mise en forme. */
const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}]*$/u, { message: 'Caractères invisibles ou de contrôle interdits.' });

/** Texte libre : retours à la ligne permis, autres caractères de contrôle interdits. */
const freeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[\n\r\t\P{Cc}]*$/u, { message: 'Caractères de contrôle interdits.' })
    // Inversions du sens d'écriture et espaces invisibles (les émojis composés restent permis).
    .regex(/^[^\u200B\u202A-\u202E\u2066-\u2069]*$/u, {
      message: 'Caractères invisibles interdits.',
    });

/** Champs de profil modifiables (tous facultatifs ; null efface). */
export const UpdateProfile = z.strictObject({
  displayName: singleLine(50).nullable().optional(),
  pronouns: singleLine(30).nullable().optional(),
  bio: freeText(2000).nullable().optional(),
});
export type UpdateProfile = z.infer<typeof UpdateProfile>;

/** Ce qu'il reste à faire avant d'utiliser Plumiotheca. */
export const AccountStep = z.enum(['first-visit', 'charter', 'age-locked', 'ready']);
export type AccountStep = z.infer<typeof AccountStep>;

/** Mon compte, vu par moi seule (jamais l'identifiant Keycloak ni l'e-mail). */
export const MyAccount = z.strictObject({
  step: AccountStep,
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  pronouns: z.string().nullable(),
  bio: z.string().nullable(),
  ageBand: z.enum(['15-17', '18+']).nullable(),
  charterVersion: z.string().nullable(),
  /** Date à partir de laquelle le pseudonyme peut de nouveau changer (null : maintenant). */
  handleChangeableFrom: z.iso.datetime().nullable(),
});
export type MyAccount = z.infer<typeof MyAccount>;

/** Profil public : ni e-mail, ni identifiant Keycloak, ni âge. */
export const PublicProfile = z.strictObject({
  handle: z.string(),
  displayName: z.string().nullable(),
  pronouns: z.string().nullable(),
  bio: z.string().nullable(),
});
export type PublicProfile = z.infer<typeof PublicProfile>;

export const HandleAvailability = z.strictObject({ available: z.boolean() });
export type HandleAvailability = z.infer<typeof HandleAvailability>;
