import { RevisionKind } from '@plumiotheca/contracts';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';

/**
 * Instantané d'un chapitre : sauvegarde automatique (compactée), version nommée ou publiée.
 *
 * La version lue par le public est la révision `current` de son chapitre : elle appartient
 * forcément à ce chapitre (pas de pointeur vers la révision d'un autre), il n'y en a qu'une,
 * et c'est toujours une révision publiée.
 */
@Entity('chapter_revisions')
@Index(['chapter', 'createdAt'])
@Index('chapter_revisions_one_current', ['chapter'], { unique: true, where: '"current"' })
@Check('chapter_revisions_current_is_published', `NOT "current" OR "kind" = 'published'`)
@Check('chapter_revisions_word_count_positive', `"word_count" >= 0`)
export class ChapterRevision {
  @IdColumn()
  id!: string;

  @ManyToOne(() => Chapter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  chapter!: Relation<Chapter>;

  @Column({ type: 'enum', enum: RevisionKind.options, enumName: 'revision_kind' })
  kind!: RevisionKind;

  /** Révision publiée affichée aux lecteurs (une seule par chapitre). */
  @Column({ type: 'boolean', default: false })
  current!: boolean;

  /** Nom donné à une version par la personne qui écrit (« avant la réécriture »…). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({ type: 'jsonb' })
  content!: object;

  @Column({ type: 'integer', default: 0 })
  wordCount!: number;

  /** Qui a fait cette version (co-écriture) ; NULL si son compte a été effacé. */
  @Index()
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  createdBy!: Relation<User> | null;

  @CreatedAt()
  createdAt!: Date;
}
