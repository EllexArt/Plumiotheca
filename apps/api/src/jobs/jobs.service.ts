import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PgBoss, type JobWithMetadata } from 'pg-boss';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';

/** Schéma PostgreSQL de la file (à côté des tables de l'application, hors migrations). */
export const JOBS_SCHEMA = 'pgboss';

/** Durée de conservation d'une tâche terminée (et donc de ses données) : 7 jours. */
const KEEP_FINISHED_SECONDS = 7 * 24 * 3_600;

/** Une tâche en arrière-plan, déclarée par le module qui la traite. */
export interface JobDefinition<T extends object = object> {
  /** Nom de la file (minuscules et tirets : « comptes-verrouilles »). */
  name: string;
  /**
   * Traitement d'une tâche ; une exception la fait réessayer, jusqu'à `retryLimit`. Doit
   * être idempotent : une tâche interrompue (arrêt, expiration) est rejouée.
   */
  handle: (data: T, job: JobWithMetadata<T>) => Promise<void>;
  /** Nouvelles tentatives après un échec (3 par défaut), espacées de plus en plus. */
  retryLimit?: number;
  /** Délai avant la première nouvelle tentative, en secondes (30 par défaut), puis croissant. */
  retryDelaySeconds?: number;
  /** Tâche planifiée : expression cron (fuseau Europe/Paris), lancée avec des données vides. */
  cron?: string;
}

/**
 * Erreur relancée vers pg-boss à la place de l'originale : pg-boss enregistre l'erreur
 * dans sa table, et un message ou une pile peuvent citer une donnée personnelle.
 */
class JobFailed extends Error {
  constructor(type: string) {
    super(`Échec de la tâche (${type})`);
    this.name = 'JobFailed';
    this.stack = undefined;
  }
}

/**
 * Résumé d'une erreur pour le journal : type, code et emplacement dans le code. Ni message
 * ni pile complète, qui peuvent citer une valeur (adresse, texte, paramètre SQL).
 */
function summarize(error: unknown) {
  const err = error instanceof Error ? error : new Error('valeur non-Error');
  const at = err.stack
    ?.split('\n')
    .find((line) => line.trimStart().startsWith('at '))
    ?.trim();
  return { type: err.name, code: (err as { code?: unknown }).code, at };
}

/**
 * File de tâches en arrière-plan (pg-boss, dans PostgreSQL, décision 30) : nouvelles
 * tentatives avec délai croissant, tâches planifiées, journal des échecs. Les modules
 * déclarent leurs tâches à l'initialisation (`define`) ; la file démarre avec l'application
 * et s'arrête avant la base (les tâches en cours finissent avec leur connexion).
 *
 * Désactivée par défaut dans les tests (JOBS_ENABLED) : un test l'active pour la vérifier.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, BeforeApplicationShutdown {
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

  /**
   * Ajoute une tâche à la file. Null si la file est désactivée ; erreur si elle est activée
   * mais pas démarrée (envoi trop tôt, ou après l'arrêt) : jamais de tâche perdue en silence.
   */
  async send<T extends object>(name: string, data: T): Promise<string | null> {
    if (!this.definitions.has(name)) throw new Error(`Tâche inconnue : ${name}`);
    if (!this.enabled) return null;
    if (!this.boss) throw new Error(`File de tâches non démarrée (envoi de ${name})`);
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
      this.logger.error({ failure: summarize(error) }, 'File de tâches'),
    );
    // Signaux d'exploitation (file qui s'allonge, horloge décalée, requête lente).
    boss.on('warning', (warning) => this.logger.warn({ warning }, 'File de tâches'));
    await boss.start();
    this.boss = boss;
    for (const definition of this.definitions.values()) await this.register(boss, definition);
    this.logger.log(`File de tâches démarrée (${this.definitions.size} tâches)`);
  }

  /** Avant la fermeture de la base (TypeORM) : 10 s pour finir les tâches en cours. */
  async beforeApplicationShutdown(): Promise<void> {
    const boss = this.boss;
    this.boss = null;
    await boss?.stop({ graceful: true, timeout: 10_000 });
  }

  private async register(boss: PgBoss, definition: JobDefinition): Promise<void> {
    const options = {
      retryLimit: definition.retryLimit ?? 3,
      retryDelay: definition.retryDelaySeconds ?? 30,
      retryBackoff: true,
      retryDelayMax: 3_600,
      deleteAfterSeconds: KEEP_FINISHED_SECONDS,
    };
    // createQueue n'écrase pas une file existante : updateQueue applique les options du code
    // (une politique de tentatives modifiée vaut aussi pour la file déjà créée).
    await boss.createQueue(definition.name, options);
    await boss.updateQueue(definition.name, options);
    // Une tâche à la fois : un échec ne fait pas rejouer d'autres tâches du même lot.
    await boss.work(
      definition.name,
      { batchSize: 1, includeMetadata: true },
      async ([job]: JobWithMetadata[]) => {
        if (!job) return;
        try {
          await definition.handle(job.data, job);
        } catch (error) {
          // Journal des échecs : nom, identifiant, tentative (limite lue sur la tâche) et
          // résumé de l'erreur ; jamais les données de la tâche (elles visent une personne).
          const failure = summarize(error);
          const last = job.retryCount >= job.retryLimit;
          this.logger[last ? 'error' : 'warn'](
            {
              job: {
                name: job.name,
                id: job.id,
                attempt: job.retryCount + 1,
                of: job.retryLimit + 1,
              },
              failure,
            },
            last ? 'Tâche en échec définitif' : 'Tâche en échec, nouvelle tentative prévue',
          );
          throw new JobFailed(failure.type);
        }
      },
    );
    if (definition.cron) {
      await boss.schedule(definition.name, definition.cron, {}, { tz: 'Europe/Paris' });
    } else {
      // Planification retirée du code : retirée aussi de la base (sinon tâche « fantôme »).
      await boss.unschedule(definition.name);
    }
  }
}
