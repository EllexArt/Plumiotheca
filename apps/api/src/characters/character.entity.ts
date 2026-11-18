import { RelationshipKind } from '@plumiotheca/contracts';
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
import { Story } from '../stories/story.entity.js';

/**
 * Personnage (#79), par son nom : partagé entre histoires, comme un tag (« Ilse » est le
 * même personnage d'une histoire à l'autre). Les fiches d'univers s'y relieront (#58).
 */
@Entity('characters')
export class Character {
  @IdColumn()
  id!: string;

  /** Nom affiché, tel que saisi la première fois. */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /** Forme normalisée (casse, accents, espaces) : un seul personnage par forme. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  normalized!: string;

  @CreatedAt()
  createdAt!: Date;
}

/**
 * Relation (#79) : un type (romantique « / », platonique « & ») et ses personnages, quel que
 * soit leur ordre (`key`) ; le nom affiché garde l'ordre de la première saisie.
 */
@Entity('relationships')
export class Relationship {
  @IdColumn()
  id!: string;

  @Column({ type: 'enum', enum: RelationshipKind.options, enumName: 'relationship_kind' })
  kind!: RelationshipKind;

  @Column({ type: 'varchar', length: 300 })
  name!: string;

  /** Type et personnages normalisés, triés : « romantic:ilse|tomas ». */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 600 })
  key!: string;

  @CreatedAt()
  createdAt!: Date;
}

/** Personnages d'une histoire, dans l'ordre choisi. */
@Entity('story_characters')
@Index(['character'])
export class StoryCharacter {
  @PrimaryColumn({ type: 'uuid' })
  storyId!: string;

  @PrimaryColumn({ type: 'uuid' })
  characterId!: string;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'story_id' })
  story!: Relation<Story>;

  @ManyToOne(() => Character, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character!: Relation<Character>;

  @Column({ type: 'smallint' })
  position!: number;
}

/** Relations d'une histoire, dans l'ordre choisi. */
@Entity('story_relationships')
@Index(['relationship'])
export class StoryRelationship {
  @PrimaryColumn({ type: 'uuid' })
  storyId!: string;

  @PrimaryColumn({ type: 'uuid' })
  relationshipId!: string;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'story_id' })
  story!: Relation<Story>;

  @ManyToOne(() => Relationship, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'relationship_id' })
  relationship!: Relation<Relationship>;

  @Column({ type: 'smallint' })
  position!: number;
}
