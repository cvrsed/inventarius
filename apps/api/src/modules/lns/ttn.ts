import type { ConnectionCheckDto, LorawanVersion } from '@inventarius/shared';
import {
  externalIdFor,
  LnsOperationError,
  TTN_ASSET_ATTRIBUTE,
  type ConnectionCheck,
  type LnsAdapter,
  type LnsProfile,
  type LorawanDeviceSecrets,
  type RegistrationResult,
  type RemoteDevice,
  type RemoteDeviceRef,
} from './adapter.js';

/** Componentes de The Things Stack en el orden en que se crean (se borran en el inverso). */
export const TTN_STEPS = ['is', 'js', 'ns', 'as'] as const;
export type TtnStep = (typeof TTN_STEPS)[number];

const MAC_VERSIONS: Record<LorawanVersion, string> = {
  '1.0': 'MAC_V1_0',
  '1.0.1': 'MAC_V1_0_1',
  '1.0.2': 'MAC_V1_0_2',
  '1.0.3': 'MAC_V1_0_3',
  '1.0.4': 'MAC_V1_0_4',
  '1.1': 'MAC_V1_1',
};

/** Fallo HTTP ya interpretado: transitorio si no hubo respuesta, 429 o 5xx (RF-63). */
class HttpFailure extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
  }
  get transient(): boolean {
    return this.httpStatus === null || this.httpStatus === 429 || this.httpStatus >= 500;
  }
  /** Sin respuesta: no se sabe si el cambio se aplicó. */
  get ambiguous(): boolean {
    return this.httpStatus === null || this.httpStatus >= 500;
  }
}

function describe(status: number, apiMessage: string | undefined): string {
  switch (status) {
    case 401:
      return 'TTN rechazó la credencial (API key inválida o vencida)';
    case 403:
      return 'La API key no tiene los derechos necesarios en TTN';
    case 404:
      return 'TTN no encontró el recurso (revisa la aplicación)';
    case 409:
      return 'El dispositivo ya existe en TTN';
    case 429:
      return 'TTN limitó las peticiones; se reintentará';
    default:
      return `TTN respondió ${status}${apiMessage ? `: ${apiMessage}` : ''}`;
  }
}

/**
 * Adaptador de TTN / The Things Stack v3 por REST (sección 5.4). El dispositivo vive en cuatro componentes
 * (IS, JS, NS, AS); si un paso falla se borra, en orden inverso, lo ya creado.
 */
export class TtnAdapter implements LnsAdapter {
  readonly kind = 'ttn' as const;

  constructor(private readonly timeoutMs: number) {}

  private async request(
    profile: LnsProfile,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${profile.endpoint.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${profile.credential}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new HttpFailure(
        timeout ? 'TTN no respondió a tiempo' : 'No se pudo conectar con TTN',
        null,
      );
    }
    const text = await res.text();
    const json: unknown = (() => {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    })();
    if (!res.ok) {
      const msg = (json as { message?: string } | null)?.message;
      throw new HttpFailure(describe(res.status, msg), res.status);
    }
    return json;
  }

  private app(profile: LnsProfile): string {
    return encodeURIComponent(profile.target.applicationId ?? '');
  }

  async testConnection(profile: LnsProfile): Promise<ConnectionCheck> {
    const started = Date.now();
    const checks: ConnectionCheckDto['checks'] = [];
    try {
      await this.request(
        profile,
        'GET',
        `/api/v3/applications/${this.app(profile)}?field_mask=name`,
      );
      checks.push({ name: 'application', ok: true, detail: null });
    } catch (e) {
      checks.push({
        name: 'application',
        ok: false,
        detail: e instanceof HttpFailure ? e.message : 'Error inesperado',
      });
    }
    return { ok: checks.every((c) => c.ok), latencyMs: Date.now() - started, checks };
  }

  async findDevice(profile: LnsProfile, devEui: string): Promise<RemoteDevice | null> {
    const id = externalIdFor('ttn', devEui);
    try {
      const json = (await this.request(
        profile,
        'GET',
        `/api/v3/applications/${this.app(profile)}/devices/${id}?field_mask=attributes`,
      )) as { attributes?: Record<string, string> } | null;
      return {
        externalId: id,
        inventariusAssetId: json?.attributes?.[TTN_ASSET_ATTRIBUTE] ?? null,
      };
    } catch (e) {
      if (e instanceof HttpFailure) {
        if (e.httpStatus === 404) return null;
        throw new LnsOperationError(e.message, { transient: e.transient, cause: e });
      }
      throw e;
    }
  }

  async registerDevice(profile: LnsProfile, d: LorawanDeviceSecrets): Promise<RegistrationResult> {
    const id = externalIdFor('ttn', d.devEui);
    const app = this.app(profile);
    const defaults = profile.deviceDefaults;
    const ids = { device_id: id, dev_eui: d.devEui, join_eui: d.joinEui };
    const mac = d.lorawanVersion ? MAC_VERSIONS[d.lorawanVersion] : defaults.macVersion;
    const idMask = ['ids.dev_eui', 'ids.join_eui'];

    const steps: Record<TtnStep, () => Promise<unknown>> = {
      is: () =>
        this.request(profile, 'POST', `/api/v3/applications/${app}/devices`, {
          end_device: {
            ids,
            name: d.name.slice(0, 100),
            description: d.description,
            attributes: { [TTN_ASSET_ATTRIBUTE]: d.assetId },
            join_server_address: defaults.joinServerAddress,
            network_server_address: defaults.networkServerAddress,
            application_server_address: defaults.applicationServerAddress,
          },
          field_mask: {
            paths: [
              'name',
              'description',
              'attributes',
              'join_server_address',
              'network_server_address',
              'application_server_address',
              ...idMask,
            ],
          },
        }),
      js: () =>
        this.request(profile, 'PUT', `/api/v3/js/applications/${app}/devices/${id}`, {
          end_device: {
            ids,
            network_server_address: defaults.networkServerAddress,
            application_server_address: defaults.applicationServerAddress,
            root_keys:
              d.lorawanVersion === '1.1'
                ? { app_key: { key: d.appKey }, nwk_key: { key: d.nwkKey ?? '' } }
                : { app_key: { key: d.appKey } },
          },
          field_mask: {
            paths: [
              'network_server_address',
              'application_server_address',
              'root_keys.app_key.key',
              ...(d.lorawanVersion === '1.1' ? ['root_keys.nwk_key.key'] : []),
              ...idMask,
            ],
          },
        }),
      ns: () =>
        this.request(profile, 'PUT', `/api/v3/ns/applications/${app}/devices/${id}`, {
          end_device: {
            ids,
            lorawan_version: mac,
            lorawan_phy_version: defaults.phyVersion,
            frequency_plan_id: defaults.frequencyPlanId,
            supports_join: true,
            supports_class_b: d.deviceClass === 'B',
            supports_class_c: d.deviceClass === 'C',
            multicast: false,
          },
          field_mask: {
            paths: [
              'lorawan_version',
              'lorawan_phy_version',
              'frequency_plan_id',
              'supports_join',
              'supports_class_b',
              'supports_class_c',
              'multicast',
              ...idMask,
            ],
          },
        }),
      as: () =>
        this.request(profile, 'PUT', `/api/v3/as/applications/${app}/devices/${id}`, {
          end_device: { ids },
          field_mask: { paths: idMask },
        }),
    };

    const done: TtnStep[] = [];
    for (const step of TTN_STEPS) {
      try {
        await steps[step]();
        done.push(step);
      } catch (e) {
        const failure =
          e instanceof HttpFailure ? e : new HttpFailure('Error inesperado en TTN', null);
        // Sin respuesta no se sabe si el paso se aplicó: también se intenta borrarlo.
        const toUndo = failure.ambiguous ? [...done, step] : done;
        const orphans = await this.undo(profile, id, toUndo);
        const message = orphans.length
          ? `${failure.message}. No se pudo deshacer por completo: quedaron componentes en TTN`
          : failure.message;
        throw new LnsOperationError(message, {
          transient: failure.transient && orphans.length === 0,
          stepsDone: orphans.length ? done : [],
          orphans,
          conflict: failure.httpStatus === 409 && step === 'is',
          cause: e,
        });
      }
    }
    return { externalId: id, stepsDone: [...done] };
  }

  /** Borra en orden inverso (AS → NS → JS → IS); sigue ante un fallo y devuelve los componentes que quedaron. */
  private async undo(
    profile: LnsProfile,
    id: string,
    done: readonly TtnStep[],
  ): Promise<TtnStep[]> {
    const orphans: TtnStep[] = [];
    for (const step of [...done].reverse()) {
      try {
        await this.request(profile, 'DELETE', this.pathOf(profile, step, id));
      } catch (e) {
        if (!(e instanceof HttpFailure && e.httpStatus === 404)) orphans.push(step);
      }
    }
    return orphans;
  }

  private pathOf(profile: LnsProfile, step: TtnStep, id: string): string {
    const app = this.app(profile);
    return step === 'is'
      ? `/api/v3/applications/${app}/devices/${id}`
      : `/api/v3/${step}/applications/${app}/devices/${id}`;
  }

  async deregisterDevice(profile: LnsProfile, ref: RemoteDeviceRef): Promise<void> {
    const orphans = await this.undo(profile, ref.externalId, TTN_STEPS);
    if (orphans.length) {
      throw new LnsOperationError('No se pudo borrar todo el dispositivo en TTN', {
        transient: true,
        orphans,
      });
    }
  }
}
