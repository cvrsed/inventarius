import { auditFieldLabel, auditValueLabel } from '@/app/i18n/audit';
import { formatDecimal } from '@inventarius/shared';
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
/** Cuántos elementos de una lista (p. ej. las series de una importación) se nombran antes de resumir el resto. */
const LIST_LIMIT = 10;

/** Opciones del detalle: la entidad del evento (rótulos que dependen de ella) y campos que no se muestran. */
export interface DetailOptions {
  entity?: string;
  skip?: ReadonlySet<string>;
}

/**
 * Las claves se auditan como `hasAppKey` (hay/no hay) y `appKeyChanged` (se escribió una): al lector le basta una
 * línea «AppKey: cargada / actualizada / eliminada». Los dos campos crudos no se muestran.
 */
const KEY_FIELDS = [
  { field: 'appKey', has: 'hasAppKey', changed: 'appKeyChanged' },
  { field: 'nwkKey', has: 'hasNwkKey', changed: 'nwkKeyChanged' },
] as const;

function keyRows(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  entity: string | undefined,
  text: DetailText,
): { rows: DetailRow[]; hidden: Set<string> } {
  const rows: DetailRow[] = [];
  const hidden = new Set<string>();
  for (const k of KEY_FIELDS) {
    hidden.add(k.has).add(k.changed);
    const hadBefore = before?.[k.has] === true;
    const hasAfter = after?.[k.has];
    const state =
      hasAfter === true && !hadBefore
        ? 'loaded'
        : hasAfter === false && hadBefore
          ? 'removed'
          : (after ?? before)?.[k.changed] === true
            ? 'updated'
            : null;
    if (state) {
      rows.push({
        field: k.field,
        label: auditFieldLabel(k.field, entity),
        value: text.t(`audit.keyState.${state}`),
      });
    }
  }
  return { rows, hidden };
}

/**
 * Datos propios del evento, no un campo que cambió de valor: el motivo de una baja, la nota de una asignación, a quién
 * se asignó o a dónde volvió. Se muestran como valor simple, sin «antes → después» (que queda para lo que cambió).
 */
export const EVENT_FIELDS: ReadonlySet<string> = new Set([
  'reason',
  'note',
  'expectedReturnOn',
  'returnedTo',
  'assignedTo',
  'assignedToType',
  'quantity',
  'unit',
  'stockBefore',
  'stockAfter',
  'fromStockAfter',
  'toStockAfter',
  'recipient',
  'recipientRef',
  'direction',
  'fromLocation',
  'toLocation',
  'originalKind',
  'receivedOn',
  'supplier',
  'location',
]);

/** Campos de cantidad: llegan como texto con punto decimal y se muestran en es-CL (coma decimal). */
const QUANTITY_FIELDS: ReadonlySet<string> = new Set([
  'quantity',
  'minStock',
  'stockBefore',
  'stockAfter',
  'fromStockAfter',
  'toStockAfter',
]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Valor de un campo en lenguaje de persona: sin `null`, `true`, códigos internos ni JSON. */
export function formatDetailValue(
  field: string,
  value: unknown,
  text: DetailText,
  entity?: string,
): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (typeof value === 'boolean') return text.t(value ? 'common.yes' : 'common.no');
  if (Array.isArray(value)) {
    if (!value.length) return EMPTY;
    const shown = value.slice(0, LIST_LIMIT).map((v) => {
      if (typeof v !== 'string') return String(v);
      if (text.te(`permissions.${v}`)) return text.t(`permissions.${v}`);
      return auditValueLabel(field, v, entity) ?? v;
    });
    const more = value.length - shown.length;
    return more > 0
      ? `${shown.join(', ')} … ${text.t('audit.andMore').replace('{n}', String(more))}`
      : shown.join(', ');
  }
  if (isRecord(value)) {
    // Objeto plano (p. ej. el destino de un perfil LNS): «Tenant: …; Aplicación: …».
    const parts = Object.entries(value).map(
      ([k, v]) => `${auditFieldLabel(k, entity)}: ${formatDetailValue(k, v, text, entity)}`,
    );
    return parts.length ? parts.join('; ') : EMPTY;
  }
  if (typeof value === 'string') {
    const enumerated = auditValueLabel(field, value, entity);
    if (enumerated !== undefined) return enumerated;
    if (QUANTITY_FIELDS.has(field) && /^\d+(\.\d+)?$/.test(value)) return formatDecimal(value);
    if (field === 'receivedOn' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value);
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
 * cambió de valor, como antes/después (los datos del evento y el contexto, como valor simple); con uno solo (alta o baja) o con un objeto plano, el valor.
 */
export function describeAuditDetail(
  diff: Record<string, unknown> | null,
  text: DetailText,
  options: DetailOptions = {},
): DetailRow[] {
  if (!diff) return [];
  const { entity } = options;
  const before = isRecord(diff['before']) ? diff['before'] : null;
  const after = isRecord(diff['after']) ? diff['after'] : null;
  const keys = keyRows(before, after ?? (before ? null : diff), entity, text);
  const hide = (f: string) => keys.hidden.has(f) || (options.skip?.has(f) ?? false);
  const row = (field: string) => ({ field, label: auditFieldLabel(field, entity) });
  const fmt = (f: string, v: unknown) => formatDetailValue(f, v, text, entity);
  // `context`: datos que no cambiaron pero ayudan a entender el evento (p. ej. el estado de un activo dado de baja).
  const context = isRecord(diff['context'])
    ? Object.entries(diff['context']).map(([f, v]) => ({
        ...row(f),
        value: fmt(f, v),
      }))
    : [];

  if (before && after) {
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changes: DetailRow[] = [];
    for (const f of fields.filter((x) => !hide(x))) {
      if (EVENT_FIELDS.has(f)) {
        // Dato del evento: valor simple (el de después; en una restauración, el que traía la baja).
        const v = after[f] ?? before[f];
        if (v !== null && v !== undefined && v !== '') {
          changes.push({ ...row(f), value: fmt(f, v) });
        }
      } else if (JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)) {
        changes.push({
          ...row(f),
          before: fmt(f, before[f]),
          after: fmt(f, after[f]),
        });
      }
    }
    return [...changes, ...keys.rows, ...context];
  }
  const single = after ?? before ?? diff;
  return [
    ...Object.entries(single)
      .filter(([f]) => (single !== diff || f !== 'context') && !hide(f))
      .map(([f, v]) => ({ ...row(f), value: fmt(f, v) })),
    ...keys.rows,
    ...context,
  ];
}
