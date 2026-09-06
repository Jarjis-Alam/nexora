-- Phase 7D: Attempt limits
-- tests.attempt_limit: NULL = unlimited; integer >= 1 = maximum number of submitted attempts per user/test.
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "attempt_limit" integer;

ALTER TABLE "tests" DROP CONSTRAINT IF EXISTS "tests_attempt_limit_check";
ALTER TABLE "tests" ADD CONSTRAINT "tests_attempt_limit_check"
  CHECK ("attempt_limit" IS NULL OR "attempt_limit" >= 1);

-- Composite index supporting the resumable-attempt lookup and the submitted-attempt count.
CREATE INDEX IF NOT EXISTS "attempts_user_test_status_idx"
  ON "attempts" ("user_id", "test_id", "status");