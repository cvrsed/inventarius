import type { LnsKind } from '@inventarius/shared';

/** Campos del destino por proveedor (sección 5.1). */
export const TARGET_FIELDS: Record<LnsKind, string[]> = {
  chirpstack: ['tenantId', 'applicationId'],
  ttn: ['applicationId'],
};

/** Valores por defecto con que se registran los dispositivos, por proveedor. */
export const DEFAULT_FIELDS: Record<LnsKind, string[]> = {
  chirpstack: ['deviceProfileId'],
  ttn: [
    'frequencyPlanId',
    'macVersion',
    'phyVersion',
    'joinServerAddress',
    'networkServerAddress',
    'applicationServerAddress',
  ],
};

export interface ProfileForm {
  kind: LnsKind;
  name: string;
  description: string;
  endpoint: string;
  tls: boolean;
  credential: string;
  active: boolean;
  target: Record<string, string>;
  deviceDefaults: Record<string, string>;
}

const pick = (source: Record<string, string>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, (source[k] ?? '').trim()]));

/**
 * Cuerpo del POST/PATCH. Al editar, la credencial solo viaja si se escribió una nueva (la actual nunca se lee,
 * RF-50) y el proveedor no se envía porque no cambia.
 */
export function profileBody(form: ProfileForm, editing: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim() === '' ? null : form.description.trim(),
    endpoint: form.endpoint.trim(),
    active: form.active,
    target: pick(form.target, TARGET_FIELDS[form.kind]),
    deviceDefaults: pick(form.deviceDefaults, DEFAULT_FIELDS[form.kind]),
  };
  if (form.kind === 'chirpstack') body['tls'] = form.tls;
  if (!editing) body['kind'] = form.kind;
  if (form.credential.trim()) body['credential'] = form.credential.trim();
  return body;
}
