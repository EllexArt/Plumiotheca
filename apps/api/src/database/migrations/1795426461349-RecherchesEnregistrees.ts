import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recherches enregistrées et leurs alertes (#80) : une notification peut aussi annoncer de
 * nouvelles histoires pour une recherche (au plus une par jour et par recherche).
 */
export class RecherchesEnregistrees1795426461349 implements MigrationInterface {
  name = 'RecherchesEnregistrees1795426461349';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "saved_searches" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "name" character varying(100) NOT NULL,
                "query" character varying(2000) NOT NULL,
                "alerts" boolean NOT NULL DEFAULT true,
                "checked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "user_id" uuid NOT NULL,
                CONSTRAINT "PK_d9a53c71ccc5cf66dcdc5b33dfe" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_1a65b2a523833240aa55135ffb" ON "saved_searches" ("user_id", "created_at")
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD "data" jsonb
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD "saved_search_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_b9ef231a1c698c340f4fb73bb16"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_2f1facf9875fad7d70246b3d5ad"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "UQ_30d3bd6effa56c5304ff280f24e"
        `);
    // Nouveau type de notification : le type est recréé plutôt qu'étendu (ADD VALUE),
    // car une valeur ajoutée ne peut pas servir dans la même transaction (contrainte).
    await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "kind" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TYPE "public"."notification_kind" RENAME TO "notification_kind_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_kind" AS ENUM('new_chapter', 'saved_search')`,
    );
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ALTER COLUMN "kind" TYPE "public"."notification_kind"
            USING "kind"::"text"::"public"."notification_kind"
        `);
    await queryRunner.query(`DROP TYPE "public"."notification_kind_old"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "kind" SET DEFAULT 'new_chapter'`,
    );
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ALTER COLUMN "story_id" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ALTER COLUMN "chapter_id" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "notifications_kind_target" CHECK (
                    (
                        "kind" = 'new_chapter'
                        AND "story_id" IS NOT NULL
                        AND "chapter_id" IS NOT NULL
                    )
                    OR (
                        "kind" = 'saved_search'
                        AND "saved_search_id" IS NOT NULL
                    )
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "UQ_30d3bd6effa56c5304ff280f24e" UNIQUE ("user_id", "chapter_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "saved_searches"
            ADD CONSTRAINT "FK_8f01d13ac8e7b451d244674274f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_b9ef231a1c698c340f4fb73bb16" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_2f1facf9875fad7d70246b3d5ad" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_9e29679a25a1fe337b89d4ed49e" FOREIGN KEY ("saved_search_id") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Alertes de recherche : sans équivalent avant cette migration.
    await queryRunner.query(`DELETE FROM "notifications" WHERE "kind" = 'saved_search'`);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_9e29679a25a1fe337b89d4ed49e"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_2f1facf9875fad7d70246b3d5ad"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_b9ef231a1c698c340f4fb73bb16"
        `);
    await queryRunner.query(`
            ALTER TABLE "saved_searches" DROP CONSTRAINT "FK_8f01d13ac8e7b451d244674274f"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "UQ_30d3bd6effa56c5304ff280f24e"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_target"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ALTER COLUMN "chapter_id"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ALTER COLUMN "story_id"
            SET NOT NULL
        `);
    await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "kind" DROP DEFAULT`);
    await queryRunner.query(`
            CREATE TYPE "public"."notification_kind_old" AS ENUM('new_chapter')
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ALTER COLUMN "kind" TYPE "public"."notification_kind_old" USING "kind"::"text"::"public"."notification_kind_old"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."notification_kind"
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."notification_kind_old"
            RENAME TO "notification_kind"
        `);
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "kind" SET DEFAULT 'new_chapter'`,
    );
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "UQ_30d3bd6effa56c5304ff280f24e" UNIQUE ("user_id", "chapter_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_2f1facf9875fad7d70246b3d5ad" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_b9ef231a1c698c340f4fb73bb16" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP COLUMN "saved_search_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP COLUMN "data"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1a65b2a523833240aa55135ffb"
        `);
    await queryRunner.query(`
            DROP TABLE "saved_searches"
        `);
  }
}
