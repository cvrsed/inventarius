import {
  assetSortSchema,
  type AssetSituation,
  type AssigneeType,
  type AuditAction,
  type AssetDto,
  type AssetFilters,
  type AssetListItemDto,
  type BatchAssetsRequest,
  type ChangeStatusRequest,
  type BatchAssetsResult,
  type AuditEntryDto,
  type CategoryExtension,
  type CheckinRequest,
  type CheckoutRequest,
  type LocationType,
  type CreateAssetInput,
  type Currency,
  type StatusKind,
  type UpdateAssetInput,
} from '@inventarius/shared';
import { randomUUID } from 'node:crypto';
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
  assertCheckoutLocation,
  duplicatedSerials,
  assertReturnLocation,
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

const ENTITY = 'asset' as const;
const EXPORT_BATCH = 1000;
const MAX_TAG_ATTEMPTS = 5;

const iso = (d: Date) => d.toISOString();
const ref = (id: string | null, name: string | null) => (id && name ? { id, name } : null);
const isAssigned = (r: AssetRow) => r.assignedUserId !== null || r.assignedLocationId !== null;
const assigneeName = (r: AssetRow) => r.assignedUserName ?? r.assignedLocationName;
const money = (v: number | null | undefined) => (v === null || v === undefined ? v : String(v));

/** Lo que va a auditoría: nombres legibles, para que el historial se lea sin consultar otras tablas. */
/** Rótulo del activo para la auditoría: etiqueta + nombre. */
const assetLabel = (r: AssetRow): string => `${r.assetTag} ${r.name}`;

function snapshot(r: AssetRow): Record<string, unknown> {
  return {
    assetTag: r.assetTag,
    name: r.name,
    serial: r.serial,
    model: r.modelName,
    status: r.statusName,
    location: r.locationName,
    baseLocation: r.baseLocationName,
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
    baseLocation: ref(r.baseLocationId, r.baseLocationName),
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
    /** «Hoy» (AAAA-MM-DD) en la zona horaria de la instalación; define qué devoluciones están atrasadas. */
    private readonly today: () => string,
  ) {}

  async list(
    filters: AssetFilters,
    sort: string | undefined,
    page: { page: number; pageSize: number },
  ) {
    const { rows, total } = await this.repo.list(
      this.db,
      filters,
      parseSort(sort),
      {
        limit: page.pageSize,
        offset: (page.page - 1) * page.pageSize,
      },
      this.today(),
    );
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
    if (input.baseLocationId)
      await this.requireWarehouse(tx, input.baseLocationId, 'baseLocationId');
    const assetTag =
      input.assetTag ?? formatAssetTag(this.tagPrefix, await this.repo.nextTagNumber(tx));
    const id = await this.repo.insert(tx, {
      assetTag,
      name: input.name,
      serial: input.serial,
      modelId: input.modelId,
      statusId: input.statusId,
      baseLocationId: input.baseLocationId,
      locationId: input.baseLocationId,
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
        const changes = toChanges(patch);
        // En bodega y sin asignar, cambiar la base mueve también la ubicación actual.
        const inStock = !isAssigned(current) && current.locationId === current.baseLocationId;
        if (changes.baseLocationId !== undefined && inStock) {
          changes.locationId = changes.baseLocationId;
        }
        await this.repo.update(tx, id, changes);
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
    if (patch.baseLocationId && patch.baseLocationId !== current.baseLocationId) {
      await this.requireWarehouse(tx, patch.baseLocationId, 'baseLocationId');
    }
  }

  /**
   * Único camino para cambiar el estado después del alta: queda en el historial (`asset.status_change`)
   * con su nota. Un activo asignado primero se devuelve (el check-in elige el estado de vuelta).
   */
  async changeStatus(actor: Actor, id: string, input: ChangeStatusRequest): Promise<AssetDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.lockAndRead(tx, id);
      AssetsService.assertEditable(current);
      if (isAssigned(current)) {
        throw new ConflictError('El activo está asignado; devuélvelo para cambiar su estado');
      }
      const status = await this.catalog.requireStatus(tx, input.statusId);
      if (status.systemKey) throw reservedStatus();
      if (status.id === current.statusId) {
        throw new ValidationError('El activo ya tiene ese estado', {
          statusId: ['Elige un estado distinto del actual'],
        });
      }
      await this.repo.update(tx, id, { statusId: status.id });
      await this.record(tx, actor, 'asset.status_change', id, {
        before: { status: current.statusName },
        after: { status: status.name, note: input.note ?? null },
      });
      return toDto(await this.require(tx, id));
    });
  }

  /**
   * RF-27: crea `quantity` activos en una sola transacción, con etiquetas correlativas. Cada activo tiene su
   * evento `asset.create` (su historial) y el lote deja un único registro `asset.batch_create`.
   */
  async createBatch(actor: Actor, input: BatchAssetsRequest): Promise<BatchAssetsResult> {
    const serials = input.serials?.map((s) => s.trim());
    if (serials) {
      const repeated = duplicatedSerials(serials);
      if (repeated.length) throw serialsError('Hay series repetidas en la lista', repeated);
    }
    return this.db.transaction(async (tx) => {
      const model = await this.catalog.requireModel(tx, input.modelId);
      const status = await this.catalog.requireStatus(tx, input.statusId);
      if (status.systemKey) throw reservedStatus();
      const base = await this.requireWarehouse(tx, input.baseLocationId, 'baseLocationId');
      if (serials) {
        const existing = await this.repo.existingSerials(tx, serials);
        if (existing.length) throw serialsError('Ya existen activos con estas series', existing);
      }
      const numbers = await this.repo.nextTagNumbers(tx, input.quantity);
      const name = input.name ?? model.name;
      const created = await this.repo.insertMany(
        tx,
        numbers.map((n, i) => ({
          assetTag: formatAssetTag(this.tagPrefix, n),
          name,
          serial: serials?.[i] ?? null,
          modelId: input.modelId,
          statusId: input.statusId,
          baseLocationId: input.baseLocationId,
          locationId: input.baseLocationId,
          purchaseCurrency: this.defaultCurrency,
        })),
      );
      const batchId = randomUUID();
      await this.audit.recordMany(tx, [
        ...created.map((a, i) => ({
          ...actor,
          action: 'asset.create' as const,
          entity: ENTITY,
          entityId: a.id,
          entityLabel: `${a.assetTag} ${name}`,
          diff: {
            after: {
              assetTag: a.assetTag,
              name,
              serial: serials?.[i] ?? null,
              model: model.name,
              status: status.name,
              baseLocation: base.name,
              location: base.name,
              batchId,
            },
          },
        })),
        {
          ...actor,
          action: 'asset.batch_create',
          entity: 'asset_batch',
          entityId: batchId,
          entityLabel: `Lote de ${created.length} activos`,
          diff: {
            after: {
              count: created.length,
              model: model.name,
              status: status.name,
              baseLocation: base.name,
              firstTag: created[0]!.assetTag,
              lastTag: created.at(-1)!.assetTag,
              withSerials: serials !== undefined,
            },
          },
        },
      ]);
      return {
        batchId,
        count: created.length,
        assets: created.map((a, i) => ({
          id: a.id,
          assetTag: a.assetTag,
          serial: serials?.[i] ?? null,
        })),
      };
    });
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
          // Con una persona la ubicación actual deja de ser la bodega; en un sitio, es el sitio.
          currentLocationId: input.locationId ?? null,
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
            assignedToType: (input.userId ? 'user' : 'location') satisfies AssigneeType,
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
    const site = await this.catalog.requireActiveLocation(tx, input.locationId!, 'locationId');
    assertCheckoutLocation(site.type as LocationType);
    return site;
  }

  private async requireWarehouse(tx: Executor, id: string, field: string) {
    const row = await this.catalog.requireActiveLocation(tx, id, field);
    if (row.type !== 'warehouse') {
      throw new ValidationError('Debe ser una bodega', { [field]: ['Elige una bodega'] });
    }
    return row;
  }

  /** RF-23: devuelve el activo con una nota y el estado en que queda. */
  async checkin(actor: Actor, id: string, input: CheckinRequest): Promise<AssetDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.lockAndRead(tx, id);
      assertCanCheckin({ deleted: current.deletedAt !== null, assigned: isAssigned(current) });
      const status = await this.catalog.requireStatus(tx, input.statusId);
      if (status.systemKey) throw reservedStatus();
      await this.repo.closeAssignment(tx, id, { by: actor.actorId, note: input.note ?? null });
      const warehouse = await this.catalog.requireActiveLocation(tx, input.locationId);
      assertReturnLocation(warehouse.type as LocationType);
      await this.repo.setAssignee(tx, id, {
        userId: null,
        locationId: null,
        currentLocationId: warehouse.id,
        statusId: status.id,
      });
      await this.record(tx, actor, 'asset.checkin', id, {
        before: { assignedTo: assigneeName(current), status: current.statusName },
        after: { status: status.name, returnedTo: warehouse.name, note: input.note ?? null },
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
      // Antes/después de la situación del activo (el estado del catálogo no cambia con la baja, va como contexto).
      await this.record(tx, actor, 'asset.delete', id, {
        before: { situation: 'vigente' satisfies AssetSituation },
        after: { situation: 'baja' satisfies AssetSituation, reason },
        context: { status: current.statusName },
      });
    });
  }

  /** RF-25: restaura un activo dado de baja. */
  async restore(actor: Actor, id: string): Promise<AssetDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.lockAndRead(tx, id);
      if (!current.deletedAt) throw new ConflictError('El activo no está dado de baja');
      await this.repo.setDeleted(tx, id, null);
      await this.record(tx, actor, 'asset.restore', id, {
        before: { situation: 'baja' satisfies AssetSituation, reason: current.deleteReason },
        after: { situation: 'vigente' satisfies AssetSituation },
        context: { status: current.statusName },
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
      const { rows, total } = await this.repo.list(
        this.db,
        filters,
        spec,
        {
          limit: EXPORT_BATCH,
          offset,
        },
        this.today(),
      );
      for (const r of rows) yield csvRow(exportCells(r));
      if (offset + EXPORT_BATCH >= total) return;
    }
  }

  private async record(
    tx: Executor,
    actor: Actor,
    action: AuditAction,
    id: string,
    diff: Record<string, unknown>,
  ) {
    // El rótulo se toma del estado actual del activo (ya con el cambio aplicado) y queda congelado en el registro.
    const row = await this.require(tx, id);
    return this.audit.record(tx, {
      ...actor,
      action,
      entity: ENTITY,
      entityId: id,
      entityLabel: assetLabel(row),
      diff,
    });
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
  'Ubicación actual',
  'Ubicación base',
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
    r.locationName ?? (r.assignedUserName ? `Con ${r.assignedUserName}` : null),
    r.baseLocationName,
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

function serialsError(message: string, serials: string[]): ValidationError {
  const shown = serials.slice(0, 5).join(', ') + (serials.length > 5 ? '…' : '');
  return new ValidationError(message, { serials: [`${message}: ${shown}`] });
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
