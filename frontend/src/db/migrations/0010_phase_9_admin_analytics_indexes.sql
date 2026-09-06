CREATE INDEX IF NOT EXISTS "attempts_submitted_at_idx" ON "attempts" USING btree ("submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempts_test_status_submitted_idx" ON "attempts" USING btree ("test_id", "status", "submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_questions_question_id_idx" ON "attempt_questions" USING btree ("question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "answers_question_id_idx" ON "answers" USING btree ("question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "answers_question_is_correct_idx" ON "answers" USING btree ("question_id", "is_correct");
