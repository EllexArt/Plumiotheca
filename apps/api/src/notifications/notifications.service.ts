import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  NOTIFICATION_DAYS,
  type NotificationPage,
  type NotificationQuery,
} from '@plumiotheca/contracts';
import { DataSource, type EntityManager } from 'typeorm';
import { JobsService } from '../jobs/jobs.service.js';
import type { User } from '../users/user.entity.js';

/** Histoire `s`, écrite par `a`, visible du public (même règle que publicStories). */
const PUBLIC_STORY = `s.status = 'published' AND a.status = 'active'
  AND a.age_band IN ('15-17', '18+') AND a.handle IS NOT NULL`;

/** Mes notifications visibles : histoire publique, chapitre toujours publié. */
const VISIBLE = `FROM notifications n
  JOIN stories s ON s.id = n.story_id
  JOIN users a ON a.id = s.author_id
  JOIN chapters c ON c.id = n.chapter_id AND c.status = 'published'
  WHERE n.user_id = $1 AND ${PUBLIC_STORY}`;

/**
 * Notifications sur le site (#33). Un chapitre publié pour la première fois prévient toutes
 * les personnes qui ont l’histoire dans Mes lectures (toutes étagères), sauf celle qui l’a
 * écrite. Une histoire devenue invisible (dépubliée, compte verrouillé) disparaît des listes
 * sans que ses notifications soient effacées : elles reviennent si l’histoire revient.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.define({
      name: 'purge-notifications',
      cron: '17 3 * * *',
      handle: async () => void (await this.purge()),
    });
  }

  /**
   * Nouveau chapitre, dans la transaction de sa publication : une notification par personne
   * qui suit l’histoire. Rien si l’histoire n’est pas publique (premier chapitre d’une
   * histoire encore en brouillon : personne ne peut l’avoir dans ses lectures).
   */
  async newChapter(tx: EntityManager, storyId: string, chapterId: string): Promise<void> {
    await tx.query(
      `INSERT INTO notifications (user_id, story_id, chapter_id)
       SELECT le.user_id, s.id, $2
       FROM library_entries le
       JOIN stories s ON s.id = le.story_id
       JOIN users a ON a.id = s.author_id
       JOIN users u ON u.id = le.user_id AND u.status = 'active'
       WHERE le.story_id = $1 AND le.user_id <> s.author_id AND ${PUBLIC_STORY}
       ON CONFLICT (user_id, chapter_id) DO NOTHING`,
      [storyId, chapterId],
    );
  }

  /** Mes notifications, la plus récente d’abord. */
  async list(account: User, query: NotificationQuery): Promise<NotificationPage> {
    const rows = await this.db.query<
      {
        id: string;
        created_at: Date;
        read_at: Date | null;
        story_id: string;
        story_title: string;
        language: string;
        chapter_id: string;
        chapter_title: string;
        number: number;
      }[]
    >(
      `SELECT n.id, n.created_at, n.read_at, s.id AS story_id, s.title AS story_title,
              s.language, c.id AS chapter_id, c.title AS chapter_title,
              (SELECT count(*)::int FROM chapters o WHERE o.story_id = s.id
                 AND o.status = 'published' AND o.position <= c.position) AS number
       ${VISIBLE} AND ($2::uuid IS NULL OR n.id < $2)
       ORDER BY n.id DESC
       LIMIT $3`,
      [account.id, query.apres ?? null, query.limite + 1],
    );
    const page = rows.slice(0, query.limite);
    return {
      items: page.map((r) => ({
        id: r.id,
        kind: 'new_chapter',
        createdAt: r.created_at.toISOString(),
        read: r.read_at !== null,
        story: { id: r.story_id, title: r.story_title, language: r.language },
        chapter: { id: r.chapter_id, number: r.number, title: r.chapter_title },
      })),
      nextCursor: rows.length > query.limite ? page.at(-1)!.id : null,
    };
  }

  /** Nombre de notifications non lues (en-tête du site). */
  async unread(account: User): Promise<number> {
    const [row] = await this.db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n ${VISIBLE} AND n.read_at IS NULL`,
      [account.id],
    );
    return row?.n ?? 0;
  }

  /** Marque une notification comme lue ; 404 si elle n’est pas à vous. */
  async markRead(account: User, id: string): Promise<void> {
    const [, count] = await this.db.query<[unknown, number]>(
      `UPDATE notifications SET read_at = coalesce(read_at, now())
       WHERE id = $1 AND user_id = $2`,
      [id, account.id],
    );
    if (!count) throw new NotFoundException();
  }

  async markAllRead(account: User): Promise<void> {
    await this.db.query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [account.id],
    );
  }

  /** Notifications de plus de 90 jours, lues ou non : supprimées. */
  async purge(): Promise<number> {
    const [, count] = await this.db.query<[unknown, number]>(
      'DELETE FROM notifications WHERE created_at < now() - make_interval(days => $1)',
      [NOTIFICATION_DAYS],
    );
    if (count) this.logger.log({ deleted: count }, 'Anciennes notifications supprimées');
    return count;
  }
}
