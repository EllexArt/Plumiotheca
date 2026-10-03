import { Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { IdColumn } from '../database/columns.js';
import { User } from './user.entity.js';

/**
 * Anciens pseudonymes d'un compte, lisibles par la modération seule et gardés un an
 * (décision 44) : un signalement qui cite un ancien nom reste rattachable, et changer de
 * pseudonyme tous les mois n'efface pas ses traces. Jamais exposé publiquement.
 */
@Entity('handle_history')
@Index(['handleKey'])
export class HandleHistory {
  @IdColumn()
  id!: string;

  @Index()
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  user!: Relation<User>;

  @Column({ type: 'varchar', length: 30 })
  handle!: string;

  @Column({ type: 'varchar', length: 30 })
  handleKey!: string;

  /** Fin d'utilisation ; la ligne est purgée un an après (tâche planifiée, #70). */
  @Column({ type: 'timestamptz' })
  usedUntil!: Date;
}
