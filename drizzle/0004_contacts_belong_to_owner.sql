-- Step 2: the ownership move is complete, so the column can be enforced and the
-- old card link dropped.
ALTER TABLE "contacts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_user_sort_idx" ON "contacts" USING btree ("user_id","sort_order");--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_card_id_cards_id_fk";--> statement-breakpoint
DROP INDEX "contacts_card_sort_idx";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "card_id";
