-- La serie es única por modelo (sin distinguir mayúsculas), no global: marcas distintas pueden repetir series. Si ya hay
-- repetidas dentro de un mismo modelo la migración se detiene y las lista: decidir cuál conservar es de una persona.
DO $$
DECLARE
	dup text;
BEGIN
	SELECT string_agg(serial_lower || ' en el modelo ' || model_name || ' (' || n || ' activos)', ', ' ORDER BY model_name, serial_lower) INTO dup
	FROM (
		SELECT lower(a."serial") AS serial_lower, m."name" AS model_name, count(*) AS n
		FROM "assets" a
		JOIN "models" m ON m."id" = a."model_id"
		WHERE a."serial" IS NOT NULL
		GROUP BY lower(a."serial"), m."id", m."name"
		HAVING count(*) > 1
	) d;
	IF dup IS NOT NULL THEN
		RAISE EXCEPTION 'Hay números de serie repetidos dentro de un mismo modelo (sin distinguir mayúsculas): %. Corrígelos y vuelve a migrar.', dup;
	END IF;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "assets_serial_lower_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "assets_model_serial_lower_uq" ON "assets" USING btree ("model_id",lower("serial")) WHERE "assets"."serial" IS NOT NULL;
