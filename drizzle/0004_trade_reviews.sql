ALTER TABLE "trades" ADD COLUMN "plan_adherence" varchar(20);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "review_went_well" varchar(2000);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "review_improve" varchar(2000);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "reviewed_at" timestamp;