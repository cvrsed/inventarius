import { appKeySchema, devEuiSchema, joinEuiSchema, nwkKeySchema } from '@inventarius/shared';
import type { LorawanDto } from '@inventarius/shared';
import type { ZodType } from 'zod';

/** Estado del formulario de datos LoRaWAN; las claves vacías significan «no cambiar». */
export interface LorawanForm {
  devEui: string;
  joinEui: string;
  appKey: string;
  nwkKey: string;
  removeAppKey: boolean;
  removeNwkKey: boolean;
  deviceClass: string | number;
  lorawanVersion: string | number;
  region: string | number;
}

const HEX_FIELDS: {
  key: 'devEui' | 'joinEui' | 'appKey' | 'nwkKey';
  schema: ZodType<string>;
  n: number;
}[] = [
  { key: 'devEui', schema: devEuiSchema, n: 16 },
  { key: 'joinEui', schema: joinEuiSchema, n: 16 },
  { key: 'appKey', schema: appKeySchema, n: 32 },
  { key: 'nwkKey', schema: nwkKeySchema, n: 32 },
];

/**
 * Arma el PATCH con solo lo que cambió respecto de lo guardado y valida el formato de los hex.
 * Devuelve los campos inválidos con la cantidad de caracteres esperada. Con la identidad bloqueada
 * (dispositivo registrado) no se envían DevEUI, JoinEUI ni claves.
 */
export function lorawanPatch(
  form: LorawanForm,
  current: LorawanDto,
  identityLocked: boolean,
): { patch: Record<string, string | null>; errors: Record<string, number> } {
  const patch: Record<string, string | null> = {};
  const errors: Record<string, number> = {};
  if (!identityLocked) {
    for (const { key, schema, n } of HEX_FIELDS) {
      const raw = form[key].trim();
      const isKey = key === 'appKey' || key === 'nwkKey';
      if (isKey) {
        const remove = key === 'appKey' ? form.removeAppKey : form.removeNwkKey;
        if (remove) patch[key] = null;
        else if (raw) {
          if (schema.safeParse(raw).success) patch[key] = schema.parse(raw);
          else errors[key] = n;
        }
        continue;
      }
      if (raw === '') {
        if (current[key] !== null) patch[key] = null;
      } else if (schema.safeParse(raw).success) {
        const value = schema.parse(raw);
        if (value !== current[key]) patch[key] = value;
      } else errors[key] = n;
    }
  }
  for (const key of ['deviceClass', 'lorawanVersion', 'region'] as const) {
    const value = String(form[key]);
    const before = current[key] ?? '';
    if (value !== before) patch[key] = value === '' ? null : value;
  }
  return { patch, errors };
}
