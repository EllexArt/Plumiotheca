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
                    AND "age_purge_started_at" IS NULL${extra}
                )
            )
        `;

/**
 * Avatar (#26) : une image interne (média prêt), retirée si l'image est supprimée. Un
 * compte supprimé (anonymisé) n'en garde pas.
 */
export class Avatar1792101373024 implements MigrationInterface {
  name = 'Avatar1792101373024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "avatar_media_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_d9c628b3f5b6ae73eb41c2045eb" FOREIGN KEY ("avatar_media_id") REFERENCES "media"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(
      DELETED_IS_EMPTY(`
                    AND "avatar_media_id" IS NULL`),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_deleted_is_empty"`);
    await queryRunner.query(DELETED_IS_EMPTY(''));
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "FK_d9c628b3f5b6ae73eb41c2045eb"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "avatar_media_id"
        `);
  }
}
