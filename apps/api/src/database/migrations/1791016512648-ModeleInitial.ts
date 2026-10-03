import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModeleInitial1791016512648 implements MigrationInterface {
  name = 'ModeleInitial1791016512648';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."age_band" AS ENUM('15-17', '18+')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."account_status" AS ENUM('active', 'deletion_pending', 'deleted')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."deletion_mode" AS ENUM('erase', 'anonymize')
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "keycloak_id" uuid,
                "handle" character varying(30),
                "handle_key" character varying(30),
                "display_name" character varying(50),
                "pronouns" character varying(30),
                "bio" text,
                "age_band" "public"."age_band",
                "charter_version" character varying(20),
                "charter_accepted_at" TIMESTAMP WITH TIME ZONE,
                "status" "public"."account_status" NOT NULL DEFAULT 'active',
                "deletion_requested_at" TIMESTAMP WITH TIME ZONE,
                "deletion_mode" "public"."deletion_mode",
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "users_deleted_is_empty" CHECK (
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
                    )
                ),
                CONSTRAINT "users_active_has_keycloak_id" CHECK (
                    "status" = 'deleted'
                    OR "keycloak_id" IS NOT NULL
                ),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_2cecdb4ce6f8d26aade7977c37" ON "users" ("keycloak_id")
            WHERE keycloak_id IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_4b0ff48556ade4edef9f6cb03e" ON "users" ("handle_key")
            WHERE handle_key IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."rating" AS ENUM('general', 'teen', 'mature')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."story_status" AS ENUM('draft', 'published', 'archived')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."completion" AS ENUM('in_progress', 'completed')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."major_warning" AS ENUM(
                'character_death',
                'graphic_violence',
                'non_consent',
                'unspecified'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "stories" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "title" character varying(200) NOT NULL,
                "summary" text NOT NULL DEFAULT '',
                "language" character varying(12) NOT NULL,
                "rating" "public"."rating",
                "status" "public"."story_status" NOT NULL DEFAULT 'draft',
                "completion" "public"."completion" NOT NULL DEFAULT 'in_progress',
                "major_warnings" "public"."major_warning" array,
                "word_count" integer NOT NULL DEFAULT '0',
                "published_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "author_id" uuid NOT NULL,
                CONSTRAINT "stories_word_count_positive" CHECK ("word_count" >= 0),
                CONSTRAINT "stories_published_is_classified" CHECK (
                    "status" <> 'published'
                    OR (
                        "rating" IS NOT NULL
                        AND "major_warnings" IS NOT NULL
                    )
                ),
                CONSTRAINT "PK_bb6f880b260ed96c452b32a39f0" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_3cb50cf2affbc809a6c626253e" ON "stories" ("author_id", "status")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."chapter_status" AS ENUM('draft', 'published')
        `);
    await queryRunner.query(`
            CREATE TABLE "chapters" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "position" integer NOT NULL,
                "title" character varying(200) NOT NULL DEFAULT '',
                "status" "public"."chapter_status" NOT NULL DEFAULT 'draft',
                "draft" jsonb NOT NULL DEFAULT '{"type": "doc", "content": []}',
                "draft_version" integer NOT NULL DEFAULT '1',
                "word_count" integer NOT NULL DEFAULT '0',
                "published_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "story_id" uuid NOT NULL,
                CONSTRAINT "chapters_story_position" UNIQUE ("story_id", "position") DEFERRABLE INITIALLY DEFERRED,
                CONSTRAINT "chapters_draft_version_positive" CHECK ("draft_version" >= 1),
                CONSTRAINT "chapters_word_count_positive" CHECK ("word_count" >= 0),
                CONSTRAINT "chapters_position_positive" CHECK ("position" >= 1),
                CONSTRAINT "PK_a2bbdbb4bdc786fe0cb0fcfc4a0" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."revision_kind" AS ENUM('autosave', 'named', 'published')
        `);
    await queryRunner.query(`
            CREATE TABLE "chapter_revisions" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "kind" "public"."revision_kind" NOT NULL,
                "current" boolean NOT NULL DEFAULT false,
                "name" character varying(100),
                "content" jsonb NOT NULL,
                "word_count" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "chapter_id" uuid NOT NULL,
                "created_by_id" uuid,
                CONSTRAINT "chapter_revisions_word_count_positive" CHECK ("word_count" >= 0),
                CONSTRAINT "chapter_revisions_current_is_published" CHECK (
                    NOT "current"
                    OR "kind" = 'published'
                ),
                CONSTRAINT "PK_a9c9c0401f71c6c4180a8d68b72" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f85d895f8db23df2f21e9b277b" ON "chapter_revisions" ("created_by_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "chapter_revisions_one_current" ON "chapter_revisions" ("chapter_id")
            WHERE "current"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_47e6dbee61bccf610eca6d04bf" ON "chapter_revisions" ("chapter_id", "created_at")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."tag_kind" AS ENUM('freeform', 'warning')
        `);
    await queryRunner.query(`
            CREATE TABLE "tags" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "name" character varying(100) NOT NULL,
                "normalized" character varying(100) NOT NULL,
                "kind" "public"."tag_kind" NOT NULL DEFAULT 'freeform',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "canonical_id" uuid,
                "parent_id" uuid,
                CONSTRAINT "tags_not_own_parent" CHECK ("parent_id" <> "id"),
                CONSTRAINT "tags_not_own_canonical" CHECK ("canonical_id" <> "id"),
                CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e87cc16da3653d2b2dbb9c741c" ON "tags" ("normalized")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_ac8350f87df117f48e2c9d6b5c" ON "tags" ("canonical_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_bd19ddcde86ca1882599dbace1" ON "tags" ("parent_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "story_tags" (
                "story_id" uuid NOT NULL,
                "tag_id" uuid NOT NULL,
                CONSTRAINT "PK_e1ec4350081fa242b2d34b44e03" PRIMARY KEY ("story_id", "tag_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_24edf1076b3af707856d5fcccd" ON "story_tags" ("tag_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "handle_releases" (
                "handle_key" character varying(30) NOT NULL,
                "reusable_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "released_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_36a1b3a75c1287640b84301b4ca" PRIMARY KEY ("handle_key")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "stories"
            ADD CONSTRAINT "FK_1e6ca6b1e366a7575873f2d1c30" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chapters"
            ADD CONSTRAINT "FK_728a399398eaeec7bebbb6c8de9" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chapter_revisions"
            ADD CONSTRAINT "FK_8315ca8db6ef468d9ccbe60a31f" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "chapter_revisions"
            ADD CONSTRAINT "FK_f85d895f8db23df2f21e9b277b2" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "tags"
            ADD CONSTRAINT "FK_ac8350f87df117f48e2c9d6b5c3" FOREIGN KEY ("canonical_id") REFERENCES "tags"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "tags"
            ADD CONSTRAINT "FK_bd19ddcde86ca1882599dbace11" FOREIGN KEY ("parent_id") REFERENCES "tags"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "story_tags"
            ADD CONSTRAINT "FK_818bd0326f1417b77cb55f0b80f" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "story_tags"
            ADD CONSTRAINT "FK_24edf1076b3af707856d5fcccd3" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "story_tags" DROP CONSTRAINT "FK_24edf1076b3af707856d5fcccd3"
        `);
    await queryRunner.query(`
            ALTER TABLE "story_tags" DROP CONSTRAINT "FK_818bd0326f1417b77cb55f0b80f"
        `);
    await queryRunner.query(`
            ALTER TABLE "tags" DROP CONSTRAINT "FK_bd19ddcde86ca1882599dbace11"
        `);
    await queryRunner.query(`
            ALTER TABLE "tags" DROP CONSTRAINT "FK_ac8350f87df117f48e2c9d6b5c3"
        `);
    await queryRunner.query(`
            ALTER TABLE "chapter_revisions" DROP CONSTRAINT "FK_f85d895f8db23df2f21e9b277b2"
        `);
    await queryRunner.query(`
            ALTER TABLE "chapter_revisions" DROP CONSTRAINT "FK_8315ca8db6ef468d9ccbe60a31f"
        `);
    await queryRunner.query(`
            ALTER TABLE "chapters" DROP CONSTRAINT "FK_728a399398eaeec7bebbb6c8de9"
        `);
    await queryRunner.query(`
            ALTER TABLE "stories" DROP CONSTRAINT "FK_1e6ca6b1e366a7575873f2d1c30"
        `);
    await queryRunner.query(`
            DROP TABLE "handle_releases"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_24edf1076b3af707856d5fcccd"
        `);
    await queryRunner.query(`
            DROP TABLE "story_tags"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_bd19ddcde86ca1882599dbace1"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ac8350f87df117f48e2c9d6b5c"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e87cc16da3653d2b2dbb9c741c"
        `);
    await queryRunner.query(`
            DROP TABLE "tags"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."tag_kind"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_47e6dbee61bccf610eca6d04bf"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."chapter_revisions_one_current"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f85d895f8db23df2f21e9b277b"
        `);
    await queryRunner.query(`
            DROP TABLE "chapter_revisions"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."revision_kind"
        `);
    await queryRunner.query(`
            DROP TABLE "chapters"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."chapter_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3cb50cf2affbc809a6c626253e"
        `);
    await queryRunner.query(`
            DROP TABLE "stories"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."major_warning"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."completion"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."story_status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."rating"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4b0ff48556ade4edef9f6cb03e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_2cecdb4ce6f8d26aade7977c37"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."deletion_mode"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."account_status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."age_band"
        `);
  }
}
