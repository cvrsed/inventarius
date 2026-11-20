import {
  missingForRegistration,
  type LinkPreviewDto,
  type LnsKind,
  type LnsRegistrationDto,
  type LnsRegistrationStatus,
  type RegistrationPreviewDto,
  type RemoteDeviceDto,
} from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { LNS_DEREGISTER_QUEUE, LNS_REGISTER_QUEUE } from '../../core/queues.js';
import type { JobQueue } from '../../core/queue.js';
import type { Actor, AuditService } from '../audit/service.js';
import type { LorawanSecrets, LorawanService, RegistrationReader } from '../lorawan/service.js';
import {
  assetMarkers,
  externalIdFor,
  LNS_NAME_MAX,
  LnsOperationError,
  type AdapterRegistry,
  type LorawanDeviceSecrets,
  type RemoteDeviceDetails,
} from './adapter.js';
import { adoptionFrom, compareRemoteDevice, type LocalDeviceView } from './link.js';
import {
  compareWithDeviceProfile,
  fillFromDeviceProfile,
  type ProfileMismatch,
} from './device-profile.js';
import type { LnsProfilesService } from './profiles-service.js';
import type { RegistrationRow, RegistrationsRepository } from './registrations-repository.js';

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

function toRemoteDto(r: RemoteDeviceDetails): RemoteDeviceDto {
  return {
    name: r.name,
    joinEui: r.joinEui,
    deviceProfileId: r.deviceProfileId,
    hasAppKey: r.appKey !== null,
    hasNwkKey: r.nwkKey !== null,
  };
}

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
    remote: r.remoteSnapshot,
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

  /**
   * RF-60: confirmación previa con exactamente lo que se enviará al LNS, con las claves enmascaradas. El dispositivo
   * lo arma `outgoingDevice`, la misma función que usa el worker, para que lo mostrado y lo enviado no diverjan.
   */
  async preview(assetId: string, profileId: string): Promise<RegistrationPreviewDto> {
    const asset = await this.requireAsset(this.db, assetId);
    const profile = await this.requireProfile(this.db, profileId);
    const data = await this.lorawan.secretsFor(this.db, assetId);
    const full = await this.profiles.get(profileId);
    const checked = await this.checkAgainstDeviceProfile(profileId, data);
    const { info, mismatches } = checked;
    const device = outgoingDevice(assetId, asset, checked.data);
    return {
      profile: { id: profileId, name: profile.name, kind: profile.kind },
      deviceName: device.name,
      description: device.description,
      externalId: externalIdFor(profile.kind, device.devEui),
      devEui: device.devEui,
      joinEui: device.joinEui,
      appKey: MASK,
      nwkKey: device.lorawanVersion === '1.1' && device.nwkKey ? MASK : null,
      deviceClass: device.deviceClass,
      lorawanVersion: device.lorawanVersion,
      region: device.region,
      tags: assetMarkers(profile.kind, assetId),
      target: full.target,
      deviceProfile: { name: info.name, version: info.versionLabel, region: info.regionLabel },
      mismatches,
      fromDeviceProfile: checked.filled,
    };
  }

  /**
   * Compara versión, clase y región del activo con las del device profile del perfil LNS (en ChirpStack viven en el
   * device profile, no en el dispositivo). Si el LNS no responde no se puede validar y se dice, en vez de registrar a ciegas.
   * La versión y la región que el activo no tiene se toman del device profile (`filled`); con la versión así completada
   * se vuelve a exigir lo que RF-60 pide (una NwkKey si resulta ser 1.1).
   */
  private async checkAgainstDeviceProfile(profileId: string, data: LorawanSecrets) {
    const profile = await this.profiles.resolve(this.db, profileId);
    let info;
    try {
      info = await this.adapters[profile.kind].describeDeviceProfile(profile);
    } catch (e) {
      if (!(e instanceof LnsOperationError)) throw e;
      this.log.error({ err: e, profileId }, 'no se pudo leer el device profile del LNS');
      throw new ConflictError(
        `No se pudo validar el activo contra el device profile del LNS: ${e.message}`,
      );
    }
    const { data: completed, filled } = fillFromDeviceProfile(data, info);
    const missing = missingForRegistration({
      devEui: completed.devEui,
      joinEui: completed.joinEui,
      hasAppKey: Boolean(completed.appKey),
      hasNwkKey: Boolean(completed.nwkKey),
      lorawanVersion: completed.lorawanVersion,
    });
    if (missing.length) {
      throw new ValidationError('Faltan datos LoRaWAN para registrar en el LNS', {
        lorawan: missing.map((f) => `Falta ${f}`),
      });
    }
    return { info, data: completed, filled, mismatches: compareWithDeviceProfile(completed, info) };
  }

  /** RF-60/61: deja el activo en `registrando` y encola el job. Un activo solo puede estar en un perfil (RF-65). */
  async request(actor: Actor, assetId: string, profileId: string): Promise<LnsRegistrationDto> {
    await this.requireProfile(this.db, profileId);
    const data = await this.lorawan.secretsFor(this.db, assetId); // valida los datos exigidos (RF-60)
    const {
      info,
      mismatches,
      data: completed,
      filled,
    } = await this.checkAgainstDeviceProfile(profileId, data);
    if (mismatches.length) throw mismatchError(mismatches, info);
    const { registrationId, dto } = await this.db.transaction(async (tx) => {
      const asset = await this.requireAsset(tx, assetId);
      if (asset.deleted) throw new ConflictError('El activo está dado de baja');
      const profile = await this.requireProfile(tx, profileId);
      // Lo que el activo no tenía se guarda con lo que tomó del device profile: el worker lo lee de ahí.
      if (filled.length) {
        await this.lorawan.apply(
          tx,
          actor,
          assetId,
          Object.fromEntries(filled.map((f) => [f, completed[f]])),
        );
      }
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
          // Un vinculado no se borra del LNS: es «desvinculado», no «dado de baja».
          action: row.origin === 'linked' ? 'lns.unlink' : 'lns.deregistered',
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

  /**
   * RF-64: lee el dispositivo remoto (Get y GetKeys) y lo compara con los datos del activo, antes de vincular. Solo
   * lectura: no modifica el dispositivo remoto ni deja nada guardado.
   */
  async linkPreview(assetId: string): Promise<LinkPreviewDto> {
    const view = await this.readForLink(assetId);
    return {
      profile: view.profile,
      externalId: view.remote.externalId,
      remote: toRemoteDto(view.remote),
      differences: compareRemoteDevice(view.local, view.remote),
      adopts: Object.keys(adoptionFrom(view.local, view.remote)) as LinkPreviewDto['adopts'],
    };
  }

  /** Lectura común a la vista previa y al vínculo: exige conflicto, perfil y datos del activo. */
  private async readForLink(assetId: string) {
    const asset = await this.requireAsset(this.db, assetId);
    const row = await this.repo.getByAsset(this.db, assetId);
    if (!row || row.status !== 'conflict')
      throw new ConflictError('No hay un conflicto por resolver');
    const profile = await this.profiles.resolve(this.db, row.profileId);
    const data = await this.lorawan.secretsFor(this.db, assetId);
    let remote;
    try {
      remote = await this.adapters[profile.kind].readDevice(
        profile,
        data.devEui,
        data.lorawanVersion,
      );
    } catch (e) {
      if (!(e instanceof LnsOperationError)) throw e;
      this.log.error({ err: e, assetId }, 'no se pudo leer el dispositivo del LNS para vincular');
      throw new ConflictError(`No se pudo leer el dispositivo en el LNS: ${e.message}`);
    }
    if (!remote) {
      throw new ConflictError(
        'El dispositivo ya no existe en el LNS: cancela el conflicto y vuelve a registrar',
      );
    }
    const local: LocalDeviceView = {
      joinEui: data.joinEui,
      name: deviceName(asset),
      deviceProfileId: profile.deviceDefaults.deviceProfileId ?? null,
      appKey: data.appKey,
      nwkKey: data.nwkKey,
      usesNwkKey: data.lorawanVersion === '1.1',
    };
    return {
      profile: { id: row.profileId, name: row.profileName, kind: row.profileKind as LnsKind },
      local,
      remote,
    };
  }

  /**
   * RF-64: ante un conflicto, **vincular** (adoptar los datos del LNS y tomar el dispositivo como registrado) o
   * **cancelar**. Vincular lee el remoto otra vez (no se fía de una lectura vieja) y nunca lo modifica: el JoinEUI y
   * las claves que el LNS tiene pasan al activo, y la ficha guarda lo que el LNS realmente tiene.
   */
  async resolveConflict(
    actor: Actor,
    assetId: string,
    action: 'link' | 'cancel',
  ): Promise<LnsRegistrationDto | null> {
    const view = action === 'link' ? await this.readForLink(assetId) : null;
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
      const { local, remote } = view!;
      // El estado sigue siendo `conflict`: la identidad del activo todavía se puede editar para adoptar los datos.
      const adopted = adoptionFrom(local, remote);
      if (Object.keys(adopted).length) await this.lorawan.apply(tx, actor, assetId, adopted);
      await this.repo.update(tx, row.id, {
        status: 'registered',
        origin: 'linked',
        lastError: null,
        orphans: [],
        stepsDone: [COMPLETE],
        registeredAt: new Date(),
        lastOperation: 'register',
        remoteSnapshot: { ...toRemoteDto(remote), readAt: new Date().toISOString() },
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'lns.link',
        entity: 'asset',
        entityId: assetId,
        entityLabel: label,
        diff: { after: { profile: row.profileName, externalId: row.externalId, origin: 'linked' } },
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
      const device = outgoingDevice(reg.assetId, asset, data);
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

const MISMATCH_LABELS = {
  lorawanVersion: 'La versión de LoRaWAN',
  region: 'La región',
  deviceClass: 'La clase',
} as const;

/** 422 con una explicación por campo: qué tiene el activo, qué tiene el device profile y cuál es. */
function mismatchError(
  mismatches: ProfileMismatch[],
  info: { name: string | null },
): ValidationError {
  const profile = info.name ? `«${info.name}»` : 'del LNS';
  const errors: Record<string, string[]> = {};
  for (const m of mismatches) {
    errors[m.field] = [
      m.field === 'deviceClass'
        ? `La clase del activo (${m.asset}) no la admite el device profile ${profile} (admite: ${m.lns})`
        : `${MISMATCH_LABELS[m.field]} del activo (${m.asset}) no coincide con la del device profile ${profile} (${m.lns})`,
    ];
  }
  return new ValidationError(
    'El activo no coincide con el device profile del LNS: corrige el activo o elige otro perfil',
    errors,
  );
}

/** Máscara de una clave en la confirmación: no revela nada de ella. */
const MASK = '•'.repeat(32);

function deviceName(asset: { assetTag: string; name: string }): string {
  return `${asset.assetTag} ${asset.name}`;
}

/** Lo que recibe el adaptador: es la única fuente tanto de la confirmación previa como del registro real. */
function outgoingDevice(
  assetId: string,
  asset: { assetTag: string; name: string } | undefined,
  data: LorawanSecrets,
): LorawanDeviceSecrets {
  return {
    ...data,
    assetId,
    name: (asset ? deviceName(asset) : data.devEui).slice(0, LNS_NAME_MAX),
    description: asset?.name ?? '',
  };
}
