CREATE TABLE "consumable_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"consumable_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta" numeric(14, 3) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"supplier" text,
	"note" text,
	"reason" text,
	"recipient_user_id" uuid,
	"recipient_name" text,
	"recipient_ref" text,
	"transfer_id" uuid,
	"reverses_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumable_movements_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "consumable_movements_kind_chk" CHECK ("consumable_movements"."kind" IN ('receipt', 'delivery', 'adjustment', 'transfer_out', 'transfer_in', 'reversal')),
	CONSTRAINT "consumable_movements_delta_chk" CHECK ("consumable_movements"."delta" <> 0),
	CONSTRAINT "consumable_movements_sign_chk" CHECK (("consumable_movements"."kind" IN ('receipt', 'transfer_in') AND "consumable_movements"."delta" > 0) OR ("consumable_movements"."kind" IN ('delivery', 'transfer_out') AND "consumable_movements"."delta" < 0) OR "consumable_movements"."kind" IN ('adjustment', 'reversal')),
	CONSTRAINT "consumable_movements_recipient_chk" CHECK (("consumable_movements"."kind" = 'delivery' AND (("consumable_movements"."recipient_user_id" IS NULL) <> ("consumable_movements"."recipient_name" IS NULL)) AND ("consumable_movements"."recipient_ref" IS NULL OR "consumable_movements"."recipient_name" IS NOT NULL)) OR ("consumable_movements"."kind" <> 'delivery' AND "consumable_movements"."recipient_user_id" IS NULL AND "consumable_movements"."recipient_name" IS NULL AND "consumable_movements"."recipient_ref" IS NULL)),
	CONSTRAINT "consumable_movements_reversal_chk" CHECK (("consumable_movements"."kind" = 'reversal') = ("consumable_movements"."reverses_id" IS NOT NULL) AND ("consumable_movements"."kind" <> 'reversal' OR "consumable_movements"."note" IS NOT NULL)),
	CONSTRAINT "consumable_movements_transfer_chk" CHECK ("consumable_movements"."kind" NOT IN ('transfer_out', 'transfer_in') OR "consumable_movements"."transfer_id" IS NOT NULL),
	CONSTRAINT "consumable_movements_reason_chk" CHECK (("consumable_movements"."kind" = 'adjustment' AND "consumable_movements"."reason" IN ('physical_count', 'waste_damage', 'loss', 'other') AND ("consumable_movements"."reason" <> 'other' OR "consumable_movements"."note" IS NOT NULL)) OR ("consumable_movements"."kind" <> 'adjustment' AND "consumable_movements"."reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "consumable_stock" (
	"consumable_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumable_stock_consumable_id_location_id_pk" PRIMARY KEY("consumable_id","location_id"),
	CONSTRAINT "consumable_stock_non_negative_chk" CHECK ("consumable_stock"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumable_warehouse_minimums" (
	"consumable_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"min_quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "consumable_warehouse_minimums_consumable_id_location_id_pk" PRIMARY KEY("consumable_id","location_id"),
	CONSTRAINT "consumable_minimums_qty_chk" CHECK ("consumable_warehouse_minimums"."min_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "consumables" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" "citext" NOT NULL,
	"category_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"notes" text,
	"min_stock" numeric(14, 3),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumables_name_unique" UNIQUE("name"),
	CONSTRAINT "consumables_min_stock_chk" CHECK ("consumables"."min_stock" IS NULL OR "consumables"."min_stock" > 0)
);
--> statement-breakpoint
CREATE TABLE "measure_units" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" "citext" NOT NULL,
	"plural" text NOT NULL,
	"abbreviation" text NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measure_units_name_unique" UNIQUE("name"),
	CONSTRAINT "measure_units_decimals_chk" CHECK ("measure_units"."decimals" BETWEEN 0 AND 3)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "scope" text DEFAULT 'asset' NOT NULL;--> statement-breakpoint
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_consumable_id_consumables_id_fk" FOREIGN KEY ("consumable_id") REFERENCES "public"."consumables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_reverses_id_consumable_movements_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."consumable_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_stock" ADD CONSTRAINT "consumable_stock_consumable_id_consumables_id_fk" FOREIGN KEY ("consumable_id") REFERENCES "public"."consumables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_stock" ADD CONSTRAINT "consumable_stock_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_warehouse_minimums" ADD CONSTRAINT "consumable_warehouse_minimums_consumable_id_consumables_id_fk" FOREIGN KEY ("consumable_id") REFERENCES "public"."consumables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_warehouse_minimums" ADD CONSTRAINT "consumable_warehouse_minimums_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_unit_id_measure_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."measure_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumable_movements_consumable_idx" ON "consumable_movements" USING btree ("consumable_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "consumable_movements_location_idx" ON "consumable_movements" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "consumable_movements_transfer_idx" ON "consumable_movements" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "consumable_movements_recipient_idx" ON "consumable_movements" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "consumable_stock_location_idx" ON "consumable_stock" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "consumable_minimums_location_idx" ON "consumable_warehouse_minimums" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "consumables_category_idx" ON "consumables" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "consumables_unit_idx" ON "consumables" USING btree ("unit_id");
ALTER TABLE "categories" ADD CONSTRAINT "categories_scope_chk" CHECK ("categories"."scope" IN ('asset', 'consumable'));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_consumable_no_extension_chk" CHECK ("categories"."scope" = 'asset' OR "categories"."extension" = 'none');--> statement-breakpoint

-- Unidades semilla (D4). Los decimales permitidos dependen de la unidad: un par no se parte, un litro sí.
INSERT INTO "measure_units" ("name", "plural", "abbreviation", "decimals") VALUES
  ('unidad', 'unidades', 'un', 0),
  ('par', 'pares', 'par', 0),
  ('caja', 'cajas', 'caja', 0),
  ('litro', 'litros', 'L', 3),
  ('metro', 'metros', 'm', 2),
  ('kilogramo', 'kilogramos', 'kg', 3);--> statement-breakpoint

-- Permisos de consumibles y su mapeo a los roles semilla (D12). Ajustar y anular es solo del Administrador (D6).
INSERT INTO "permissions" ("key") VALUES
  ('consumables:read'), ('consumables:manage'), ('consumables:receive'),
  ('consumables:deliver'), ('consumables:transfer'), ('consumables:adjust')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."key" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'Administrador' AND p."key" LIKE 'consumables:%'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p.k FROM "roles" r CROSS JOIN (VALUES
  ('consumables:read'), ('consumables:manage'), ('consumables:receive'),
  ('consumables:deliver'), ('consumables:transfer')) AS p(k)
WHERE r."name" = 'Operador'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p.k FROM "roles" r CROSS JOIN (VALUES ('consumables:read'), ('consumables:deliver')) AS p(k)
WHERE r."name" = 'Técnico de campo'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'consumables:read' FROM "roles" r WHERE r."name" = 'Lector'
ON CONFLICT DO NOTHING;
