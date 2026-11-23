import { sql, type SQL } from 'drizzle-orm';

/**
 * Subconsulta con el id de una ubicación y los de todas sus descendientes, sin límite de profundidad (RF-12).
 *
 * `CYCLE` corta la recursión al volver a un id ya visitado: si los datos tuvieran un ciclo (la API no deja crearlos, pero
 * un arreglo manual en la base sí), la consulta termina igual en vez de girar sin fin. Se usa como `col IN (...)`.
 */
export function subtreeIdsSql(rootId: string): SQL {
  return sql`(
    WITH RECURSIVE sub(id) AS (
      SELECT id FROM locations WHERE id = ${rootId}::uuid
      UNION ALL
      SELECT l.id FROM locations l JOIN sub s ON l.parent_id = s.id
    ) CYCLE id SET is_cycle USING visited
    SELECT id FROM sub WHERE NOT is_cycle
  )`;
}
