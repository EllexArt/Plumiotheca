import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm';
import { Tag } from '../tags/tag.entity.js';
import { Story } from './story.entity.js';

/**
 * Tag posé sur une histoire. Supprimer une histoire retire ses tags ; supprimer un tag
 * encore utilisé est refusé (les jardiniers le fusionnent d'abord dans son tag canonique).
 */
@Entity('story_tags')
@Index(['tag'])
export class StoryTag {
  @PrimaryColumn({ type: 'uuid' })
  storyId!: string;

  @PrimaryColumn({ type: 'uuid' })
  tagId!: string;

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'story_id' })
  story!: Relation<Story>;

  @ManyToOne(() => Tag, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tag_id' })
  tag!: Relation<Tag>;
}
