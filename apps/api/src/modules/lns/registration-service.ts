import {
  type LnsRegistrationDto,
  type LnsRegistrationStatus,
  type RegistrationPreviewDto,
} from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import type { JobQueue } from '../../core/queue.js';
import type { Actor, AuditService } from '../audit/service.js';
import type { LorawanSecrets, LorawanService, RegistrationReader } from '../lorawan/service.js';
import {
  externalIdFor,
  LnsOperationError,
  type AdapterRegistry,
  type LorawanDeviceSecrets,
} from './adapter.js';
import type { LnsProfilesService } from './profiles-service.js';
import type { RegistrationRow, RegistrationsRepository } from './registrations-repository.js';

export const LNS_REGISTER_QUEUE = 'lns-register';
export const LNS_DEREGISTER_QUEUE = 'lns-deregister';
/** Colas del LNS; el migrador las crea (DDL) para que la API y el worker solo necesiten DML. */
export const LNS_QUEUES = [LNS_REGISTER_QUEUE, LNS_DEREGISTER_QUEUE] as const;

/** Marca el último paso de un registro completo (permite distinguir uno entero de uno a medias, RF-64). */
const COMPLETE = 'complete';
const IN_FLIGHT = new Set<string>(['registering', 'deregistering']);
const REMOTE = new Set<string>(['registered', 'partial', 'registering', 'deregistering']);

/** Datos del activo que necesita el registro; lo implementa el módulo de activos. */
export interface RegistrationAssetPort {
  get(
    exec: Executor,
    id: string,
  ): Promise<{ id: string; assetTag: string; name: string; deleted: boolean } | undefined>;
}

export interface RegistrationSettings {
  maxAttempts: number;
  retryDelaySeconds: number;
}

const WORKER = { actorId: null, ip: null, actorLabel: 'worker' } as const;

function toDto(r: RegistrationRow): LnsRegistrationDto {
  return {
    status: r.status as LnsRegistrationStatus,
    profile: { id: r.profileId, name: r.profileName, kind: r.profileKind as 'chirpstack' | 'ttn' },
    externalId: r.externalId,
    origin: r.origin as 'created' | 'linked',
    lastError: r.lastError,
    orphans: r.orphans,
    attempts: r.attempts,
    registeredAt: r.registeredAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Registro y baja de dispositivos en un LNS (RF-60 a RF-65). La API solo cambia el estado y encola el job; el worker
 * habla con el LNS. Todo estado intermedio queda guardado, así un reinicio del worker no pierde la operación.
 */
export class RegistrationService implements RegistrationReader {
  constructor(
    private readonly repo: RegistrationsRepository,
    private readonly db: Executor,
    private readonly audit: AuditService,
    private readonly lorawan: LorawanService,
    private readonly profiles: LnsProfilesService,
    private readonly assets: RegistrationAssetPort,
    private readonly adapters: AdapterRegistry,
    private readonly queue: JobQueue,
    private readonly settings: RegistrationSettings,
    private readonly log: { error: (obj: object, msg: string) => void } = {
      error: () => undefined,
    },
  ) {}

  async find(exec: Executor, assetId: string): Promise<LnsRegistrationDto | null> {
    const row = await this.repo.getByAsset(exec, assetId);
    return row ? toDto(row) : null;
  }

  /** `true` si el activo tiene algo en el LNS (o a medias): no se puede dar de baja el activo (RF-25). */
  async hasRemoteFootprint(exec: Executor, assetId: string): Promise<boolean> {
    const row = await this.repo.getByAsset(exec, assetId);
    return Boolean(row && REMOTE.has(row.status));
  }

  private async requireAsset(exec: Executor, assetId: string) {
    const asset = await this.assets.get(exec, assetId);
    if (!asset) throw new NotFoundError('Activo no encontrado');
    return asset;
  }

  private async requireProfile(exec: Executor, profileId: string) {
    let profile;
    try {
      profile = await this.profiles.isActive(exec, profileId);
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new ValidationError('El perfil LNS no existe', {
          profileId: ['El perfil no existe'],
        });
      }
      throw e;
    }
    if (!profile.active) {
      throw new ValidationError('El perfil LNS está desactivado', {
        profileId: ['Elige un perfil activo'],
      });
    }
    return profile;
  }

  /** RF-60: lo que se enviará al LNS, sin claves. Valida de paso que los datos estén completos. */
  async preview(assetId: string, profileId: string): Promise<RegistrationPreviewDto> {
    const asset = await this.requireAsset(this.db, assetId);
    const profile = await this.requireProfile(this.db, profileId);
    const data = await this.lorawan.secretsFor(this.db, assetId);
    const full = await this.profiles.get(profileId);
    const fields = [
      { label: 'devEui', value: data.devEui },
      { label: 'joinEui', value: data.joinEui },
      { label: 'deviceClass', value: data.deviceClass ?? '—' },
      { label: 'lorawanVersion', value: data.lorawanVersion ?? '—' },
      { label: 'region', value: data.region ?? '—' },
      ...Object.entries(full.target).map(([k, v]) => ({ label: `target.${k}`, value: v })),
    ];
    return {
      profile: { id: profileId, name: profile.name, kind: profile.kind },
      deviceName: deviceName(asset),
      externalId: externalIdFor(profile.kind, data.devEui),
      fields,
    };
  }

  /** RF-60/61: deja el activo en `registrando` y encola el job. Un activo solo puede estar en un perfil (RF-65). */
  async request(actor: Actor, assetId: string, profileId: string): Promise<LnsRegistrationDto> {
    const { registrationId, dto } = await this.db.transaction(async (tx) => {
      const asset = await this.requireAsset(tx, assetId);
      if (asset.deleted) throw new ConflictError('El activo está dado de baja');
      const profile = await this.requireProfile(tx, profileId);
      await this.lorawan.secretsFor(tx, assetId); // valida los datos exigidos (RF-60)
      await this.repo.lockByAsset(tx, assetId);
      const existing = await this.repo.getByAsset(tx, assetId);
      let id: string;
      if (existing) {
        if (existing.status === 'registered' || IN_FLIGHT.has(existing.status)) {
          throw new ConflictError(
            existing.status === 'registered'
              ? `El activo ya está registrado en «${existing.profileName}»`
              : 'Ya hay una operación en curso para este activo',
          );
        }
        if (existing.status === 'partial' && existing.profileId !== profileId) {
          throw new ConflictError(
            'Quedaron restos en el LNS del perfil anterior: reintenta con ese perfil antes de elegir otro',
          );
        }
        id = existing.id;
        await this.repo.update(tx, id, {
          profileId,
          status: 'registering',
          lastOperation: 'register',
          lastError: null,
          attempts: 0,
          requestedBy: actor.actorId,
          origin: 'created',
          ...(existing.status === 'partial'
            ? {}
            : { stepsDone: [], orphans: [], externalId: null }),
        });
      } else {
        id = await this.repo.insert(tx, { assetId, profileId, requestedBy: actor.actorId });
      }
      await this.audit.record(tx, {
        ...actor,
        action: 'lns.register',
        entity: 'asset',
        entityId: assetId,
        entityLabel: `${asset.assetTag} ${asset.name}`,
        diff: { after: { profile: profile.name } },
      });
      return { registrationId: id, dto: toDto((await this.repo.getById(tx, id))!) };
    });
    await this.enqueue(LNS_REGISTER_QUEUE, registrationId);
    return dto;
  }

  /** RF-62: baja en el LNS. Si el dispositivo solo se había vinculado, solo se desvincula (no se toca el LNS). */
  async deregister(actor: Actor, assetId: string): Promise<LnsRegistrationDto | null> {
    const outcome = await this.db.transaction(async (tx) => {
      const asset = await this.requireAsset(tx, assetId);
      await this.repo.lockByAsset(tx, assetId);
      const row = await this.repo.getByAsset(tx, assetId);
      if (!row) throw new NotFoundError('El activo no está registrado en un LNS');
      if (IN_FLIGHT.has(row.status))
        throw new ConflictError('Ya hay una operación en curso para este activo');
      const label = `${asset.assetTag} ${asset.name}`;
      const unlinkOnly = row.origin === 'linked' || !REMOTE.has(row.status);
      if (unlinkOnly) {
        await this.repo.remove(tx, row.id);
        await this.audit.record(tx, {
          ...actor,
          action: 'lns.deregistered',
          entity: 'asset',
          entityId: assetId,
          entityLabel: label,
          diff: {
            before: { profile: row.profileName },
            after: { origin: row.origin === 'linked' ? 'linked' : 'created' },
          },
        });
        return { id: null, dto: null };
      }
      await this.repo.update(tx, row.id, {
        status: 'deregistering',
        lastOperation: 'deregister',
        lastError: null,
        attempts: 0,
        requestedBy: actor.actorId,
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'lns.deregister',
        entity: 'asset',
        entityId: assetId,
        entityLabel: label,
        diff: { before: { profile: row.profileName } },
      });
      return { id: row.id, dto: toDto((await this.repo.getById(tx, row.id))!) };
    });
    if (outcome.id) await this.enqueue(LNS_DEREGISTER_QUEUE, outcome.id);
    return outcome.dto;
  }

  /** RF-63: reintento manual desde `error` o `parcial`; retoma la operación que falló. */
  async retry(actor: Actor, assetId: string): Promise<LnsRegistrationDto> {
    const { id, op, dto } = await this.db.transaction(async (tx) => {
      const asset = await this.requireAsset(tx, assetId);
      await this.repo.lockByAsset(tx, assetId);
      const row = await this.repo.getByAsset(tx, assetId);
      if (!row) throw new NotFoundError('El activo no está registrado en un LNS');
      if (row.status !== 'error' && row.status !== 'partial') {
        throw new ConflictError('Solo se puede reintentar desde un registro con error o parcial');
      }
      const deregistering = row.lastOperation === 'deregister';
      await this.repo.update(tx, row.id, {
        status: deregistering ? 'deregistering' : 'registering',
        lastError: null,
        attempts: 0,
        requestedBy: actor.actorId,
      });
      await this.audit.record(tx, {
        ...actor,
        action: deregistering ? 'lns.deregister' : 'lns.register',
        entity: 'asset',
        entityId: assetId,
        entityLabel: `${asset.assetTag} ${asset.name}`,
        diff: { after: { profile: row.profileName } },
      });
      return {
        id: row.id,
        op: row.lastOperation,
        dto: toDto((await this.repo.getById(tx, row.id))!),
      };
    });
    await this.enqueue(op === 'deregister' ? LNS_DEREGISTER_QUEUE : LNS_REGISTER_QUEUE, id);
    return dto;
  }

  /** RF-64: ante un conflicto, **vincular** (tomarlo como registrado sin tocarlo) o **cancelar**. */
  async resolveConflict(
    actor: Actor,
    assetId: string,
    action: 'link' | 'cancel',
  ): Promise<LnsRegistrationDto | null> {
    return this.db.transaction(async (tx) => {
      const asset = await this.requireAsset(tx, assetId);
      await this.repo.lockByAsset(tx, assetId);
      const row = await this.repo.getByAsset(tx, assetId);
      if (!row || row.status !== 'conflict')
        throw new ConflictError('No hay un conflicto por resolver');
      const label = `${asset.assetTag} ${asset.name}`;
      if (action === 'cancel') {
        await this.repo.remove(tx, row.id);
        await this.audit.record(tx, {
          ...actor,
          action: 'lns.cancel',
          entity: 'asset',
          entityId: assetId,
          entityLabel: label,
          diff: { before: { profile: row.profileName } },
        });
        return null;
      }
      await this.repo.update(tx, row.id, {
        status: 'registered',
        origin: 'linked',
        lastError: null,
        orphans: [],
        stepsDone: [COMPLETE],
        registeredAt: new Date(),
        lastOperation: 'register',
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'lns.link',
        entity: 'asset',
        entityId: assetId,
        entityLabel: label,
        diff: { after: { profile: row.profileName, externalId: row.externalId } },
      });
      return toDto((await this.repo.getById(tx, row.id))!);
    });
  }

  private async enqueue(queue: string, registrationId: string): Promise<void> {
    try {
      await this.queue.send(
        queue,
        { registrationId },
        {
          retryLimit: this.settings.maxAttempts,
          retryDelay: this.settings.retryDelaySeconds,
          retryBackoff: true,
        },
      );
    } catch (e) {
      this.log.error({ err: e, registrationId }, 'no se pudo encolar el job del LNS');
      await this.repo.update(this.db, registrationId, {
        status: 'error',
        lastError: 'No se pudo encolar la operación. Reintenta en unos minutos.',
      });
      throw new ConflictError('No se pudo encolar la operación. Reintenta en unos minutos.');
    }
  }

  // --- Lado del worker ---

  /** Job de registro. Idempotente: un job repetido o de un registro que ya cambió de estado no hace nada. */
  async runRegister(registrationId: string): Promise<void> {
    const reg = await this.repo.getById(this.db, registrationId);
    if (!reg || reg.status !== 'registering') return;
    const attempts = reg.attempts + 1;
    await this.repo.update(this.db, reg.id, { attempts });

    let data: LorawanSecrets;
    let profile;
    try {
      profile = await this.profiles.resolve(this.db, reg.profileId);
      data = await this.lorawan.secretsFor(this.db, reg.assetId);
    } catch (e) {
      await this.fail(reg, 'No se pudieron leer los datos del dispositivo o el perfil', e);
      return;
    }
    const adapter = this.adapters[profile.kind];
    try {
      const asset = await this.assets.get(this.db, reg.assetId);
      const device: LorawanDeviceSecrets = {
        ...data,
        assetId: reg.assetId,
        name: asset ? deviceName(asset) : data.devEui,
        description: asset?.name ?? '',
      };
      const remote = await adapter.findDevice(profile, data.devEui);
      if (remote) {
        if (remote.inventariusAssetId !== reg.assetId) {
          await this.markConflict(reg, remote.externalId);
          return;
        }
        if (reg.stepsDone.includes(COMPLETE)) {
          await this.markRegistered(reg, remote.externalId, reg.stepsDone);
          return;
        }
        // Es nuestro pero quedó a medias (p. ej. el worker cayó): se limpia lo propio y se vuelve a registrar.
        await adapter.deregisterDevice(profile, {
          externalId: remote.externalId,
          devEui: data.devEui,
        });
      }
      const result = await adapter.registerDevice(profile, device);
      await this.markRegistered(reg, result.externalId, [...result.stepsDone, COMPLETE]);
    } catch (e) {
      if (!(e instanceof LnsOperationError)) {
        await this.fail(reg, 'Error inesperado al registrar en el LNS', e);
        return;
      }
      if (e.conflict) {
        await this.markConflict(reg, externalIdFor(profile.kind, data.devEui));
      } else if (e.orphans.length) {
        await this.repo.update(this.db, reg.id, {
          status: 'partial',
          lastOperation: 'register',
          orphans: e.orphans,
          stepsDone: e.stepsDone,
          lastError: e.message,
        });
        await this.auditWorker(reg, 'lns.register_failed', {
          error: e.message,
          orphans: e.orphans,
        });
      } else if (e.transient && attempts < this.settings.maxAttempts) {
        await this.repo.update(this.db, reg.id, {
          lastError: `Reintentando (${attempts}/${this.settings.maxAttempts}): ${e.message}`,
        });
        throw e; // pg-boss reintenta con espera creciente (RF-63)
      } else {
        await this.repo.update(this.db, reg.id, {
          status: 'error',
          lastOperation: 'register',
          lastError: e.message,
          stepsDone: [],
          orphans: [],
        });
        await this.auditWorker(reg, 'lns.register_failed', { error: e.message });
      }
    }
  }

  /** Job de baja: borra en el LNS y deja el activo `no registrado` (RF-62). */
  async runDeregister(registrationId: string): Promise<void> {
    const reg = await this.repo.getById(this.db, registrationId);
    if (!reg || reg.status !== 'deregistering') return;
    const attempts = reg.attempts + 1;
    await this.repo.update(this.db, reg.id, { attempts });
    try {
      const profile = await this.profiles.resolve(this.db, reg.profileId);
      const devEui = await this.lorawan.devEuiOf(this.db, reg.assetId);
      await this.adapters[profile.kind].deregisterDevice(profile, {
        externalId: reg.externalId ?? externalIdFor(profile.kind, devEui ?? ''),
        devEui: devEui ?? '',
      });
    } catch (e) {
      if (e instanceof LnsOperationError && e.transient && attempts < this.settings.maxAttempts) {
        await this.repo.update(this.db, reg.id, {
          lastError: `Reintentando (${attempts}/${this.settings.maxAttempts}): ${e.message}`,
        });
        throw e;
      }
      const message =
        e instanceof LnsOperationError ? e.message : 'Error inesperado al dar de baja en el LNS';
      if (!(e instanceof LnsOperationError)) this.log.error({ err: e, registrationId }, message);
      const orphans = e instanceof LnsOperationError && e.orphans.length ? e.orphans : ['device'];
      await this.repo.update(this.db, reg.id, {
        status: 'partial',
        lastOperation: 'deregister',
        orphans,
        lastError: message,
      });
      await this.auditWorker(reg, 'lns.register_failed', { error: message, orphans });
      return;
    }
    await this.db.transaction(async (tx) => {
      await this.repo.remove(tx, reg.id);
      await this.auditWorkerIn(tx, reg, 'lns.deregistered', {
        before: { profile: reg.profileName },
      });
    });
  }

  private async markRegistered(
    reg: RegistrationRow,
    externalId: string,
    steps: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.repo.update(tx, reg.id, {
        status: 'registered',
        origin: 'created',
        externalId,
        stepsDone: steps,
        orphans: [],
        lastError: null,
        lastOperation: 'register',
        registeredAt: new Date(),
      });
      await this.auditWorkerIn(tx, reg, 'lns.registered', {
        after: { profile: reg.profileName, externalId },
      });
    });
  }

  private async markConflict(reg: RegistrationRow, externalId: string): Promise<void> {
    const message = 'El DevEUI ya existe en el LNS y no lo creó Inventarius';
    await this.repo.update(this.db, reg.id, {
      status: 'conflict',
      externalId,
      lastError: message,
      stepsDone: [],
      orphans: [],
    });
    await this.auditWorker(reg, 'lns.register_failed', { error: message });
  }

  /** Falla no esperada (no del LNS): se registra en el log del servidor y el usuario ve un mensaje genérico. */
  private async fail(reg: RegistrationRow, message: string, cause: unknown): Promise<void> {
    this.log.error({ err: cause, registrationId: reg.id }, message);
    await this.repo.update(this.db, reg.id, { status: 'error', lastError: message });
    await this.auditWorker(reg, 'lns.register_failed', { error: message });
  }

  private auditWorker(
    reg: RegistrationRow,
    action: 'lns.register_failed',
    diff: Record<string, unknown>,
  ) {
    return this.auditWorkerIn(this.db, reg, action, {
      after: { profile: reg.profileName, ...diff },
    });
  }

  private async auditWorkerIn(
    exec: Executor,
    reg: RegistrationRow,
    action: 'lns.registered' | 'lns.deregistered' | 'lns.register_failed',
    diff: Record<string, unknown>,
  ): Promise<void> {
    const asset = await this.assets.get(exec, reg.assetId);
    await this.audit.record(exec, {
      ...WORKER,
      action,
      entity: 'asset',
      entityId: reg.assetId,
      entityLabel: asset ? `${asset.assetTag} ${asset.name}` : null,
      diff,
    });
  }
}

function deviceName(asset: { assetTag: string; name: string }): string {
  return `${asset.assetTag} ${asset.name}`;
}
