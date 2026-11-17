import type { AuditEntryDto } from '@inventarius/shared';

export interface HistoryChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface HistoryItem {
  /** Sufijo de la acción; sirve para elegir el ícono (el texto sale de `auditActionLabel`). */
  key: Key;
  /** Código de auditoría de la entrada; su texto sale de `app/i18n/audit.ts`. */
  action: string;
  params: Record<string, string>;
  changes: HistoryChange[];
}

const KNOWN = [
  'create',
  'update',
  'status_change',
  'checkout',
  'checkin',
  'delete',
  'restore',
] as const;
type Key = (typeof KNOWN)[number];

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/**
 * Convierte una entrada de auditoría en lo que muestra la línea de tiempo (RF-24): qué pasó y qué campos
 * cambiaron. El destino de la asignación va como parámetro del título, no como cambio.
 */
export function describeEntry(entry: AuditEntryDto): HistoryItem {
  const suffix = entry.action.replace(/^asset\./, '');
  const key: Key = (KNOWN as readonly string[]).includes(suffix) ? (suffix as Key) : 'update';
  const before = asRecord(entry.diff?.['before']);
  const after = asRecord(entry.diff?.['after']);
  const params: Record<string, string> = {};
  if (key === 'checkout') params['to'] = String(after['assignedTo'] ?? '');

  if (key === 'create') return { key, action: entry.action, params, changes: [] };
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
  return { key, action: entry.action, params, changes };
}
