CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- Correlativo de las etiquetas autogeneradas (RF-20). Un hueco por un alta fallida es aceptable.
CREATE SEQUENCE "asset_tag_seq" AS bigint MINVALUE 1 START 1;--> statement-breakpoint
CREATE TABLE "asset_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" uuid,
	"location_id" uuid,
	"checked_out_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_out_by" uuid,
	"expected_return_on" date,
	"checkout_note" text,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" uuid,
	"checkin_note" text,
	CONSTRAINT "asset_assignments_one_target_chk" CHECK (("asset_assignments"."user_id" IS NULL) <> ("asset_assignments"."location_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asset_tag" "citext" NOT NULL,
	"name" text NOT NULL,
	"serial" text,
	"model_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"location_id" uuid,
	"assigned_user_id" uuid,
	"assigned_location_id" uuid,
	"purchase_date" date,
	"purchase_cost" numeric(12, 2),
	"supplier" text,
	"warranty_months" integer,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"delete_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_asset_tag_unique" UNIQUE("asset_tag"),
	CONSTRAINT "assets_one_assignee_chk" CHECK ("assets"."assigned_user_id" IS NULL OR "assets"."assigned_location_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" "citext" NOT NULL,
	"extension" text DEFAULT 'none' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" "citext" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manufacturers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"model_number" text,
	"manufacturer_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"lorawan_class" text,
	"lorawan_version" text,
	"lorawan_regional_parameters" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_labels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" "citext" NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_labels_name_unique" UNIQUE("name"),
	CONSTRAINT "status_labels_system_key_unique" UNIQUE("system_key")
);
--> statement-breakpoint
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_checked_out_by_users_id_fk" FOREIGN KEY ("checked_out_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_status_id_status_labels_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status_labels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_assigned_location_id_locations_id_fk" FOREIGN KEY ("assigned_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_assignments_user_idx" ON "asset_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_assignments_location_idx" ON "asset_assignments" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "asset_assignments_asset_idx" ON "asset_assignments" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_assignments_open_uq" ON "asset_assignments" USING btree ("asset_id") WHERE "asset_assignments"."checked_in_at" IS NULL;--> statement-breakpoint
CREATE INDEX "assets_model_idx" ON "assets" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "assets_status_idx" ON "assets" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "assets_location_idx" ON "assets" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "assets_assigned_user_idx" ON "assets" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "assets_assigned_location_idx" ON "assets" USING btree ("assigned_location_id");--> statement-breakpoint
CREATE INDEX "assets_created_idx" ON "assets" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "assets_tag_trgm_idx" ON "assets" USING gin (("asset_tag"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "assets_name_trgm_idx" ON "assets" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "assets_serial_trgm_idx" ON "assets" USING gin ("serial" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "locations_parent_idx" ON "locations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "models_manufacturer_idx" ON "models" USING btree ("manufacturer_id");--> statement-breakpoint
CREATE INDEX "models_category_idx" ON "models" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "models_manufacturer_name_uq" ON "models" USING btree ("manufacturer_id","name");