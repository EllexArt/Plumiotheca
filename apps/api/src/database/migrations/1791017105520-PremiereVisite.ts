import { MigrationInterface, QueryRunner } from 'typeorm';

export class PremiereVisite1791017105520 implements MigrationInterface {
  name = 'PremiereVisite1791017105520';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "handle_changed_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."age_band"
            ADD VALUE 'under-15'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."age_band_old" AS ENUM('15-17', '18+')
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "age_band" TYPE "public"."age_band_old" USING "age_band"::"text"::"public"."age_band_old"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."age_band"
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."age_band_old"
            RENAME TO "age_band"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "handle_changed_at"
        `);
  }
}
