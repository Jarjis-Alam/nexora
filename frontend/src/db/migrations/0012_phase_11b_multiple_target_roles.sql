-- Phase 11B: Multiple target roles per student (one primary)
-- Replaces the Phase 11A single-role-per-student constraint with:
--   1. (user_id, role_id) uniqueness   -> a student may target many roles
--   2. partial unique on (user_id) WHERE is_primary = true -> exactly one primary role
-- Existing rows are safe: user_id was unique, so no (user_id, role_id) duplicates can exist.

DROP INDEX IF EXISTS "student_target_roles_user_id_unique_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "student_target_roles_user_role_idx"
	ON "student_target_roles" USING btree ("user_id","role_id");

CREATE UNIQUE INDEX IF NOT EXISTS "student_target_roles_single_primary_idx"
	ON "student_target_roles" USING btree ("user_id") WHERE "is_primary" = true;