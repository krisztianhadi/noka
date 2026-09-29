CREATE TABLE "card_notes" (
	"card_id" uuid PRIMARY KEY NOT NULL,
	"notes_encrypted" "bytea",
	"key_version" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"pin_hash" text NOT NULL,
	"pin_encrypted" "bytea" NOT NULL,
	"pin_version" integer DEFAULT 1 NOT NULL,
	"pin_rotated_at" timestamp with time zone,
	"languages" text[] DEFAULT '{en,es,fr,zh,ru}' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"last_failed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"payload_encrypted" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"card_id" uuid,
	"kind" text NOT NULL,
	"success" boolean NOT NULL,
	"ip_prefix_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_notes" ADD CONSTRAINT "card_notes_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_attempts" ADD CONSTRAINT "scan_attempts_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cards_one_active_per_user" ON "cards" USING btree ("user_id") WHERE "cards"."active";--> statement-breakpoint
CREATE INDEX "contacts_card_sort_idx" ON "contacts" USING btree ("card_id","sort_order");--> statement-breakpoint
CREATE INDEX "scan_attempts_card_idx" ON "scan_attempts" USING btree ("card_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scan_attempts_ip_idx" ON "scan_attempts" USING btree ("ip_prefix_hash","created_at" DESC NULLS LAST);