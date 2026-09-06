-- Phase 7E: Test instructions
-- tests.instructions: nullable plain text shown to students on the test detail page before starting.
-- NULL/empty = no instructions.
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "instructions" text;