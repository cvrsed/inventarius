-- La serie es única sin distinguir mayúsculas. Si ya hay repetidas la migración se detiene y las lista: decidir cuál
-- conservar es de una persona (corregir o vaciar el número de serie de los sobrantes) y luego se vuelve a migrar.
DO $$
DECLARE
	dup text;
BEGIN
	SELECT string_agg(serial_lower || ' (' || n || ' activos)', ', ' ORDER BY serial_lower) INTO dup
	FROM (
		SELECT lower("serial") AS serial_lower, count(*) AS n
		FROM "assets"
		WHERE "serial" IS NOT NULL
		GROUP BY lower("serial")
		HAVING count(*) > 1
	) d;
	IF dup IS NOT NULL THEN
		RAISE EXCEPTION 'Hay números de serie repetidos (sin distinguir mayúsculas): %. Corrígelos y vuelve a migrar.', dup;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_serial_lower_uq" ON "assets" USING btree (lower("serial")) WHERE "assets"."serial" IS NOT NULL;
