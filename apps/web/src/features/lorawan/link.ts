import type { LinkDifferenceDto } from '@inventarius/shared';

/** ChirpStack guarda un JoinEUI en ceros cuando no se definió ninguno. */
export const isUnsetJoinEui = (v: string | null): boolean => v !== null && /^0{16}$/.test(v);

type T = (key: string, named?: Record<string, unknown>) => string;

/** Una diferencia en lenguaje de persona: «JoinEUI: el activo tiene X y el LNS Y». Las claves nunca muestran su valor. */
export function describeDifference(
  d: LinkDifferenceDto,
  t: T,
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
