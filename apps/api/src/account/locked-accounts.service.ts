import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan } from 'typeorm';
import { KeycloakAdminService } from '../auth/keycloak-admin.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { User } from '../users/user.entity.js';

/** Délai avant la suppression d'un compte verrouillé (moins de 15 ans, décision 45). */
export const LOCKED_ACCOUNT_DAYS = 30;
const DAY = 24 * 3_600_000;
/** Comptes traités par passage (la tâche reprend le lendemain s'il en reste). */
const BATCH = 100;

/**
 * Comptes verrouillés (réponse « moins de 15 ans ») : supprimés 30 jours après, dans
 * Keycloak (e-mail, mot de passe) puis dans l'application (#141). Le refus reste ainsi
 * mémorisé 30 jours, le temps d'empêcher de recommencer aussitôt avec un autre âge.
 */
@Injectable()
export class LockedAccountsService implements OnModuleInit {
  private readonly logger = new Logger('Comptes verrouillés');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly keycloak: KeycloakAdminService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.define({
      name: 'comptes-verrouilles',
      // Chaque nuit, à une minute peu chargée.
      cron: '17 3 * * *',
      handle: async () => {
        await this.purge();
      },
    });
  }

  /**
   * Supprime les comptes verrouillés depuis plus de 30 jours. Keycloak d'abord : si sa
   * suppression échoue, la ligne reste et la tâche est rejouée (jamais un compte Keycloak
   * orphelin, qui pourrait recommencer l'accueil). Renvoie le nombre de comptes supprimés.
   */
  async purge(now = new Date()): Promise<number> {
    const users = this.db.getRepository(User);
    const expired = await users.find({
      where: {
        ageBand: 'under-15',
        ageLockedAt: LessThan(new Date(now.getTime() - LOCKED_ACCOUNT_DAYS * DAY)),
      },
      order: { ageLockedAt: 'ASC' },
      take: BATCH,
    });
    for (const user of expired) {
      if (user.keycloakId) await this.keycloak.deleteUser(user.keycloakId);
      // Conditionnelle : seulement si le compte est toujours verrouillé.
      await users.delete({ id: user.id, ageBand: 'under-15' });
    }
    if (expired.length) this.logger.log(`${expired.length} compte(s) verrouillé(s) supprimé(s)`);
    return expired.length;
  }
}
