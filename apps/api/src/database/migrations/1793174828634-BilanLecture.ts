import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bilan de lecture (#34) : temps de lecture cumulé par mois, et réglage du bilan (activé
 * par défaut).
 */
export class BilanLecture1793174828634 implements MigrationInterface {
  name = 'BilanLecture1793174828634';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "reading_times" (
                "user_id" uuid NOT NULL,
                "month" date NOT NULL,
                "seconds" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_e8dfdb4cd6a112cd059464da324" PRIMARY KEY ("user_id", "month")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "reading_stats" boolean NOT NULL DEFAULT true
        `);
    await queryRunner.query(`
            ALTER TABLE "reading_times"
            ADD CONSTRAINT "FK_4fb214ca0406a2be51c9774971c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "reading_times" DROP CONSTRAINT "FK_4fb214ca0406a2be51c9774971c"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "reading_stats"
        `);
    await queryRunner.query(`
            DROP TABLE "reading_times"
        `);
  }
}
