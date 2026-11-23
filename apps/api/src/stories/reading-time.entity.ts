import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';
import { User } from '../users/user.entity.js';

/**
 * Temps de lecture (#34), cumulé par mois (Europe/Paris) : ni heure, ni jour, ni histoire.
 * Donnée personnelle, jamais montrée aux autres ; effacée quand la personne désactive son
 * bilan, et avec le compte.
 */
@Entity('reading_times')
export class ReadingTimeEntry {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  /** Premier jour du mois. */
  @PrimaryColumn({ type: 'date' })
  month!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'int', default: 0 })
  seconds!: number;
}
