import { MigrationInterface, QueryRunner } from 'typeorm';

export class AvertissementsFacultatifs1791201913977 implements MigrationInterface {
  name = 'AvertissementsFacultatifs1791201913977';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."content_warning" AS ENUM(
                'grief',
                'violence',
                'suicide',
                'self_harm',
                'eating_disorder',
                'addiction',
                'abuse',
                'harassment',
                'discrimination',
                'animal_harm',
                'pregnancy_loss',
                'medical'
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "stories"
            ADD "content_warnings" "public"."content_warning" array NOT NULL DEFAULT '{}'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stories" DROP COLUMN "content_warnings"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."content_warning"
        `);
  }
}
