CREATE TABLE "trade_import_rows" (
	"trade_id" uuid PRIMARY KEY NOT NULL,
	"import_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_import_rows" ADD CONSTRAINT "trade_import_rows_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_import_rows" ADD CONSTRAINT "trade_import_rows_import_id_trade_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."trade_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_import_rows_import_idx" ON "trade_import_rows" USING btree ("import_id");