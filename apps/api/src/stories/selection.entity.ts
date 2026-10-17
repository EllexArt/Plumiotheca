import { SelectionVisibility } from '@plumiotheca/contracts';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { User } from '../users/user.entity.js';
import { Story } from './story.entity.js';

/**
 * Sélection (#30) : étagère composée par une personne, privée par défaut. Supprimée avec
 * son compte ; ses histoires en sont retirées si elles sont supprimées.
 */
@Entity('selections')
@Index(['owner', 'updatedAt'])
// Étagères publiques d’Explorer, les plus récentes d’abord.
@Index(['visibility', 'updatedAt', 'id'])
export class Selection {
  @IdColumn()
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner!: Relation<User>;

  @Column({ type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 100 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({
    type: 'enum',
    enum: SelectionVisibility.options,
    enumName: 'selection_visibility',
    default: 'private',
  })
  visibility!: SelectionVisibility;

  @CreatedAt()
  createdAt!: Date;

  // À la milliseconde : curseur des étagères publiques (date JavaScript).
  @Column({ type: 'timestamptz', precision: 3, default: () => 'now()' })
  updatedAt!: Date;
}

/** Une histoire dans une sélection, à sa place. */
@Entity('selection_items')
@Index(['story'])
export class SelectionItem {
  @PrimaryColumn({ type: 'uuid' })
  selectionId!: string;

  @PrimaryColumn({ type: 'uuid' })
  storyId!: string;

  @ManyToOne(() => Selection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'selection_id' })
  selection!: Relation<Selection>;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'story_id' })
  story!: Relation<Story>;

  @Column({ type: 'integer' })
  position!: number;

  @CreatedAt()
  addedAt!: Date;
}
