ALTER TABLE "trading_accounts" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trading_accounts_one_default_per_user" ON "trading_accounts" USING btree ("user_id") WHERE "trading_accounts"."is_default" = true;--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS position
  FROM trading_accounts
)
UPDATE trading_accounts SET is_default = true
FROM ranked WHERE trading_accounts.id = ranked.id AND ranked.position = 1;
