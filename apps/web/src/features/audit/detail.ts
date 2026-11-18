import { auditFieldLabel, auditValueLabel } from '@/app/i18n/audit';
import { formatDateOnly } from '@/shared/format/format';

/** Una línea del detalle: un valor, o un antes/después cuando el campo cambió. */
export interface DetailRow {
  field: string;
  label: string;
  value?: string;
  before?: string;
  after?: string;
}

/** Textos que necesita el formateo; `t` y `te` vienen de vue-i18n (inyectados para poder probar sin él). */
export interface DetailText {
  t: (key: string) => string;
  te: (key: string) => boolean;
}

const EMPTY = '—';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Valor de un campo en lenguaje de persona: sin `null`, `true`, códigos internos ni JSON. */
export function formatDetailValue(field: string, value: unknown, text: DetailText): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (typeof value === 'boolean') return text.t(value ? 'common.yes' : 'common.no');
  if (Array.isArray(value)) {
    if (!value.length) return EMPTY;
    return value
      .map((v) =>
        typeof v === 'string' && text.te(`permissions.${v}`)
          ? text.t(`permissions.${v}`)
          : String(v),
      )
      .join(', ');
  }
  if (typeof value === 'string') {
    const enumerated = auditValueLabel(field, value);
    if (enumerated !== undefined) return enumerated;
    if (
      (field === 'purchaseDate' || field === 'expectedReturnOn') &&
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return formatDateOnly(value);
    }
    return value;
  }
  if (typeof value === 'object') return EMPTY;
  return String(value);
}

/**
 * Convierte el `diff` de una auditoría en una lista campo → valor. Con `before` y `after` muestra solo lo que
 * cambió, como antes/después; con uno solo (alta o baja) o con un objeto plano, el valor.
 */
export function describeAuditDetail(
  diff: Record<string, unknown> | null,
  text: DetailText,
): DetailRow[] {
  if (!diff) return [];
  const before = isRecord(diff['before']) ? diff['before'] : null;
  const after = isRecord(diff['after']) ? diff['after'] : null;
  const row = (field: string) => ({ field, label: auditFieldLabel(field) });
  // `context`: datos que no cambiaron pero ayudan a entender el evento (p. ej. el estado de un activo dado de baja).
  const context = isRecord(diff['context'])
    ? Object.entries(diff['context']).map(([f, v]) => ({
        ...row(f),
        value: formatDetailValue(f, v, text),
      }))
    : [];

  if (before && after) {
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changes = fields
      .filter((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null))
      .map((f) => ({
        ...row(f),
        before: formatDetailValue(f, before[f], text),
        after: formatDetailValue(f, after[f], text),
      }));
    return [...changes, ...context];
  }
  const single = after ?? before ?? diff;
  return [
    ...Object.entries(single)
      .filter(([f]) => single !== diff || f !== 'context')
      .map(([f, v]) => ({ ...row(f), value: formatDetailValue(f, v, text) })),
    ...context,
  ];
}
