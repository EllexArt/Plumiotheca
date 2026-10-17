import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mes lectures (#30) : étagères et position de lecture, sur le compte (décision 54 amendée).
 */
export class MesLectures1792252868090 implements MigrationInterface {
  name = 'MesLectures1792252868090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."shelf" AS ENUM('reading', 'to_read', 'finished')
        `);
    await queryRunner.query(`
            CREATE TABLE "library_entries" (
                "user_id" uuid NOT NULL,
                "story_id" uuid NOT NULL,
                "shelf" "public"."shelf" NOT NULL,
                "chapter_id" uuid,
                "block_id" character varying(32),
                "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8d6d42e3acd91cc22e0ae83a1cb" PRIMARY KEY ("user_id", "story_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_bd71a70fa128ff98fa29aeee87" ON "library_entries" ("user_id", "shelf", "updated_at", "story_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "library_entries"
            ADD CONSTRAINT "FK_d03ef727850f4b1d48f67c5a1f3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "library_entries"
            ADD CONSTRAINT "FK_7d5add9de1ff09d967a8543bd7a" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "library_entries"
            ADD CONSTRAINT "FK_e3f3bfe36c602934dba2fdf402a" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "library_entries" DROP CONSTRAINT "FK_e3f3bfe36c602934dba2fdf402a"
        `);
    await queryRunner.query(`
            ALTER TABLE "library_entries" DROP CONSTRAINT "FK_7d5add9de1ff09d967a8543bd7a"
        `);
    await queryRunner.query(`
            ALTER TABLE "library_entries" DROP CONSTRAINT "FK_d03ef727850f4b1d48f67c5a1f3"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_bd71a70fa128ff98fa29aeee87"
        `);
    await queryRunner.query(`
            DROP TABLE "library_entries"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."shelf"
        `);
  }
}
