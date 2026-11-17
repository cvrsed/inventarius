import {
  assetSortSchema,
  type AssetDto,
  type AssetFilters,
  type AssetListItemDto,
  type AuditEntryDto,
  type CategoryExtension,
  type CheckinRequest,
  type CheckoutRequest,
  type CreateAssetInput,
  type Currency,
  type StatusKind,
  type UpdateAssetInput,
} from '@inventarius/shared';
import { csvRow } from '../../core/csv.js';
import type { Executor } from '../../core/db/executor.js';
import { changedFields } from '../../core/diff.js';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '../../core/errors.js';
import type { Actor, AuditService } from '../audit/service.js';
import { compact, isViolation } from '../catalog/entity.js';
import type { CatalogService } from '../catalog/service.js';
import {
  assertCanCheckin,
  assertCanCheckout,
  assertCanDelete,
  formatAssetTag,
  warrantyEndsOn,
} from './domain.js';
import type { AssetChanges, AssetRow, AssetsRepository } from './repository.js';

/** Personas a las que se puede asignar un activo; lo implementa el módulo de usuarios. */
export interface AssigneeDirectory {
  find(
    exec: Executor,
    id: string,
  ): Promise<{ id: string; name: string; active: boolean } | undefined>;
  search(q: string | undefined, limit: number): Promise<{ id: string; name: string }[]>;
}

const ENTITY = 'asset';
const EXPORT_BATCH = 1000;
const MAX_TAG_ATTEMPTS = 5;

const iso = (d: Date) => d.toISOString();
const ref = (id: string | null, name: string | null) => (id && name ? { id, name } : null);
const isAssigned = (r: AssetRow) => r.assignedUserId !== null || r.assignedLocationId !== null;
const assigneeName = (r: AssetRow) => r.assignedUserName ?? r.assignedLocationName;
const money = (v: number | null | undefined) => (v === null || v === undefined ? v : String(v));

/** Lo que va a auditoría: nombres legibles, para que el historial se lea sin consultar otras tablas. */
function snapshot(r: AssetRow): Record<string, unknown> {
  return {
    assetTag: r.assetTag,
    name: r.name,
    serial: r.serial,
    model: r.modelName,
    status: r.statusName,
    location: r.locationName,
    purchaseDate: r.purchaseDate,
    purchaseCost: r.purchaseCost === null ? null : Number(r.purchaseCost),
    purchaseCurrency: r.purchaseCurrency,
    supplier: r.supplier,
    warrantyMonths: r.warrantyMonths,
    notes: r.notes,
  };
}

export function toListItem(r: AssetRow): AssetListItemDto {
  return {
    id: r.id,
    assetTag: r.assetTag,
    name: r.name,
    serial: r.serial,
    model: { id: r.modelId, name: r.modelName },
    category: {
      id: r.categoryId,
      name: r.categoryName,
      extension: r.categoryExtension as CategoryExtension,
    },
    status: { id: r.statusId, name: r.statusName, kind: r.statusKind as StatusKind },
    location: ref(r.locationId, r.locationName),
    assignedUser: ref(r.assignedUserId, r.assignedUserName),
    assignedLocation: ref(r.assignedLocationId, r.assignedLocationName),
    deleted: r.deletedAt !== null,
    updatedAt: iso(r.updatedAt),
  };
}

export function toDto(r: AssetRow): AssetDto {
  return {
    ...toListItem(r),
    manufacturer: { id: r.manufacturerId, name: r.manufacturerName },
    purchaseDate: r.purchaseDate,
    purchaseCost: r.purchaseCost === null ? null : Number(r.purchaseCost),
    purchaseCurrency: r.purchaseCurrency as Currency,
    supplier: r.supplier,
    warrantyMonths: r.warrantyMonths,
    warrantyEndsOn: warrantyEndsOn(r.purchaseDate, r.warrantyMonths),
    notes: r.notes,
    assignment:
      r.assignmentSince && isAssigned(r)
        ? {
            since: iso(r.assignmentSince),
            expectedReturnOn: r.assignmentExpectedReturnOn,
            note: r.assignmentNote,
          }
        : null,
    deletedAt: r.deletedAt ? iso(r.deletedAt) : null,
    deleteReason: r.deleteReason,
    createdAt: iso(r.createdAt),
  };
}

/** Activos: alta, edición, asignación, baja lógica, historial y exportación (RF-20 a RF-26). */
export class AssetsService {
  constructor(
    private readonly repo: AssetsRepository,
    private readonly db: Executor,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly people: AssigneeDirectory,
    private readonly tagPrefix: string,
    private readonly defaultCurrency: Currency,
  ) {}

  async list(
    filters: AssetFilters,
    sort: string | undefined,
    page: { page: number; pageSize: number },
  ) {
    const { rows, total } = await this.repo.list(this.db, filters, parseSort(sort), {
      limit: page.pageSize,
      offset: (page.page - 1) * page.pageSize,
    });
    return { data: rows.map(toListItem), meta: { ...page, total } };
  }

  async get(id: string): Promise<AssetDto> {
    return toDto(await this.require(this.db, id));
  }

  private async require(exec: Executor, id: string): Promise<AssetRow> {
    const row = await this.repo.getById(exec, id);
    if (!row) throw new NotFoundError('Activo no encontrado');
    return row;
  }

  /** Lee y bloquea el activo para modificarlo; verifica la versión si se la pasa. */
  private async lockAndRead(tx: Executor, id: string, version?: string): Promise<AssetRow> {
    if (!(await this.repo.lock(tx, id))) throw new NotFoundError('Activo no encontrado');
    const row = await this.require(tx, id);
    if (version !== undefined && iso(row.updatedAt) !== version)
      throw new PreconditionFailedError();
    return row;
  }

  private static assertEditable(row: AssetRow): void {
    if (row.deletedAt) {
      throw new ConflictError('El activo está dado de baja; restáuralo para modificarlo');
    }
  }

  async create(actor: Actor, input: CreateAssetInput): Promise<AssetDto> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.db.transaction((tx) => this.insertAsset(tx, actor, input));
      } catch (e) {
        if (!isViolation(e, '23505')) throw e;
        if (input.assetTag) throw new ConflictError('Ya existe un activo con esa etiqueta');
        // Un correlativo autogenerado chocó con una etiqueta escrita a mano: se pide el siguiente.
        if (attempt >= MAX_TAG_ATTEMPTS) throw e;
      }
    }
  }

  private async insertAsset(
    tx: Executor,
    actor: Actor,
    input: CreateAssetInput,
  ): Promise<AssetDto> {
    await this.catalog.requireModel(tx, input.modelId);
    const status = await this.catalog.requireStatus(tx, input.statusId);
    if (status.systemKey) throw reservedStatus();
    if (input.locationId) await this.catalog.requireActiveLocation(tx, input.locationId);
    const assetTag =
      input.assetTag ?? formatAssetTag(this.tagPrefix, await this.repo.nextTagNumber(tx));
    const id = await this.repo.insert(tx, {
      assetTag,
      name: input.name,
      serial: input.serial,
      modelId: input.modelId,
      statusId: input.statusId,
      locationId: input.locationId,
      purchaseDate: input.purchaseDate,
      purchaseCost: money(input.purchaseCost) ?? null,
      purchaseCurrency: input.purchaseCurrency ?? this.defaultCurrency,
      supplier: input.supplier,
      warrantyMonths: input.warrantyMonths,
      notes: input.notes,
    });
    const row = await this.require(tx, id);
    await this.record(tx, actor, 'asset.create', id, { after: snapshot(row) });
    return toDto(row);
  }

  async update(
    actor: Actor,
    id: string,
    patch: UpdateAssetInput,
    expectedVersion: string,
  ): Promise<AssetDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const current = await this.lockAndRead(tx, id, expectedVersion);
        AssetsService.assertEditable(current);
        await this.validatePatch(tx, current, patch);
        await this.repo.update(tx, id, toChanges(patch));
        const row = await this.require(tx, id);
        const diff = changedFields(snapshot(current), snapshot(row));
        if (diff) await this.record(tx, actor, 'asset.update', id, diff);
        return toDto(row);
      });
    } catch (e) {
      if (isViolation(e, '23505')) throw new ConflictError('Ya existe un activo con esa etiqueta');
      throw e;
    }
  }

  private async validatePatch(
    tx: Executor,
    current: AssetRow,
    patch: UpdateAssetInput,
  ): Promise<void> {
    if (patch.modelId && patch.modelId !== current.modelId) {
      await this.catalog.requireModel(tx, patch.modelId);
    }
    if (patch.locationId && patch.locationId !== current.locationId) {
      await this.catalog.requireActiveLocation(tx, patch.locationId);
    }
    if (patch.statusId && patch.statusId !== current.statusId) {
      if (isAssigned(current)) {
        throw new ConflictError('El activo está asignado; devuélvelo para cambiar su estado');
      }
      const status = await this.catalog.requireStatus(tx, patch.statusId);
      if (status.systemKey) throw reservedStatus();
    }
  }

  /** RF-23: asigna a un usuario o a una ubicación y deja el activo en el estado de sistema «Asignado». */
  async checkout(actor: Actor, id: string, input: CheckoutRequest): Promise<AssetDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const current = await this.lockAndRead(tx, id);
        assertCanCheckout({
          deleted: current.deletedAt !== null,
          assigned: isAssigned(current),
          statusKind: current.statusKind as StatusKind,
        });
        const target = await this.resolveTarget(tx, input);
        const assigned = await this.catalog.assignedStatus(tx);
        await this.repo.setAssignee(tx, id, {
          userId: input.userId ?? null,
          locationId: input.locationId ?? null,
          statusId: assigned.id,
        });
        await this.repo.openAssignmentFor(tx, {
          assetId: id,
          userId: input.userId ?? null,
          locationId: input.locationId ?? null,
          by: actor.actorId,
          expectedReturnOn: input.expectedReturnOn ?? null,
          note: input.note ?? null,
        });
        await this.record(tx, actor, 'asset.checkout', id, {
          before: { status: current.statusName },
          after: {
            status: assigned.name,
            assignedTo: target.name,
            assignedToType: input.userId ? 'user' : 'location',
            expectedReturnOn: input.expectedReturnOn ?? null,
            note: input.note ?? null,
          },
        });
        return toDto(await this.require(tx, id));
      });
    } catch (e) {
      // El índice parcial de asignaciones abiertas es el respaldo si dos pedidos se cruzan.
      if (isViolation(e, '23505')) throw new ConflictError('El activo ya está asignado');
      throw e;
    }
  }

  private async resolveTarget(tx: Executor, input: CheckoutRequest): Promise<{ name: string }> {
    if (input.userId) {
      const user = await this.people.find(tx, input.userId);
      if (!user || !user.active) {
        throw new ValidationError('El usuario no existe o está inactivo', {
          userId: ['Elige un usuario activo'],
        });
      }
      return user;
    }
    return this.catalog.requireActiveLocation(tx, input.locationId!, 'locationId');
  }

  /** RF-23: devuelve el activo con una nota y el estado en que queda. */
  async checkin(actor: Actor, id: string, input: CheckinRequest): Promise<AssetDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.lockAndRead(tx, id);
      assertCanCheckin({ deleted: current.deletedAt !== null, assigned: isAssigned(current) });
      const status = await this.catalog.requireStatus(tx, input.statusId);
      if (status.systemKey) throw reservedStatus();
      await this.repo.closeAssignment(tx, id, { by: actor.actorId, note: input.note ?? null });
      await this.repo.setAssignee(tx, id, { userId: null, locationId: null, statusId: status.id });
      await this.record(tx, actor, 'asset.checkin', id, {
        before: { assignedTo: assigneeName(current), status: current.statusName },
        after: { status: status.name, note: input.note ?? null },
      });
      return toDto(await this.require(tx, id));
    });
  }

  /** RF-25: baja lógica con motivo. */
  async remove(actor: Actor, id: string, reason: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await this.lockAndRead(tx, id);
      assertCanDelete({ deleted: current.deletedAt !== null, assigned: isAssigned(current) });
      await this.repo.setDeleted(tx, id, reason);
      await this.record(tx, actor, 'asset.delete', id, { after: { reason } });
    });
  }

  /** RF-25: restaura un activo dado de baja. */
  async restore(actor: Actor, id: string): Promise<AssetDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.lockAndRead(tx, id);
      if (!current.deletedAt) throw new ConflictError('El activo no está dado de baja');
      await this.repo.setDeleted(tx, id, null);
      await this.record(tx, actor, 'asset.restore', id, {
        before: { reason: current.deleteReason },
      });
      return toDto(await this.require(tx, id));
    });
  }

  /** RF-24: línea de tiempo del activo (creación, cambios, asignaciones), la más reciente primero. */
  async history(
    id: string,
    page: { page: number; pageSize: number },
  ): Promise<{ data: AuditEntryDto[]; meta: { page: number; pageSize: number; total: number } }> {
    await this.require(this.db, id);
    return this.audit.list({ entity: ENTITY, entityId: id }, page);
  }

  /** Personas asignables por nombre, o una en concreto por id (para mostrar el filtro de la URL). */
  async assignees(q: string | undefined, id?: string): Promise<{ id: string; name: string }[]> {
    if (id) {
      const person = await this.people.find(this.db, id);
      return person ? [{ id: person.id, name: person.name }] : [];
    }
    return this.people.search(q, 25);
  }

  /** RF-26: CSV del listado filtrado, por lotes para no cargar todo en memoria. Sin claves ni secretos. */
  async *exportCsv(filters: AssetFilters, sort: string | undefined): AsyncGenerator<string> {
    yield '﻿' + csvRow(EXPORT_HEADERS);
    const spec = parseSort(sort);
    for (let offset = 0; ; offset += EXPORT_BATCH) {
      const { rows, total } = await this.repo.list(this.db, filters, spec, {
        limit: EXPORT_BATCH,
        offset,
      });
      for (const r of rows) yield csvRow(exportCells(r));
      if (offset + EXPORT_BATCH >= total) return;
    }
  }

  private record(
    tx: Executor,
    actor: Actor,
    action: string,
    id: string,
    diff: Record<string, unknown>,
  ) {
    return this.audit.record(tx, { ...actor, action, entity: ENTITY, entityId: id, diff });
  }
}

const EXPORT_HEADERS = [
  'Etiqueta',
  'Nombre',
  'Serie',
  'Modelo',
  'Fabricante',
  'Categoría',
  'Estado',
  'Ubicación',
  'Asignado a',
  'Fecha de compra',
  'Costo',
  'Moneda',
  'Proveedor',
  'Garantía (meses)',
  'Fin de garantía',
  'Notas',
  'Dado de baja',
  'Creado',
];

function exportCells(r: AssetRow) {
  return [
    r.assetTag,
    r.name,
    r.serial,
    r.modelName,
    r.manufacturerName,
    r.categoryName,
    r.statusName,
    r.locationName,
    assigneeName(r),
    r.purchaseDate,
    r.purchaseCost,
    r.purchaseCurrency,
    r.supplier,
    r.warrantyMonths,
    warrantyEndsOn(r.purchaseDate, r.warrantyMonths),
    r.notes,
    r.deletedAt ? 'Sí' : 'No',
    iso(r.createdAt),
  ];
}

function parseSort(sort: string | undefined) {
  const parsed = assetSortSchema.safeParse(sort ?? 'assetTag');
  if (!parsed.success) {
    throw new ValidationError('Orden no válido', { sort: ['Columna de orden desconocida'] });
  }
  return parsed.data;
}

function reservedStatus(): ValidationError {
  return new ValidationError('«Asignado» lo pone el sistema al asignar', {
    statusId: ['Usa «Asignar» para dejar el activo en ese estado'],
  });
}

function toChanges(patch: UpdateAssetInput): AssetChanges {
  const { purchaseCost, ...rest } = patch;
  return compact({
    ...rest,
    ...(purchaseCost !== undefined ? { purchaseCost: money(purchaseCost) ?? null } : {}),
  });
}
