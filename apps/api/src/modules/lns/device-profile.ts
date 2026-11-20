import type { LorawanClass, LorawanRegion, LorawanVersion } from '@inventarius/shared';

/**
 * Lo que el LNS tiene configurado en el device profile al que irá el dispositivo. En ChirpStack la versión de MAC, la
 * región y las clases viven ahí, no en el dispositivo; `null` significa «el LNS no lo fija» o «no se pudo traducir».
 */
export interface DeviceProfileInfo {
  /** Id y nombre del device profile (o `null` si el LNS no los tiene, como en TTN). */
  id: string | null;
  name: string | null;
  version: LorawanVersion | null;
  region: LorawanRegion | null;
  /** Clases que el perfil admite (la A siempre). `null` si el LNS no lo restringe aquí. */
  classes: LorawanClass[] | null;
  /** El texto de versión y región tal como las tiene el LNS, para mostrarlas aunque Inventarius no las conozca. */
  versionLabel: string | null;
  regionLabel: string | null;
}

/** Una diferencia entre el activo y el device profile del perfil LNS. */
export interface ProfileMismatch {
  field: 'lorawanVersion' | 'deviceClass' | 'region';
  /** Lo que tiene el activo. */
  asset: string;
  /** Lo que tiene el LNS. */
  lns: string;
}

/**
 * Compara versión, clase y región del activo con el device profile (RF-60). Un valor que el LNS no fija no se compara.
 * Si el activo no tiene un valor (se completa con el del modelo antes de llamar), tampoco hay nada que comparar.
 */
export function compareWithDeviceProfile(
  asset: {
    lorawanVersion: LorawanVersion | null;
    deviceClass: LorawanClass | null;
    region: LorawanRegion | null;
  },
  info: DeviceProfileInfo,
): ProfileMismatch[] {
  const out: ProfileMismatch[] = [];
  if (asset.lorawanVersion && info.version && asset.lorawanVersion !== info.version) {
    out.push({ field: 'lorawanVersion', asset: asset.lorawanVersion, lns: info.version });
  }
  if (asset.region && info.region && asset.region !== info.region) {
    out.push({ field: 'region', asset: asset.region, lns: info.region });
  }
  if (asset.deviceClass && info.classes && !info.classes.includes(asset.deviceClass)) {
    out.push({
      field: 'deviceClass',
      asset: asset.deviceClass,
      lns: info.classes.join(', '),
    });
  }
  return out;
}

/** Campos del activo que se pueden completar con los del device profile. */
export type ProfileFilledField = 'lorawanVersion' | 'region';

/**
 * Completa la versión LoRaWAN y la región que el activo no tiene (ni por sí mismo ni por su modelo) con las del device
 * profile, que es lo que el LNS usará de todos modos. Lo que el activo ya tiene no se toca: si no calza, lo detecta
 * `compareWithDeviceProfile`. Devuelve los datos completados y qué campos se tomaron del perfil.
 */
export function fillFromDeviceProfile<
  T extends { lorawanVersion: LorawanVersion | null; region: LorawanRegion | null },
>(data: T, info: DeviceProfileInfo): { data: T; filled: ProfileFilledField[] } {
  const filled: ProfileFilledField[] = [];
  const out = { ...data };
  if (!out.lorawanVersion && info.version) {
    out.lorawanVersion = info.version;
    filled.push('lorawanVersion');
  }
  if (!out.region && info.region) {
    out.region = info.region;
    filled.push('region');
  }
  return { data: out, filled };
}
