import type { AuditEntryDto } from '@inventarius/shared';
import { describeAuditDetail, type DetailRow, type DetailText } from '@/features/audit/detail';

export interface HistoryItem {
  /** Ícono de la línea de tiempo; el texto de la acción sale de `auditActionLabel`. */
  key: Key;
  /** Código de auditoría de la entrada; su texto sale de `app/i18n/audit.ts`. */
  action: string;
  params: Record<string, string>;
  /** Lo que cambió, con los mismos rótulos y valores que la página de Auditoría (una sola tabla de traducciones). */
  rows: DetailRow[];
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
 * cambiaron. El destino de la asignación va como parámetro del título, no como cambio. Los rótulos y valores los
 * pone `describeAuditDetail`, el mismo que usa la página de Auditoría.
 */
export function describeEntry(entry: AuditEntryDto, text: DetailText): HistoryItem {
  const suffix = entry.action.replace(/^asset\./, '');
  const key: Key = (KNOWN as readonly string[]).includes(suffix) ? (suffix as Key) : 'update';
  const params: Record<string, string> = {};
  if (key === 'checkout')
    params['to'] = String(asRecord(entry.diff?.['after'])['assignedTo'] ?? '');
  if (key === 'create') return { key, action: entry.action, params, rows: [] };
  // En la asignación el destino ya va en el título.
  const skip = new Set(key === 'checkout' ? ['assignedTo', 'assignedToType'] : []);
  const rows = describeAuditDetail(entry.diff, text, {
    entity: entry.entity,
    action: entry.action,
    skip,
  });
  return { key, action: entry.action, params, rows };
}
