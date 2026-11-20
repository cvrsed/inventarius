import {
  createLnsProfileSchema,
  type ConnectionCheckDto,
  type CreateLnsProfileInput,
  type LnsKind,
  type LnsProfileDto,
  type UpdateLnsProfileInput,
} from '@inventarius/shared';
import { randomUUID } from 'node:crypto';
import type { Executor } from '../../core/db/executor.js';
import { changedFields } from '../../core/diff.js';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '../../core/errors.js';
import type { SecretBox } from '../../core/secret-box.js';
import type { Actor, AuditService } from '../audit/service.js';
import { isViolation } from '../catalog/entity.js';
import { EncryptionNotConfiguredError } from '../lorawan/service.js';
import type { AdapterRegistry, LnsProfile } from './adapter.js';
import type {
  LnsProfileChanges,
  LnsProfileRow,
  LnsProfilesRepository,
} from './profiles-repository.js';

const credentialContext = (id: string) => `lns_profiles:${id}:credential`;
const hint = (credential: string) => `•••• ${credential.slice(-4)}`;

export function toProfileDto(r: LnsProfileRow): LnsProfileDto {
  return {
    id: r.id,
    kind: r.kind as LnsKind,
    name: r.name,
    description: r.description,
    endpoint: r.endpoint,
    tls: r.tls,
    credentialHint: r.credentialHint,
    target: r.target,
    deviceDefaults: r.deviceDefaults,
    active: r.active,
    registeredDevices: r.registeredDevices,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Lo que va a auditoría: nunca la credencial, solo si cambió. */
function snapshot(r: LnsProfileRow): Record<string, unknown> {
  return {
    kind: r.kind,
    name: r.name,
    description: r.description,
    endpoint: r.endpoint,
    tls: r.tls,
    target: r.target,
    deviceDefaults: r.deviceDefaults,
    active: r.active,
  };
}

/** Perfiles LNS (RF-50 a RF-52): CRUD con credencial cifrada que no vuelve al frontend, y «Probar conexión». */
export class LnsProfilesService {
  constructor(
    private readonly repo: LnsProfilesRepository,
    private readonly db: Executor,
    private readonly audit: AuditService,
    private readonly box: SecretBox | undefined,
    private readonly adapters: AdapterRegistry,
  ) {}

  private requireBox(): SecretBox {
    if (!this.box) throw new EncryptionNotConfiguredError();
    return this.box;
  }

  async list(query: {
    q?: string | undefined;
    activeOnly?: boolean;
    page: number;
    pageSize: number;
  }) {
    const { rows, total } = await this.repo.list(this.db, query, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      data: rows.map(toProfileDto),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string): Promise<LnsProfileDto> {
    return toProfileDto(await this.require(this.db, id));
  }

  private async require(exec: Executor, id: string): Promise<LnsProfileRow> {
    const row = await this.repo.get(exec, id);
    if (!row) throw new NotFoundError('Perfil LNS no encontrado');
    return row;
  }

  async create(actor: Actor, input: CreateLnsProfileInput): Promise<LnsProfileDto> {
    const box = this.requireBox();
    const id = randomUUID();
    const sealed = box.seal(input.credential, credentialContext(id));
    try {
      return await this.db.transaction(async (tx) => {
        await this.repo.insert(tx, {
          id,
          kind: input.kind,
          name: input.name,
          description: input.description,
          endpoint: input.endpoint,
          tls: input.kind === 'chirpstack' ? input.tls : false,
          credentialEnc: sealed.data,
          credentialHint: hint(input.credential),
          keyId: sealed.keyId,
          target: input.target,
          deviceDefaults: input.deviceDefaults,
          active: input.active,
        });
        const row = await this.require(tx, id);
        await this.audit.record(tx, {
          ...actor,
          action: 'lns_profile.create',
          entity: 'lns_profile',
          entityId: id,
          entityLabel: row.name,
          diff: { after: snapshot(row) },
        });
        return toProfileDto(row);
      });
    } catch (e) {
      if (isViolation(e, '23505')) throw new ConflictError('Ya existe un perfil con ese nombre');
      throw e;
    }
  }

  async update(
    actor: Actor,
    id: string,
    patch: UpdateLnsProfileInput,
    expectedVersion: string,
  ): Promise<LnsProfileDto> {
    try {
      return await this.db.transaction(async (tx) => {
        if (!(await this.repo.lock(tx, id))) throw new NotFoundError('Perfil LNS no encontrado');
        const current = await this.require(tx, id);
        if (current.updatedAt.toISOString() !== expectedVersion)
          throw new PreconditionFailedError();

        const merged = {
          kind: current.kind,
          name: patch.name ?? current.name,
          description: patch.description === undefined ? current.description : patch.description,
          active: patch.active ?? current.active,
          endpoint: patch.endpoint ?? current.endpoint,
          tls: patch.tls ?? current.tls,
          target: { ...current.target, ...patch.target },
          deviceDefaults: { ...current.deviceDefaults, ...patch.deviceDefaults },
          credential: patch.credential ?? 'sin-cambios',
        };
        // El perfil resultante debe ser válido para su proveedor (mismas reglas que al crear).
        const parsed = createLnsProfileSchema.safeParse(merged);
        if (!parsed.success) {
          const errors: Record<string, string[]> = {};
          for (const i of parsed.error.issues)
            (errors[i.path.join('.') || '_'] ??= []).push(i.message);
          throw new ValidationError('Datos del perfil inválidos', errors);
        }
        // Si hay dispositivos registrados, cambiar el destino los dejaría apuntando a otro lado (RF-52).
        if (
          current.registeredDevices > 0 &&
          (patch.endpoint || patch.target) &&
          (merged.endpoint !== current.endpoint ||
            JSON.stringify(merged.target) !== JSON.stringify(current.target))
        ) {
          throw new ConflictError(
            'El perfil tiene dispositivos registrados: no se puede cambiar su destino. Crea otro perfil.',
          );
        }

        const changes: LnsProfileChanges = {
          name: parsed.data.name,
          description: parsed.data.description,
          active: parsed.data.active,
          endpoint: parsed.data.endpoint,
          tls: parsed.data.kind === 'chirpstack' ? parsed.data.tls : false,
          target: parsed.data.target,
          deviceDefaults: parsed.data.deviceDefaults,
        };
        if (patch.credential) {
          const sealed = this.requireBox().seal(patch.credential, credentialContext(id));
          changes.credentialEnc = sealed.data;
          changes.keyId = sealed.keyId;
          changes.credentialHint = hint(patch.credential);
        }
        await this.repo.update(tx, id, changes);
        const row = await this.require(tx, id);
        const diff = changedFields(snapshot(current), snapshot(row));
        if (diff || patch.credential) {
          await this.audit.record(tx, {
            ...actor,
            action: 'lns_profile.update',
            entity: 'lns_profile',
            entityId: id,
            entityLabel: row.name,
            diff: {
              before: diff?.before ?? {},
              after: {
                ...(diff?.after ?? {}),
                ...(patch.credential ? { credentialChanged: true } : {}),
              },
            },
          });
        }
        return toProfileDto(row);
      });
    } catch (e) {
      if (isViolation(e, '23505')) throw new ConflictError('Ya existe un perfil con ese nombre');
      throw e;
    }
  }

  /** RF-52: un perfil con dispositivos registrados no se borra, solo se desactiva. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (!(await this.repo.lock(tx, id))) throw new NotFoundError('Perfil LNS no encontrado');
      const row = await this.require(tx, id);
      if (row.registeredDevices > 0) {
        throw new ConflictError(
          'El perfil tiene dispositivos registrados y no se puede borrar. Desactívalo para que no se use más.',
        );
      }
      await this.repo.remove(tx, id);
      await this.audit.record(tx, {
        ...actor,
        action: 'lns_profile.delete',
        entity: 'lns_profile',
        entityId: id,
        entityLabel: row.name,
        diff: { before: snapshot(row) },
      });
    });
  }

  /** Perfil con la credencial descifrada, solo para hablar con el LNS. */
  async resolve(exec: Executor, id: string): Promise<LnsProfile> {
    const row = await this.require(exec, id);
    return {
      id: row.id,
      kind: row.kind as LnsKind,
      name: row.name,
      endpoint: row.endpoint,
      tls: row.tls,
      credential: this.requireBox().open(row.credentialEnc, row.keyId, credentialContext(row.id)),
      target: row.target,
      deviceDefaults: row.deviceDefaults,
    };
  }

  async isActive(
    exec: Executor,
    id: string,
  ): Promise<{ name: string; kind: LnsKind; active: boolean }> {
    const row = await this.require(exec, id);
    return { name: row.name, kind: row.kind as LnsKind, active: row.active };
  }

  /** RF-51: valida credencial y destino; devuelve resultado y latencia. */
  async testConnection(id: string): Promise<ConnectionCheckDto> {
    const profile = await this.resolve(this.db, id);
    return this.adapters[profile.kind].testConnection(profile);
  }

  /** Recifra las credenciales con la clave maestra vigente (rotación). */
  async reencryptAll(): Promise<number> {
    const box = this.requireBox();
    return this.db.transaction(async (tx) => {
      const { rows } = await this.repo.list(tx, {}, { limit: 10_000, offset: 0 });
      let n = 0;
      for (const row of rows) {
        if (!box.needsRotation(row.keyId)) continue;
        const plain = box.open(row.credentialEnc, row.keyId, credentialContext(row.id));
        const sealed = box.seal(plain, credentialContext(row.id));
        await this.repo.update(tx, row.id, { credentialEnc: sealed.data, keyId: sealed.keyId });
        n += 1;
      }
      return n;
    });
  }
}
