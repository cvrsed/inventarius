import type { DeviceProfileInfo } from './device-profile.js';
import type {
  ConnectionCheckDto,
  LnsKind,
  LorawanClass,
  LorawanRegion,
  LorawanVersion,
} from '@inventarius/shared';

/** Perfil LNS con la credencial ya descifrada. Vive solo en memoria del worker o de la petición de prueba. */
export interface LnsProfile {
  id: string;
  kind: LnsKind;
  name: string;
  endpoint: string;
  tls: boolean;
  credential: string;
  target: Record<string, string>;
  deviceDefaults: Record<string, string>;
}

/** Dispositivo a registrar, con claves en claro (nunca se registran en logs). */
export interface LorawanDeviceSecrets {
  assetId: string;
  /** Nombre legible en el LNS (etiqueta + nombre del activo). */
  name: string;
  description: string;
  devEui: string;
  joinEui: string;
  appKey: string;
  nwkKey: string | null;
  deviceClass: LorawanClass | null;
  lorawanVersion: LorawanVersion | null;
  region: LorawanRegion | null;
}

/** Dispositivo que ya existe en el destino. */
export interface RemoteDevice {
  externalId: string;
  /** Id de activo con que Inventarius lo etiquetó; `null` si lo creó otro (RF-64). */
  inventariusAssetId: string | null;
}

/**
 * Lo que el LNS tiene hoy de un dispositivo, leído sin modificarlo (RF-64, vincular). Las claves se leen solo para
 * compararlas o adoptarlas: viven en memoria, nunca se registran en logs ni en la auditoría.
 */
export interface RemoteDeviceDetails {
  externalId: string;
  name: string;
  /** Hexadecimal en mayúsculas, como lo guarda Inventarius; `null` si el LNS no lo tiene. */
  joinEui: string | null;
  /** Id del device profile (solo ChirpStack). */
  deviceProfileId: string | null;
  inventariusAssetId: string | null;
  /** AppKey y NwkKey de Inventarius; `null` = no están en el LNS (o están en ceros). */
  appKey: string | null;
  nwkKey: string | null;
}

export interface RemoteDeviceRef {
  externalId: string;
  devEui: string;
}

export interface RegistrationResult {
  externalId: string;
  /** Pasos completados, en orden. */
  stepsDone: string[];
}

export type ConnectionCheck = ConnectionCheckDto;

/**
 * Falla de una operación contra el LNS. `transient` (timeout, 5xx, `UNAVAILABLE`) se reintenta con espera; el resto no
 * (RF-63). Si la compensación también falló, `orphans` nombra los componentes que quedaron en el LNS (estado `parcial`).
 */
export class LnsOperationError extends Error {
  constructor(
    message: string,
    readonly options: {
      transient: boolean;
      stepsDone?: string[];
      orphans?: string[];
      /** El destino dice que el dispositivo ya existe (el servicio lo trata como conflicto, RF-64). */
      conflict?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'LnsOperationError';
  }
  get transient(): boolean {
    return this.options.transient;
  }
  get stepsDone(): string[] {
    return this.options.stepsDone ?? [];
  }
  get conflict(): boolean {
    return this.options.conflict ?? false;
  }
  get orphans(): string[] {
    return this.options.orphans ?? [];
  }
}

/** Contrato que implementa cada Network Server soportado (sección 5.5). */
export interface LnsAdapter {
  readonly kind: LnsKind;
  /** Verifica credencial y que el destino configurado exista. */
  testConnection(profile: LnsProfile): Promise<ConnectionCheck>;
  /**
   * Lee la configuración del device profile al que irá el dispositivo (versión de MAC, región, clases), para validar
   * el activo antes de registrarlo (RF-60).
   */
  describeDeviceProfile(profile: LnsProfile): Promise<DeviceProfileInfo>;
  /** Devuelve el dispositivo si existe en el destino, o `null`. */
  findDevice(profile: LnsProfile, devEui: string): Promise<RemoteDevice | null>;
  /**
   * Lee el dispositivo remoto (datos y claves) sin modificarlo. `lorawanVersion` dice dónde mirar la AppKey: en
   * ChirpStack 1.0.x vive en `nwk_key`. Devuelve `null` si no existe.
   */
  readDevice(
    profile: LnsProfile,
    devEui: string,
    lorawanVersion: LorawanVersion | null,
  ): Promise<RemoteDeviceDetails | null>;
  /** Crea el dispositivo completo; compensa internamente si falla a mitad. */
  registerDevice(profile: LnsProfile, device: LorawanDeviceSecrets): Promise<RegistrationResult>;
  /** Borra el dispositivo del destino en el orden que corresponda; borrar lo que no existe no es error. */
  deregisterDevice(profile: LnsProfile, ref: RemoteDeviceRef): Promise<void>;
}

/** Largo máximo del nombre del dispositivo en ChirpStack y TTN. */
export const LNS_NAME_MAX = 100;

/** Etiquetas (ChirpStack) o atributos (TTN) con que Inventarius marca lo que crea, tal como se envían. */
export function assetMarkers(kind: LnsKind, assetId: string): { key: string; value: string }[] {
  return [{ key: kind === 'ttn' ? TTN_ASSET_ATTRIBUTE : ASSET_TAG_KEY, value: assetId }];
}

/** Id del dispositivo en el LNS, derivado y estable a partir del DevEUI (sección 5.4). */
export function externalIdFor(kind: LnsKind, devEui: string): string {
  return kind === 'ttn' ? `inv-${devEui.toLowerCase()}` : devEui.toLowerCase();
}

/** Etiqueta con la que Inventarius marca lo que crea, para reconocerlo en un reintento (RF-64). */
export const ASSET_TAG_KEY = 'inventarius_asset_id';
/** En TTN las claves de atributos no admiten guion bajo. */
export const TTN_ASSET_ATTRIBUTE = 'inventarius-asset-id';

export type AdapterRegistry = Record<LnsKind, LnsAdapter>;
