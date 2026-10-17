import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  LibraryEntry as LibraryEntryView,
  LibraryPage,
  LibraryQuery,
  LibraryStatus,
  ReadingPosition,
  Shelf,
} from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import type { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { LibraryEntry } from './library-entry.entity.js';
import { StoriesService } from './stories.service.js';
import { visibleStory } from './story-access.js';

/**
 * « Mes lectures » (#30) : étagères (en cours, à lire, terminées) et position de lecture,
 * sur le compte. Seules les histoires que la personne peut voir sont montrées ; une histoire
 * devenue invisible (dépubliée, compte verrouillé) reste rangée et réapparaît si elle redevient
 * visible.
 */
@Injectable()
export class LibraryService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly stories: StoriesService,
  ) {}

  async list(user: User, query: LibraryQuery): Promise<LibraryPage> {
    const qb = this.db
      .getRepository(LibraryEntry)
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.story', 'story')
      .innerJoinAndSelect('story.author', 'author')
      .where('entry.user_id = :me', { me: user.id })
      .andWhere('entry.shelf = :shelf', { shelf: query.etagere })
      // Même règle que story-access.ts : les siennes, ou les histoires publiques.
      .andWhere(
        `(story.author_id = :me OR (story.status = 'published' AND author.status = 'active'
          AND author.age_band IN ('15-17', '18+') AND author.handle IS NOT NULL))`,
      );
    if (query.apres) {
      const [date, id] = decodeCursor(query.apres);
      qb.andWhere('(entry.updated_at, entry.story_id) < (:date, :id)', { date, id });
    }
    const rows = await qb
      .orderBy('entry.updated_at', 'DESC')
      .addOrderBy('entry.story_id', 'DESC')
      .limit(query.limite + 1)
      .getMany();
    const page = rows.slice(0, query.limite);
    // Ses propres histoires gardent leur vrai statut (brouillon…) ; les autres sont publiées.
    const mine = page.filter((e) => e.story.author.id === user.id).map((e) => e.story);
    const others = page.filter((e) => e.story.author.id !== user.id).map((e) => e.story);
    const summaries = new Map(
      [
        ...(await this.stories.summaries(this.db.manager, mine, true)),
        ...(await this.stories.summaries(this.db.manager, others, false)),
      ].map((s) => [s.id, s]),
    );
    const readable = await this.readableChapters(user, page);
    return {
      items: page.map((entry) => ({
        ...this.view(entry, readable),
        story: summaries.get(entry.storyId)!,
      })),
      nextCursor:
        rows.length > query.limite
          ? encodeCursor(page.at(-1)!.updatedAt, page.at(-1)!.storyId)
          : null,
    };
  }

  /** Place de l'histoire dans Mes lectures ; 404 si la personne ne peut pas la voir. */
  async status(user: User, storyId: string): Promise<LibraryStatus> {
    await visibleStory(this.db.manager, storyId, user);
    const entry = await this.db.getRepository(LibraryEntry).findOneBy({ userId: user.id, storyId });
    if (!entry) return { entry: null };
    return { entry: this.view(entry, await this.readableChapters(user, [entry])) };
  }

  /** Range l'histoire sur une étagère (l'ajoute à Mes lectures au besoin). */
  async setShelf(user: User, storyId: string, shelf: Shelf): Promise<LibraryStatus> {
    await visibleStory(this.db.manager, storyId, user);
    await this.db.query(
      `INSERT INTO library_entries (user_id, story_id, shelf) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, story_id) DO UPDATE SET shelf = EXCLUDED.shelf, updated_at = now()`,
      [user.id, storyId, shelf],
    );
    return this.status(user, storyId);
  }

  /**
   * Position de lecture. Ouvrir une histoire l'ajoute à Mes lectures, en cours (« Commencer
   * la lecture ») ; une histoire « à lire » passe en cours, une histoire terminée le reste.
   */
  async setPosition(user: User, storyId: string, position: ReadingPosition) {
    const story = await visibleStory(this.db.manager, storyId, user);
    const chapter = await this.db
      .getRepository(Chapter)
      .findOneBy({ id: position.chapterId, story: { id: storyId } });
    const own = story.author.id === user.id;
    if (!chapter || (!own && chapter.status !== 'published')) throw new NotFoundException();
    await this.db.query(
      `INSERT INTO library_entries (user_id, story_id, shelf, chapter_id, block_id)
       VALUES ($1, $2, 'reading', $3, $4)
       ON CONFLICT (user_id, story_id) DO UPDATE SET
         chapter_id = EXCLUDED.chapter_id,
         block_id = EXCLUDED.block_id,
         updated_at = now(),
         shelf = CASE WHEN library_entries.shelf = 'to_read' THEN 'reading'::shelf
                      ELSE library_entries.shelf END`,
      [user.id, storyId, position.chapterId, position.blockId],
    );
    return this.status(user, storyId);
  }

  async remove(user: User, storyId: string): Promise<void> {
    await this.db.getRepository(LibraryEntry).delete({ userId: user.id, storyId });
  }

  /** Chapitres où l'on peut encore reprendre : publiés (ou de ses propres histoires). */
  private async readableChapters(user: User, entries: LibraryEntry[]): Promise<Set<string>> {
    const ids = entries.map((e) => e.chapterId).filter((id): id is string => !!id);
    if (!ids.length) return new Set();
    const rows = await this.db.query<{ id: string }[]>(
      `SELECT c.id FROM chapters c JOIN stories s ON s.id = c.story_id
       WHERE c.id = ANY($1) AND (c.status = 'published' OR s.author_id = $2)`,
      [ids, user.id],
    );
    return new Set(rows.map((r) => r.id));
  }

  private view(entry: LibraryEntry, readable: Set<string>): LibraryEntryView {
    const chapterId = entry.chapterId && readable.has(entry.chapterId) ? entry.chapterId : null;
    return {
      shelf: entry.shelf,
      chapterId,
      blockId: chapterId ? entry.blockId : null,
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
