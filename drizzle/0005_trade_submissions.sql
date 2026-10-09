ALTER TABLE "trades" ADD COLUMN "submission_key" uuid;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "submission_hash" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "trades_account_submission_unique" ON "trades" USING btree ("account_id","submission_key");