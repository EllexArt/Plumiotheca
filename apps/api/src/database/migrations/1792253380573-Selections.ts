import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sélections (#30) : étagères des membres, privées par défaut, et leurs histoires.
 */
export class Selections1792253380573 implements MigrationInterface {
  name = 'Selections1792253380573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."selection_visibility" AS ENUM('private', 'public')
        `);
    await queryRunner.query(`
            CREATE TABLE "selections" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "owner_id" uuid NOT NULL,
                "title" character varying(100) NOT NULL,
                "description" text NOT NULL DEFAULT '',
                "visibility" "public"."selection_visibility" NOT NULL DEFAULT 'private',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ca8c40db57a61d47e4f5fbbf04e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_72b9ab2e233f867284b3063ee8" ON "selections" ("visibility", "updated_at", "id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_45f4e35825a4b0189b4272ad2e" ON "selections" ("owner_id", "updated_at")
        `);
    await queryRunner.query(`
            CREATE TABLE "selection_items" (
                "selection_id" uuid NOT NULL,
                "story_id" uuid NOT NULL,
                "position" integer NOT NULL,
                "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e4b9daf47e1956ffbba8ce9e9a9" PRIMARY KEY ("selection_id", "story_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_4a685a87617759908d9149fd83" ON "selection_items" ("story_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "selections"
            ADD CONSTRAINT "FK_175d50dd262045193fb6ded065f" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "selection_items"
            ADD CONSTRAINT "FK_f730181654378a8b2f8cb990427" FOREIGN KEY ("selection_id") REFERENCES "selections"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "selection_items"
            ADD CONSTRAINT "FK_4a685a87617759908d9149fd830" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "selection_items" DROP CONSTRAINT "FK_4a685a87617759908d9149fd830"
        `);
    await queryRunner.query(`
            ALTER TABLE "selection_items" DROP CONSTRAINT "FK_f730181654378a8b2f8cb990427"
        `);
    await queryRunner.query(`
            ALTER TABLE "selections" DROP CONSTRAINT "FK_175d50dd262045193fb6ded065f"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4a685a87617759908d9149fd83"
        `);
    await queryRunner.query(`
            DROP TABLE "selection_items"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_45f4e35825a4b0189b4272ad2e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_72b9ab2e233f867284b3063ee8"
        `);
    await queryRunner.query(`
            DROP TABLE "selections"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."selection_visibility"
        `);
  }
}
