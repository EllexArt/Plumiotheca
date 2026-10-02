import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@plumiotheca/contracts';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC = 'plumiotheca:public';
export const REQUIRED_ROLES = 'plumiotheca:roles';

/** Route accessible sans connexion. Toutes les autres l'exigent (refus par défaut). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Route réservée à l'un de ces rôles. Pour la modération et l'administration, le jeton doit
 * aussi prouver une double authentification faite pendant cette connexion.
 */
export const RequireRoles = (...roles: [Role, ...Role[]]) => SetMetadata(REQUIRED_ROLES, roles);

/** La personne connectée (route non publique uniquement). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
