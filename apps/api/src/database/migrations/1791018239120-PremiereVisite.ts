import { MigrationInterface, QueryRunner } from 'typeorm';

export class PremiereVisite1791018239120 implements MigrationInterface {
  name = 'PremiereVisite1791018239120';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "handle_history" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "handle" character varying(30) NOT NULL,
                "handle_key" character varying(30) NOT NULL,
                "used_until" TIMESTAMP WITH TIME ZONE NOT NULL,
                "user_id" uuid NOT NULL,
                CONSTRAINT "PK_95ca28d29e84fdef23433c52ecc" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_8a93621f5018fa78ad573f3a91" ON "handle_history" ("user_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_021627543516bbf70875766cd0" ON "handle_history" ("handle_key")
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "handle_changed_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."age_band"
            ADD VALUE 'under-15'
        `);
    await queryRunner.query(`
            ALTER TABLE "handle_history"
            ADD CONSTRAINT "FK_8a93621f5018fa78ad573f3a91b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Retour arrière : « under-15 » n'existe pas dans l'ancien type. Les comptes
    // verrouillés repassent à « âge non renseigné » (le verrou est perdu).
    await queryRunner.query(`UPDATE "users" SET "age_band" = NULL WHERE "age_band" = 'under-15'`);
    await queryRunner.query(`
            ALTER TABLE "handle_history" DROP CONSTRAINT "FK_8a93621f5018fa78ad573f3a91b"
        `);
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
    await queryRunner.query(`
            DROP INDEX "public"."IDX_021627543516bbf70875766cd0"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8a93621f5018fa78ad573f3a91"
        `);
    await queryRunner.query(`
            DROP TABLE "handle_history"
        `);
  }
}
