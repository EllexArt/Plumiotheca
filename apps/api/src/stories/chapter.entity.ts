import { ChapterStatus } from '@plumiotheca/contracts';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  type Relation,
  Unique,
  VersionColumn,
} from 'typeorm';
import { CreatedAt, IdColumn, UpdatedAt } from '../database/columns.js';
import { ChapterRevision } from './chapter-revision.entity.js';
import { Story } from './story.entity.js';

/** Document TipTap vide : point de départ d'un brouillon. */
export const EMPTY_DOCUMENT = { type: 'doc', content: [] } as const;

/**
 * Chapitre. Le brouillon (`draft`) se retravaille librement ; les lecteurs voient la
 * révision publiée, figée, tant qu'une nouvelle version n'est pas publiée.
 */
@Entity('chapters')
// Ordre unique dans l'histoire ; vérifié en fin de transaction pour pouvoir réordonner.
@Unique('chapters_story_position', ['story', 'position'], { deferrable: 'INITIALLY DEFERRED' })
export class Chapter {
  @IdColumn()
  id!: string;

  @ManyToOne(() => Story, (story) => story.chapters, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  story!: Relation<Story>;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ type: 'varchar', length: 200, default: '' })
  title!: string;

  @Column({
    type: 'enum',
    enum: ChapterStatus.options,
    enumName: 'chapter_status',
    default: 'draft',
  })
  status!: ChapterStatus;

  /** Brouillon en cours (JSON ProseMirror/TipTap, blocs à identifiant stable). */
  // Écrit sous la forme normalisée par PostgreSQL (espaces compris), sinon la vérification
  // des migrations verrait une différence à chaque fois.
  @Column({ type: 'jsonb', default: () => `'{"type": "doc", "content": []}'` })
  draft!: object;

  /** Incrémentée à chaque sauvegarde : une sauvegarde sur une version dépassée → 409. */
  @VersionColumn()
  version!: number;

  @ManyToOne(() => ChapterRevision, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  publishedRevision!: Relation<ChapterRevision> | null;

  @Column({ type: 'integer', default: 0 })
  wordCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
