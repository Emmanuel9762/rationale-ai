CREATE TABLE "trade_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_imports" ADD CONSTRAINT "trade_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_imports" ADD CONSTRAINT "trade_imports_account_id_trading_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_imports_owner_payload_unique" ON "trade_imports" USING btree ("user_id","payload_hash");