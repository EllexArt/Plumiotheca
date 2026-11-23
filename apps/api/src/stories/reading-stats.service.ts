import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ReadingStats } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import type { User } from '../users/user.entity.js';

/** Mois en cours, à Paris (premier jour). */
const THIS_MONTH = `date_trunc('month', now() AT TIME ZONE 'Europe/Paris')::date`;

const disabled = () =>
  new ApiProblem(
    HttpStatus.CONFLICT,
    'Votre bilan de lecture est désactivé : réactivez-le dans les paramètres du compte.',
    'bilan-desactive',
  );

/**
 * Bilan de lecture (#34). Les étagères, chapitres et mots viennent de Mes lectures ; le
 * temps de lecture est le seul ajout, cumulé par mois. Rien n'est gardé ni compté quand le
 * bilan est désactivé.
 */
@Injectable()
export class ReadingStatsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Ajoute du temps de lecture au mois en cours. */
  async addTime(user: User, seconds: number): Promise<void> {
    if (!user.readingStats) throw disabled();
    await this.db.query(
      `INSERT INTO reading_times (user_id, month, seconds) VALUES ($1, ${THIS_MONTH}, $2)
       ON CONFLICT (user_id, month) DO UPDATE SET seconds = reading_times.seconds + $2`,
      [user.id, seconds],
    );
  }

  async stats(user: User): Promise<ReadingStats> {
    if (!user.readingStats) throw disabled();
    // Histoires visibles seulement (les siennes, ou publiques), comme Mes lectures.
    const [shelves] = await this.db.query<
      { finished: number; reading: number; to_read: number; chapters: number; words: number }[]
    >(
      `WITH entries AS (
         SELECT le.shelf, le.story_id, cur.position AS at
         FROM library_entries le
         JOIN stories s ON s.id = le.story_id
         JOIN users a ON a.id = s.author_id
         LEFT JOIN chapters cur ON cur.id = le.chapter_id
         WHERE le.user_id = $1 AND (s.author_id = $1 OR (s.status = 'published'
           AND a.status = 'active' AND a.age_band IN ('15-17', '18+') AND a.handle IS NOT NULL))
       ), read AS (
         SELECT count(c.id)::int AS chapters, coalesce(sum(c.word_count), 0)::int AS words
         FROM entries e
         JOIN chapters c ON c.story_id = e.story_id AND c.status = 'published'
           AND (e.shelf = 'finished' OR c.position < e.at)
       )
       SELECT count(*) FILTER (WHERE shelf = 'finished')::int AS finished,
              count(*) FILTER (WHERE shelf = 'reading')::int AS reading,
              count(*) FILTER (WHERE shelf = 'to_read')::int AS to_read,
              (SELECT chapters FROM read) AS chapters, (SELECT words FROM read) AS words
       FROM entries`,
      [user.id],
    );
    const months = await this.db.query<{ month: string; seconds: number }[]>(
      `SELECT to_char(m, 'YYYY-MM') AS month, coalesce(rt.seconds, 0)::int AS seconds
       FROM generate_series(${THIS_MONTH} - interval '11 months', ${THIS_MONTH}, interval '1 month') m
       LEFT JOIN reading_times rt ON rt.user_id = $1 AND rt.month = m::date
       ORDER BY m`,
      [user.id],
    );
    const [totals] = await this.db.query<{ year: number; total: number }[]>(
      `SELECT coalesce(sum(seconds) FILTER (
                WHERE date_trunc('year', month) = date_trunc('year', ${THIS_MONTH})), 0)::int AS year,
              coalesce(sum(seconds), 0)::int AS total
       FROM reading_times WHERE user_id = $1`,
      [user.id],
    );
    const minutes = (seconds: number) => Math.floor(seconds / 60);
    return {
      finished: shelves?.finished ?? 0,
      reading: shelves?.reading ?? 0,
      toRead: shelves?.to_read ?? 0,
      chaptersRead: shelves?.chapters ?? 0,
      wordsRead: shelves?.words ?? 0,
      minutesThisMonth: minutes(months.at(-1)?.seconds ?? 0),
      minutesThisYear: minutes(totals?.year ?? 0),
      minutesTotal: minutes(totals?.total ?? 0),
      months: months.map((m) => ({ month: m.month, minutes: minutes(m.seconds) })),
    };
  }
}
