import { Shelf } from '@plumiotheca/contracts';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { Story } from './story.entity.js';

/**
 * Une histoire dans « Mes lectures » (#30) : étagère et position de lecture, sur le compte.
 * Donnée personnelle (ce qu’une personne lit) : jamais montrée aux autres, supprimée avec
 * le compte ou l’histoire.
 */
@Entity('library_entries')
// Une étagère, la plus récemment lue ou rangée d’abord (curseur).
@Index(['user', 'shelf', 'updatedAt', 'story'])
export class LibraryEntry {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'uuid' })
  storyId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'story_id' })
  story!: Relation<Story>;

  @Column({ type: 'enum', enum: Shelf.options, enumName: 'shelf' })
  shelf!: Shelf;

  /** Chapitre où reprendre ; supprimé avec le chapitre. */
  @Column({ type: 'uuid', nullable: true })
  chapterId!: string | null;

  @ManyToOne(() => Chapter, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'chapter_id' })
  chapter?: Relation<Chapter> | null;

  /** Paragraphe en cours (identifiant de bloc du texte). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  blockId!: string | null;

  // À la milliseconde : curseur de l’étagère (date JavaScript, sans microsecondes).
  @Column({ type: 'timestamptz', precision: 3, default: () => 'now()' })
  updatedAt!: Date;
}
