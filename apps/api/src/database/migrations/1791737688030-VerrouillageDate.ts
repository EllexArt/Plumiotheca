import { MigrationInterface, QueryRunner } from 'typeorm';

/** Date du verrouillage « moins de 15 ans » : suppression du compte 30 jours après (#141). */
export class VerrouillageDate1791737688030 implements MigrationInterface {
  name = 'VerrouillageDate1791737688030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "age_locked_at" TIMESTAMP WITH TIME ZONE
        `);
    // Comptes déjà verrouillés : le délai de 30 jours part d'aujourd'hui.
    await queryRunner.query(`
            UPDATE "users" SET "age_locked_at" = now() WHERE "age_band" = 'under-15'
        `);
    await queryRunner.query(`
            ALTER TABLE "users" ADD CONSTRAINT "users_locked_has_date"
            CHECK ("age_band" <> 'under-15' OR "age_locked_at" IS NOT NULL)
        `);
    // Un compte supprimé (anonymisé) ne garde pas non plus la date du verrouillage.
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" ADD CONSTRAINT "users_deleted_is_empty" CHECK (
                "status" <> 'deleted'
                OR (
                    "keycloak_id" IS NULL
                    AND "handle" IS NULL
                    AND "handle_key" IS NULL
                    AND "display_name" IS NULL
                    AND "pronouns" IS NULL
                    AND "bio" IS NULL
                    AND "age_band" IS NULL
                    AND "charter_version" IS NULL
                    AND "charter_accepted_at" IS NULL
                    AND "age_locked_at" IS NULL
                )
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" ADD CONSTRAINT "users_deleted_is_empty" CHECK (
                "status" <> 'deleted'
                OR (
                    "keycloak_id" IS NULL
                    AND "handle" IS NULL
                    AND "handle_key" IS NULL
                    AND "display_name" IS NULL
                    AND "pronouns" IS NULL
                    AND "bio" IS NULL
                    AND "age_band" IS NULL
                    AND "charter_version" IS NULL
                    AND "charter_accepted_at" IS NULL
                )
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "users_locked_has_date"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "age_locked_at"
        `);
  }
}
