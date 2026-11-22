-- D8 (revisión 2 de F3.5): las descripciones de los roles semilla mencionan sus permisos de consumibles.
-- Solo se reescribe la que sigue siendo la original: una descripción que alguien editó a mano se respeta.
UPDATE "roles" SET "description" = 'Acceso total, incluida la gestión de usuarios, roles, perfiles LNS y consumibles.'
WHERE "name" = 'Administrador' AND "description" = 'Acceso total, incluida la gestión de usuarios, roles y perfiles LNS.';--> statement-breakpoint
UPDATE "roles" SET "description" = 'Gestiona activos, catálogo y consumibles (ingresa, entrega, traslada y ajusta stock, sin anular); registra en LNS sin ver claves.'
WHERE "name" = 'Operador' AND "description" = 'Gestiona activos y catálogo; registra en LNS sin ver claves.';--> statement-breakpoint
UPDATE "roles" SET "description" = 'Asigna activos y registra dispositivos en LNS desde terreno; entrega consumibles y registra devoluciones.'
WHERE "name" = 'Técnico de campo' AND "description" = 'Asigna activos y registra dispositivos en LNS desde terreno.';--> statement-breakpoint
UPDATE "roles" SET "description" = 'Solo consulta (activos, LoRaWAN y consumibles).'
WHERE "name" = 'Lector' AND "description" = 'Solo consulta.';
