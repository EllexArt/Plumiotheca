import { Completion, MajorWarning, Rating, StoryStatus } from '@plumiotheca/contracts';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { CreatedAt, IdColumn, UpdatedAt } from '../database/columns.js';
import { Tag } from '../tags/tag.entity.js';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';

/**
 * Histoire. Supprimée avec le compte de son autrice dans les deux modes de suppression
 * (décision 26) ; les co-autrices arrivent avec les univers (M5).
 */
@Entity('stories')
// Une histoire publiée a toujours ses avertissements majeurs renseignés.
@Check('published_has_warnings', `"status" <> 'published' OR "major_warnings" IS NOT NULL`)
@Index(['author', 'status'])
export class Story {
  @IdColumn()
  id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  author!: Relation<User>;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', default: '' })
  summary!: string;

  /** Langue (BCP 47 : « fr », « en », « pt-BR »…). */
  @Column({ type: 'varchar', length: 12 })
  language!: string;

  @Column({ type: 'enum', enum: Rating.options, enumName: 'rating', default: 'general' })
  rating!: Rating;

  @Column({ type: 'enum', enum: StoryStatus.options, enumName: 'story_status', default: 'draft' })
  status!: StoryStatus;

  @Column({
    type: 'enum',
    enum: Completion.options,
    enumName: 'completion',
    default: 'in_progress',
  })
  completion!: Completion;

  /** NULL : pas encore renseignés ; liste vide : aucun ne s'applique. */
  @Column({
    type: 'enum',
    enum: MajorWarning.options,
    enumName: 'major_warning',
    array: true,
    nullable: true,
  })
  majorWarnings!: MajorWarning[] | null;

  /** Total des chapitres publiés, recalculé à la publication. */
  @Column({ type: 'integer', default: 0 })
  wordCount!: number;

  @ManyToMany(() => Tag)
  @JoinTable({
    name: 'story_tags',
    joinColumn: { name: 'story_id' },
    inverseJoinColumn: { name: 'tag_id' },
  })
  tags!: Relation<Tag[]>;

  @OneToMany(() => Chapter, (chapter) => chapter.story)
  chapters!: Relation<Chapter[]>;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
