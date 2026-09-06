CREATE TABLE "test_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"section_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_sections" ADD CONSTRAINT "test_sections_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "test_sections_test_id_idx" ON "test_sections" USING btree ("test_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "test_sections_test_order_idx" ON "test_sections" USING btree ("test_id","section_order");
--> statement-breakpoint
ALTER TABLE "test_questions" ADD COLUMN "section_id" uuid;
--> statement-breakpoint
-- Backfill default section 'General' for all existing tests
INSERT INTO "test_sections" ("id", "test_id", "title", "section_order", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 'General', 1, now(), now()
FROM "tests";
--> statement-breakpoint
-- Associate existing test questions with the default section of their test
UPDATE "test_questions" tq
SET "section_id" = ts."id"
FROM "test_sections" ts
WHERE ts."test_id" = tq."test_id";
--> statement-breakpoint
ALTER TABLE "test_questions" ALTER COLUMN "section_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_section_id_test_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."test_sections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "test_questions_section_id_idx" ON "test_questions" USING btree ("section_id");
