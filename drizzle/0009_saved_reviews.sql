CREATE TABLE "saved_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"evidence_id" varchar(64) NOT NULL,
	"response_hash" varchar(64) NOT NULL,
	"evidence" json NOT NULL,
	"response" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_reviews" ADD CONSTRAINT "saved_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_reviews_owner_content_unique" ON "saved_reviews" USING btree ("user_id","evidence_id","response_hash");--> statement-breakpoint
CREATE INDEX "saved_reviews_owner_created_idx" ON "saved_reviews" USING btree ("user_id","created_at","id");