import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccountStep } from '@plumiotheca/contracts';
import type { User } from '../users/user.entity.js';

export const ALLOWED_STEPS = 'plumiotheca:allowed-steps';

/**
 * Route accessible avant que le compte soit prêt (première visite, charte à accepter,
 * compte verrouillé). Par défaut, toute route connectée exige un compte prêt.
 */
export const AllowAccountSteps = (...steps: AccountStep[]) => SetMetadata(ALLOWED_STEPS, steps);

/** Sur une route publique : le compte de la personne connectée et prête, sinon null. */
export const OptionalAccount = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ account?: User }>().account ?? null,
);

/** Le compte de la personne connectée dans l'application (route non publique). */
export const CurrentAccount = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ account: User }>().account,
);
