import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { JobsService } from '../jobs/jobs.service.js';
import type { User } from '../users/user.entity.js';
import type { Story } from './story.entity.js';

/** Jour en cours, à Paris (une lecture comptée par personne, par histoire et par jour). */
const TODAY = `(now() AT TIME ZONE 'Europe/Paris')::date`;

/**
 * Lectures uniques (#17, architecture §4) : une lecture par personne, par histoire et par
 * jour ; recharger la page ou relire un chapitre ne compte pas deux fois, et la personne
 * qui a écrit l'histoire n'est pas comptée.
 *
 * Aucune empreinte de navigateur (pas de cookie, rien dans le navigateur) : la personne est
 * reconnue par son compte, ou, sans compte, par son adresse IP ; dans les deux cas seule
 * une empreinte HMAC avec un sel du jour est gardée, et le sel comme les empreintes sont
 * effacés le lendemain (§1 quater). Le compteur de l'histoire, lui, ne dit rien de personne.
 */
@Injectable()
export class ReadsService implements OnModuleInit {
  private readonly logger = new Logger('Lectures');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    // Filet de sécurité : le premier comptage d'un nouveau jour efface déjà la veille.
    this.jobs.define({
      name: 'lectures-du-jour',
      cron: '7 0 * * *',
      handle: () => this.forgetPastDays(),
    });
  }

  /**
   * Compte une lecture de l'histoire, sauf si elle l'est déjà aujourd'hui pour cette
   * personne. N'échoue jamais : un incident de comptage n'empêche pas de lire.
   */
  async record(story: Story, viewer: User | null, ip: string | undefined): Promise<void> {
    if (viewer?.id === story.author.id) return;
    const who = viewer ? `compte:${viewer.id}` : ip ? `ip:${ip}` : null;
    if (!who) return;
    try {
      await this.db.transaction(async (tx) => {
        const created = await tx.query<unknown[]>(
          `INSERT INTO read_salts (day, salt) VALUES (${TODAY}, $1)
           ON CONFLICT (day) DO NOTHING RETURNING day`,
          [randomBytes(32)],
        );
        // Premier comptage du jour : le sel et les empreintes de la veille disparaissent.
        if (created.length) await this.forgetPastDays(tx.query.bind(tx));
        const [today] = await tx.query<{ day: string; salt: Buffer }[]>(
          `SELECT day::text AS day, salt FROM read_salts WHERE day = ${TODAY}`,
        );
        const reader = createHmac('sha256', today!.salt).update(who).digest();
        const counted = await tx.query<unknown[]>(
          `INSERT INTO read_marks (story_id, reader, day) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING RETURNING day`,
          [story.id, reader, today!.day],
        );
        if (counted.length) {
          await tx.query(`UPDATE stories SET read_count = read_count + 1 WHERE id = $1`, [
            story.id,
          ]);
        }
      });
    } catch (error) {
      this.logger.warn(
        { failure: { type: (error as Error).name } },
        'Lecture non comptée (incident de comptage)',
      );
    }
  }

  /** Efface les sels et les empreintes des jours passés. */
  async forgetPastDays(
    query: (sql: string) => Promise<unknown> = (sql) => this.db.query(sql),
  ): Promise<void> {
    await query(`DELETE FROM read_marks WHERE day < ${TODAY}`);
    await query(`DELETE FROM read_salts WHERE day < ${TODAY}`);
  }
}
