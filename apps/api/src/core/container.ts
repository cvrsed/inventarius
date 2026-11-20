import type { Clock } from './clock.js';
import { DashboardRepository } from '../modules/dashboard/repository.js';
import { DashboardService } from '../modules/dashboard/service.js';
import { localDate, systemClock } from './clock.js';
import type { AppConfig } from './config.js';
import type { Executor } from './db/executor.js';
import { AssetsRepository } from '../modules/assets/repository.js';
import { AssetsService } from '../modules/assets/service.js';
import { AuditRepository } from '../modules/audit/repository.js';
import { RecordDirectory } from './db/records.js';
import { AuditService } from '../modules/audit/service.js';
import { Argon2Hasher, type PasswordHasher } from '../modules/auth/password.js';
import { AuthRepository } from '../modules/auth/repository.js';
import { AuthService } from '../modules/auth/service.js';
import { LoginThrottle } from '../modules/auth/throttle.js';
import { CatalogRepository } from '../modules/catalog/repository.js';
import { CatalogService } from '../modules/catalog/service.js';
import { ConsumablesRepository } from '../modules/consumables/repository.js';
import { ConsumablesService } from '../modules/consumables/service.js';
import { RbacRepository } from '../modules/rbac/repository.js';
import { RbacService } from '../modules/rbac/service.js';
import { LorawanImportService } from '../modules/lorawan/import-service.js';
import { LorawanRepository } from '../modules/lorawan/repository.js';
import { LorawanService } from '../modules/lorawan/service.js';
import type { AdapterRegistry } from '../modules/lns/adapter.js';
import { ChirpstackAdapter } from '../modules/lns/chirpstack.js';
import { LnsProfilesRepository } from '../modules/lns/profiles-repository.js';
import { LnsProfilesService } from '../modules/lns/profiles-service.js';
import { RegistrationService } from '../modules/lns/registration-service.js';
import { RegistrationsRepository } from '../modules/lns/registrations-repository.js';
import { TtnAdapter } from '../modules/lns/ttn.js';
import type { JobQueue } from './queue.js';
import { UsersRepository } from '../modules/users/repository.js';
import { UsersService, type SessionRevoker } from '../modules/users/service.js';

export interface Services {
  audit: AuditService;
  rbac: RbacService;
  users: UsersService;
  auth: AuthService;
  catalog: CatalogService;
  assets: AssetsService;
  consumables: ConsumablesService;
  dashboard: DashboardService;
  lorawan: LorawanService;
  lorawanImport: LorawanImportService;
  lnsProfiles: LnsProfilesService;
  registrations: RegistrationService;
}

export interface ContainerDeps {
  db: Executor;
  config: AppConfig;
  hasher?: PasswordHasher;
  clock?: Clock;
  /** Cola de trabajos; sin ella no se puede encolar (los tests de la API usan una en memoria). */
  queue?: JobQueue;
  /** Adaptadores de LNS; por defecto los reales (los tests inyectan dobles). */
  adapters?: AdapterRegistry;
  log?: { error: (obj: object, msg: string) => void };
}

/**
 * Raíz de composición: único lugar que conoce las implementaciones concretas.
 * `users` necesita revocar sesiones y `auth` necesita `users`; se resuelve con un revocador diferido.
 */
export function buildServices(deps: ContainerDeps): Services {
  const { db, config } = deps;
  const hasher = deps.hasher ?? new Argon2Hasher();
  const clock = deps.clock ?? systemClock;

  const usersRepo = new UsersRepository();
  // `users` y `auth` se necesitan mutuamente; los puertos diferidos leen de aquí cuando ya están construidos.
  const late: { auth?: AuthService; users?: UsersService } = {};
  const revoker: SessionRevoker = {
    revokeAllForUser: (exec, userId) => {
      if (!late.auth) throw new Error('AuthService no inicializado');
      return late.auth.revokeAllForUser(exec, userId);
    },
  };

  // Auditoría resuelve nombres de actor a través de users; se enlaza con un directorio diferido.
  const audit = new AuditService(
    new AuditRepository(),
    db,
    {
      namesByIds: (ids) => {
        if (!late.users) throw new Error('UsersService no inicializado');
        return late.users.namesByIds(ids);
      },
    },
    new RecordDirectory(db),
  );
  const rbac = new RbacService(new RbacRepository(), db, audit);
  const users = (late.users = new UsersService(usersRepo, db, rbac, audit, hasher, revoker));
  const authRepo = new AuthRepository();
  const throttle = new LoginThrottle(authRepo, db, config.login, clock);
  const auth = (late.auth = new AuthService(
    authRepo,
    db,
    users,
    rbac,
    audit,
    hasher,
    throttle,
    config.session,
    clock,
  ));
  const catalogRepo = new CatalogRepository();
  const catalog = new CatalogService(catalogRepo, db, audit);
  const assetsRepo = new AssetsRepository();
  const lorawanRepo = new LorawanRepository();
  const adapters: AdapterRegistry = deps.adapters ?? {
    chirpstack: new ChirpstackAdapter(config.lns.requestTimeoutMs),
    ttn: new TtnAdapter(config.lns.requestTimeoutMs),
  };
  const queue: JobQueue = deps.queue ?? {
    send: () => Promise.reject(new Error('La cola de trabajos no está configurada')),
  };

  // El registro LNS y los datos LoRaWAN se necesitan mutuamente (y con activos); se enlazan con puertos diferidos.
  const lateLns: { registrations?: RegistrationService; lorawan?: LorawanService } = {};
  const lorawan = (lateLns.lorawan = new LorawanService(
    lorawanRepo,
    db,
    audit,
    {
      lock: async (exec, id) => {
        if (!(await assetsRepo.lock(exec, id))) return undefined;
        const row = await assetsRepo.getById(exec, id);
        if (!row) return undefined;
        const model = await catalog.requireModel(exec, row.modelId, { allowInactive: true });
        return {
          id: row.id,
          assetTag: row.assetTag,
          name: row.name,
          deleted: row.deletedAt !== null,
          categoryExtension: row.categoryExtension,
          modelDefaults: {
            deviceClass: model.lorawanClass,
            lorawanVersion: model.lorawanVersion,
            region: model.lorawanRegion,
          },
        };
      },
    },
    {
      find: (exec, id) => {
        if (!lateLns.registrations) throw new Error('RegistrationService no inicializado');
        return lateLns.registrations.find(exec, id);
      },
    },
    config.secretBox,
  ));
  const assets = new AssetsService(
    assetsRepo,
    db,
    audit,
    catalog,
    {
      find: (exec, id) => users.findById(id, exec),
      search: (q, limit) => users.searchAssignable(q, limit),
    },
    config.assetTagPrefix,
    config.defaultCurrency,
    () => localDate(clock.now(), config.timezone),
    {
      apply: (tx, actor, assetId, input) => lorawan.apply(tx, actor, assetId, input),
      hasRemoteFootprint: (exec, assetId) => {
        if (!lateLns.registrations) throw new Error('RegistrationService no inicializado');
        return lateLns.registrations.hasRemoteFootprint(exec, assetId);
      },
    },
  );
  const consumables = new ConsumablesService(
    new ConsumablesRepository(),
    db,
    audit,
    catalog,
    {
      find: (exec, id) => users.findById(id, exec),
      search: (q, limit) => users.searchAssignable(q, limit),
      namesByIds: (ids) => users.namesByIds(ids),
    },
    () => localDate(clock.now(), config.timezone),
    config.timezone,
  );
  const lnsProfiles = new LnsProfilesService(
    new LnsProfilesRepository(),
    db,
    audit,
    config.secretBox,
    adapters,
  );
  const registrations = (lateLns.registrations = new RegistrationService(
    new RegistrationsRepository(),
    db,
    audit,
    lorawan,
    lnsProfiles,
    {
      get: async (exec, id) => {
        const row = await assetsRepo.getById(exec, id);
        return row
          ? { id: row.id, assetTag: row.assetTag, name: row.name, deleted: row.deletedAt !== null }
          : undefined;
      },
    },
    adapters,
    queue,
    config.lns,
    deps.log,
  ));
  const lorawanImport = new LorawanImportService(
    db,
    lorawanRepo,
    lorawan,
    { bySerials: (exec, serials) => assetsRepo.bySerials(exec, serials) },
    registrations,
    audit,
  );
  const dashboard = new DashboardService(
    new DashboardRepository(),
    db,
    { namesByIds: (ids) => users.namesByIds(ids) },
    () => localDate(clock.now(), config.timezone),
  );
  return {
    audit,
    rbac,
    users,
    auth,
    catalog,
    assets,
    consumables,
    dashboard,
    lorawan,
    lorawanImport,
    lnsProfiles,
    registrations,
  };
}
