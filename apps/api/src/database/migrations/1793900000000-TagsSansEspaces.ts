import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tags normalisés sans espaces (#78) : « slow burn » et « slowburn » deviennent le même tag.
 * Les formes normalisées existantes (déjà sans casse, accents ni tirets, espaces simples)
 * perdent leurs espaces ; deux tags qui se retrouvent identiques sont fusionnés dans le plus
 * ancien (histoires, synonymes et sous-tags rattachés à lui). Les tags masqués de Mes limites
 * suivent la même forme.
 *
 * Pas de retour arrière : les tags fusionnés ne se séparent pas automatiquement (un
 * jardinier peut toujours en déclarer un synonyme).
 */
export class TagsSansEspaces1793900000000 implements MigrationInterface {
  name = 'TagsSansEspaces1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tag gardé pour chaque nouvelle forme : le plus ancien.
    await queryRunner.query(`
      CREATE TEMPORARY TABLE tag_merge ON COMMIT DROP AS
      SELECT t.id AS old_id, k.keep_id
      FROM tags t
      JOIN (
        SELECT DISTINCT ON (replace(normalized, ' ', ''))
               replace(normalized, ' ', '') AS key, id AS keep_id
        FROM tags
        ORDER BY replace(normalized, ' ', ''), created_at, id
      ) k ON k.key = replace(t.normalized, ' ', '')
      WHERE t.id <> k.keep_id
    `);
    // Histoires : vers le tag gardé (sans doublon).
    await queryRunner.query(`
      INSERT INTO story_tags (story_id, tag_id)
      SELECT st.story_id, m.keep_id FROM story_tags st JOIN tag_merge m ON m.old_id = st.tag_id
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(
      `DELETE FROM story_tags WHERE tag_id IN (SELECT old_id FROM tag_merge)`,
    );
    // Synonymes et sous-tags des tags fusionnés : vers le tag gardé (jamais vers lui-même).
    await queryRunner.query(`
      UPDATE tags t SET canonical_id = NULLIF(m.keep_id, t.id)
      FROM tag_merge m WHERE t.canonical_id = m.old_id
    `);
    await queryRunner.query(`
      UPDATE tags t SET parent_id = NULLIF(m.keep_id, t.id)
      FROM tag_merge m WHERE t.parent_id = m.old_id
    `);
    await queryRunner.query(`DELETE FROM tags WHERE id IN (SELECT old_id FROM tag_merge)`);
    await queryRunner.query(`UPDATE tags SET normalized = replace(normalized, ' ', '')`);
    // Un tag gardé qui était lui-même synonyme d'un tag fusionné en lui : de nouveau canonique.
    await queryRunner.query(`UPDATE tags SET canonical_id = NULL WHERE canonical_id = id`);
    await queryRunner.query(`
      UPDATE users SET limits = jsonb_set(
        limits, '{hiddenTags}',
        (SELECT coalesce(jsonb_agg(DISTINCT replace(tag, ' ', '')), '[]'::jsonb)
         FROM jsonb_array_elements_text(limits->'hiddenTags') AS tag))
      WHERE limits ? 'hiddenTags'
    `);
  }

  public async down(): Promise<void> {
    // Rien à défaire sans perte : voir plus haut.
  }
}
