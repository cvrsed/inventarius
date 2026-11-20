-- P2: «ajustar» y «anular» dejan de ser un solo permiso. consumables:reverse anula cualquier movimiento; consumables:adjust
-- queda solo para ajustes de stock.
INSERT INTO "permissions" ("key") VALUES ('consumables:reverse') ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Quien hoy puede ajustar podía anular con el mismo permiso: se conserva esa capacidad (Administrador y cualquier rol
-- personalizado que lo tenga). Hacerlo antes de dar `adjust` al Operador evita que éste herede la anulación.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT rp."role_id", 'consumables:reverse' FROM "role_permissions" rp WHERE rp."permission" = 'consumables:adjust'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- El Administrador siempre tiene todos los permisos de consumibles, aunque su fila de adjust se hubiera quitado a mano.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'consumables:reverse' FROM "roles" r WHERE r."name" = 'Administrador'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- El Operador ajusta stock (Rodrigo, revisión de F3.5) pero no anula.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", 'consumables:adjust' FROM "roles" r WHERE r."name" = 'Operador'
ON CONFLICT DO NOTHING;
