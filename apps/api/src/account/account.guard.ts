import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccountStep } from '@plumiotheca/contracts';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { ApiProblem } from '../common/problem.js';
import type { User } from '../users/user.entity.js';
import { IS_PUBLIC } from '../auth/decorators.js';
import { ALLOWED_STEPS } from './account.decorators.js';
import { accountStep } from './account-step.js';
import { AccountService, AGE_LOCKED_MESSAGE } from './account.service.js';

const REFUSALS: Record<Exclude<AccountStep, 'ready'>, [string, string]> = {
  'first-visit': ['premiere-visite-requise', 'Choisissez d’abord votre pseudonyme.'],
  charter: ['charte-a-accepter', 'La charte a changé : prenez un instant pour la relire.'],
  'age-locked': ['age-minimum', AGE_LOCKED_MESSAGE],
};

/**
 * Après l'authentification : rattache le compte de l'application (créé à la première
 * requête) et refuse toute route tant que le compte n'est pas prêt, sauf celles prévues.
 */
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accounts: AccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser; account?: User }>();
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      // Route publique : on rattache le compte s'il est prêt, sans jamais refuser.
      if (req.user) {
        const account = await this.accounts.find(req.user.id);
        if (account && accountStep(account) === 'ready') req.account = account;
      }
      return true;
    }
    if (!req.user) return true;
    const account = await this.accounts.ensure(req.user.id);
    req.account = account;
    const step = accountStep(account);
    if (step === 'ready') return true;
    const allowed = this.reflector.getAllAndOverride<AccountStep[]>(ALLOWED_STEPS, targets);
    if (allowed?.includes(step)) return true;
    const [type, detail] = REFUSALS[step];
    throw new ApiProblem(HttpStatus.FORBIDDEN, detail, type);
  }
}
