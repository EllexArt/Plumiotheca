import { RevisionKind } from '@plumiotheca/contracts';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';

/** Instantané d'un chapitre : sauvegarde automatique (compactée), version nommée ou publiée. */
@Entity('chapter_revisions')
@Index(['chapter', 'createdAt'])
export class ChapterRevision {
  @IdColumn()
  id!: string;

  @ManyToOne(() => Chapter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  chapter!: Relation<Chapter>;

  @Column({ type: 'enum', enum: RevisionKind.options, enumName: 'revision_kind' })
  kind!: RevisionKind;

  /** Nom donné par l'autrice à une version (« avant la réécriture »…). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({ type: 'jsonb' })
  content!: object;

  @Column({ type: 'integer', default: 0 })
  wordCount!: number;

  /** Qui a fait cette version (co-écriture) ; NULL si son compte a été effacé. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  createdBy!: Relation<User> | null;

  @CreatedAt()
  createdAt!: Date;
}
