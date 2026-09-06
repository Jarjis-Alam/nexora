-- 1. Add randomize_questions to tests
ALTER TABLE "tests" ADD COLUMN "randomize_questions" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- 2. Create attempt_questions table
CREATE TABLE "attempt_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"question_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 3. Foreign key constraints with cascade delete
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_section_id_test_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."test_sections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- 4. Unique indexes & performance indexes
CREATE UNIQUE INDEX "attempt_questions_unique_idx" ON "attempt_questions" USING btree ("attempt_id","question_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_questions_order_idx" ON "attempt_questions" USING btree ("attempt_id","question_order");
--> statement-breakpoint
CREATE INDEX "attempt_questions_attempt_id_idx" ON "attempt_questions" USING btree ("attempt_id");
--> statement-breakpoint
CREATE INDEX "attempt_questions_section_id_idx" ON "attempt_questions" USING btree ("section_id");
