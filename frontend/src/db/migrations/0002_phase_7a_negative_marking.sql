ALTER TABLE "tests" ADD COLUMN "negative_marking_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "negative_mark_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "negative_marking_enabled" boolean;
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "negative_mark_rate" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_negative_mark_rate_range" CHECK ("negative_mark_rate" >= 0.00 AND "negative_mark_rate" <= 1.00);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_negative_mark_rate_range" CHECK ("negative_mark_rate" IS NULL OR ("negative_mark_rate" >= 0.00 AND "negative_mark_rate" <= 1.00));
