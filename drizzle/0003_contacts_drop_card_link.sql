-- Step 1 of moving contact ownership from the card to the owner (2026-09-29).
--
-- Order matters: the owner is copied *out* of the card before the card link is
-- removed. The auto-generated version of this migration dropped first, which would
-- have destroyed the attribution of every existing contact.
ALTER TABLE "contacts" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "contacts" SET "user_id" = "cards"."user_id" FROM "cards" WHERE "cards"."id" = "contacts"."card_id";
