import {
  Completion,
  ContentWarning,
  MajorWarning,
  Rating,
  StoryStatus,
} from '@plumiotheca/contracts';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { CreatedAt, IdColumn, UpdatedAt } from '../database/columns.js';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';

/**
 * Histoire. Supprimée avec le compte de la personne qui l'a écrite, dans les deux modes de
 * suppression (décision 26) ; la co-écriture arrive avec les univers (M5).
 */
@Entity('stories')
// Une histoire publiée a toujours un classement et des avertissements majeurs choisis
// explicitement (jamais « Tout public » par défaut).
@Check(
  'stories_published_is_classified',
  `"status" <> 'published' OR ("rating" IS NOT NULL AND "major_warnings" IS NOT NULL)`,
)
@Check('stories_word_count_positive', `"word_count" >= 0`)
@Index(['author', 'status'])
// « Mes histoires » : la plus récemment modifiée d'abord.
@Index('stories_mine', ['author', 'updatedAt', 'id'])
// Liste publique : les plus récentes d'abord (parcouru à l'envers par PostgreSQL).
@Index('stories_public_list', ['publishedAt', 'id'], { where: `"status" = 'published'` })
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

  /** NULL tant que l'autrice ou l'auteur ne l'a pas choisi ; obligatoire pour publier. */
  @Column({ type: 'enum', enum: Rating.options, enumName: 'rating', nullable: true })
  rating!: Rating | null;

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

  /** Avertissements facultatifs (liste fine) ; jamais NULL. */
  @Column({
    type: 'enum',
    enum: ContentWarning.options,
    enumName: 'content_warning',
    array: true,
    default: '{}',
  })
  contentWarnings!: ContentWarning[];

  /** Total des chapitres publiés, recalculé à la publication. */
  @Column({ type: 'integer', default: 0 })
  wordCount!: number;

  @OneToMany(() => Chapter, (chapter) => chapter.story)
  chapters!: Relation<Chapter[]>;

  // À la milliseconde : curseur de la liste publique (date JavaScript, sans microsecondes).
  @Column({ type: 'timestamptz', precision: 3, nullable: true })
  publishedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;

  // À la milliseconde : curseur de « Mes histoires ».
  @UpdatedAt(3)
  updatedAt!: Date;
}
