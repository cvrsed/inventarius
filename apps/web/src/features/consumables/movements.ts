import {
  formatQuantity,
  type MovementDto,
  type MovementKind,
  type UnitRef,
} from '@inventarius/shared';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Ícono Lucide de cada tipo de movimiento (todos están en `APP_ICONS`). */
export const MOVEMENT_ICONS: Record<MovementKind, string> = {
  receipt: 'i-lucide-package-plus',
  delivery: 'i-lucide-hand-helping',
  return: 'i-lucide-undo-2',
  adjustment: 'i-lucide-scale',
  transfer_out: 'i-lucide-arrow-right-left',
  transfer_in: 'i-lucide-arrow-right-left',
  reversal: 'i-lucide-ban',
};

/** Ícono de cada acción de la ficha: el mismo que el del movimiento que registra (P12). */
export const ACTION_ICONS = {
  receive: MOVEMENT_ICONS.receipt,
  deliver: MOVEMENT_ICONS.delivery,
  return: MOVEMENT_ICONS.return,
  transfer: MOVEMENT_ICONS.transfer_out,
  adjust: MOVEMENT_ICONS.adjustment,
  reverse: MOVEMENT_ICONS.reversal,
} as const;

/** `+24 pares` / `−3 pares`: con signo (menos tipográfico) y la unidad. */
export function signedQuantity(delta: string, unit: UnitRef): string {
  const negative = delta.startsWith('-');
  const text = formatQuantity(negative ? delta.slice(1) : delta, unit);
  return `${negative ? '−' : '+'}${text}`;
}

export interface MovementView {
  title: string;
  quantity: string;
  /** Lo que dice la entrada: «Ingreso +12 pares» o «Traslado: origen → destino, 2 pares». */
  headline: string;
  /** Dónde: una bodega, o «origen → destino» en un traslado. */
  place: string;
  /** Líneas «campo: valor» propias del tipo (receptor, proveedor, motivo...). */
  lines: { label: string; value: string }[];
}

/** Texto de un movimiento para el historial, todo por i18n. */
export function describeMovement(m: MovementDto, unit: UnitRef, t: Translate): MovementView {
  const lines: MovementView['lines'] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) lines.push({ label: t(`consumables.history.${label}`), value });
  };
  if (m.recipient) {
    add(
      m.kind === 'return' ? 'returnedBy' : 'recipient',
      m.recipient.ref ? `${m.recipient.name} (${m.recipient.ref})` : m.recipient.name,
    );
  }
  add('supplier', m.supplier);
  if (m.reason) add('reason', t(`consumables.reasons.${m.reason}`));
  add(m.kind === 'reversal' ? 'reversalReason' : 'note', m.note);

  let place = m.location.name;
  const isTransfer = m.counterpartLocation !== null;
  if (m.counterpartLocation) {
    // El stock entra a la bodega del movimiento cuando el `delta` es positivo y sale cuando es negativo.
    const [from, to] = m.delta.startsWith('-')
      ? [m.location.name, m.counterpartLocation.name]
      : [m.counterpartLocation.name, m.location.name];
    place = `${from} → ${to}`;
  }
  const reversesTransfer = m.kind === 'reversal' && m.reverses?.kind.startsWith('transfer');
  const title = reversesTransfer
    ? t('consumables.kinds.reversalTransfer')
    : t(`consumables.kinds.${m.kind}`);
  // Un traslado no suma ni resta: es una cantidad que se mueve, sin signo.
  const quantity = isTransfer
    ? formatQuantity(m.delta.startsWith('-') ? m.delta.slice(1) : m.delta, unit)
    : signedQuantity(m.delta, unit);
  return {
    title,
    quantity,
    headline: isTransfer ? `${title}: ${place}, ${quantity}` : `${title} ${quantity}`,
    place,
    lines,
  };
}
