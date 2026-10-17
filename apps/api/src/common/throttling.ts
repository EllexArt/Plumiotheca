import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/** Limiteur large par adresse IP, avant l’authentification (inondation, jetons forgés). */
export const FLOOD = 'inondation';

/**
 * Premier étage, avant l’authentification : un plafond large par adresse IP. Il freine une
 * inondation, même avec des jetons forgés (refusés ensuite), sans gêner les personnes qui
 * partagent une adresse (lycée, médiathèque, opérateur mobile).
 */
@Injectable()
export class FloodGuard extends ThrottlerGuard {
  override async onModuleInit() {
    await super.onModuleInit();
    this.throttlers = this.throttlers.filter((t) => t.name === FLOOD);
  }

  /** Un seul compteur par adresse, toutes routes confondues (et non un par route). */
  protected override generateKey(_context: ExecutionContext, tracker: string, name: string) {
    return `${name}:${tracker}`;
  }
}

/**
 * Second étage, après l’authentification (#137) : les limites de chaque route, comptées par
 * compte quand la requête porte un jeton valide, par adresse IP sinon. Deux comptes derrière
 * la même adresse ne se partagent donc pas leur quota.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  override async onModuleInit() {
    await super.onModuleInit();
    this.throttlers = this.throttlers.filter((t) => t.name !== FLOOD);
  }

  protected override async getTracker(req: Request & { user?: { id?: string } }): Promise<string> {
    const account = req.user?.id;
    return account ? `compte:${account}` : `ip:${await super.getTracker(req)}`;
  }
}
