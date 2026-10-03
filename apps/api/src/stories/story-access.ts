import { HttpStatus } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import type { User } from '../users/user.entity.js';
import { Story } from './story.entity.js';

/**
 * Règles de visibilité et de propriété des histoires, en un seul endroit (testé) :
 * - le public ne voit que les histoires publiées dont l'autrice ou l'auteur a un compte actif et
 *   complet (ni verrouillé, ni en cours de suppression : décision 41) ;
 * - la personne qui écrit voit et modifie les siennes, brouillons compris ;
 * - une histoire invisible pour vous répond 404 (son existence ne fuite pas) ; visible mais
 *   pas à vous, une modification répond 403.
 */
export function publicStories(qb: SelectQueryBuilder<Story>, alias = 'story', author = 'author') {
  return qb
    .andWhere(`${alias}.status = 'published'`)
    .andWhere(`${author}.status = 'active'`)
    .andWhere(`${author}.age_band IN ('15-17', '18+')`)
    .andWhere(`${author}.handle IS NOT NULL`);
}

const isPublic = (story: Story) =>
  story.status === 'published' &&
  story.author.status === 'active' &&
  (story.author.ageBand === '15-17' || story.author.ageBand === '18+') &&
  story.author.handle !== null;

/** L'histoire si vous pouvez la voir, sinon 404. */
export async function visibleStory(
  db: EntityManager,
  id: string,
  viewer: User | null,
): Promise<Story> {
  const story = await db
    .getRepository(Story)
    .findOne({ where: { id }, relations: { author: true } });
  if (!story) throw new NotFoundException();
  if (viewer && story.author.id === viewer.id) return story;
  if (isPublic(story)) return story;
  throw new NotFoundException();
}

/** L'histoire si vous l'avez écrite ; 404 si vous ne la voyez pas, 403 sinon. */
export async function ownedStory(db: EntityManager, id: string, account: User): Promise<Story> {
  const story = await visibleStory(db, id, account);
  if (story.author.id !== account.id) {
    throw new ApiProblem(
      HttpStatus.FORBIDDEN,
      'Seule l’autrice ou l’auteur de cette histoire peut la modifier.',
    );
  }
  return story;
}

/** Verrouille l'histoire le temps d'une transaction (numérotation, publication, tags). */
export async function lockStory(tx: EntityManager, storyId: string): Promise<void> {
  await tx.query('SELECT id FROM stories WHERE id = $1 FOR UPDATE', [storyId]);
}
