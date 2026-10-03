import { type AccountStep, CHARTER_VERSION } from '@plumiotheca/contracts';
import type { User } from '../users/user.entity.js';

/** Ce qu'il reste à faire à cette personne avant d'utiliser Plumiotheca. */
export function accountStep(user: User): AccountStep {
  if (user.ageBand === 'under-15') return 'age-locked';
  if (!user.handle || !user.ageBand) return 'first-visit';
  if (user.charterVersion !== CHARTER_VERSION) return 'charter';
  return 'ready';
}
