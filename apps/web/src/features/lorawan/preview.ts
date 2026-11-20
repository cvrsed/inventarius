import type { RegistrationPreviewDto } from '@inventarius/shared';

export interface PreviewRow {
  key: string;
  label: string;
  value: string;
  /** Identificadores y claves se muestran en monoespaciado. */
  mono: boolean;
  /** Las claves enmascaradas no se parten en dos líneas. */
  nowrap?: boolean;
}

type T = (key: string, named?: Record<string, unknown>) => string;

/**
 * Filas de la confirmación previa al registro: exactamente lo que se enviará al LNS (RF-60). El servidor las arma con
 * la misma función que usa el registro real; aquí solo se les pone texto. Las claves llegan ya enmascaradas.
 */
export function previewRows(p: RegistrationPreviewDto, t: T): PreviewRow[] {
  const none = t('lorawan.notSet');
  const label = (k: string) => t(`lorawan.registerDialog.previewFields.${k}`);
  const row = (key: string, value: string, mono = false): PreviewRow => ({
    key,
    label: label(key),
    value,
    mono,
  });
  const deviceProfile = [p.deviceProfile.name, p.deviceProfile.version, p.deviceProfile.region]
    .filter(Boolean)
    .join(' · ');
  // Lo que el activo no tenía y se toma del device profile se guarda en el activo al registrar: se dice de dónde sale.
  const fromProfile = (field: 'lorawanVersion' | 'region', value: string | null) =>
    value && p.fromDeviceProfile.includes(field)
      ? t('lorawan.registerDialog.fromDeviceProfile', { value })
      : (value ?? none);
  return [
    row('profile', `${p.profile.name} · ${t(`lns.kinds.${p.profile.kind}`)}`),
    row('deviceName', p.deviceName),
    row('description', p.description || none),
    row('devEui', p.devEui, true),
    row('joinEui', p.joinEui, true),
    { ...row('appKey', p.appKey, true), nowrap: true },
    ...(p.nwkKey ? [{ ...row('nwkKey', p.nwkKey, true), nowrap: true }] : []),
    row('deviceProfile', deviceProfile || none),
    row('deviceClass', p.deviceClass ?? none),
    row('lorawanVersion', fromProfile('lorawanVersion', p.lorawanVersion)),
    row('region', fromProfile('region', p.region)),
    row('tags', p.tags.map((x) => `${x.key} = ${x.value}`).join(', '), true),
    ...Object.entries(p.target).map(([k, v]) => ({
      key: `target.${k}`,
      label: label(k),
      value: v,
      mono: true,
    })),
    row('externalId', p.externalId, true),
  ];
}
