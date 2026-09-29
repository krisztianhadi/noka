CREATE TABLE "owner_notes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"notes_encrypted" "bytea",
	"key_version" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_notes" ADD CONSTRAINT "owner_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Copy existing notes across before the old table is dropped by migration 0006:
-- the owner is recovered through the card that used to own the note.
INSERT INTO "owner_notes" ("user_id", "notes_encrypted", "key_version", "updated_at")
SELECT "cards"."user_id", "card_notes"."notes_encrypted", "card_notes"."key_version", "card_notes"."updated_at"
FROM "card_notes" JOIN "cards" ON "cards"."id" = "card_notes"."card_id"
ON CONFLICT ("user_id") DO NOTHING;
