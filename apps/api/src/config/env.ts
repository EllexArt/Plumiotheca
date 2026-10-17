import { z } from 'zod';

const DEV_ISSUER = 'http://localhost:8080/realms/plumiotheca';

const DEV_ORIGINS = ['http://localhost:5173'];

/** Liste d'origines séparées par des virgules, chacune réduite à « schéma://hôte[:port] ». */
const origins = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z.url({ protocol: /^https?$/ }).refine((o) => new URL(o).origin === o, {
        message: 'Origine attendue, sans chemin ni barre finale (ex. https://plumiotheca.fr)',
      }),
    ),
  );

export const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Interface d'écoute : 127.0.0.1 par défaut, 0.0.0.0 dans un conteneur. */
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Origines autorisées à appeler l'API depuis un navigateur. */
    CORS_ORIGINS: origins.optional(),
    /**
     * Nombre de proxys inverses devant l'API (adresse IP réelle du client, pour la
     * limitation de débit). Obligatoire en production : 0 si l'API est exposée directement.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional(),
    /**
     * Requêtes autorisées par minute, par compte (par adresse IP sans compte) ; certaines
     * routes ont leur propre limite.
     */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    /** Plafond large par adresse IP, avant l'authentification (adresses partagées). */
    RATE_LIMIT_IP_PER_MINUTE: z.coerce.number().int().min(1).default(1200),
    /** Émetteur des jetons (claim « iss »), tel que le voit le navigateur. Obligatoire en production. */
    KEYCLOAK_ISSUER: z.url({ protocol: /^https?$/ }).optional(),
    /**
     * Adresse des clés publiques, si l'API les lit par un autre chemin que le navigateur
     * (ex. http://keycloak:8080/... dans un conteneur). Par défaut : celle de l'émetteur.
     */
    KEYCLOAK_JWKS_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Compte de service de l'API (identifiants client) : suppression des comptes Keycloak. */
    KEYCLOAK_ADMIN_CLIENT_ID: z.string().min(1).default('api-administration'),
    /** Secret de ce compte (écrit par « pnpm infra:up » en développement). Obligatoire en production. */
    KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(1).optional(),
    DB_HOST: z.string().min(1).default('localhost'),
    /** 5433 : port de la base de l'infrastructure de développement (infra/). */
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5433),
    DB_USERNAME: z.string().min(1).default('plumiotheca'),
    /** Obligatoire en production. */
    DB_PASSWORD: z.string().optional(),
    DB_NAME: z.string().min(1).default('plumiotheca'),
    DB_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Nouvelles tentatives de connexion au démarrage avant d'abandonner (2 s d'écart). */
    DB_CONNECT_RETRIES: z.coerce.number().int().min(0).max(30).default(5),
    /** Applique les migrations au démarrage (par défaut en développement seulement). */
    DB_MIGRATE_ON_START: z.enum(['true', 'false']).optional(),
    /** File de tâches en arrière-plan (pg-boss) : active par défaut, sauf dans les tests. */
    JOBS_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    /** Moteur de recherche (Meilisearch), interrogé par l'API seulement (#82). */
    MEILI_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:7700'),
    /** Clé de Meilisearch ; jamais envoyée au navigateur. Obligatoire en production. */
    MEILI_MASTER_KEY: z.string().min(1).optional(),
    /** Index des histoires publiées (un autre nom pour les tests). */
    SEARCH_INDEX: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .default('histoires'),
    /** Stockage des images (S3 ; Garage en développement). */
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).default('http://localhost:3900'),
    /**
     * Adresse du stockage vue par le navigateur, qui y téléverse directement (#18) ; par
     * défaut celle de l'API.
     */
    S3_UPLOAD_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    S3_REGION: z.string().min(1).default('garage'),
    /** Images traitées, publiques, servies depuis MEDIA_PUBLIC_URL. */
    S3_BUCKET: z.string().min(1).default('medias'),
    /** Téléversements bruts, privés, effacés dès le traitement (et au plus tard après un jour). */
    S3_INCOMING_BUCKET: z.string().min(1).default('medias-entrants'),
    /** Écrits par « pnpm infra:up » en développement. Obligatoires en production. */
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    /**
     * Origine publique des images traitées : un domaine séparé de celui du site (#18).
     * En développement, le site web de Garage pour le bucket « medias ».
     */
    MEDIA_PUBLIC_URL: z
      .url({ protocol: /^https?$/ })
      .refine((u) => new URL(u).origin === u, {
        message:
          'Origine attendue, sans chemin ni barre finale (ex. https://medias.plumiotheca.fr)',
      })
      .default('http://medias.web.garage.localhost:3902'),
    /** Audience exigée dans les jetons (client Keycloak de l'API). */
    JWT_AUDIENCE: z.string().min(1).default('api'),
    /** Clients autorisés à appeler l'API (claim « azp »), séparés par des virgules. */
    JWT_CLIENTS: z
      .string()
      .default('web')
      .transform((s) =>
        s
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      ),
  })
  .superRefine((env, ctx) => {
    // Le compte de service tire l'adresse du serveur et le realm de ces adresses (#141).
    for (const key of ['KEYCLOAK_ISSUER', 'KEYCLOAK_JWKS_URL'] as const) {
      if (env[key] && !/\/realms\/[^/]+/.test(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Adresse de realm Keycloak attendue (…/realms/<realm>…)',
        });
      }
    }
    if (env.NODE_ENV !== 'production') return;
    if (!env.CORS_ORIGINS?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Obligatoire en production',
      });
    }
    if (!env.DB_PASSWORD) {
      ctx.addIssue({ code: 'custom', path: ['DB_PASSWORD'], message: 'Obligatoire en production' });
    }
    if (!env.KEYCLOAK_ISSUER) {
      ctx.addIssue({
        code: 'custom',
        path: ['KEYCLOAK_ISSUER'],
        message: 'Obligatoire en production',
      });
    }
    if (env.TRUST_PROXY === undefined) {
      ctx.addIssue({ code: 'custom', path: ['TRUST_PROXY'], message: 'Obligatoire en production' });
    }
    for (const key of ['MEILI_MASTER_KEY', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'Obligatoire en production' });
    }
    // Sans lui, les comptes verrouillés ne seraient jamais supprimés de Keycloak (#141).
    if (!env.KEYCLOAK_ADMIN_CLIENT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['KEYCLOAK_ADMIN_CLIENT_SECRET'],
        message: 'Obligatoire en production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    CORS_ORIGINS: env.CORS_ORIGINS ?? DEV_ORIGINS,
    TRUST_PROXY: env.TRUST_PROXY ?? 0,
    DB_PASSWORD: env.DB_PASSWORD ?? '',
    DB_MIGRATE_ON_START: env.DB_MIGRATE_ON_START
      ? env.DB_MIGRATE_ON_START === 'true'
      : env.NODE_ENV === 'development',
    KEYCLOAK_ISSUER: env.KEYCLOAK_ISSUER ?? DEV_ISSUER,
    S3_UPLOAD_ENDPOINT: env.S3_UPLOAD_ENDPOINT ?? env.S3_ENDPOINT,
    KEYCLOAK_JWKS_URL:
      env.KEYCLOAK_JWKS_URL ?? `${env.KEYCLOAK_ISSUER ?? DEV_ISSUER}/protocol/openid-connect/certs`,
  }));

export type Config = z.output<typeof Env>;

/**
 * Lit et valide la configuration. En cas d'erreur, le message liste les variables
 * concernées sans jamais afficher leur valeur (elles peuvent contenir des secrets).
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = Env.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')} : ${i.message}`);
    throw new Error(`Configuration invalide :\n${lines.join('\n')}`);
  }
  return result.data;
}
