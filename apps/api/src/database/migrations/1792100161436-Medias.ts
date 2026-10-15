import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Images téléversées (#18) : autorisation, traitement, refus ; une image prête a ses
 * dimensions, une image refusée sa raison.
 */
export class Medias1792100161436 implements MigrationInterface {
  name = 'Medias1792100161436';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."media_kind" AS ENUM('avatar', 'cover')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."media_status" AS ENUM('pending', 'processing', 'ready', 'rejected')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."media_rejection" AS ENUM('format', 'taille', 'illisible', 'absent')
        `);
    await queryRunner.query(`
            CREATE TABLE "media" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "owner_id" uuid NOT NULL,
                "kind" "public"."media_kind" NOT NULL,
                "status" "public"."media_status" NOT NULL DEFAULT 'pending',
                "rejection" "public"."media_rejection",
                "width" integer,
                "height" integer,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "processed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "media_status_consistent" CHECK (
                    ("status" = 'ready') = (
                        "width" IS NOT NULL
                        AND "height" IS NOT NULL
                    )
                    AND ("status" = 'rejected') = ("rejection" IS NOT NULL)
                ),
                CONSTRAINT "PK_f4e0fcac36e050de337b670d8bd" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_81023eea7e43fa21849dfd3e8f" ON "media" ("status", "created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_8a3dd0913c2a96451fade65e4a" ON "media" ("owner_id", "created_at")
        `);
    await queryRunner.query(`
            ALTER TABLE "media"
            ADD CONSTRAINT "FK_c6889397830b5ed0f2a30362065" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "media" DROP CONSTRAINT "FK_c6889397830b5ed0f2a30362065"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8a3dd0913c2a96451fade65e4a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_81023eea7e43fa21849dfd3e8f"
        `);
    await queryRunner.query(`
            DROP TABLE "media"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."media_rejection"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."media_status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."media_kind"
        `);
  }
}
