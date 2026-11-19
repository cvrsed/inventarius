import type { ConnectionCheckDto } from '@inventarius/shared';
import type { DeviceProfileInfo } from '../src/modules/lns/device-profile.js';
import {
  externalIdFor,
  LnsOperationError,
  type LnsAdapter,
  type LnsProfile,
  type LorawanDeviceSecrets,
  type RemoteDevice,
  type RemoteDeviceDetails,
} from '../src/modules/lns/adapter.js';

/** El device profile del «LNS» coincide con el activo de prueba (AU915, LoRaWAN 1.0.3, clase A). */
export const DEFAULT_DEVICE_PROFILE: DeviceProfileInfo = {
  id: 'dp-1',
  name: 'Perfil AU915',
  version: '1.0.3',
  region: 'AU915',
  classes: ['A'],
  versionLabel: 'LoRaWAN 1.0.3',
  regionLabel: 'AU915',
};

/** Adaptador de LNS programable para las pruebas de servicio: guarda lo «creado» y falla donde se le pide. */
export class FakeLnsAdapter implements LnsAdapter {
  constructor(readonly kind: 'chirpstack' | 'ttn') {}
  /** Dispositivos existentes en el «LNS»: DevEUI -> id del activo que lo creó (o null si es ajeno). */
  remote = new Map<string, string | null>();
  calls: string[] = [];
  /** Resultados programados para las próximas llamadas a `registerDevice` (se consumen en orden). */
  registerOutcomes: (LnsOperationError | 'ok')[] = [];
  deregisterOutcomes: (LnsOperationError | 'ok')[] = [];
  lastDevice: LorawanDeviceSecrets | null = null;
  connection: ConnectionCheckDto = {
    ok: true,
    latencyMs: 12,
    checks: [{ name: 'application', ok: true, detail: null }],
  };

  /** Lo que el «LNS» dice de su device profile; por defecto coincide con el activo de prueba (AU915, 1.0.3, clase A). */
  deviceProfile: DeviceProfileInfo = { ...DEFAULT_DEVICE_PROFILE };
  /** Fallo programado de `describeDeviceProfile` (se consume en la próxima llamada). */
  describeOutcome: LnsOperationError | null = null;

  async describeDeviceProfile() {
    this.calls.push('describe');
    if (this.describeOutcome) {
      const e = this.describeOutcome;
      this.describeOutcome = null;
      throw e;
    }
    return this.deviceProfile;
  }

  /**
   * Lo que «el LNS» dice del dispositivo existente: nombre, JoinEUI, device profile y claves. Por defecto se arma desde
   * `remote` con valores de prueba; una prueba lo reemplaza para simular diferencias.
   */
  remoteDetails = new Map<string, Partial<RemoteDeviceDetails>>();

  async readDevice(_p: LnsProfile, devEui: string): Promise<RemoteDeviceDetails | null> {
    this.calls.push('read');
    if (!this.remote.has(devEui)) return null;
    return {
      externalId: externalIdFor(this.kind, devEui),
      name: 'Medidor ajeno',
      joinEui: '8877665544332211',
      deviceProfileId: this.kind === 'chirpstack' ? 'dp-remoto' : null,
      inventariusAssetId: this.remote.get(devEui) ?? null,
      appKey: null,
      nwkKey: null,
      ...this.remoteDetails.get(devEui),
    };
  }

  async testConnection() {
    this.calls.push('test');
    return this.connection;
  }

  async findDevice(_p: LnsProfile, devEui: string): Promise<RemoteDevice | null> {
    this.calls.push('find');
    if (!this.remote.has(devEui)) return null;
    return {
      externalId: externalIdFor(this.kind, devEui),
      inventariusAssetId: this.remote.get(devEui) ?? null,
    };
  }

  async registerDevice(_p: LnsProfile, d: LorawanDeviceSecrets) {
    this.calls.push('register');
    this.lastDevice = d;
    const outcome = this.registerOutcomes.shift() ?? 'ok';
    if (outcome !== 'ok') throw outcome;
    this.remote.set(d.devEui, d.assetId);
    return { externalId: externalIdFor(this.kind, d.devEui), stepsDone: ['device', 'keys'] };
  }

  async deregisterDevice(_p: LnsProfile, ref: { externalId: string; devEui: string }) {
    this.calls.push('deregister');
    const outcome = this.deregisterOutcomes.shift() ?? 'ok';
    if (outcome !== 'ok') throw outcome;
    for (const k of [...this.remote.keys()])
      if (externalIdFor(this.kind, k) === ref.externalId) this.remote.delete(k);
  }
}

export const transient = (msg = 'No se pudo conectar con el LNS') =>
  new LnsOperationError(msg, { transient: true });
export const permanent = (msg = 'El LNS rechazó los datos') =>
  new LnsOperationError(msg, { transient: false });
export const partial = (orphans: string[]) =>
  new LnsOperationError('No se pudo deshacer el registro', {
    transient: false,
    orphans,
    stepsDone: orphans,
  });
