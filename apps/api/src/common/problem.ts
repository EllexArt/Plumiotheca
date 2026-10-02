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

/** Titres affichables, par statut. Le type sert d'identifiant stable côté web. */
const BY_STATUS: Record<number, { type: string; title: string }> = {
  400: { type: 'requete-invalide', title: 'Requête invalide' },
  401: { type: 'non-authentifie', title: 'Connexion nécessaire' },
  403: { type: 'interdit', title: 'Action non autorisée' },
  404: { type: 'introuvable', title: 'Ressource introuvable' },
  405: { type: 'methode-non-autorisee', title: 'Méthode non autorisée' },
  409: { type: 'conflit', title: 'Conflit avec l’état actuel' },
  413: { type: 'trop-volumineux', title: 'Contenu trop volumineux' },
  415: { type: 'format-non-pris-en-charge', title: 'Format non pris en charge' },
  429: { type: 'trop-de-requetes', title: 'Trop de requêtes, réessayez dans un instant' },
};
const INTERNAL = { type: 'interne', title: 'Erreur interne, réessayez plus tard' };

/**
 * Erreur métier avec un message destiné à la personne (jamais de détail technique).
 * Les autres exceptions HTTP ne renvoient que le titre générique de leur statut.
 */
export class ApiProblem extends HttpException {
  constructor(
    status: HttpStatus,
    readonly detail: string,
    readonly problemType?: string,
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

/** Erreurs d'Express (corps illisible, trop volumineux…) : portent un statut 4xx. */
const clientErrorStatus = (e: unknown): number | undefined => {
  const status = (e as { status?: unknown; type?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
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

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (clientErrorStatus(exception) ?? HttpStatus.INTERNAL_SERVER_ERROR);

    if (status >= 500) {
      this.logger.error({ err: exception }, 'Erreur non gérée');
    }

    const known = status < 500 ? (BY_STATUS[status] ?? BY_STATUS[400]) : INTERNAL;
    const body: Problem = { ...known!, status };
    if (exception instanceof ApiProblem) {
      body.detail = exception.detail;
      if (exception.problemType) body.type = exception.problemType;
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
