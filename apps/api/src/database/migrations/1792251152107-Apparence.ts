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
                    AND "charter_accepted_at" IS NULL
                    AND "age_locked_at" IS NULL
                    AND "age_purge_started_at" IS NULL
                    AND "avatar_media_id" IS NULL
                    AND "reading_preferences" IS NULL
                    AND "limits" IS NULL${extra}
                )
            )
        `;

/**
 * Apparence du site (#77) : ambiance et mode, sur le compte. Un compte supprimé (anonymisé)
 * n'en garde pas.
 */
export class Apparence1792251152107 implements MigrationInterface {
  name = 'Apparence1792251152107';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "appearance" jsonb`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(
      DELETED_IS_EMPTY(`
                    AND "appearance" IS NULL`),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(DELETED_IS_EMPTY(''));
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "appearance"`);
  }
}
