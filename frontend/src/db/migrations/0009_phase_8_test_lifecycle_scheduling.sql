DO $$ BEGIN
  CREATE TYPE "public"."test_status" AS ENUM('draft', 'published', 'closed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "status" "public"."test_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "scheduled_start_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "scheduled_end_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "schedule_timezone" varchar(100);
--> statement-breakpoint
-- Backfill existing data cleanly
UPDATE "tests" SET "status" = 'published' WHERE "is_published" = TRUE;
--> statement-breakpoint
UPDATE "tests" SET "status" = 'draft' WHERE "is_published" = FALSE;
--> statement-breakpoint
UPDATE "tests" SET "status" = 'published' WHERE "type" = 'baseline';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tests" ADD CONSTRAINT "tests_schedule_range_check" CHECK ("scheduled_end_at" IS NULL OR "scheduled_start_at" IS NULL OR "scheduled_end_at" > "scheduled_start_at");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tests_status_idx" ON "tests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tests_type_status_idx" ON "tests" USING btree ("type","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tests_schedule_window_idx" ON "tests" USING btree ("scheduled_start_at","scheduled_end_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_test_lifecycle_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_published = true AND (NEW.status IS NULL OR NEW.status = 'draft') THEN
      NEW.status := 'published';
    ELSIF NEW.status = 'published' THEN
      NEW.is_published := true;
    ELSIF NEW.status IS NOT NULL AND NEW.status != 'published' THEN
      NEW.is_published := false;
    END IF;
  ELSE -- UPDATE
    IF NEW.is_published = false AND OLD.is_published = true THEN
      NEW.status := 'draft';
    ELSIF NEW.is_published = true AND OLD.is_published = false THEN
      NEW.status := 'published';
    ELSIF NEW.status = 'published' THEN
      NEW.is_published := true;
    ELSIF NEW.status != 'published' THEN
      NEW.is_published := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_sync_test_lifecycle_status ON tests;
CREATE TRIGGER trg_sync_test_lifecycle_status
BEFORE INSERT OR UPDATE ON tests
FOR EACH ROW
EXECUTE FUNCTION sync_test_lifecycle_status();

