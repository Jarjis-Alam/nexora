CREATE TABLE IF NOT EXISTS "question_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"selection_count" integer NOT NULL,
	"pool_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_pools_selection_count_check" CHECK ("selection_count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_section_id_test_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."test_sections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_pools_test_id_idx" ON "question_pools" USING btree ("test_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_pools_section_id_idx" ON "question_pools" USING btree ("section_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "question_pools_section_pool_order_idx" ON "question_pools" USING btree ("section_id","pool_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_pool_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_pool_questions" ADD CONSTRAINT "question_pool_questions_pool_id_question_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."question_pools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_pool_questions" ADD CONSTRAINT "question_pool_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "question_pool_questions_unique_idx" ON "question_pool_questions" USING btree ("pool_id","question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_pool_questions_pool_id_idx" ON "question_pool_questions" USING btree ("pool_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_pool_questions_question_id_idx" ON "question_pool_questions" USING btree ("question_id");
--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "pool_id" uuid;
--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_pool_id_question_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."question_pools"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_questions_pool_id_idx" ON "attempt_questions" USING btree ("pool_id");
