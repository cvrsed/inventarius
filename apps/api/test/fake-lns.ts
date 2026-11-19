import type { ConnectionCheckDto } from '@inventarius/shared';
import {
  externalIdFor,
  LnsOperationError,
  type LnsAdapter,
  type LnsProfile,
  type LorawanDeviceSecrets,
  type RemoteDevice,
} from '../src/modules/lns/adapter.js';

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
