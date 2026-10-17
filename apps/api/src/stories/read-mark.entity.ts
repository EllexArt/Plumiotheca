import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Story } from './story.entity.js';

/**
 * Lecture déjà comptée aujourd'hui (#17) : histoire, empreinte de la personne qui lit, jour.
 * L'empreinte est un HMAC du compte (ou de l'adresse IP pour une visite sans compte) avec le
 * sel du jour : sans ce sel, effacé le lendemain, elle ne permet de retrouver personne. Les
 * marques des jours passés sont effacées avec le sel.
 */
@Entity('read_marks')
@Index(['day'])
export class ReadMark {
  @PrimaryColumn({ type: 'uuid' })
  storyId!: string;

  @PrimaryColumn({ type: 'bytea' })
  reader!: Buffer;

  /** Jour (Europe/Paris) de la lecture. */
  @PrimaryColumn({ type: 'date' })
  day!: string;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'story_id' })
  story!: Relation<Story>;
}

/** Sel du jour des empreintes de lecture : un par jour, effacé le lendemain. */
@Entity('read_salts')
export class ReadSalt {
  @PrimaryColumn({ type: 'date' })
  day!: string;

  @Column({ type: 'bytea' })
  salt!: Buffer;
}
