import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterBase {
  /** Clave en el estado del listado (y en la URL). */
  key: string;
  /** Nombre del filtro: rotula el chip y el campo del panel. */
  label: string;
  /** Texto del botón de la barra, si es más corto que `label` (p. ej. «Ubicación» para «Ubicación base»). */
  barLabel?: string;
  /** `bar`: botón compacto en la barra de escritorio; `more`: dentro de «+ Filtros». En móvil van todos al panel. */
  placement: 'bar' | 'more';
  /** Valor que equivale a «sin filtro» (por defecto `''`). Un filtro con otro valor está activo. */
  defaultValue?: string;
  /** Placeholder del buscador del menú (p. ej. «Buscar ubicación…»). */
  searchPlaceholder?: string;
}

/** Opciones fijas. Con muchas (más de 8) el menú ofrece búsqueda. */
export interface ChoiceFilter extends FilterBase {
  kind: 'choice';
  options: FilterOption[];
}

/** Opciones que se buscan en el servidor (catálogos con miles de filas). */
export interface RemoteFilter extends FilterBase {
  kind: 'remote';
  /** Identifica la fuente en la caché de consultas. */
  source: string;
  fetcher: (q: string) => Promise<RemoteOption[]>;
  /** Nombre de un id que viene de la URL, para mostrarlo en el botón y el chip. */
  resolve: (id: string) => Promise<RemoteOption | null>;
}

/** Fecha (`AAAA-MM-DD`). */
export interface DateFilter extends FilterBase {
  kind: 'date';
}

export type FilterDef = ChoiceFilter | RemoteFilter | DateFilter;

export type FilterValues = Record<string, string | number>;
