import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan } from 'typeorm';
import { KeycloakAdminService } from '../auth/keycloak-admin.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { User } from '../users/user.entity.js';

/** Délai avant la suppression d'un compte verrouillé (moins de 15 ans, décision 45). */
export const LOCKED_ACCOUNT_DAYS = 30;
/**
 * Délai entre la désactivation et la suppression : au-delà de la durée de vie d'un jeton
 * d'accès (5 minutes), aucun jeton émis avant la désactivation n'est encore valide.
 */
export const PURGE_DELAY_MS = 3_600_000;
const DAY = 24 * 3_600_000;
const BATCH = 50;
/** Temps de travail d'un passage (la file laisse 30 minutes à la tâche). */
const BUDGET_MS = 10 * 60_000;

export interface PurgeResult {
  disabled: number;
  deleted: number;
  failed: number;
}

/**
 * Comptes verrouillés (réponse « moins de 15 ans ») : supprimés 30 jours après, dans
 * Keycloak (e-mail, mot de passe) puis dans l'application (#141), en deux temps :
 *
 * 1. le compte Keycloak est désactivé et déconnecté (plus aucun nouveau jeton) ;
 * 2. au passage suivant, au moins une heure après, quand plus aucun jeton émis avant n'est
 *    valide : suppression dans Keycloak, puis de la ligne. Sans ce délai, un jeton encore
 *    valide recréerait aussitôt un compte vierge, qui pourrait déclarer un autre âge.
 *
 * Le refus reste ainsi mémorisé 30 jours. Un compte en échec n'arrête pas les autres ;
 * la tâche échoue à la fin (et est rejouée) si l'un d'eux n'a pas pu être traité.
 */
@Injectable()
export class LockedAccountsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger('Comptes verrouillés');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly keycloak: KeycloakAdminService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.define({
      name: 'comptes-verrouilles',
      // Chaque nuit, à une minute peu chargée (hors de l'heure sautée au passage à l'été).
      cron: '17 3 * * *',
      expireInSeconds: 30 * 60,
      handle: async () => {
        const result = await this.purge();
        if (result.failed) {
          throw new Error(`${result.failed} compte(s) verrouillé(s) non traité(s)`);
        }
      },
    });
  }

  /** Compte de service inutilisable : signalé dès le démarrage, pas à 3 h du matin. */
  async onApplicationBootstrap() {
    if (!this.jobs.enabled || !this.keycloak.configured) return;
    try {
      await this.keycloak.accessToken();
    } catch (error) {
      this.logger.error(
        { failure: { type: (error as Error).name, message: (error as Error).message } },
        'Compte de service Keycloak inutilisable : les comptes verrouillés ne seront pas supprimés',
      );
    }
  }

  async purge(now = new Date()): Promise<PurgeResult> {
    const users = this.db.getRepository(User);
    const result: PurgeResult = { disabled: 0, deleted: 0, failed: 0 };
    const end = Date.now() + BUDGET_MS;
    const failedIds = new Set<string>();
    const next = (where: object) =>
      users.find({ where, order: { ageLockedAt: 'ASC' }, take: BATCH + failedIds.size });

    // 2. Suppression des comptes désactivés depuis assez longtemps.
    for (;;) {
      const batch = (
        await next({
          ageBand: 'under-15',
          agePurgeStartedAt: LessThan(new Date(now.getTime() - PURGE_DELAY_MS)),
        })
      ).filter((u) => !failedIds.has(u.id));
      if (!batch.length) break;
      for (const user of batch) {
        try {
          if (user.keycloakId) await this.keycloak.deleteUser(user.keycloakId);
          // Conditionnelle : seulement si le compte est toujours verrouillé.
          await users.delete({ id: user.id, ageBand: 'under-15' });
          result.deleted++;
        } catch {
          failedIds.add(user.id);
          result.failed++;
        }
      }
      if (Date.now() > end) break;
    }

    // 1. Désactivation des comptes verrouillés depuis plus de 30 jours.
    for (;;) {
      const batch = (
        await next({
          ageBand: 'under-15',
          agePurgeStartedAt: IsNull(),
          ageLockedAt: LessThan(new Date(now.getTime() - LOCKED_ACCOUNT_DAYS * DAY)),
        })
      ).filter((u) => !failedIds.has(u.id));
      if (!batch.length) break;
      for (const user of batch) {
        try {
          if (user.keycloakId) await this.keycloak.disableUser(user.keycloakId);
          await users.update(
            { id: user.id, ageBand: 'under-15', agePurgeStartedAt: IsNull() },
            { agePurgeStartedAt: now },
          );
          result.disabled++;
        } catch {
          failedIds.add(user.id);
          result.failed++;
        }
      }
      if (Date.now() > end) break;
    }

    if (result.disabled || result.deleted || result.failed) {
      // Journal : des nombres seulement, jamais d'identifiant de personne.
      this.logger.log(result, 'Comptes verrouillés traités');
    }
    return result;
  }
}
