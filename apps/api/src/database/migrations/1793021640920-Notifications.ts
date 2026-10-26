import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notifications sur le site (#33) : nouveaux chapitres des histoires de Mes lectures,
 * gardées 90 jours ; préférence d’e-mail récapitulatif (« never » par défaut).
 */
export class Notifications1793021640920 implements MigrationInterface {
  name = 'Notifications1793021640920';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."notification_kind" AS ENUM('new_chapter')
        `);
    await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "kind" "public"."notification_kind" NOT NULL DEFAULT 'new_chapter',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "read_at" TIMESTAMP WITH TIME ZONE,
                "user_id" uuid NOT NULL,
                "story_id" uuid NOT NULL,
                "chapter_id" uuid NOT NULL,
                CONSTRAINT "UQ_30d3bd6effa56c5304ff280f24e" UNIQUE ("user_id", "chapter_id"),
                CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_77ee7b06d6f802000c0846f3a5" ON "notifications" ("created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_42a3b53ed1260d584bca380188" ON "notifications" ("user_id", "id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."email_digest" AS ENUM('never', 'daily', 'weekly')
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "email_digest" "public"."email_digest" NOT NULL DEFAULT 'never'
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_b9ef231a1c698c340f4fb73bb16" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "FK_2f1facf9875fad7d70246b3d5ad" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_2f1facf9875fad7d70246b3d5ad"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_b9ef231a1c698c340f4fb73bb16"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "email_digest"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."email_digest"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_42a3b53ed1260d584bca380188"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_77ee7b06d6f802000c0846f3a5"
        `);
    await queryRunner.query(`
            DROP TABLE "notifications"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."notification_kind"
        `);
  }
}
