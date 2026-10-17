import { MigrationInterface, QueryRunner } from 'typeorm';

export class HistoiresEtChapitres1791029268234 implements MigrationInterface {
  name = 'HistoiresEtChapitres1791029268234';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "chapters"
            ALTER COLUMN "draft"
            SET DEFAULT '{"type": "doc", "content": [{"type": "paragraph"}]}'
        `);
    await queryRunner.query(`
            CREATE INDEX "stories_public_list" ON "stories" ("published_at", "id")
            WHERE "status" = 'published'
        `);
    // Une révision ne change jamais de chapitre (variante de la faille C2).
    await queryRunner.query(`
            CREATE FUNCTION chapter_revision_immutable_chapter() RETURNS trigger AS $$
            BEGIN
              RAISE EXCEPTION 'chapter_id d''une révision non modifiable' USING ERRCODE = '23514';
            END $$ LANGUAGE plpgsql
        `);
    await queryRunner.query(`
            CREATE TRIGGER chapter_revisions_chapter_immutable
            BEFORE UPDATE OF chapter_id ON chapter_revisions
            FOR EACH ROW WHEN (OLD.chapter_id IS DISTINCT FROM NEW.chapter_id)
            EXECUTE FUNCTION chapter_revision_immutable_chapter()
        `);
    // Un chapitre publié a toujours une révision courante (vérifié en fin de transaction,
    // pour permettre de publier en plusieurs étapes).
    await queryRunner.query(`
            CREATE FUNCTION chapter_published_has_revision() RETURNS trigger AS $$
            DECLARE target uuid;
            BEGIN
              IF TG_TABLE_NAME = 'chapters' THEN
                target := NEW.id;
              ELSIF TG_OP = 'DELETE' THEN
                target := OLD.chapter_id;
              ELSE
                target := NEW.chapter_id;
              END IF;
              IF EXISTS (SELECT 1 FROM chapters c WHERE c.id = target AND c.status = 'published')
                 AND NOT EXISTS (SELECT 1 FROM chapter_revisions r WHERE r.chapter_id = target AND r.current)
              THEN
                RAISE EXCEPTION 'chapitre publié sans révision courante' USING ERRCODE = '23514';
              END IF;
              RETURN NULL;
            END $$ LANGUAGE plpgsql
        `);
    await queryRunner.query(`
            CREATE CONSTRAINT TRIGGER chapters_published_has_revision
            AFTER INSERT OR UPDATE OF status ON chapters
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION chapter_published_has_revision()
        `);
    await queryRunner.query(`
            CREATE CONSTRAINT TRIGGER chapter_revisions_keep_current
            AFTER UPDATE OF current OR DELETE ON chapter_revisions
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION chapter_published_has_revision()
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER chapter_revisions_keep_current ON chapter_revisions`);
    await queryRunner.query(`DROP TRIGGER chapters_published_has_revision ON chapters`);
    await queryRunner.query(`DROP FUNCTION chapter_published_has_revision()`);
    await queryRunner.query(
      `DROP TRIGGER chapter_revisions_chapter_immutable ON chapter_revisions`,
    );
    await queryRunner.query(`DROP FUNCTION chapter_revision_immutable_chapter()`);
    await queryRunner.query(`
            DROP INDEX "public"."stories_public_list"
        `);
    await queryRunner.query(`
            ALTER TABLE "chapters"
            ALTER COLUMN "draft"
            SET DEFAULT '{"type": "doc", "content": []}'
        `);
  }
}
