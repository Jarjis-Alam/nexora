ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "randomize_options" boolean DEFAULT false NOT NULL;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "option_order" jsonb;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "options_snapshot" jsonb;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "correct_answer_snapshot" jsonb;
