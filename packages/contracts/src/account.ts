import { z } from 'zod';
import { DeclaredAge } from './domain.js';

// Pseudonyme public (@handle) : 3 à 30 caractères, lettres (accents compris), chiffres,
// point, tiret, tiret bas. L'unicité ignore la casse et les accents (« Élise » = « elise »).
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

export const Handle = z
  .string()
  .trim()
  .min(HANDLE_MIN)
  .max(HANDLE_MAX)
  .regex(/^[\p{L}\p{N}._-]+$/u, {
    message: 'Lettres, chiffres, point, tiret et tiret bas uniquement.',
  })
  .refine((h) => /[\p{L}\p{N}]/u.test(h), {
    message: 'Au moins une lettre ou un chiffre.',
  });

/** Première visite : pseudonyme, âge déclaré, charte acceptée (version lue). */
export const FirstVisit = z.strictObject({
  handle: Handle,
  age: DeclaredAge,
  charterVersion: z.string().min(1).max(20),
});
export type FirstVisit = z.infer<typeof FirstVisit>;

export const AcceptCharter = z.strictObject({ charterVersion: z.string().min(1).max(20) });
export type AcceptCharter = z.infer<typeof AcceptCharter>;

export const ChangeHandle = z.strictObject({ handle: Handle });
export type ChangeHandle = z.infer<typeof ChangeHandle>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Champs de profil modifiables (tous facultatifs ; null efface). */
export const UpdateProfile = z.strictObject({
  displayName: optionalText(50),
  pronouns: optionalText(30),
  bio: optionalText(2000),
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
