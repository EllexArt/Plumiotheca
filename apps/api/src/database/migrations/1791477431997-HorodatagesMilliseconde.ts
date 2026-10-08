import { MigrationInterface, QueryRunner } from 'typeorm';

export class HorodatagesMilliseconde1791477431997 implements MigrationInterface {
  name = 'HorodatagesMilliseconde1791477431997';

  // Curseurs de pagination (#138) : dates à la milliseconde, comme une date JavaScript.
  // Les valeurs existantes sont arrondies à la milliseconde.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."stories_public_list"
        `);
    await queryRunner.query(`
            ALTER TABLE "stories"
            ALTER COLUMN "published_at" TYPE TIMESTAMP(3) WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "stories"
            ALTER COLUMN "updated_at" TYPE TIMESTAMP(3) WITH TIME ZONE
        `);
    await queryRunner.query(`
            CREATE INDEX "stories_public_list" ON "stories" ("published_at", "id")
            WHERE "status" = 'published'
        `);
    await queryRunner.query(`
            CREATE INDEX "stories_mine" ON "stories" ("author_id", "updated_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."stories_mine"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."stories_public_list"
        `);
    await queryRunner.query(`
            ALTER TABLE "stories"
            ALTER COLUMN "updated_at" TYPE TIMESTAMP(6) WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "stories"
            ALTER COLUMN "published_at" TYPE TIMESTAMP(6) WITH TIME ZONE
        `);
    await queryRunner.query(`
            CREATE INDEX "stories_public_list" ON "stories" ("published_at", "id")
            WHERE "status" = 'published'
        `);
  }
}
