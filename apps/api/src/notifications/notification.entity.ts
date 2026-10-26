import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation, Unique } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { Chapter } from '../stories/chapter.entity.js';
import { Story } from '../stories/story.entity.js';
import { User } from '../users/user.entity.js';

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
export class Notification {
  @IdColumn()
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn()
  user!: Relation<User>;

  @ManyToOne(() => Story, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn()
  story!: Relation<Story>;

  @ManyToOne(() => Chapter, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn()
  chapter!: Relation<Chapter>;

  @Column({
    type: 'enum',
    enum: ['new_chapter'],
    enumName: 'notification_kind',
    default: 'new_chapter',
  })
  kind!: 'new_chapter';

  @CreatedAt()
  createdAt!: Date;

  /** Lue (ouverte, ou « tout marquer comme lu ») ; NULL : non lue. */
  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
