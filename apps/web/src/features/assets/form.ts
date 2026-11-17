import type { AssetDto } from '@inventarius/shared';
import { getDefaultCurrency } from '@/shared/format/format';
import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';

/** Campos del formulario de activo: textos tal como se escriben y referencias como `{ id, name }`. */
export interface AssetForm {
  assetTag: string;
  name: string;
  model: RemoteOption | null;
  status: RemoteOption | null;
  baseLocation: RemoteOption | null;
  serial: string;
  purchaseDate: string;
  purchaseCost: string;
  purchaseCurrency: string;
  supplier: string;
  warrantyMonths: string;
  notes: string;
}

export const emptyAssetForm = (currency = getDefaultCurrency()): AssetForm => ({
  assetTag: '',
  name: '',
  model: null,
  status: null,
  baseLocation: null,
  serial: '',
  purchaseDate: '',
  purchaseCost: '',
  purchaseCurrency: currency,
  supplier: '',
  warrantyMonths: '',
  notes: '',
});

type Loaded = Pick<
  AssetDto,
  | 'assetTag'
  | 'name'
  | 'serial'
  | 'model'
  | 'status'
  | 'baseLocation'
  | 'purchaseDate'
  | 'purchaseCost'
  | 'purchaseCurrency'
  | 'supplier'
  | 'warrantyMonths'
  | 'notes'
>;

export function formFromAsset(a: Loaded): AssetForm {
  return {
    assetTag: a.assetTag,
    name: a.name,
    model: { id: a.model.id, name: a.model.name },
    status: { id: a.status.id, name: a.status.name },
    baseLocation: a.baseLocation ? { id: a.baseLocation.id, name: a.baseLocation.name } : null,
    serial: a.serial ?? '',
    purchaseDate: a.purchaseDate ?? '',
    purchaseCost: a.purchaseCost === null ? '' : String(a.purchaseCost),
    purchaseCurrency: a.purchaseCurrency,
    supplier: a.supplier ?? '',
    warrantyMonths: a.warrantyMonths === null ? '' : String(a.warrantyMonths),
    notes: a.notes ?? '',
  };
}

const orNull = (v: string): string | null => v.trim() || null;

/** Acepta coma decimal (es-CL); lo que no es número válido se descarta. */
function toNumber(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
}

/**
 * Cuerpo de la petición. En alta la etiqueta vacía se omite (la API la genera); en edición el estado solo
 * viaja si cambió, porque un activo asignado no admite cambiarlo por esta vía.
 */
export function toAssetPayload(
  f: AssetForm,
  mode: 'create' | 'edit',
  currentStatusId?: string,
): Record<string, unknown> {
  const warranty = toNumber(f.warrantyMonths);
  const tag = f.assetTag.trim();
  return {
    ...(tag ? { assetTag: tag } : {}),
    name: f.name.trim(),
    modelId: f.model?.id ?? null,
    ...(mode === 'create' || f.status?.id !== currentStatusId
      ? { statusId: f.status?.id ?? null }
      : {}),
    serial: orNull(f.serial),
    baseLocationId: f.baseLocation?.id ?? null,
    purchaseDate: orNull(f.purchaseDate),
    purchaseCost: toNumber(f.purchaseCost),
    purchaseCurrency: f.purchaseCurrency,
    supplier: orNull(f.supplier),
    warrantyMonths: warranty === null ? null : Math.trunc(warranty),
    notes: orNull(f.notes),
  };
}
