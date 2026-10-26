import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Réindexations suivies (#82) : la réindexation complète rejoue, après l'échange d'index,
 * les histoires réindexées pendant qu'elle tournait.
 */
export class ReindexationsSuivies1793030000000 implements MigrationInterface {
  name = 'ReindexationsSuivies1793030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "search_syncs" ("story_id" uuid NOT NULL, "synced_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL, CONSTRAINT "PK_search_syncs" PRIMARY KEY ("story_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "search_syncs"`);
  }
}
