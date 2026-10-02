import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role, ROLES_WITH_MFA } from '@plumiotheca/contracts';
import type { Request } from 'express';
import { ApiProblem } from '../common/problem.js';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC, REQUIRED_ROLES } from './decorators.js';
import { TokenVerifier } from './token-verifier.js';

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i;

/** Garde globale : toute route exige un jeton valide, sauf celles marquées @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new ApiProblem(HttpStatus.UNAUTHORIZED, 'Connectez-vous pour continuer.', undefined, {
        'WWW-Authenticate': 'Bearer realm="plumiotheca"',
      });
    }
    const user = await this.verifier.verify(token);
    req.user = user;

    const required = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, targets);
    if (required?.length) {
      const granted = required.filter((role) => user.roles.includes(role));
      if (!granted.length) {
        throw new ApiProblem(HttpStatus.FORBIDDEN, 'Cette action est réservée à l’équipe.');
      }
      // Un rôle sans exigence de MFA suffit ; sinon, le second facteur doit avoir été
      // validé pendant cette connexion (une session plus ancienne ne suffit pas).
      const needsMfa = granted.every((role) => ROLES_WITH_MFA.includes(role));
      if (needsMfa && !user.mfa) {
        throw new ApiProblem(
          HttpStatus.FORBIDDEN,
          'Reconnectez-vous avec la double authentification pour accéder à cet espace.',
          'mfa-requise',
        );
      }
    }
    return true;
  }
}
