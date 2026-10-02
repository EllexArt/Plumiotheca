import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Config } from '../config/env.js';

/** Identifiant de requête fourni par un proxy, accepté seulement s'il est inoffensif. */
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Champs masqués partout où ils apparaissent (un niveau de profondeur) : les journaux ne
 * contiennent ni e-mail, ni secret, ni contenu écrit par les personnes.
 */
export const REDACTED_PATHS = [
  'email',
  'password',
  'token',
  'authorization',
  'cookie',
  'content',
  // Paramètres des requêtes SQL joints aux erreurs de la base.
  'parameters',
  '*.parameters',
  '*.email',
  '*.password',
  '*.token',
  '*.authorization',
  '*.cookie',
  '*.content',
  '*.headers.authorization',
  '*.headers.cookie',
];

export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const id = typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Chemin sans paramètres de requête (ils peuvent contenir des données personnelles). */
const pathOnly = (url: string | undefined) => (url ?? '').split('?')[0];

export function loggerParams(config: Config, destination?: DestinationStream): Params {
  const pretty = config.NODE_ENV === 'development' && !destination;
  return {
    pinoHttp: [
      {
        level: config.LOG_LEVEL,
        genReqId,
        redact: { paths: REDACTED_PATHS, censor: '[masqué]' },
        // Liste blanche : ni en-têtes, ni corps, ni adresse IP dans les journaux de requêtes.
        serializers: {
          req: (req: { id: string; method: string; url?: string }) => ({
            id: req.id,
            method: req.method,
            path: pathOnly(req.url),
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        autoLogging: { ignore: (req) => pathOnly(req.url) === '/api/health' },
        ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
      },
      ...(destination ? [destination] : []),
    ] as Params['pinoHttp'],
  };
}
