ALTER TABLE "audit_log" ADD COLUMN "entity_label" text;--> statement-breakpoint
-- Rótulo de los registros ya auditados. Primero el que traía el propio diff (el nombre de entonces: sobrevive a renombres y
-- a borrados); si no, el nombre actual del registro. Los que no se pueden resolver quedan sin rótulo (la web muestra «—»).
UPDATE "audit_log" SET "entity_label" = COALESCE(
  "diff"->'after'->>'name', "diff"->'before'->>'name', "diff"->'after'->>'path', "diff"->'before'->>'path',
  "diff"->>'email'
) WHERE "entity" IN ('category', 'manufacturer', 'model', 'location', 'status_label', 'role', 'user')
  AND "entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = u."name" FROM "users" u
  WHERE a."entity" = 'user' AND a."entity_id" = u."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = r."name" FROM "roles" r
  WHERE a."entity" = 'role' AND a."entity_id" = r."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = c."name" FROM "categories" c
  WHERE a."entity" = 'category' AND a."entity_id" = c."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = m."name" FROM "manufacturers" m
  WHERE a."entity" = 'manufacturer' AND a."entity_id" = m."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = m."name" FROM "models" m
  WHERE a."entity" = 'model' AND a."entity_id" = m."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = l."name" FROM "locations" l
  WHERE a."entity" = 'location' AND a."entity_id" = l."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = s."name" FROM "status_labels" s
  WHERE a."entity" = 'status_label' AND a."entity_id" = s."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" SET "entity_label" = ("diff"->'after'->>'assetTag') || ' ' || ("diff"->'after'->>'name')
  WHERE "entity" = 'asset' AND "diff"->'after'->>'assetTag' IS NOT NULL AND "diff"->'after'->>'name' IS NOT NULL;
--> statement-breakpoint
UPDATE "audit_log" a SET "entity_label" = (x."asset_tag"::text || ' ' || x."name") FROM "assets" x
  WHERE a."entity" = 'asset' AND a."entity_id" = x."id" AND a."entity_label" IS NULL;
--> statement-breakpoint
UPDATE "audit_log" SET "entity_label" = 'Lote de ' || ("diff"->'after'->>'count') || ' activos'
  WHERE "entity" = 'asset_batch' AND "diff"->'after'->>'count' IS NOT NULL;
