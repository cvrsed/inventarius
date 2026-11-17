import type {
  AssetModelDto,
  CatalogListQuery,
  CategoryDto,
  CategoryExtension,
  LocationDto,
  ManufacturerDto,
  StatusKind,
  StatusLabelDto,
} from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import { ConflictError, ValidationError } from '../../core/errors.js';
import type { AuditService } from '../audit/service.js';
import { CatalogEntity, compact } from './entity.js';
import type {
  CatalogRepository,
  CategoryRow,
  LocationRow,
  ManufacturerRow,
  ModelRow,
  StatusLabelRow,
} from './repository.js';

type Page = Pick<CatalogListQuery, 'page' | 'pageSize'>;
type ListQuery = CatalogListQuery;
const offsetOf = (q: Page) => (q.page - 1) * q.pageSize;
const listOpts = (q: ListQuery) => ({
  q: q.q,
  active: q.active,
  sort: q.sort,
  limit: q.pageSize,
  offset: offsetOf(q),
});
const iso = (d: Date) => d.toISOString();

const LORAWAN_FIELDS = [
  'lorawanClass',
  'lorawanRegion',
  'lorawanVersion',
  'lorawanRegionalParameters',
] as const;

type ModelPatch = { [K in keyof ModelInput]?: ModelInput[K] | undefined } & {
  active?: boolean | undefined;
};

interface ModelListQuery extends ListQuery {
  manufacturerId?: string | undefined;
  categoryId?: string | undefined;
}
interface ModelInput {
  name: string;
  modelNumber: string | null;
  manufacturerId: string;
  categoryId: string;
  lorawanClass: string | null;
  lorawanRegion: string | null;
  lorawanVersion: string | null;
  lorawanRegionalParameters: string | null;
}

/**
 * Catálogo de referencia (RF-10 a RF-14): categorías, fabricantes, modelos, ubicaciones y estados.
 * Cada entidad es un `CatalogEntity` con sus reglas propias; las demás partes del sistema usan los
 * métodos `require*` para validar referencias sin leer estas tablas.
 */
export class CatalogService {
  readonly categories: CatalogEntity<
    CategoryRow,
    CategoryDto,
    { name: string; extension: string },
    { name?: string | undefined; extension?: string | undefined; active?: boolean | undefined },
    ListQuery
  >;
  readonly manufacturers: CatalogEntity<
    ManufacturerRow,
    ManufacturerDto,
    { name: string },
    { name?: string | undefined; active?: boolean | undefined },
    ListQuery
  >;
  readonly models: CatalogEntity<ModelRow, AssetModelDto, ModelInput, ModelPatch, ModelListQuery>;
  readonly locations: CatalogEntity<
    LocationRow,
    LocationDto,
    { name: string; parentId: string | null; address: string | null },
    {
      name?: string | undefined;
      parentId?: string | null | undefined;
      address?: string | null | undefined;
      active?: boolean | undefined;
    },
    ListQuery
  >;
  readonly statusLabels: CatalogEntity<
    StatusLabelRow,
    StatusLabelDto,
    { name: string; kind: StatusKind },
    { name?: string | undefined; kind?: StatusKind | undefined; active?: boolean | undefined },
    ListQuery
  >;

  constructor(
    private readonly repo: CatalogRepository,
    private readonly db: Executor,
    audit: AuditService,
  ) {
    this.categories = new CatalogEntity(
      {
        entity: 'category',
        notFound: 'Categoría no encontrada',
        duplicate: 'Ya existe una categoría con ese nombre',
        toDto: (r) => ({
          id: r.id,
          name: r.name,
          extension: r.extension as CategoryExtension,
          active: r.active,
          updatedAt: iso(r.updatedAt),
        }),
        snapshot: (r) => ({ name: r.name, extension: r.extension, active: r.active }),
        list: (e, q) => repo.listCategories(e, listOpts(q)),
        get: (e, id) => repo.getCategory(e, id),
        insert: (e, v) => repo.insertCategory(e, v),
        update: (e, id, v) => repo.updateCategory(e, id, compact(v)),
        remove: (e, id) => repo.deleteCategory(e, id),
        inUse: (e, id) => repo.categoryInUse(e, id),
      },
      db,
      audit,
    );

    this.manufacturers = new CatalogEntity(
      {
        entity: 'manufacturer',
        notFound: 'Fabricante no encontrado',
        duplicate: 'Ya existe un fabricante con ese nombre',
        toDto: (r) => ({ id: r.id, name: r.name, active: r.active, updatedAt: iso(r.updatedAt) }),
        snapshot: (r) => ({ name: r.name, active: r.active }),
        list: (e, q) => repo.listManufacturers(e, listOpts(q)),
        get: (e, id) => repo.getManufacturer(e, id),
        insert: (e, v) => repo.insertManufacturer(e, v),
        update: (e, id, v) => repo.updateManufacturer(e, id, compact(v)),
        remove: (e, id) => repo.deleteManufacturer(e, id),
        inUse: (e, id) => repo.manufacturerInUse(e, id),
      },
      db,
      audit,
    );

    this.models = new CatalogEntity(
      {
        entity: 'model',
        notFound: 'Modelo no encontrado',
        duplicate: 'Ese fabricante ya tiene un modelo con ese nombre',
        toDto: (r) => ({
          id: r.id,
          name: r.name,
          modelNumber: r.modelNumber,
          manufacturer: { id: r.manufacturerId, name: r.manufacturerName },
          category: {
            id: r.categoryId,
            name: r.categoryName,
            extension: r.categoryExtension as CategoryExtension,
          },
          active: r.active,
          lorawanClass: r.lorawanClass as AssetModelDto['lorawanClass'],
          lorawanRegion: r.lorawanRegion,
          lorawanVersion: r.lorawanVersion,
          lorawanRegionalParameters: r.lorawanRegionalParameters,
          updatedAt: iso(r.updatedAt),
        }),
        snapshot: (r) => ({
          name: r.name,
          modelNumber: r.modelNumber,
          manufacturer: r.manufacturerName,
          category: r.categoryName,
          active: r.active,
          lorawanClass: r.lorawanClass,
          lorawanRegion: r.lorawanRegion,
          lorawanVersion: r.lorawanVersion,
          lorawanRegionalParameters: r.lorawanRegionalParameters,
        }),
        list: (e, q) =>
          repo.listModels(e, {
            ...listOpts(q),
            manufacturerId: q.manufacturerId,
            categoryId: q.categoryId,
          }),
        get: (e, id) => repo.getModel(e, id),
        insert: (e, v) => repo.insertModel(e, v),
        update: (e, id, v) => repo.updateModel(e, id, compact(v)),
        remove: (e, id) => repo.deleteModel(e, id),
        inUse: (e, id) => repo.modelInUse(e, id),
        beforeCreate: (tx, input) => this.prepareModel(tx, input, undefined),
        beforeUpdate: (tx, current, patch) =>
          this.prepareModel(tx, patch, current) as Promise<ModelPatch>,
      },
      db,
      audit,
    );

    this.locations = new CatalogEntity(
      {
        entity: 'location',
        notFound: 'Ubicación no encontrada',
        duplicate: 'Ya existe una ubicación con ese nombre',
        toDto: (r) => ({
          id: r.id,
          name: r.name,
          parent: r.parentId && r.parentName ? { id: r.parentId, name: r.parentName } : null,
          path: r.path,
          address: r.address,
          active: r.active,
          updatedAt: iso(r.updatedAt),
        }),
        snapshot: (r) => ({ path: r.path, address: r.address, active: r.active }),
        list: (e, q) => repo.listLocations(e, listOpts(q)),
        get: (e, id) => repo.getLocation(e, id),
        insert: async (e, v) => repo.insertLocation(e, v),
        update: (e, id, v) => repo.updateLocation(e, id, compact(v)),
        remove: (e, id) => repo.deleteLocation(e, id),
        inUse: (e, id) => repo.locationInUse(e, id),
        beforeCreate: async (tx, input) => {
          if (input.parentId) await this.requireLocation(tx, input.parentId, 'parentId');
          return input;
        },
        beforeUpdate: async (tx, current, patch) => {
          if (patch.parentId) {
            await this.requireLocation(tx, patch.parentId, 'parentId');
            if ((await repo.subtreeIds(tx, current.id)).includes(patch.parentId)) {
              throw new ValidationError('Una ubicación no puede quedar dentro de sí misma', {
                parentId: ['Elige una ubicación que no sea ella ni una de sus hijas'],
              });
            }
          }
          return patch;
        },
      },
      db,
      audit,
    );

    this.statusLabels = new CatalogEntity(
      {
        entity: 'status_label',
        notFound: 'Estado no encontrado',
        duplicate: 'Ya existe un estado con ese nombre',
        toDto: (r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind as StatusKind,
          active: r.active,
          isSystem: r.systemKey !== null,
          updatedAt: iso(r.updatedAt),
        }),
        snapshot: (r) => ({ name: r.name, kind: r.kind, active: r.active }),
        list: (e, q) => repo.listStatusLabels(e, listOpts(q)),
        get: (e, id) => repo.getStatusLabel(e, id),
        insert: (e, v) => repo.insertStatusLabel(e, v),
        update: (e, id, v) => repo.updateStatusLabel(e, id, compact(v)),
        remove: (e, id) => repo.deleteStatusLabel(e, id),
        inUse: (e, id) => repo.statusLabelInUse(e, id),
        beforeUpdate: async (_tx, current, patch) => {
          if (current.systemKey && Object.keys(compact(patch)).length) {
            throw new ConflictError(
              `«${current.name}» lo usa el sistema al asignar activos; no se puede modificar`,
            );
          }
          return patch;
        },
        beforeDelete: (_tx, row) => {
          if (row.systemKey) {
            throw new ConflictError(
              `«${row.name}» lo usa el sistema al asignar activos; no se puede borrar`,
            );
          }
        },
      },
      db,
      audit,
    );
  }

  /**
   * Valida fabricante y categoría (existentes y activos) y las reglas LoRaWAN del modelo: los valores por
   * defecto solo valen en categorías con extensión `lorawan`; al pasar a otra categoría se descartan.
   */
  private async prepareModel<T extends ModelPatch>(
    tx: Executor,
    input: T,
    current: ModelRow | undefined,
  ): Promise<T> {
    const errors: Record<string, string[]> = {};
    if (input.manufacturerId && input.manufacturerId !== current?.manufacturerId) {
      const m = await this.repo.getManufacturer(tx, input.manufacturerId);
      if (!m) errors['manufacturerId'] = ['El fabricante no existe'];
      else if (!m.active) errors['manufacturerId'] = ['El fabricante está inactivo'];
    }
    let extension = current?.categoryExtension;
    const categoryChanged =
      input.categoryId !== undefined && input.categoryId !== current?.categoryId;
    if (input.categoryId !== undefined && (!current || categoryChanged)) {
      const c = await this.repo.getCategory(tx, input.categoryId);
      if (!c) errors['categoryId'] = ['La categoría no existe'];
      else {
        extension = c.extension;
        if (!c.active) errors['categoryId'] = ['La categoría está inactiva'];
      }
    }
    let out = input;
    if (extension !== 'lorawan') {
      const given = LORAWAN_FIELDS.find((k) => input[k] !== undefined && input[k] !== null);
      if (given) errors[given] = ['Solo los modelos de una categoría LoRaWAN tienen estos valores'];
      // Pasó a una categoría sin extensión: se descartan los valores LoRaWAN que traía.
      else if (categoryChanged && current) {
        out = {
          ...input,
          lorawanClass: null,
          lorawanRegion: null,
          lorawanVersion: null,
          lorawanRegionalParameters: null,
        };
      }
    } else {
      // La clase es lo que decide cómo se comunica el dispositivo: sin ella el modelo no sirve en F3.
      const effectiveClass =
        input.lorawanClass !== undefined ? input.lorawanClass : current?.lorawanClass;
      if (!effectiveClass) errors['lorawanClass'] = ['La clase es obligatoria en modelos LoRaWAN'];
    }
    if (Object.keys(errors).length)
      throw new ValidationError('Revisa los datos del modelo', errors);
    return out;
  }

  private async requireLocation(tx: Executor, id: string, field: string): Promise<LocationRow> {
    const row = await this.repo.getLocation(tx, id);
    if (!row)
      throw new ValidationError('La ubicación no existe', { [field]: ['La ubicación no existe'] });
    return row;
  }

  // --- Puertos para el módulo de activos ---

  /** Modelo con su categoría, o error de validación si no existe o está inactivo. */
  async requireModel(
    exec: Executor,
    id: string,
    opts: { allowInactive?: boolean } = {},
  ): Promise<ModelRow> {
    const row = await this.repo.getModel(exec, id);
    if (!row)
      throw new ValidationError('El modelo no existe', { modelId: ['El modelo no existe'] });
    if (!row.active && !opts.allowInactive) {
      throw new ValidationError('El modelo está inactivo', {
        modelId: ['El modelo está inactivo'],
      });
    }
    return row;
  }

  async requireStatus(
    exec: Executor,
    id: string,
    opts: { allowInactive?: boolean; field?: string } = {},
  ): Promise<StatusLabelRow> {
    const field = opts.field ?? 'statusId';
    const row = await this.repo.getStatusLabel(exec, id);
    if (!row)
      throw new ValidationError('El estado no existe', { [field]: ['El estado no existe'] });
    if (!row.active && !opts.allowInactive) {
      throw new ValidationError('El estado está inactivo', {
        [field]: ['El estado está inactivo'],
      });
    }
    return row;
  }

  async requireActiveLocation(
    exec: Executor,
    id: string,
    field = 'locationId',
  ): Promise<LocationRow> {
    const row = await this.requireLocation(exec, id, field);
    if (!row.active) {
      throw new ValidationError('La ubicación está inactiva', {
        [field]: ['La ubicación está inactiva'],
      });
    }
    return row;
  }

  /** Estado que pone el check-out (`system_key = 'assigned'`). */
  async assignedStatus(exec: Executor): Promise<StatusLabelRow> {
    const row = await this.repo.getStatusBySystemKey(exec, 'assigned');
    if (!row)
      throw new Error('Falta el estado de sistema «Asignado»; ¿se aplicaron las migraciones?');
    return row;
  }
}
