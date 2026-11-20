import { randomUUID } from 'node:crypto';
import {
  addDelta,
  compareQuantities,
  formatQuantity,
  negateDelta,
  normalizeDelta,
  MAX_BACKDATE_DAYS,
  normalizeQuantity,
  receivedOnProblem,
  type AdjustmentInput,
  type ConsumableDetailDto,
  type ConsumableDto,
  type ConsumableListQuery,
  type DeliveryInput,
  type MeasureUnitDto,
  type MovementDto,
  type MovementKind,
  type MovementListQuery,
  type MovementResult,
  type ReceiptInput,
  type ReturnInput,
  type ReversalInput,
  type TransferInput,
  type UnitRef,
  type WarehouseStockDto,
} from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import { changedFields } from '../../core/diff.js';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '../../core/errors.js';
import type { Actor, AuditService } from '../audit/service.js';
import { CatalogEntity, compact, isViolation } from '../catalog/entity.js';
import type { CatalogService } from '../catalog/service.js';
import {
  assertQuantityFitsUnit,
  isBelowMinimum,
  localDay,
  remainingToReturn,
  signedDelta,
} from './domain.js';
import type {
  ConsumableRow,
  ConsumablesRepository,
  LedgerMismatch,
  MeasureUnitRow,
  MovementViewRow,
} from './repository.js';

/** Personas del sistema que pueden recibir una entrega (puerto hacia `users`). */
export interface PeoplePort {
  find(
    exec: Executor,
    id: string,
  ): Promise<{ id: string; name: string; active: boolean } | undefined>;
  search(q: string | undefined, limit: number): Promise<{ id: string; name: string }[]>;
  namesByIds(ids: string[]): Promise<Map<string, string>>;
}

type ListQuery = {
  page: number;
  pageSize: number;
  q?: string | undefined;
  active?: boolean | undefined;
  sort?: string | undefined;
  withUsage?: boolean | undefined;
};
type UnitInput = { name: string; plural: string; abbreviation: string; decimals: number };
type UnitPatch = { [K in keyof UnitInput]?: UnitInput[K] | undefined } & {
  active?: boolean | undefined;
};

export interface CreateConsumableInput {
  name: string;
  categoryId: string;
  unitId: string;
  notes: string | null;
  minStock: string | null;
  warehouseMinimums: { locationId: string; minQuantity: string }[];
}
export type UpdateConsumableInput = {
  [K in keyof CreateConsumableInput]?: CreateConsumableInput[K] | undefined;
} & { active?: boolean | undefined };

const iso = (d: Date) => d.toISOString();
const unitRefOf = (r: ConsumableRow): UnitRef => ({
  id: r.unitId,
  name: r.unitName,
  plural: r.unitPlural,
  abbreviation: r.unitAbbreviation,
  decimals: r.unitDecimals,
});
const unitDto = (r: MeasureUnitRow): MeasureUnitDto => ({
  id: r.id,
  name: r.name,
  plural: r.plural,
  abbreviation: r.abbreviation,
  decimals: r.decimals,
  active: r.active,
  updatedAt: iso(r.updatedAt),
});

const INACTIVE =
  'El consumible está inactivo: no admite ingresos, entregas, devoluciones ni traslados (los ajustes y las anulaciones sí).';

interface Touched {
  consumable: ConsumableRow;
  unit: UnitRef;
}

/**
 * Consumibles por cantidad (RF-70 a RF-74, ADR 0008). El libro de movimientos es la fuente de verdad; el saldo
 * por (consumible, bodega) se actualiza en la misma transacción con la fila bloqueada, así dos movimientos sobre el
 * mismo saldo se serializan y ninguno lo deja negativo (D2, D3). Nunca se editan ni se borran movimientos.
 */
export class ConsumablesService {
  /** Unidades de medida administrables (D4). */
  readonly units: CatalogEntity<MeasureUnitRow, MeasureUnitDto, UnitInput, UnitPatch, ListQuery>;

  constructor(
    private readonly repo: ConsumablesRepository,
    private readonly db: Executor,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly people: PeoplePort,
    private readonly today: () => string,
    private readonly timezone: string,
  ) {
    this.units = new CatalogEntity(
      {
        entity: 'measure_unit',
        notFound: 'Unidad de medida no encontrada',
        duplicate: 'Ya existe una unidad con ese nombre',
        toDto: unitDto,
        snapshot: (r) => ({
          name: r.name,
          plural: r.plural,
          abbreviation: r.abbreviation,
          decimals: r.decimals,
          active: r.active,
        }),
        list: (e, q) =>
          repo.listUnits(e, {
            q: q.q,
            active: q.active,
            sort: q.sort,
            limit: q.pageSize,
            offset: (q.page - 1) * q.pageSize,
          }),
        get: (e, id) => repo.getUnit(e, id),
        insert: (e, v) => repo.insertUnit(e, v),
        update: (e, id, v) => repo.updateUnit(e, id, compact(v)),
        remove: (e, id) => repo.deleteUnit(e, id),
        inUse: (e, id) => repo.unitInUse(e, id),
        beforeUpdate: async (tx, current, patch) => {
          // Bajar los decimales dejaría cantidades ya registradas que la unidad no admite.
          if (
            patch.decimals !== undefined &&
            patch.decimals < current.decimals &&
            (await repo.unitInUse(tx, current.id))
          ) {
            throw new ConflictError(
              'La unidad está en uso: puedes permitir más decimales, no menos. Crea otra unidad si hace falta.',
            );
          }
          return patch;
        },
      },
      db,
      audit,
    );
  }

  // --- Catálogo (RF-70) ---

  async list(query: ConsumableListQuery) {
    const { rows, total } = await this.repo.list(this.db, {
      q: query.q,
      categoryId: query.categoryId,
      active: query.active,
      lowStock: query.lowStock,
      sort: query.sort,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      data: rows.map((r) => this.toDto(r)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string, exec: Executor = this.db): Promise<ConsumableDetailDto> {
    const row = await this.repo.get(exec, id);
    if (!row) throw new NotFoundError('Consumible no encontrado');
    return this.detail(exec, row);
  }

  async create(actor: Actor, input: CreateConsumableInput): Promise<ConsumableDetailDto> {
    try {
      return await this.db.transaction(async (tx) => {
        await this.catalog.requireCategory(tx, input.categoryId, 'consumable');
        const unit = await this.requireUnit(tx, input.unitId);
        await this.validateMinimums(tx, unit, input.minStock, input.warehouseMinimums);
        const { id } = await this.repo.insert(tx, {
          name: input.name,
          categoryId: input.categoryId,
          unitId: input.unitId,
          notes: input.notes,
          minStock: input.minStock,
        });
        await this.repo.replaceMinimums(tx, id, input.warehouseMinimums);
        const row = (await this.repo.get(tx, id))!;
        await this.audit.record(tx, {
          ...actor,
          action: 'consumable.create',
          entity: 'consumable',
          entityId: id,
          entityLabel: row.name,
          diff: { after: await this.snapshot(tx, row) },
        });
        return this.detail(tx, row);
      });
    } catch (e) {
      if (isViolation(e, '23505'))
        throw new ConflictError('Ya existe un consumible con ese nombre');
      throw e;
    }
  }

  async update(
    actor: Actor,
    id: string,
    patch: UpdateConsumableInput,
    expectedVersion: string,
  ): Promise<ConsumableDetailDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const current = await this.repo.get(tx, id);
        if (!current) throw new NotFoundError('Consumible no encontrado');
        if (iso(current.updatedAt) !== expectedVersion) throw new PreconditionFailedError();
        const before = await this.snapshot(tx, current);

        if (patch.categoryId && patch.categoryId !== current.categoryId) {
          await this.catalog.requireCategory(tx, patch.categoryId, 'consumable');
        }
        let unit = unitRefOf(current);
        if (patch.unitId && patch.unitId !== current.unitId) {
          if (await this.repo.hasMovements(tx, id)) {
            throw new ConflictError(
              'No se puede cambiar la unidad de un consumible con movimientos: las cantidades ya registradas quedarían mal.',
            );
          }
          unit = await this.requireUnit(tx, patch.unitId);
        }
        const minStock = patch.minStock !== undefined ? patch.minStock : current.minStock;
        const minimums =
          patch.warehouseMinimums ??
          (await this.repo.minimums(tx, id)).map((m) => ({
            locationId: m.locationId,
            minQuantity: normalizeQuantity(m.minQuantity),
          }));
        await this.validateMinimums(
          tx,
          unit,
          minStock === null ? null : normalizeQuantity(minStock),
          minimums,
          patch.warehouseMinimums === undefined,
        );

        await this.repo.update(
          tx,
          id,
          compact({
            name: patch.name,
            categoryId: patch.categoryId,
            unitId: patch.unitId,
            active: patch.active,
            notes: patch.notes,
            minStock: patch.minStock,
          }),
        );
        if (patch.warehouseMinimums)
          await this.repo.replaceMinimums(tx, id, patch.warehouseMinimums);

        const row = (await this.repo.get(tx, id))!;
        const diff = changedFields(before, await this.snapshot(tx, row));
        if (diff) {
          await this.audit.record(tx, {
            ...actor,
            action: 'consumable.update',
            entity: 'consumable',
            entityId: id,
            entityLabel: row.name,
            diff,
          });
        }
        return this.detail(tx, row);
      });
    } catch (e) {
      if (isViolation(e, '23505'))
        throw new ConflictError('Ya existe un consumible con ese nombre');
      throw e;
    }
  }

  /** Con movimientos no se borra, solo se desactiva (D10). */
  async remove(actor: Actor, id: string): Promise<void> {
    const blocked =
      'No se puede borrar porque tiene movimientos. Desactívalo: queda en el historial y ya no admite ingresos ni entregas.';
    try {
      await this.db.transaction(async (tx) => {
        const current = await this.repo.get(tx, id);
        if (!current) throw new NotFoundError('Consumible no encontrado');
        if (!(await this.repo.lockShared(tx, id)))
          throw new NotFoundError('Consumible no encontrado');
        if (await this.repo.hasMovements(tx, id)) throw new ConflictError(blocked);
        const snapshot = await this.snapshot(tx, current);
        await this.repo.remove(tx, id);
        await this.audit.record(tx, {
          ...actor,
          action: 'consumable.delete',
          entity: 'consumable',
          entityId: id,
          entityLabel: current.name,
          diff: { before: snapshot },
        });
      });
    } catch (e) {
      if (isViolation(e, '23503')) throw new ConflictError(blocked);
      throw e;
    }
  }

  // --- Movimientos (RF-71 a RF-73, D6 a D8) ---

  /** Ingreso a una bodega (RF-71). */
  async receive(actor: Actor, consumableId: string, input: ReceiptInput): Promise<MovementResult> {
    const { ids, balances } = await this.db.transaction(async (tx) => {
      const { consumable, unit } = await this.begin(tx, consumableId, 'active');
      assertQuantityFitsUnit(input.quantity, unit, 'quantity');
      const warehouse = await this.entryWarehouse(tx, input.locationId);
      const today = this.today();
      const problem = input.receivedOn ? receivedOnProblem(input.receivedOn, today) : null;
      if (problem) {
        const message =
          problem === 'future'
            ? 'La fecha del ingreso no puede ser futura'
            : `La fecha del ingreso no puede ser de más de ${MAX_BACKDATE_DAYS} días atrás`;
        throw new ValidationError(message, { receivedOn: [message] });
      }
      const before = (await this.repo.lockStock(tx, consumableId, [warehouse.id])).get(
        warehouse.id,
      )!;
      const after = await this.repo.applyDelta(tx, consumableId, warehouse.id, input.quantity);
      const id = await this.repo.insertMovement(tx, {
        consumableId,
        locationId: warehouse.id,
        kind: 'receipt',
        delta: input.quantity,
        actorId: actor.actorId!,
        ...(input.receivedOn && input.receivedOn !== today
          ? { occurredOn: input.receivedOn, timezone: this.timezone }
          : {}),
        supplier: input.supplier,
        note: input.note,
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'consumable.receive',
        entity: 'consumable',
        entityId: consumableId,
        entityLabel: consumable.name,
        diff: {
          location: warehouse.path,
          quantity: input.quantity,
          unit: unit.name,
          supplier: input.supplier,
          note: input.note,
          receivedOn: input.receivedOn ?? today,
          registeredAt: iso((await this.repo.getMovement(tx, id))!.createdAt),
          stockBefore: normalizeQuantity(before),
          stockAfter: normalizeQuantity(after),
        },
      });
      return {
        ids: [id],
        balances: [{ locationId: warehouse.id, quantity: normalizeQuantity(after) }],
      };
    });
    return this.result(consumableId, ids, balances);
  }

  /** Entrega a una persona (RF-72): descuenta de una bodega y no pasa del stock de esa bodega. */
  async deliver(actor: Actor, consumableId: string, input: DeliveryInput): Promise<MovementResult> {
    const { ids, balances } = await this.db.transaction(async (tx) => {
      const { consumable, unit } = await this.begin(tx, consumableId, 'active');
      assertQuantityFitsUnit(input.quantity, unit, 'quantity');
      const warehouse = await this.exitWarehouse(tx, input.locationId);
      let recipientLabel = input.recipientName ?? '';
      if (input.recipientUserId) {
        const person = await this.people.find(tx, input.recipientUserId);
        if (!person || !person.active) {
          const message = 'La persona que recibe no existe o está inactiva';
          throw new ValidationError(message, { recipientUserId: [message] });
        }
        recipientLabel = person.name;
      }
      const before = (await this.repo.lockStock(tx, consumableId, [warehouse.id])).get(
        warehouse.id,
      )!;
      this.assertEnough(before, input.quantity, warehouse.path, unit);
      const after = await this.repo.applyDelta(
        tx,
        consumableId,
        warehouse.id,
        negateDelta(input.quantity),
      );
      const id = await this.repo.insertMovement(tx, {
        consumableId,
        locationId: warehouse.id,
        kind: 'delivery',
        delta: negateDelta(input.quantity),
        actorId: actor.actorId!,
        note: input.note,
        recipientUserId: input.recipientUserId ?? null,
        recipientName: input.recipientName ?? null,
        recipientRef: input.recipientRef ?? null,
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'consumable.deliver',
        entity: 'consumable',
        entityId: consumableId,
        entityLabel: consumable.name,
        diff: {
          location: warehouse.path,
          quantity: input.quantity,
          unit: unit.name,
          recipient: recipientLabel,
          recipientRef: input.recipientRef ?? null,
          note: input.note,
          stockBefore: normalizeQuantity(before),
          stockAfter: normalizeQuantity(after),
        },
      });
      return {
        ids: [id],
        balances: [{ locationId: warehouse.id, quantity: normalizeQuantity(after) }],
      };
    });
    return this.result(consumableId, ids, balances);
  }

  /**
   * Devolución de (parte de) una entrega (P1): es un movimiento propio, positivo y ligado a la entrega. Entra a la
   * bodega de la entrega o a otra bodega activa, hereda el receptor y no pasa de lo entregado menos lo ya devuelto.
   */
  async returnDelivery(
    actor: Actor,
    deliveryId: string,
    input: ReturnInput,
  ): Promise<MovementResult> {
    let consumableId = '';
    const { ids, balances } = await this.db.transaction(async (tx) => {
      const delivery = await this.repo.getMovement(tx, deliveryId);
      if (!delivery) throw new NotFoundError('Movimiento no encontrado');
      consumableId = delivery.consumableId;
      if (delivery.kind !== 'delivery') {
        throw new ConflictError('Solo se pueden devolver entregas.');
      }
      await this.repo.lockDelivery(tx, delivery.id);
      const { consumable, unit } = await this.begin(tx, delivery.consumableId, 'active');
      if (await this.repo.reversalOf(tx, delivery.id)) {
        throw new ConflictError('La entrega fue anulada: no se puede devolver.');
      }
      assertQuantityFitsUnit(input.quantity, unit, 'quantity');
      const warehouse = await this.entryWarehouse(tx, input.locationId ?? delivery.locationId);
      const delivered = normalizeDelta(delivery.delta).replace('-', '');
      const returned = normalizeQuantity(await this.repo.returnedOf(tx, delivery.id));
      const remaining = remainingToReturn(delivered, returned);
      if (compareQuantities(input.quantity, remaining) > 0) {
        throw new ConflictError(
          remaining === '0'
            ? `Ya se devolvió todo lo entregado (${formatQuantity(delivered, unit)}).`
            : `No se puede devolver más de lo entregado: solo quedan por devolver ${formatQuantity(remaining, unit)} ` +
                `(se entregaron ${formatQuantity(delivered, unit)} y ya se devolvieron ${formatQuantity(returned, unit)}).`,
        );
      }
      const recipient = await this.recipientLabel(tx, delivery);
      const before = (await this.repo.lockStock(tx, delivery.consumableId, [warehouse.id])).get(
        warehouse.id,
      )!;
      const after = await this.repo.applyDelta(
        tx,
        delivery.consumableId,
        warehouse.id,
        input.quantity,
      );
      const id = await this.repo.insertMovement(tx, {
        consumableId: delivery.consumableId,
        locationId: warehouse.id,
        kind: 'return',
        delta: input.quantity,
        actorId: actor.actorId!,
        note: input.note,
        recipientUserId: delivery.recipientUserId,
        recipientName: delivery.recipientName,
        recipientRef: delivery.recipientRef,
        returnsId: delivery.id,
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'consumable.return',
        entity: 'consumable',
        entityId: delivery.consumableId,
        entityLabel: consumable.name,
        diff: {
          quantity: input.quantity,
          unit: unit.name,
          location: warehouse.path,
          stockBefore: normalizeQuantity(before),
          stockAfter: normalizeQuantity(after),
          recipient: recipient,
          recipientRef: delivery.recipientRef,
          note: input.note,
          returned: `${formatQuantity(normalizeQuantity(addDelta(returned, input.quantity)), unit)} de ${formatQuantity(delivered, unit)}`,
        },
      });
      return {
        ids: [id],
        balances: [{ locationId: warehouse.id, quantity: normalizeQuantity(after) }],
      };
    });
    return this.result(consumableId, ids, balances);
  }

  /** Traslado atómico entre bodegas (D8): salida y entrada en una transacción, ligadas. */
  async transfer(
    actor: Actor,
    consumableId: string,
    input: TransferInput,
  ): Promise<MovementResult> {
    const { ids, balances } = await this.db.transaction(async (tx) => {
      const { consumable, unit } = await this.begin(tx, consumableId, 'active');
      assertQuantityFitsUnit(input.quantity, unit, 'quantity');
      const from = await this.exitWarehouse(tx, input.fromLocationId, 'fromLocationId');
      const to = await this.entryWarehouse(tx, input.toLocationId, 'toLocationId');
      const locked = await this.repo.lockStock(tx, consumableId, [from.id, to.id]);
      const fromBefore = locked.get(from.id)!;
      this.assertEnough(fromBefore, input.quantity, from.path, unit);
      const transferId = randomUUID();
      const fromAfter = await this.repo.applyDelta(
        tx,
        consumableId,
        from.id,
        negateDelta(input.quantity),
      );
      const toAfter = await this.repo.applyDelta(tx, consumableId, to.id, input.quantity);
      const outId = await this.repo.insertMovement(tx, {
        consumableId,
        locationId: from.id,
        kind: 'transfer_out',
        delta: negateDelta(input.quantity),
        actorId: actor.actorId!,
        note: input.note,
        transferId,
      });
      const inId = await this.repo.insertMovement(tx, {
        consumableId,
        locationId: to.id,
        kind: 'transfer_in',
        delta: input.quantity,
        actorId: actor.actorId!,
        note: input.note,
        transferId,
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'consumable.transfer',
        entity: 'consumable',
        entityId: consumableId,
        entityLabel: consumable.name,
        diff: {
          fromLocation: from.path,
          toLocation: to.path,
          quantity: input.quantity,
          unit: unit.name,
          note: input.note,
          stockBefore: normalizeQuantity(fromBefore),
          fromStockAfter: normalizeQuantity(fromAfter),
          toStockAfter: normalizeQuantity(toAfter),
        },
      });
      return {
        ids: [outId, inId],
        balances: [
          { locationId: from.id, quantity: normalizeQuantity(fromAfter) },
          { locationId: to.id, quantity: normalizeQuantity(toAfter) },
        ],
      };
    });
    return this.result(consumableId, ids, balances);
  }

  /** Ajuste (D6): suma o resta con motivo. No puede dejar el stock negativo. Funciona también con el consumible inactivo. */
  async adjust(
    actor: Actor,
    consumableId: string,
    input: AdjustmentInput,
  ): Promise<MovementResult> {
    const { ids, balances } = await this.db.transaction(async (tx) => {
      const { consumable, unit } = await this.begin(tx, consumableId, 'any');
      assertQuantityFitsUnit(input.quantity, unit, 'quantity');
      const warehouse =
        input.direction === 'add'
          ? await this.entryWarehouse(tx, input.locationId)
          : await this.exitWarehouse(tx, input.locationId);
      const delta = signedDelta(input.direction, input.quantity);
      const before = (await this.repo.lockStock(tx, consumableId, [warehouse.id])).get(
        warehouse.id,
      )!;
      if (input.direction === 'subtract')
        this.assertEnough(before, input.quantity, warehouse.path, unit);
      const after = await this.repo.applyDelta(tx, consumableId, warehouse.id, delta);
      const id = await this.repo.insertMovement(tx, {
        consumableId,
        locationId: warehouse.id,
        kind: 'adjustment',
        delta,
        actorId: actor.actorId!,
        reason: input.reason,
        note: input.note,
      });
      await this.audit.record(tx, {
        ...actor,
        action: 'consumable.adjust',
        entity: 'consumable',
        entityId: consumableId,
        entityLabel: consumable.name,
        diff: {
          location: warehouse.path,
          direction: input.direction,
          quantity: input.quantity,
          unit: unit.name,
          reason: input.reason,
          note: input.note,
          stockBefore: normalizeQuantity(before),
          stockAfter: normalizeQuantity(after),
        },
      });
      return {
        ids: [id],
        balances: [{ locationId: warehouse.id, quantity: normalizeQuantity(after) }],
      };
    });
    return this.result(consumableId, ids, balances);
  }

  /**
   * Anula un movimiento (D7): crea el inverso ligado al original, con motivo. Un traslado se anula entero (las dos
   * bodegas). Se anula una sola vez, una anulación no se anula y no puede dejar un saldo negativo.
   */
  async reverse(actor: Actor, movementId: string, input: ReversalInput): Promise<MovementResult> {
    let consumableId = '';
    try {
      const { ids, balances } = await this.db.transaction(async (tx) => {
        const original = await this.repo.getMovement(tx, movementId);
        if (!original) throw new NotFoundError('Movimiento no encontrado');
        consumableId = original.consumableId;
        // Entrega y devoluciones se serializan: no se anula una entrega mientras alguien le devuelve algo.
        if (original.kind === 'delivery') await this.repo.lockDelivery(tx, original.id);
        if (original.kind === 'return') await this.repo.lockDelivery(tx, original.returnsId!);
        if (original.kind === 'reversal') {
          throw new ConflictError(
            'Una anulación no se puede anular. Si fue un error, registra de nuevo el movimiento.',
          );
        }
        const { consumable, unit } = await this.begin(tx, original.consumableId, 'any');
        if (
          original.kind === 'delivery' &&
          compareQuantities(await this.repo.returnedOf(tx, original.id), '0') > 0
        ) {
          throw new ConflictError(
            'Esta entrega tiene devoluciones vigentes: anula primero las devoluciones y después la entrega.',
          );
        }
        const sibling = await this.repo.transferSibling(tx, original);
        const legs = [original, ...(sibling ? [sibling] : [])].sort((a, b) =>
          a.kind === 'transfer_out' ? -1 : b.kind === 'transfer_out' ? 1 : 0,
        );
        const locked = await this.repo.lockStock(
          tx,
          original.consumableId,
          legs.map((l) => l.locationId),
        );
        // Se vuelve a mirar con los saldos bloqueados: otra anulación pudo confirmarse entre medio.
        if (await this.repo.reversalOf(tx, original.id)) {
          throw new ConflictError('Este movimiento ya fue anulado');
        }
        const places = await this.catalog.locationsByIds(
          tx,
          legs.map((l) => l.locationId),
        );
        const pathOf = (id: string) => places.get(id)?.path ?? id;
        for (const leg of legs) {
          const inverse = negateDelta(normalizeDelta(leg.delta));
          if (compareSign(addDelta(locked.get(leg.locationId)!, inverse)) < 0) {
            throw new ConflictError(
              `No se puede anular: dejaría el stock en negativo en ${pathOf(leg.locationId)} ` +
                `(hay ${formatQuantity(locked.get(leg.locationId)!, unit)} y la anulación descuenta ` +
                `${formatQuantity(inverse.replace('-', ''), unit)}). Parte del stock ya se usó.`,
            );
          }
        }
        const transferId = sibling ? randomUUID() : null;
        const ids: string[] = [];
        const balances: { locationId: string; quantity: string }[] = [];
        const after = new Map<string, string>();
        for (const leg of legs) {
          const inverse = negateDelta(normalizeDelta(leg.delta));
          const quantity = await this.repo.applyDelta(
            tx,
            original.consumableId,
            leg.locationId,
            inverse,
          );
          after.set(leg.locationId, normalizeQuantity(quantity));
          ids.push(
            await this.repo.insertMovement(tx, {
              consumableId: original.consumableId,
              locationId: leg.locationId,
              kind: 'reversal',
              delta: inverse,
              actorId: actor.actorId!,
              note: input.reason,
              reversesId: leg.id,
              transferId,
            }),
          );
          balances.push({ locationId: leg.locationId, quantity: after.get(leg.locationId)! });
        }
        const quantity = normalizeDelta(original.delta).replace('-', '');
        const author = (await this.people.namesByIds([original.actorId])).get(original.actorId);
        const recipient = await this.recipientLabel(tx, original);
        const before = (id: string) => normalizeQuantity(locked.get(id)!);
        // Orden de lectura de los eventos de consumibles: tipo, cantidad, unidad, bodega(s), saldos, receptor, motivos, fechas.
        await this.audit.record(tx, {
          ...actor,
          action: 'consumable.reverse',
          entity: 'consumable',
          entityId: original.consumableId,
          entityLabel: consumable.name,
          diff: {
            originalKind: sibling ? 'transfer_out' : original.kind,
            quantity,
            unit: unit.name,
            ...(sibling
              ? {
                  fromLocation: pathOf(legs[0]!.locationId),
                  toLocation: pathOf(legs[1]!.locationId),
                  fromStockBefore: before(legs[0]!.locationId),
                  fromStockAfter: after.get(legs[0]!.locationId),
                  toStockBefore: before(legs[1]!.locationId),
                  toStockAfter: after.get(legs[1]!.locationId),
                }
              : {
                  location: pathOf(original.locationId),
                  stockBefore: before(original.locationId),
                  stockAfter: after.get(original.locationId),
                }),
            recipient: recipient || null,
            recipientRef: original.recipientRef,
            originalReason: original.reason,
            originalNote: original.note,
            reversalReason: input.reason,
            originalActor: author ?? null,
            movementDate: localDay(original.occurredAt, this.timezone),
            registeredAt: iso(original.createdAt),
          },
        });
        return { ids, balances };
      });
      return await this.result(consumableId, ids, balances);
    } catch (e) {
      // Respaldo de la restricción única: dos anulaciones simultáneas del mismo movimiento.
      if (isViolation(e, '23505')) throw new ConflictError('Este movimiento ya fue anulado');
      throw e;
    }
  }

  /** Historial de un consumible (RF-73), el más reciente primero, filtrable por bodega, tipo y fecha. */
  async movements(consumableId: string, query: MovementListQuery) {
    if (!(await this.repo.get(this.db, consumableId))) {
      throw new NotFoundError('Consumible no encontrado');
    }
    const { rows, total } = await this.repo.listMovements(this.db, consumableId, {
      locationId: query.locationId,
      kind: query.kind,
      from: query.from,
      to: query.to,
      timezone: this.timezone,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      data: await this.toMovementDtos(rows),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** Personas del sistema a quienes se puede entregar. */
  recipients(q: string | undefined): Promise<{ id: string; name: string }[]> {
    return this.people.search(q, 25);
  }

  /** Cuadratura (D2): saldos que no son iguales a la suma del libro. Vacío = todo cuadra. */
  async verifyLedger(): Promise<LedgerMismatch[]> {
    const rows = await this.repo.ledgerMismatches(this.db);
    return rows.map((r) => ({
      ...r,
      stock: normalizeQuantity(r.stock),
      ledger: normalizeDelta(r.ledger),
    }));
  }

  // --- Internos ---

  /**
   * Abre un movimiento: bloquea el consumible en modo compartido (no se puede desactivar a mitad de camino) y valida
   * que admita el movimiento. Todo lo que sigue usa `tx`: dentro de una transacción no se vuelve al pool.
   */
  private async begin(tx: Executor, id: string, needs: 'active' | 'any'): Promise<Touched> {
    if (!(await this.repo.lockShared(tx, id))) throw new NotFoundError('Consumible no encontrado');
    const consumable = (await this.repo.get(tx, id))!;
    if (needs === 'active' && !consumable.active) throw new ConflictError(INACTIVE);
    return { consumable, unit: unitRefOf(consumable) };
  }

  /** Nombre del receptor de una entrega (la persona del sistema o el texto libre). */
  private async recipientLabel(
    tx: Executor,
    m: { recipientUserId: string | null; recipientName: string | null },
  ): Promise<string> {
    if (m.recipientUserId) return (await this.people.find(tx, m.recipientUserId))?.name ?? '';
    return m.recipientName ?? '';
  }

  /**
   * Bodega de una salida (entrega, traslado de salida, ajuste negativo): una bodega inactiva con stock sigue admitiendo
   * salidas para poder vaciarla (P7).
   */
  private exitWarehouse(tx: Executor, id: string, field = 'locationId') {
    return this.catalog.requireWarehouse(tx, id, field, { allowInactive: true });
  }

  /** Bodega de una entrada (ingreso, traslado de entrada, devolución, ajuste positivo): debe estar activa (P7). */
  private async entryWarehouse(tx: Executor, id: string, field = 'locationId') {
    const warehouse = await this.catalog.requireWarehouse(tx, id, field, { allowInactive: true });
    if (!warehouse.active) {
      const message = `La bodega «${warehouse.path}» está inactiva: ya no admite entradas (ingresos, traslados hacia ella, devoluciones ni ajustes que sumen); solo salidas, para vaciarla.`;
      throw new ValidationError(message, { [field]: [message] });
    }
    return warehouse;
  }

  private assertEnough(balance: string, quantity: string, where: string, unit: UnitRef): void {
    if (compareQuantities(balance, quantity) >= 0) return;
    throw new ConflictError(
      `No hay stock suficiente en ${where}: hay ${formatQuantity(balance, unit)} y se piden ${formatQuantity(quantity, unit)}.`,
    );
  }

  private async requireUnit(tx: Executor, id: string): Promise<UnitRef> {
    const unit = await this.repo.getUnit(tx, id);
    const fail = (message: string): never => {
      throw new ValidationError(message, { unitId: [message] });
    };
    if (!unit) return fail('La unidad de medida no existe');
    if (!unit.active) return fail('La unidad de medida está inactiva');
    return {
      id: unit.id,
      name: unit.name,
      plural: unit.plural,
      abbreviation: unit.abbreviation,
      decimals: unit.decimals,
    };
  }

  /** Los mínimos respetan los decimales de la unidad y los de bodega apuntan a bodegas, sin repetir. */
  private async validateMinimums(
    tx: Executor,
    unit: UnitRef,
    minStock: string | null,
    minimums: { locationId: string; minQuantity: string }[],
    existing = false,
  ): Promise<void> {
    if (minStock !== null) assertQuantityFitsUnit(minStock, unit, 'minStock');
    const seen = new Set<string>();
    for (const m of minimums) {
      assertQuantityFitsUnit(m.minQuantity, unit, 'warehouseMinimums');
      if (seen.has(m.locationId)) {
        throw new ValidationError('Hay una bodega repetida en los mínimos', {
          warehouseMinimums: ['Hay una bodega repetida en los mínimos'],
        });
      }
      seen.add(m.locationId);
      // Un mínimo ya guardado puede apuntar a una bodega que luego se desactivó.
      await this.catalog.requireWarehouse(tx, m.locationId, 'warehouseMinimums', {
        allowInactive: existing,
      });
    }
  }

  private async snapshot(tx: Executor, row: ConsumableRow): Promise<Record<string, unknown>> {
    const minimums = await this.repo.minimums(tx, row.id);
    const places = await this.catalog.locationsByIds(
      tx,
      minimums.map((m) => m.locationId),
    );
    return {
      name: row.name,
      category: row.categoryName,
      unit: row.unitName,
      notes: row.notes,
      minStock: row.minStock === null ? null : normalizeQuantity(row.minStock),
      warehouseMinimums: minimums
        .map(
          (m) =>
            `${places.get(m.locationId)?.path ?? m.locationId}: ${normalizeQuantity(m.minQuantity)}`,
        )
        .sort(),
      active: row.active,
    };
  }

  private toDto(r: ConsumableRow): ConsumableDto {
    const totalStock = normalizeQuantity(r.totalStock);
    const minStock = r.minStock === null ? null : normalizeQuantity(r.minStock);
    const belowMinimum = isBelowMinimum(totalStock, minStock);
    return {
      id: r.id,
      name: r.name,
      category: { id: r.categoryId, name: r.categoryName },
      unit: unitRefOf(r),
      notes: r.notes,
      minStock,
      totalStock,
      belowMinimum,
      warehousesBelowMinimum: r.warehousesBelow,
      // Un consumible desactivado deja de avisar: ya no se repone.
      lowStock: r.active && (belowMinimum || r.warehousesBelow > 0),
      active: r.active,
      hasMovements: r.hasMovements,
      updatedAt: iso(r.updatedAt),
    };
  }

  private async detail(exec: Executor, row: ConsumableRow): Promise<ConsumableDetailDto> {
    const stock = await this.repo.stockByWarehouse(exec, row.id);
    const places = await this.catalog.locationsByIds(
      exec,
      stock.map((s) => s.locationId),
    );
    const byWarehouse: WarehouseStockDto[] = stock
      .flatMap((s) => {
        const place = places.get(s.locationId);
        if (!place) return [];
        const quantity = normalizeQuantity(s.quantity);
        const minQuantity = s.minQuantity === null ? null : normalizeQuantity(s.minQuantity);
        return [
          {
            location: { id: place.id, name: place.name, path: place.path, active: place.active },
            quantity,
            minQuantity,
            belowMinimum: isBelowMinimum(quantity, minQuantity),
          },
        ];
      })
      .sort((a, b) => a.location.path.localeCompare(b.location.path, 'es'));
    return { ...this.toDto(row), stockByWarehouse: byWarehouse };
  }

  /** El resultado de un movimiento: los movimientos creados (en el orden en que se crearon) y los saldos. */
  private async result(
    consumableId: string,
    ids: string[],
    balances: { locationId: string; quantity: string }[],
  ): Promise<MovementResult> {
    const { rows } = await this.repo.listMovements(this.db, consumableId, {
      ids,
      timezone: this.timezone,
      limit: ids.length,
      offset: 0,
    });
    const dtos = await this.toMovementDtos(rows);
    return { movements: ids.map((id) => dtos.find((d) => d.id === id)!), balances };
  }

  private async toMovementDtos(rows: MovementViewRow[]): Promise<MovementDto[]> {
    const places = await this.catalog.locationsByIds(
      this.db,
      rows.flatMap((r) =>
        r.counterpartLocationId ? [r.locationId, r.counterpartLocationId] : [r.locationId],
      ),
    );
    const names = await this.people.namesByIds([
      ...new Set(
        rows.flatMap((r) =>
          [r.actorId, r.reversedByActorId, r.recipientUserId].filter((x): x is string => !!x),
        ),
      ),
    ]);
    const place = (id: string) => ({ id, name: places.get(id)?.path ?? id });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as MovementKind,
      location: place(r.locationId),
      delta: normalizeDelta(r.delta),
      occurredAt: iso(r.occurredAt),
      registeredAt: iso(r.createdAt),
      backdated: r.backdated,
      actor: names.has(r.actorId) ? { id: r.actorId, name: names.get(r.actorId)! } : null,
      supplier: r.supplier,
      note: r.note,
      reason: r.reason,
      recipient:
        r.recipientUserId || r.recipientName
          ? {
              userId: r.recipientUserId,
              name: (r.recipientUserId ? names.get(r.recipientUserId) : r.recipientName) ?? '',
              ref: r.recipientRef,
            }
          : null,
      counterpartLocation: r.counterpartLocationId ? place(r.counterpartLocationId) : null,
      reversedBy: r.reversedById
        ? {
            id: r.reversedById,
            at: iso(r.reversedAt!),
            actorName: r.reversedByActorId ? (names.get(r.reversedByActorId) ?? null) : null,
          }
        : null,
      reverses: r.reversesId
        ? { id: r.reversesId, kind: r.reversesKind as MovementKind, at: iso(r.reversesAt!) }
        : null,
      reversible:
        r.kind !== 'reversal' &&
        r.reversedById === null &&
        !(r.kind === 'delivery' && compareQuantities(r.returned ?? '0', '0') > 0),
      returned: r.kind === 'delivery' ? normalizeQuantity(r.returned ?? '0') : null,
      returnable:
        r.kind === 'delivery' &&
        r.reversedById === null &&
        compareQuantities(normalizeDelta(r.delta).replace('-', ''), r.returned ?? '0') > 0,
      returnOf: r.returnsId ? { id: r.returnsId, at: iso(r.returnsAt!) } : null,
    }));
  }
}

/** Signo de un saldo en texto: -1 si es negativo. */
function compareSign(value: string): -1 | 0 | 1 {
  return value.startsWith('-') ? -1 : value === '0' ? 0 : 1;
}
