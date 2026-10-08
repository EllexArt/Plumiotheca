import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Config } from '../config/env.js';

/** Identifiant de requête fourni par un proxy, accepté seulement s'il est inoffensif. */
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Clés jamais écrites dans les journaux : e-mails, secrets, contenus, données SQL. */
const SENSITIVE_KEYS = [
  'email',
  'Email',
  'mail',
  'password',
  'secret',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'idToken',
  'id_token',
  'apiKey',
  'authorization',
  'cookie',
  'content',
  'body',
  'text',
  'html',
  // Paramètres et détails des requêtes SQL joints aux erreurs de la base.
  'parameters',
  'detail',
];

/** Chaque clé sensible est masquée jusqu'à trois niveaux de profondeur. */
export const REDACTED_PATHS = SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

type WithId = IncomingMessage & { id?: string };

/**
 * Premier middleware de l'application : attribue l'identifiant de requête avant toute
 * lecture du corps, pour que même un JSON illisible ou trop volumineux soit traçable.
 * L'en-tête X-Request-Id entrant n'est repris que derrière un proxy de confiance.
 */
export function requestId(config: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['x-request-id'];
    const fromProxy =
      config.TRUST_PROXY > 0 && typeof header === 'string' && REQUEST_ID.test(header);
    const id = fromProxy ? header : randomUUID();
    (req as WithId).id = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}

const genReqId = (req: WithId, res: ServerResponse) => {
  if (req.id) return req.id;
  const id = randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
};

type LoggedError = {
  name?: string;
  message?: string;
  code?: unknown;
  stack?: string;
  driverError?: { code?: string; constraint?: string; table?: string };
};

/**
 * Erreur telle qu'elle est journalisée. Pour une erreur de PostgreSQL, ni message ni pile :
 * ils peuvent citer la valeur reçue (« invalid input syntax for type uuid: "…" ») ; on garde
 * le code SQLSTATE, la contrainte et la table, qui suffisent au diagnostic.
 */
export function describeError(err: LoggedError) {
  if (err.driverError) {
    return {
      type: err.name,
      code: err.driverError.code,
      constraint: err.driverError.constraint,
      table: err.driverError.table,
    };
  }
  return { type: err.name, message: err.message, code: err.code, stack: err.stack };
}

/**
 * Pseudonyme qu'une personne vérifie avant de le choisir (première visite) : il n'est pas
 * encore public et peut appartenir à un compte ensuite déclaré « moins de 15 ans » (#158).
 */
// Insensible à la casse et aux barres multiples, comme le routeur (Express ignore la casse).
const CHECKED_HANDLE = /^(\/api\/+pseudonymes\/+)[^/]+(\/+disponibilite\/*)$/i;

/**
 * Chemin journalisé : sans paramètres de requête (ils peuvent contenir des données
 * personnelles), et sans le pseudonyme dont on vérifie la disponibilité.
 */
export const pathOnly = (url: string | undefined) =>
  (url ?? '').split('?')[0]!.replace(CHECKED_HANDLE, '$1[masqué]$2');

export function loggerParams(config: Config, destination?: DestinationStream): Params {
  const pretty = config.NODE_ENV === 'development' && !destination;
  return {
    pinoHttp: [
      {
        level: config.LOG_LEVEL,
        genReqId,
        redact: { paths: REDACTED_PATHS, censor: '[masqué]' },
        // Listes blanches : ni en-têtes, ni corps, ni adresse IP, ni détail d'erreur
        // de la base (valeurs en double, paramètres) dans les journaux.
        serializers: {
          req: (req: { id: string; method: string; url?: string }) => ({
            id: req.id,
            method: req.method,
            path: pathOnly(req.url),
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          err: describeError,
        },
        autoLogging: { ignore: (req) => pathOnly(req.url) === '/api/health' },
        ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
      },
      ...(destination ? [destination] : []),
    ] as Params['pinoHttp'],
  };
}
