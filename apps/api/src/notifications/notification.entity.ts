import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
  Unique,
} from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { Chapter } from '../stories/chapter.entity.js';
import { Story } from '../stories/story.entity.js';
import { User } from '../users/user.entity.js';
import { SavedSearchEntry } from './saved-search.entity.js';

/**
 * Notification sur le site (#33) : un nouveau chapitre d’une histoire de Mes lectures.
 * Donnée personnelle (ce qu’une personne lit) : jamais montrée aux autres, supprimée avec le
 * compte, l’histoire ou le chapitre, et au plus tard 90 jours après (tâche de nuit).
 */
@Entity('notifications')
// Liste de la personne, la plus récente d’abord (curseur : l’identifiant, UUID v7).
@Index(['user', 'id'])
// Purge de nuit.
@Index(['createdAt'])
// Une seule notification par chapitre et par personne, même republié.
@Unique(['user', 'chapter'])
// Chaque type avec ce qui le décrit : un chapitre (et son histoire), ou une recherche.
@Check(
  'notifications_kind_target',
  `("kind" = 'new_chapter' AND "story_id" IS NOT NULL AND "chapter_id" IS NOT NULL)
    OR ("kind" = 'saved_search' AND "saved_search_id" IS NOT NULL)`,
)
export class Notification {
  @IdColumn()
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn()
  user!: Relation<User>;

  /** Nouveau chapitre (#33) : l'histoire et le chapitre ; null pour une recherche. */
  @ManyToOne(() => Story, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  story!: Relation<Story> | null;

  @ManyToOne(() => Chapter, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  chapter!: Relation<Chapter> | null;

  /** Recherche enregistrée (#80) : supprimée avec elle. */
  @ManyToOne(() => SavedSearchEntry, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  savedSearch!: Relation<SavedSearchEntry> | null;

  /** Recherche enregistrée : nombre de nouvelles histoires et les trois premières. */
  @Column({ type: 'jsonb', nullable: true })
  data!: { count: number; storyIds: string[] } | null;

  @Column({
    type: 'enum',
    enum: ['new_chapter', 'saved_search'],
    enumName: 'notification_kind',
    default: 'new_chapter',
  })
  kind!: 'new_chapter' | 'saved_search';

  @CreatedAt()
  createdAt!: Date;

  /** Lue (ouverte, ou « tout marquer comme lu ») ; NULL : non lue. */
  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
