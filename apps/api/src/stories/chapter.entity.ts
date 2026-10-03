import { ChapterStatus } from '@plumiotheca/contracts';
import { Check, Column, Entity, JoinColumn, ManyToOne, type Relation, Unique } from 'typeorm';
import { CreatedAt, IdColumn, UpdatedAt } from '../database/columns.js';
import { Story } from './story.entity.js';

/** Document TipTap vide : point de départ d'un brouillon. */
export const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] } as const;

/**
 * Chapitre. Le brouillon (`draft`) se retravaille librement ; les lecteurs voient la
 * révision publiée courante (voir ChapterRevision), figée, tant qu'une nouvelle version
 * n'est pas publiée.
 */
@Entity('chapters')
// Ordre unique dans l'histoire ; vérifié en fin de transaction pour pouvoir réordonner.
@Unique('chapters_story_position', ['story', 'position'], { deferrable: 'INITIALLY DEFERRED' })
@Check('chapters_position_positive', `"position" >= 1`)
@Check('chapters_word_count_positive', `"word_count" >= 0`)
@Check('chapters_draft_version_positive', `"draft_version" >= 1`)
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
  // `update: false` : ni `save()` ni `update()` ne peuvent écrire le brouillon (un `save()`
  // d'une entité lue trop tôt l'écraserait) ; seule saveDraft() le fait, en SQL direct.
  // `select: false` : jamais chargé par défaut (jusqu'à 1 Mo par chapitre) ; seules les
  // routes du brouillon le lisent (loadDraft). Défaut : un paragraphe vide, comme l'éditeur.
  @Column({
    type: 'jsonb',
    default: () => `'{"type": "doc", "content": [{"type": "paragraph"}]}'`,
    update: false,
    select: false,
  })
  draft!: object;

  /**
   * Version du brouillon, incrémentée par la seule sauvegarde du brouillon (pas par un
   * changement de titre ou d'ordre) : voir saveDraft(), jamais `save()` pour le brouillon.
   */
  @Column({ type: 'integer', default: 1, update: false })
  draftVersion!: number;

  @Column({ type: 'integer', default: 0 })
  wordCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
