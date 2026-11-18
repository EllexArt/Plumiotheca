import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journal du jardinage des tags (#78) : opérations, état des tags avant et après (pour
 * les annuler), et la personne qui a agi (oubliée avec son compte).
 */
export class JournalJardinage1794399731014 implements MigrationInterface {
  name = 'JournalJardinage1794399731014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."tag_operation_kind" AS ENUM('merge', 'split', 'parent', 'rename', 'revert')
        `);
    await queryRunner.query(`
            CREATE TABLE "tag_operations" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "kind" "public"."tag_operation_kind" NOT NULL,
                "summary" character varying(300) NOT NULL,
                "before" jsonb NOT NULL,
                "after" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "reverted_at" TIMESTAMP WITH TIME ZONE,
                "actor_id" uuid,
                CONSTRAINT "PK_aecca2fe5bee6aecd2fb0985eb6" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f82b096b075b9f1804dfa8bacb" ON "tag_operations" ("created_at")
        `);
    await queryRunner.query(`
            ALTER TABLE "tag_operations"
            ADD CONSTRAINT "FK_dc839d107cdc2bce9c35776f7e8" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tag_operations" DROP CONSTRAINT "FK_dc839d107cdc2bce9c35776f7e8"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f82b096b075b9f1804dfa8bacb"
        `);
    await queryRunner.query(`
            DROP TABLE "tag_operations"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."tag_operation_kind"
        `);
  }
}
