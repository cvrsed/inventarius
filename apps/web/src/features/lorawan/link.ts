import type { DeviceProfileLabelDto, LinkDifferenceDto } from '@inventarius/shared';

/** «AppKey», «NwkKey» o «AppKey y NwkKey», para el aviso de las claves que el dispositivo remoto no tiene. */
export function missingKeysText(keys: readonly ('appKey' | 'nwkKey')[], t: T): string {
  return keys.map((k) => t(`lorawan.fields.${k}`)).join(' y ');
}

/** ChirpStack guarda un JoinEUI en ceros cuando no se definió ninguno. */
export const isUnsetJoinEui = (v: string | null): boolean => v !== null && /^0{16}$/.test(v);

type T = (key: string, named?: Record<string, unknown>) => string;

/**
 * Un device profile para mostrar: «nombre · versión · región». Si el LNS no lo pudo describir se cae a su identificador, y
 * sin nada, a «sin definir».
 */
export function deviceProfileText(
  label: DeviceProfileLabelDto | null | undefined,
  id: string | null,
  none: string,
): string {
  const described = [label?.name, label?.version, label?.region].filter(Boolean).join(' · ');
  return described || id || none;
}

/** Una diferencia en lenguaje de persona: «JoinEUI: el activo tiene X y el LNS Y». Las claves nunca muestran su valor. */
export function describeDifference(
  d: LinkDifferenceDto,
  t: T,
  profiles: { local?: DeviceProfileLabelDto | null; remote?: DeviceProfileLabelDto | null } = {},
): { field: string; label: string; text: string } {
  const none = t('lorawan.notSet');
  if (d.field === 'appKey' || d.field === 'nwkKey') {
    return {
      field: d.field,
      label: t(`lorawan.fields.${d.field}`),
      text: t(`lorawan.linkDialog.keyDiff.${d.remote}`, {
        local: t(`lorawan.linkDialog.keyState.${d.local}`),
      }),
    };
  }
  if (d.field === 'deviceProfile') {
    return {
      field: d.field,
      label: t('lorawan.linkDialog.rows.deviceProfile'),
      text: t('lorawan.linkDialog.valueDiff', {
        local: deviceProfileText(profiles.local, d.local, none),
        remote: deviceProfileText(profiles.remote, d.remote, none),
      }),
    };
  }
  return {
    field: d.field,
    label: t(`lorawan.linkDialog.rows.${d.field}`),
    text: t('lorawan.linkDialog.valueDiff', {
      local: d.local ?? none,
      remote:
        d.field === 'joinEui' && isUnsetJoinEui(d.remote)
          ? t('lorawan.linkDialog.unsetJoinEui')
          : (d.remote ?? none),
    }),
  };
}
