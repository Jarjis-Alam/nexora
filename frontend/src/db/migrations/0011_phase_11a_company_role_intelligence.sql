CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"industry" varchar(100) NOT NULL,
	"description" text,
	"website" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_normalized_name_idx" ON "companies" USING btree ("normalized_name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_idx" ON "companies" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_industry_idx" ON "companies" USING btree ("industry");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_is_active_idx" ON "companies" USING btree ("is_active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_normalized_name_idx" ON "roles" USING btree ("normalized_name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_slug_idx" ON "roles" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roles_category_idx" ON "roles" USING btree ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roles_is_active_idx" ON "roles" USING btree ("is_active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_target_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_target_roles" ADD CONSTRAINT "student_target_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_target_roles" ADD CONSTRAINT "student_target_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_target_roles_user_id_unique_idx" ON "student_target_roles" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_target_roles_role_id_idx" ON "student_target_roles" USING btree ("role_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_target_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_target_companies" ADD CONSTRAINT "student_target_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_target_companies" ADD CONSTRAINT "student_target_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_target_companies_user_company_idx" ON "student_target_companies" USING btree ("user_id","company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_target_companies_user_id_idx" ON "student_target_companies" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_target_companies_company_id_idx" ON "student_target_companies" USING btree ("company_id");
