import { z } from 'zod';

/**
 * E-mail récapitulatif des notifications (#33) : jamais (par défaut), chaque jour ou chaque
 * semaine. L’envoi arrive avec les e-mails transactionnels (#71) ; le choix est gardé d’ici là.
 */
export const EmailDigest = z.enum(['never', 'daily', 'weekly']);
export type EmailDigest = z.infer<typeof EmailDigest>;

export const SetEmailDigest = z.strictObject({ emailDigest: EmailDigest });
export type SetEmailDigest = z.infer<typeof SetEmailDigest>;

/** Durée de conservation d’une notification, lue ou non. */
export const NOTIFICATION_DAYS = 90;

const Base = { id: z.uuid(), createdAt: z.iso.datetime(), read: z.boolean() };
const StoryRef = z.strictObject({ id: z.uuid(), title: z.string(), language: z.string() });

/**
 * Une notification : un nouveau chapitre d’une histoire de Mes lectures (#33), ou de
 * nouvelles histoires pour une recherche enregistrée (#80, au plus une par jour et par
 * recherche).
 */
export const NotificationItem = z.discriminatedUnion('kind', [
  z.strictObject({
    ...Base,
    kind: z.literal('new_chapter'),
    story: StoryRef,
    chapter: z.strictObject({
      id: z.uuid(),
      /** Numéro parmi les chapitres publiés, au moment de la lecture de la liste. */
      number: z.int(),
      title: z.string(),
    }),
  }),
  z.strictObject({
    ...Base,
    kind: z.literal('saved_search'),
    search: z.strictObject({
      id: z.uuid(),
      name: z.string(),
      /** Paramètres de la recherche (adresse d'Explorer). */
      query: z.string(),
      /** Alerte toujours active : sinon, plus de bouton « Ne plus m'alerter ». */
      alerts: z.boolean(),
    }),
    /** Nouvelles histoires ce jour-là, et les trois premières. */
    count: z.int(),
    stories: z.array(StoryRef),
  }),
]);
export type NotificationItem = z.infer<typeof NotificationItem>;

export const NotificationPage = z.strictObject({
  items: z.array(NotificationItem),
  /** À repasser en `apres` pour la page suivante ; null : dernière page. */
  nextCursor: z.uuid().nullable(),
});
export type NotificationPage = z.infer<typeof NotificationPage>;

export const NotificationQuery = z.strictObject({
  apres: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationQuery = z.infer<typeof NotificationQuery>;

export const UnreadNotifications = z.strictObject({ unread: z.int() });
export type UnreadNotifications = z.infer<typeof UnreadNotifications>;
