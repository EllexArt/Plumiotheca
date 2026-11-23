import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personnages et relations (#79) : partagés entre histoires (noms normalisés), et ceux de
 * chaque histoire dans l’ordre choisi.
 */
export class PersonnagesRelations1794846473500 implements MigrationInterface {
  name = 'PersonnagesRelations1794846473500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "characters" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "name" character varying(100) NOT NULL,
                "normalized" character varying(100) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_9d731e05758f26b9315dac5e378" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_412b38e8a5fc63455120174488" ON "characters" ("normalized")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."relationship_kind" AS ENUM('romantic', 'platonic')
        `);
    await queryRunner.query(`
            CREATE TABLE "relationships" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "kind" "public"."relationship_kind" NOT NULL,
                "name" character varying(300) NOT NULL,
                "key" character varying(600) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ba20e2f5cf487408e08e4dcecaf" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_5d3687c85e04c0fc015b618b09" ON "relationships" ("key")
        `);
    await queryRunner.query(`
            CREATE TABLE "story_characters" (
                "story_id" uuid NOT NULL,
                "character_id" uuid NOT NULL,
                "position" smallint NOT NULL,
                CONSTRAINT "PK_bd31a95ca54ebdf91d9d8ab016f" PRIMARY KEY ("story_id", "character_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_68568f527d3ebcd85ea80140cb" ON "story_characters" ("character_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "story_relationships" (
                "story_id" uuid NOT NULL,
                "relationship_id" uuid NOT NULL,
                "position" smallint NOT NULL,
                CONSTRAINT "PK_1126588a7a443d35dad16517dc9" PRIMARY KEY ("story_id", "relationship_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_07f75fd35d07605f2e2db077b8" ON "story_relationships" ("relationship_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "story_characters"
            ADD CONSTRAINT "FK_d1adb0cee5d4661be96b33ee6de" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "story_characters"
            ADD CONSTRAINT "FK_68568f527d3ebcd85ea80140cb1" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "story_relationships"
            ADD CONSTRAINT "FK_c9faff89c0f3b0abd7295b2bad2" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "story_relationships"
            ADD CONSTRAINT "FK_07f75fd35d07605f2e2db077b83" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "story_relationships" DROP CONSTRAINT "FK_07f75fd35d07605f2e2db077b83"
        `);
    await queryRunner.query(`
            ALTER TABLE "story_relationships" DROP CONSTRAINT "FK_c9faff89c0f3b0abd7295b2bad2"
        `);
    await queryRunner.query(`
            ALTER TABLE "story_characters" DROP CONSTRAINT "FK_68568f527d3ebcd85ea80140cb1"
        `);
    await queryRunner.query(`
            ALTER TABLE "story_characters" DROP CONSTRAINT "FK_d1adb0cee5d4661be96b33ee6de"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_07f75fd35d07605f2e2db077b8"
        `);
    await queryRunner.query(`
            DROP TABLE "story_relationships"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_68568f527d3ebcd85ea80140cb"
        `);
    await queryRunner.query(`
            DROP TABLE "story_characters"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5d3687c85e04c0fc015b618b09"
        `);
    await queryRunner.query(`
            DROP TABLE "relationships"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."relationship_kind"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_412b38e8a5fc63455120174488"
        `);
    await queryRunner.query(`
            DROP TABLE "characters"
        `);
  }
}
