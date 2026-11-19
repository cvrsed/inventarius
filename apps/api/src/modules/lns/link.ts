import type { LinkDifferenceDto } from '@inventarius/shared';
import type { RemoteDeviceDetails } from './adapter.js';

/** Lo que Inventarius tiene del dispositivo y espera encontrar en el LNS. */
export interface LocalDeviceView {
  joinEui: string | null;
  /** Nombre con que Inventarius lo registraría. */
  name: string;
  /** Device profile del perfil LNS elegido (ChirpStack); `null` si el LNS no tiene ese concepto. */
  deviceProfileId: string | null;
  appKey: string | null;
  nwkKey: string | null;
  /** NwkKey solo se compara en LoRaWAN 1.1: en 1.0.x no existe. */
  usesNwkKey: boolean;
}

const same = (a: string | null, b: string | null) =>
  (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

/** Código de una clave para mostrar: nunca el valor. */
const keyState = (v: string | null) => (v ? 'present' : 'absent');

function keyDifference(
  field: 'appKey' | 'nwkKey',
  local: string | null,
  remote: string | null,
): LinkDifferenceDto | null {
  if (!local && !remote) return null;
  if (local && remote && same(local, remote)) return null;
  return {
    field,
    local: keyState(local),
    // Con las dos presentes pero distintas, el remoto se marca «distinta»: ni se muestra ni se copia el valor.
    remote: local && remote ? 'differs' : keyState(remote),
  };
}

/**
 * Diferencias entre el activo y el dispositivo que ya existe en el LNS (vincular, RF-64): JoinEUI, device profile,
 * claves presentes o ausentes y nombre. Solo informa; no decide nada ni toca el dispositivo remoto.
 */
export function compareRemoteDevice(
  local: LocalDeviceView,
  remote: RemoteDeviceDetails,
): LinkDifferenceDto[] {
  const out: LinkDifferenceDto[] = [];
  if (!same(local.joinEui, remote.joinEui)) {
    out.push({ field: 'joinEui', local: local.joinEui, remote: remote.joinEui });
  }
  if (local.deviceProfileId && !same(local.deviceProfileId, remote.deviceProfileId)) {
    out.push({
      field: 'deviceProfile',
      local: local.deviceProfileId,
      remote: remote.deviceProfileId,
    });
  }
  const app = keyDifference('appKey', local.appKey, remote.appKey);
  if (app) out.push(app);
  if (local.usesNwkKey) {
    const nwk = keyDifference('nwkKey', local.nwkKey, remote.nwkKey);
    if (nwk) out.push(nwk);
  }
  if (local.name !== remote.name)
    out.push({ field: 'name', local: local.name, remote: remote.name });
  return out;
}

/**
 * Qué datos del activo se reemplazan al adoptar los del LNS: JoinEUI y claves **que el LNS sí tiene**. Lo que el LNS no
 * tiene no se borra del activo (no se destruyen datos locales para igualar al remoto). Nombre y device profile no son
 * datos del activo, así que no se adoptan.
 */
export function adoptionFrom(
  local: LocalDeviceView,
  remote: RemoteDeviceDetails,
): { joinEui?: string; appKey?: string; nwkKey?: string } {
  const out: { joinEui?: string; appKey?: string; nwkKey?: string } = {};
  if (remote.joinEui && !same(local.joinEui, remote.joinEui)) out.joinEui = remote.joinEui;
  if (remote.appKey && !same(local.appKey, remote.appKey)) out.appKey = remote.appKey;
  if (local.usesNwkKey && remote.nwkKey && !same(local.nwkKey, remote.nwkKey)) {
    out.nwkKey = remote.nwkKey;
  }
  return out;
}
