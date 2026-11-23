import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { User } from '../users/user.entity.js';

/**
 * Recherche enregistrée (#80) : ses paramètres d’adresse (Explorer) et ses alertes. Donnée
 * personnelle (ce qu’une personne cherche) : jamais montrée aux autres, supprimée avec le
 * compte.
 */
@Entity('saved_searches')
@Index(['user', 'createdAt'])
export class SavedSearchEntry {
  @IdColumn()
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn()
  user!: Relation<User>;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 2000 })
  query!: string;

  @Column({ type: 'boolean', default: true })
  alerts!: boolean;

  /** Histoires publiées après ce moment : les nouvelles de la prochaine alerte. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  checkedAt!: Date;

  @CreatedAt()
  createdAt!: Date;
}
