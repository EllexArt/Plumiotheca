import { MigrationInterface, QueryRunner } from 'typeorm';

const DELETED_IS_EMPTY = (extra: string) => `
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
                    AND "charter_accepted_at" IS NULL${extra}
                )
            )
        `;

/**
 * Suppression des comptes verrouillés « moins de 15 ans » 30 jours après (#141) : date du
 * verrouillage et début de la suppression (compte Keycloak désactivé, première étape).
 *
 * Les comptes déjà verrouillés sont datés au jour de la migration (délai compté à partir
 * d'aujourd'hui, choix prudent) ; annuler puis réappliquer la migration le remet à zéro.
 */
export class VerrouillageDate1791737688030 implements MigrationInterface {
  name = 'VerrouillageDate1791737688030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "age_locked_at" TIMESTAMP WITH TIME ZONE,
            ADD "age_purge_started_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            UPDATE "users" SET "age_locked_at" = now() WHERE "age_band" = 'under-15'
        `);
    // Daté si et seulement si verrouillé ; suppression commencée seulement si daté.
    await queryRunner.query(`
            ALTER TABLE "users" ADD CONSTRAINT "users_locked_has_date" CHECK (
                ("age_band" IS NOT DISTINCT FROM 'under-15') = ("age_locked_at" IS NOT NULL)
                AND ("age_purge_started_at" IS NULL OR "age_locked_at" IS NOT NULL)
            )
        `);
    // Un compte supprimé (anonymisé) ne garde aucune de ces dates.
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(
      DELETED_IS_EMPTY(`
                    AND "age_locked_at" IS NULL
                    AND "age_purge_started_at" IS NULL`),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(DELETED_IS_EMPTY(''));
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_locked_has_date"`);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "age_purge_started_at", DROP COLUMN "age_locked_at"
        `);
  }
}
