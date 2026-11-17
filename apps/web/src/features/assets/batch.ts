import { MAX_BATCH_SIZE } from '@inventarius/shared';
import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';

/** Estado con que parte el alta en lote (semilla del sistema, RF-27). */
export const PENDING_SETUP_STATUS = 'Pendiente de configuración';

export interface BatchForm {
  model: RemoteOption | null;
  quantity: string;
  baseLocation: RemoteOption | null;
  status: RemoteOption | null;
  name: string;
  /** Una serie por línea. */
  serials: string;
}

export const emptyBatchForm = (): BatchForm => ({
  model: null,
  quantity: '',
  baseLocation: null,
  status: null,
  name: '',
  serials: '',
});

/** Series del cuadro de texto: una por línea, sin espacios ni líneas vacías. */
export function parseSerials(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** Cantidad entera válida (1 a 500) o `null`. */
export function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_BATCH_SIZE ? n : null;
}

/** Errores de campo del formulario (clave i18n por campo); vacío si se puede enviar. */
export function validateBatch(f: BatchForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.model) e['model'] = 'common.required';
  if (!f.baseLocation) e['baseLocation'] = 'common.required';
  if (!f.status) e['status'] = 'common.required';
  const quantity = parseQuantity(f.quantity);
  if (quantity === null) e['quantity'] = 'assets.batch.quantityInvalid';
  const serials = parseSerials(f.serials);
  if (serials.length && quantity !== null && serials.length !== quantity)
    e['serials'] = 'assets.batch.serialsMismatch';
  return e;
}

export function toBatchPayload(f: BatchForm): Record<string, unknown> {
  const serials = parseSerials(f.serials);
  return {
    modelId: f.model?.id,
    quantity: parseQuantity(f.quantity),
    baseLocationId: f.baseLocation?.id,
    statusId: f.status?.id,
    ...(f.name.trim() ? { name: f.name.trim() } : {}),
    ...(serials.length ? { serials } : {}),
  };
}
