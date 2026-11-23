import { TagOperationKind } from '@plumiotheca/contracts';
import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { User } from '../users/user.entity.js';

/** État d'un tag avant ou après une opération (de quoi l'annuler). */
export interface TagState {
  id: string;
  name: string;
  normalized: string;
  canonicalId: string | null;
  parentId: string | null;
}

/**
 * Journal du jardinage des tags (#78) : chaque fusion, séparation, rattachement ou
 * renommage, avec l'état des tags touchés avant et après. Annuler rejoue l'état « avant »,
 * si les tags n'ont pas changé depuis. Lisible des jardiniers seulement ; la personne qui a
 * agi est oubliée (NULL) avec son compte.
 */
@Entity('tag_operations')
@Index(['createdAt'])
export class TagOperationEntry {
  @IdColumn()
  id!: string;

  @Column({ type: 'enum', enum: TagOperationKind.options, enumName: 'tag_operation_kind' })
  kind!: TagOperationKind;

  /** Phrase lisible, figée au moment de l'opération (les noms peuvent changer ensuite). */
  @Column({ type: 'varchar', length: 300 })
  summary!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  actor!: Relation<User> | null;

  @Column({ type: 'jsonb' })
  before!: TagState[];

  @Column({ type: 'jsonb' })
  after!: TagState[];

  @CreatedAt()
  createdAt!: Date;

  /** Opération annulée par une autre (« revert ») du journal. */
  @Column({ type: 'timestamptz', nullable: true })
  revertedAt!: Date | null;
}
