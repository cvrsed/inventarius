import type { AuditEntryDto } from '@inventarius/shared';

export interface HistoryChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface HistoryItem {
  /** Sufijo de `assets.history.actions.*`. */
  key: 'create' | 'update' | 'checkout' | 'checkin' | 'delete' | 'restore';
  params: Record<string, string>;
  changes: HistoryChange[];
}

const KNOWN = ['create', 'update', 'checkout', 'checkin', 'delete', 'restore'] as const;
type Key = (typeof KNOWN)[number];

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/**
 * Convierte una entrada de auditoría en lo que muestra la línea de tiempo (RF-24): qué pasó y qué campos
 * cambiaron. El destino de la asignación va como parámetro del título, no como cambio.
 */
export function describeEntry(entry: AuditEntryDto): HistoryItem {
  const suffix = entry.action.split('.').at(-1) ?? '';
  const key: Key = (KNOWN as readonly string[]).includes(suffix) ? (suffix as Key) : 'update';
  const before = asRecord(entry.diff?.['before']);
  const after = asRecord(entry.diff?.['after']);
  const params: Record<string, string> = {};
  if (key === 'checkout') params['to'] = String(after['assignedTo'] ?? '');

  if (key === 'create') return { key, params, changes: [] };
  // En la asignación el destino ya va en el título; la fecha y la nota solo se muestran si existen.
  const skip = new Set(key === 'checkout' ? ['assignedTo', 'assignedToType'] : []);
  const optional = new Set(['note', 'expectedReturnOn']);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (f) => !skip.has(f) && !(optional.has(f) && before[f] == null && after[f] == null),
  );
  const changes = fields.map((field) => ({
    field,
    before: before[field] ?? null,
    after: after[field] ?? null,
  }));
  return { key, params, changes };
}
