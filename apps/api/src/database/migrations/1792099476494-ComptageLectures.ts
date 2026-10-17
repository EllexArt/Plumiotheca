import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lectures uniques (#17) : compteur par histoire, empreintes du jour (HMAC salé) et sel du
 * jour, effacés le lendemain.
 */
export class ComptageLectures1792099476494 implements MigrationInterface {
  name = 'ComptageLectures1792099476494';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "read_marks" (
                "story_id" uuid NOT NULL,
                "reader" bytea NOT NULL,
                "day" date NOT NULL,
                CONSTRAINT "PK_2a901c254bb7f9516fb63a5fd71" PRIMARY KEY ("story_id", "reader", "day")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9de27ef853be6fdc0baa03073a" ON "read_marks" ("day")
        `);
    await queryRunner.query(`
            CREATE TABLE "read_salts" (
                "day" date NOT NULL,
                "salt" bytea NOT NULL,
                CONSTRAINT "PK_b553e1ccf102c6edc9adc2921ce" PRIMARY KEY ("day")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "stories"
            ADD "read_count" integer NOT NULL DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "stories" ADD CONSTRAINT "stories_read_count_positive" CHECK ("read_count" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "read_marks"
            ADD CONSTRAINT "FK_c1d6df23021d00e0caa9fb1b05e" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "read_marks" DROP CONSTRAINT "FK_c1d6df23021d00e0caa9fb1b05e"
        `);
    await queryRunner.query(`
            ALTER TABLE "stories" DROP CONSTRAINT "stories_read_count_positive"
        `);
    await queryRunner.query(`
            ALTER TABLE "stories" DROP COLUMN "read_count"
        `);
    await queryRunner.query(`
            DROP TABLE "read_salts"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9de27ef853be6fdc0baa03073a"
        `);
    await queryRunner.query(`
            DROP TABLE "read_marks"
        `);
  }
}
