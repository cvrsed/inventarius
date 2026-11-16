import type { LocationQuery } from 'vue-router';

/** Valores por defecto de un listado; su tipo (número o texto) define cómo se lee cada clave de la URL. */
export type ListDefaults = Record<string, string | number>;

const MAX_PAGE_SIZE = 100;

function first(value: LocationQuery[string] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : undefined;
}

/**
 * Estado del listado a partir de la query de la URL. Los filtros viven en la URL para poder compartirlos
 * (RF-22): lo ausente toma el valor por defecto y lo inválido se descarta en vez de romper la pantalla.
 */
export function parseListQuery<D extends ListDefaults>(raw: LocationQuery, defaults: D): D {
  const out: ListDefaults = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = first(raw[key]);
    if (value === undefined) {
      out[key] = fallback;
    } else if (typeof fallback === 'number') {
      const n = Number(value);
      const valid = Number.isInteger(n) && n >= 1;
      out[key] = valid ? (key === 'pageSize' ? Math.min(n, MAX_PAGE_SIZE) : n) : fallback;
    } else {
      out[key] = value;
    }
  }
  return out as D;
}

/** Inversa de `parseListQuery`: la URL solo lleva lo que se aparta de los valores por defecto. */
export function serializeListQuery(
  query: ListDefaults,
  defaults: ListDefaults,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== defaults[key] && value !== '') out[key] = String(value);
  }
  return out;
}
