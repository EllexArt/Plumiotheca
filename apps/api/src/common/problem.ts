import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Problem, ValidationIssue } from '@plumiotheca/contracts';
import type { Request, Response } from 'express';
import { EntityNotFoundError } from 'typeorm';
import { pathOnly } from './logger.js';

/** Titres affichables, par statut. Le type sert d'identifiant stable côté web. */
const BY_STATUS: Record<number, { type: string; title: string }> = {
  400: { type: 'requete-invalide', title: 'Requête invalide' },
  401: { type: 'non-authentifie', title: 'Connexion nécessaire' },
  403: { type: 'interdit', title: 'Action non autorisée' },
  404: { type: 'introuvable', title: 'Ressource introuvable' },
  405: { type: 'methode-non-autorisee', title: 'Méthode non autorisée' },
  406: { type: 'format-non-disponible', title: 'Format de réponse non disponible' },
  409: { type: 'conflit', title: 'Conflit avec l’état actuel' },
  410: { type: 'supprime', title: 'Cette ressource n’existe plus' },
  413: { type: 'trop-volumineux', title: 'Contenu trop volumineux' },
  415: { type: 'format-non-pris-en-charge', title: 'Format non pris en charge' },
  422: { type: 'non-traitable', title: 'Demande impossible à traiter' },
  429: { type: 'trop-de-requetes', title: 'Trop de requêtes, réessayez dans un instant' },
};
const CLIENT_ERROR = { type: 'erreur-client', title: 'Requête refusée' };
const INTERNAL = { type: 'interne', title: 'Erreur interne, réessayez plus tard' };
const UNAVAILABLE = { type: 'indisponible', title: 'Service momentanément indisponible' };

/**
 * Erreur métier avec un message destiné à la personne (jamais de détail technique).
 * Les autres exceptions HTTP ne renvoient que le titre générique de leur statut.
 */
export class ApiProblem extends HttpException {
  constructor(
    status: HttpStatus,
    readonly detail: string,
    readonly problemType?: string,
    /** En-têtes de réponse, ex. WWW-Authenticate pour un 401. */
    readonly headers: Record<string, string> = {},
  ) {
    super(detail, status);
  }
}

/** Corps de requête refusé par un schéma : liste des champs en cause. */
export class ValidationFailed extends BadRequestException {
  constructor(readonly issues: ValidationIssue[]) {
    super('Validation');
  }

  static fromStandardSchema(issues: readonly StandardSchemaV1.Issue[]) {
    return new ValidationFailed(
      issues.map((issue) => ({
        path: (issue.path ?? []).map((p) => String(typeof p === 'object' ? p.key : p)).join('.'),
        message: issue.message,
        // Code zod quand il existe (« invalid_type », « unrecognized_keys »…).
        code: (issue as { code?: string }).code ?? 'invalide',
      })),
    );
  }
}

/**
 * Erreurs de lecture du corps de la requête (JSON illisible, trop volumineux, encodage…),
 * levées par body-parser avant NestJS. Toute autre erreur portant un statut (un client HTTP
 * vers Keycloak ou S3, par exemple) reste une erreur interne : elle ne concerne pas la personne.
 */
const bodyParserStatus = (e: unknown): number | undefined => {
  const { status, expose, type } = (e ?? {}) as {
    status?: unknown;
    expose?: unknown;
    type?: unknown;
  };
  const fromBodyParser =
    expose === true &&
    typeof type === 'string' &&
    /^(entity|charset|encoding|request|stream)\./.test(type);
  return fromBodyParser && typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
};

/**
 * Filtre global : toute erreur devient un « problem+json » (RFC 9457) sans pile d'appels,
 * requête SQL ni message interne. Les erreurs inattendues sont journalisées côté serveur.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    const bodyError = bodyParserStatus(exception);
    // Introuvable en base : 404, sans les critères de recherche que TypeORM met dans son message.
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof EntityNotFoundError
          ? HttpStatus.NOT_FOUND
          : (bodyError ?? HttpStatus.INTERNAL_SERVER_ERROR);

    // Les ApiProblem de 5xx sont journalisées là où elles naissent, avec leur cause.
    if (status >= 500 && !(exception instanceof ApiProblem)) {
      this.logger.error({ err: exception }, 'Erreur non gérée');
    } else if ((req as { log?: unknown }).log === undefined) {
      // Requête rejetée avant le journal des requêtes (corps illisible ou trop volumineux) :
      // tracée ici, sans le contenu reçu.
      this.logger.warn(
        { req: { id: req.id, method: req.method, path: pathOnly(req.originalUrl) }, status },
        'Corps de requête refusé',
      );
    }

    const known =
      status < 500 ? (BY_STATUS[status] ?? CLIENT_ERROR) : status === 503 ? UNAVAILABLE : INTERNAL;
    const body: Problem = { ...known, status };
    if (exception instanceof ApiProblem) {
      body.detail = exception.detail;
      if (exception.problemType) body.type = exception.problemType;
      if (!res.headersSent) res.set(exception.headers);
    }
    if (exception instanceof ValidationFailed) {
      body.type = 'validation';
      body.errors = exception.issues;
    }
    if (req.id) body.requestId = req.id;

    if (!res.headersSent) {
      res.status(status).type('application/problem+json').json(body);
    }
  }
}
