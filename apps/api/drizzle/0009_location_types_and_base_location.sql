ALTER TABLE "assets" ADD COLUMN "base_location_id" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_base_location_id_locations_id_fk" FOREIGN KEY ("base_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_base_location_idx" ON "assets" USING btree ("base_location_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_type_chk" CHECK ("locations"."type" IN ('warehouse', 'customer_site', 'office', 'other'));--> statement-breakpoint
-- Datos de F2 sin tipos: la ubicación en que estaba cada activo pasa a ser su base y se trata como bodega.
UPDATE "locations" SET "type" = 'warehouse' WHERE "id" IN (SELECT DISTINCT "location_id" FROM "assets" WHERE "location_id" IS NOT NULL);--> statement-breakpoint
UPDATE "assets" SET "base_location_id" = "location_id";--> statement-breakpoint
-- La ubicación actual queda nula con una persona y es el sitio cuando se asignó a una ubicación.
UPDATE "assets" SET "location_id" = NULL WHERE "assigned_user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "assets" SET "location_id" = "assigned_location_id" WHERE "assigned_location_id" IS NOT NULL;
