-- Phase 7C.1: Question snapshot immutability hardening
-- Freeze question text, question type, and marks at attempt inception
-- so admin Question Bank edits cannot alter active attempts or historical grading.
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "question_text_snapshot" text;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "question_type_snapshot" question_type;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "marks_snapshot" integer;