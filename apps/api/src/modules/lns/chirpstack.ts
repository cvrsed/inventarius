import deviceGrpc from '@chirpstack/chirpstack-api/api/device_grpc_pb.js';
import devicePb from '@chirpstack/chirpstack-api/api/device_pb.js';
import applicationGrpc from '@chirpstack/chirpstack-api/api/application_grpc_pb.js';
import applicationPb from '@chirpstack/chirpstack-api/api/application_pb.js';
import profileGrpc from '@chirpstack/chirpstack-api/api/device_profile_grpc_pb.js';
import profilePb from '@chirpstack/chirpstack-api/api/device_profile_pb.js';
import tenantGrpc from '@chirpstack/chirpstack-api/api/tenant_grpc_pb.js';
import tenantPb from '@chirpstack/chirpstack-api/api/tenant_pb.js';
import { credentials, Metadata, status, type Client, type ServiceError } from '@grpc/grpc-js';
import type { ConnectionCheckDto } from '@inventarius/shared';
import {
  ASSET_TAG_KEY,
  externalIdFor,
  LnsOperationError,
  type ConnectionCheck,
  type LnsAdapter,
  type LnsProfile,
  type LorawanDeviceSecrets,
  type RegistrationResult,
  type RemoteDevice,
  type RemoteDeviceRef,
} from './adapter.js';

const TRANSIENT = new Set<number>([
  status.UNAVAILABLE,
  status.DEADLINE_EXCEEDED,
  status.INTERNAL,
  status.ABORTED,
  status.RESOURCE_EXHAUSTED,
  status.UNKNOWN,
]);

/** Lee un error gRPC y lo vuelve un texto en español sin exponer la credencial. */
function describe(e: ServiceError): string {
  switch (e.code) {
    case status.UNAUTHENTICATED:
      return 'ChirpStack rechazó la credencial (API key inválida o vencida)';
    case status.PERMISSION_DENIED:
      return 'La API key no tiene permisos suficientes en ChirpStack';
    case status.NOT_FOUND:
      return 'ChirpStack no encontró el recurso (revisa tenant, aplicación o device profile)';
    case status.ALREADY_EXISTS:
      return 'El dispositivo ya existe en ChirpStack';
    case status.INTERNAL:
      return isDuplicate(e)
        ? 'El dispositivo ya existe en ChirpStack'
        : `ChirpStack respondió con un error interno: ${e.details}`;
    case status.INVALID_ARGUMENT:
      return `ChirpStack rechazó los datos: ${e.details}`;
    case status.UNAVAILABLE:
      return 'No se pudo conectar con ChirpStack';
    case status.DEADLINE_EXCEEDED:
      return 'ChirpStack no respondió a tiempo';
    default:
      return `ChirpStack respondió con un error (${status[e.code] ?? e.code}): ${e.details}`;
  }
}

/**
 * Un dispositivo repetido: lo correcto es `ALREADY_EXISTS`, pero ChirpStack v4.20 responde `INTERNAL` con el texto de la
 * violación de la clave primaria (verificado contra un ChirpStack real, `chirpstack.real.int.test.ts`).
 */
const isDuplicate = (e: ServiceError): boolean =>
  e.code === status.ALREADY_EXISTS ||
  (e.code === status.INTERNAL && /duplicate key|already exists/i.test(e.details));

const isServiceError = (e: unknown): e is ServiceError =>
  typeof e === 'object' &&
  e !== null &&
  'code' in e &&
  typeof (e as ServiceError).code === 'number';

/**
 * Adaptador de ChirpStack v4 por gRPC (sección 5.4). Abre un canal por operación y lo cierra al terminar: las
 * operaciones son esporádicas y así un cambio de perfil no deja conexiones colgadas.
 */
export class ChirpstackAdapter implements LnsAdapter {
  readonly kind = 'chirpstack' as const;

  constructor(private readonly timeoutMs: number) {}

  private async call<Req, Res>(
    profile: LnsProfile,
    make: (address: string, creds: ReturnType<typeof credentials.createInsecure>) => Client,
    method: string,
    request: Req,
  ): Promise<Res> {
    const creds = profile.tls ? credentials.createSsl() : credentials.createInsecure();
    const client = make(profile.endpoint, creds) as unknown as Record<string, unknown> & Client;
    const meta = new Metadata();
    meta.set('authorization', `Bearer ${profile.credential}`);
    try {
      return await new Promise<Res>((resolve, reject) => {
        const fn = client[method] as (
          r: Req,
          m: Metadata,
          o: { deadline: number },
          cb: (e: ServiceError | null, res: Res) => void,
        ) => void;
        fn.call(client, request, meta, { deadline: Date.now() + this.timeoutMs }, (err, res) =>
          err ? reject(err) : resolve(res),
        );
      });
    } finally {
      client.close();
    }
  }

  private device<Res>(profile: LnsProfile, method: string, request: unknown): Promise<Res> {
    return this.call(profile, (a, c) => new deviceGrpc.DeviceServiceClient(a, c), method, request);
  }

  async testConnection(profile: LnsProfile): Promise<ConnectionCheck> {
    const started = Date.now();
    const checks: ConnectionCheckDto['checks'] = [];
    const probe = async (name: string, run: () => Promise<unknown>) => {
      try {
        await run();
        checks.push({ name, ok: true, detail: null });
        return true;
      } catch (e) {
        checks.push({
          name,
          ok: false,
          detail: isServiceError(e) ? describe(e) : 'Error inesperado',
        });
        return false;
      }
    };
    const { tenantId, applicationId } = profile.target;
    const { deviceProfileId } = profile.deviceDefaults;
    const tenantReq = new tenantPb.GetTenantRequest();
    tenantReq.setId(tenantId ?? '');
    const appReq = new applicationPb.GetApplicationRequest();
    appReq.setId(applicationId ?? '');
    const dpReq = new profilePb.GetDeviceProfileRequest();
    dpReq.setId(deviceProfileId ?? '');
    await probe('tenant', () =>
      this.call(profile, (a, c) => new tenantGrpc.TenantServiceClient(a, c), 'get', tenantReq),
    );
    await probe('application', () =>
      this.call(
        profile,
        (a, c) => new applicationGrpc.ApplicationServiceClient(a, c),
        'get',
        appReq,
      ),
    );
    await probe('deviceProfile', () =>
      this.call(profile, (a, c) => new profileGrpc.DeviceProfileServiceClient(a, c), 'get', dpReq),
    );
    return { ok: checks.every((c) => c.ok), latencyMs: Date.now() - started, checks };
  }

  /**
   * Con una API key de tenant, ChirpStack responde `UNAUTHENTICATED` (no `NOT_FOUND`) al pedir o borrar un dispositivo
   * que no existe (o que es de otro tenant). Eso se confundiría con una credencial inválida: se distingue probando
   * un recurso propio, la aplicación del perfil. Si responde bien, la credencial es válida y el dispositivo no está
   * aquí; si no, el error es de credencial y se propaga.
   */
  private async confirmAbsent(profile: LnsProfile): Promise<void> {
    const req = new applicationPb.GetApplicationRequest();
    req.setId(profile.target.applicationId ?? '');
    await this.call(
      profile,
      (a, c) => new applicationGrpc.ApplicationServiceClient(a, c),
      'get',
      req,
    );
  }

  async findDevice(profile: LnsProfile, devEui: string): Promise<RemoteDevice | null> {
    const req = new devicePb.GetDeviceRequest();
    req.setDevEui(devEui.toLowerCase());
    try {
      try {
        const res = await this.device<InstanceType<typeof devicePb.GetDeviceResponse>>(
          profile,
          'get',
          req,
        );
        const tags = res.getDevice()?.getTagsMap();
        return {
          externalId: externalIdFor('chirpstack', devEui),
          inventariusAssetId: tags?.get(ASSET_TAG_KEY) ?? null,
        };
      } catch (e) {
        if (!isServiceError(e)) throw e;
        if (e.code === status.NOT_FOUND) return null;
        if (e.code === status.UNAUTHENTICATED || e.code === status.PERMISSION_DENIED) {
          await this.confirmAbsent(profile);
          return null;
        }
        throw e;
      }
    } catch (e) {
      if (isServiceError(e)) {
        throw new LnsOperationError(describe(e), { transient: TRANSIENT.has(e.code), cause: e });
      }
      throw e;
    }
  }

  async registerDevice(profile: LnsProfile, d: LorawanDeviceSecrets): Promise<RegistrationResult> {
    const externalId = externalIdFor('chirpstack', d.devEui);
    const stepsDone: string[] = [];
    try {
      const device = new devicePb.Device();
      device.setDevEui(externalId);
      device.setName(d.name.slice(0, 100));
      device.setDescription(d.description);
      device.setApplicationId(profile.target.applicationId ?? '');
      device.setDeviceProfileId(profile.deviceDefaults.deviceProfileId ?? '');
      device.getTagsMap().set(ASSET_TAG_KEY, d.assetId);
      const create = new devicePb.CreateDeviceRequest();
      create.setDevice(device);
      await this.device(profile, 'create', create);
      stepsDone.push('device');

      // En LoRaWAN 1.0.x la AppKey va en `nwk_key` (la UI de ChirpStack la muestra como «Application key»);
      // en 1.1 van `nwk_key` (NwkKey) y `app_key` (AppKey).
      const keys = new devicePb.DeviceKeys();
      keys.setDevEui(externalId);
      if (d.lorawanVersion === '1.1') {
        keys.setNwkKey(d.nwkKey ?? '');
        keys.setAppKey(d.appKey);
      } else {
        keys.setNwkKey(d.appKey);
      }
      const createKeys = new devicePb.CreateDeviceKeysRequest();
      createKeys.setDeviceKeys(keys);
      await this.device(profile, 'createKeys', createKeys);
      stepsDone.push('keys');
      return { externalId, stepsDone };
    } catch (e) {
      const duplicate = isServiceError(e) && isDuplicate(e);
      const transient = isServiceError(e) && TRANSIENT.has(e.code) && !duplicate;
      const message = isServiceError(e)
        ? describe(e)
        : 'Error inesperado al registrar en ChirpStack';
      const conflict = duplicate;
      if (!stepsDone.includes('device')) {
        throw new LnsOperationError(message, { transient, conflict, cause: e });
      }
      // Falló después de crear el dispositivo: se compensa borrándolo.
      try {
        await this.deregisterDevice(profile, { externalId, devEui: d.devEui });
      } catch {
        throw new LnsOperationError(
          `${message}. No se pudo deshacer: el dispositivo quedó en ChirpStack`,
          {
            transient: false,
            stepsDone,
            orphans: ['device'],
            cause: e,
          },
        );
      }
      throw new LnsOperationError(message, { transient, stepsDone: [], cause: e });
    }
  }

  async deregisterDevice(profile: LnsProfile, ref: RemoteDeviceRef): Promise<void> {
    const req = new devicePb.DeleteDeviceRequest();
    req.setDevEui(ref.externalId);
    try {
      try {
        await this.device(profile, 'delete', req);
      } catch (e) {
        if (!isServiceError(e)) throw e;
        // Borrar lo que ya no existe no es error (ver `confirmAbsent`).
        if (e.code === status.NOT_FOUND) return;
        if (e.code === status.UNAUTHENTICATED || e.code === status.PERMISSION_DENIED) {
          await this.confirmAbsent(profile);
          return;
        }
        throw e;
      }
    } catch (e) {
      if (isServiceError(e)) {
        throw new LnsOperationError(describe(e), {
          transient: TRANSIENT.has(e.code),
          orphans: ['device'],
          cause: e,
        });
      }
      throw e;
    }
  }
}
