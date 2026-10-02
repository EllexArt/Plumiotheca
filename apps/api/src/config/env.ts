import { z } from 'zod';

const DEV_ISSUER = 'http://localhost:8080/realms/plumiotheca';

const DEV_ORIGINS = [
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5002',
  'http://localhost:5173',
];

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
    /** Requêtes autorisées par minute et par adresse IP. */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    /** Émetteur des jetons (claim « iss »), tel que le voit le navigateur. Obligatoire en production. */
    KEYCLOAK_ISSUER: z.url({ protocol: /^https?$/ }).optional(),
    /**
     * Adresse des clés publiques, si l'API les lit par un autre chemin que le navigateur
     * (ex. http://keycloak:8080/... dans un conteneur). Par défaut : celle de l'émetteur.
     */
    KEYCLOAK_JWKS_URL: z.url({ protocol: /^https?$/ }).optional(),
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
    if (env.NODE_ENV !== 'production') return;
    if (!env.CORS_ORIGINS?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Obligatoire en production',
      });
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
  })
  .transform((env) => ({
    ...env,
    CORS_ORIGINS: env.CORS_ORIGINS ?? DEV_ORIGINS,
    TRUST_PROXY: env.TRUST_PROXY ?? 0,
    KEYCLOAK_ISSUER: env.KEYCLOAK_ISSUER ?? DEV_ISSUER,
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
