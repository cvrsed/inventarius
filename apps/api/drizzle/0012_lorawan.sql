CREATE TABLE "asset_lorawan" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"dev_eui" text,
	"join_eui" text,
	"app_key_enc" "bytea",
	"nwk_key_enc" "bytea",
	"key_id" text,
	"activation" text DEFAULT 'OTAA' NOT NULL,
	"device_class" text,
	"lorawan_version" text,
	"region" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_lorawan_dev_eui_unique" UNIQUE("dev_eui"),
	CONSTRAINT "asset_lorawan_dev_eui_chk" CHECK ("asset_lorawan"."dev_eui" IS NULL OR "asset_lorawan"."dev_eui" ~ '^[0-9A-F]{16}$'),
	CONSTRAINT "asset_lorawan_join_eui_chk" CHECK ("asset_lorawan"."join_eui" IS NULL OR "asset_lorawan"."join_eui" ~ '^[0-9A-F]{16}$')
);
--> statement-breakpoint
CREATE TABLE "lns_profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"name" "citext" NOT NULL,
	"description" text,
	"endpoint" text NOT NULL,
	"tls" boolean DEFAULT false NOT NULL,
	"credential_enc" "bytea" NOT NULL,
	"credential_hint" text NOT NULL,
	"key_id" text NOT NULL,
	"target" jsonb NOT NULL,
	"device_defaults" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lns_profiles_name_unique" UNIQUE("name"),
	CONSTRAINT "lns_profiles_kind_chk" CHECK ("lns_profiles"."kind" IN ('chirpstack', 'ttn'))
);
--> statement-breakpoint
CREATE TABLE "lns_registrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asset_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"origin" text DEFAULT 'created' NOT NULL,
	"steps_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"orphans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"requested_by" uuid,
	"registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lns_registrations_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "lns_registrations_status_chk" CHECK ("lns_registrations"."status" IN ('registering', 'registered', 'error', 'partial', 'conflict', 'deregistering')),
	CONSTRAINT "lns_registrations_origin_chk" CHECK ("lns_registrations"."origin" IN ('created', 'linked'))
);
--> statement-breakpoint
ALTER TABLE "asset_lorawan" ADD CONSTRAINT "asset_lorawan_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lns_registrations" ADD CONSTRAINT "lns_registrations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lns_registrations" ADD CONSTRAINT "lns_registrations_profile_id_lns_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."lns_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lns_registrations" ADD CONSTRAINT "lns_registrations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lns_registrations_profile_idx" ON "lns_registrations" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "lns_registrations_status_idx" ON "lns_registrations" USING btree ("status");