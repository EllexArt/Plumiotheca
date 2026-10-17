import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saisie intelligente (#31) : index de trigrammes pour suggérer tags et pseudonymes malgré
 * les fautes de frappe. pg_trgm est une extension « de confiance » : le propriétaire de la
 * base peut la créer sans être superutilisateur.
 */
export class SaisieIntelligente1792254000000 implements MigrationInterface {
  name = 'SaisieIntelligente1792254000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX "tags_normalized_trgm" ON "tags" USING gin ("normalized" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "users_handle_key_trgm" ON "users" USING gin ("handle_key" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "users_handle_key_trgm"`);
    await queryRunner.query(`DROP INDEX "tags_normalized_trgm"`);
    // L’extension reste : d’autres objets pourraient en dépendre.
  }
}
