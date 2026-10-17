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
                    AND "reading_preferences" IS NULL${extra}
                )
            )
        `;

/**
 * Mes limites (#152) : avertissements facultatifs masqués partout. Donnée personnelle (elle
 * peut révéler ce qui touche quelqu'un) : un compte supprimé (anonymisé) n'en garde pas.
 */
export class Limites1792250556806 implements MigrationInterface {
  name = 'Limites1792250556806';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "limits" jsonb`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(
      DELETED_IS_EMPTY(`
                    AND "limits" IS NULL`),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(DELETED_IS_EMPTY(''));
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "limits"`);
  }
}
