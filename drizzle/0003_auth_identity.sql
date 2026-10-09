ALTER TABLE "users" ADD COLUMN "auth_subject" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_issuer" varchar(512);--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_identity_unique" ON "users" USING btree ("auth_issuer","auth_subject");