import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss, type Job } from 'pg-boss';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';

/** Schéma PostgreSQL de la file (à côté des tables de l'application, hors migrations). */
export const JOBS_SCHEMA = 'pgboss';

/** Une tâche en arrière-plan, déclarée par le module qui la traite. */
export interface JobDefinition<T extends object = object> {
  /** Nom de la file (minuscules et tirets : « comptes-verrouilles »). */
  name: string;
  /** Traitement d'une tâche ; une exception la fait réessayer, jusqu'à `retryLimit`. */
  handle: (data: T, job: Job<T>) => Promise<void>;
  /** Nouvelles tentatives après un échec (3 par défaut), espacées de plus en plus. */
  retryLimit?: number;
  /** Délai avant la première nouvelle tentative, en secondes (30 par défaut), puis croissant. */
  retryDelaySeconds?: number;
  /** Tâche planifiée : expression cron (fuseau Europe/Paris). */
  cron?: string;
}

/**
 * File de tâches en arrière-plan (pg-boss, dans PostgreSQL, décision 30) : nouvelles
 * tentatives avec délai croissant, tâches planifiées, journal des échecs. Les modules
 * déclarent leurs tâches à l'initialisation (`define`) ; la file démarre avec l'application.
 *
 * Désactivée par défaut dans les tests (JOBS_ENABLED) : un test l'active pour la vérifier.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Tâches');
  private readonly definitions = new Map<string, JobDefinition>();
  private boss: PgBoss | null = null;

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  get enabled(): boolean {
    return this.config.JOBS_ENABLED ?? this.config.NODE_ENV !== 'test';
  }

  /** Déclare une tâche (avant le démarrage de l'application). */
  define<T extends object>(definition: JobDefinition<T>): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Tâche déclarée deux fois : ${definition.name}`);
    }
    this.definitions.set(definition.name, definition as unknown as JobDefinition);
  }

  /** Ajoute une tâche à la file ; null si la file est désactivée. */
  async send<T extends object>(name: string, data: T): Promise<string | null> {
    if (!this.definitions.has(name)) throw new Error(`Tâche inconnue : ${name}`);
    if (!this.boss) return null;
    return this.boss.send(name, data);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    const boss = new PgBoss({
      host: this.config.DB_HOST,
      port: this.config.DB_PORT,
      user: this.config.DB_USERNAME,
      password: this.config.DB_PASSWORD,
      database: this.config.DB_NAME,
      ssl: this.config.DB_SSL,
      schema: JOBS_SCHEMA,
      application_name: 'plumiotheca-taches',
      max: 4,
    });
    // Erreurs internes de la file (connexion perdue…) : journalisées, jamais fatales.
    boss.on('error', (error: Error) =>
      this.logger.error({ err: { type: error.name, message: error.message } }, 'File de tâches'),
    );
    await boss.start();
    this.boss = boss;
    for (const definition of this.definitions.values()) await this.register(boss, definition);
    this.logger.log(`File de tâches démarrée (${this.definitions.size} tâches)`);
  }

  async onApplicationShutdown(): Promise<void> {
    // Laisse finir les tâches en cours (10 s au plus), puis ferme les connexions.
    await this.boss?.stop({ graceful: true, timeout: 10_000 });
    this.boss = null;
  }

  private async register(boss: PgBoss, definition: JobDefinition): Promise<void> {
    const retryLimit = definition.retryLimit ?? 3;
    await boss.createQueue(definition.name, {
      retryLimit,
      retryDelay: definition.retryDelaySeconds ?? 30,
      retryBackoff: true,
      retryDelayMax: 3_600,
    });
    await boss.work(definition.name, async (jobs: Job[]) => {
      for (const job of jobs) {
        try {
          await definition.handle(job.data, job);
        } catch (error) {
          // Journal des échecs : nom, identifiant, tentative et type d'erreur, jamais les
          // données de la tâche (elles peuvent viser une personne).
          const last = job.retryCount >= retryLimit;
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger[last ? 'error' : 'warn'](
            {
              job: { name: job.name, id: job.id, attempt: job.retryCount + 1, of: retryLimit + 1 },
              err: { type: err.name, message: err.message },
            },
            last ? 'Tâche en échec définitif' : 'Tâche en échec, nouvelle tentative prévue',
          );
          throw error;
        }
      }
    });
    if (definition.cron) {
      await boss.schedule(definition.name, definition.cron, null, { tz: 'Europe/Paris' });
    }
  }
}
