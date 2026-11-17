import type { Clock } from './clock.js';
import { DashboardRepository } from '../modules/dashboard/repository.js';
import { DashboardService } from '../modules/dashboard/service.js';
import { localDate, systemClock } from './clock.js';
import type { AppConfig } from './config.js';
import type { Executor } from './db/executor.js';
import { AssetsRepository } from '../modules/assets/repository.js';
import { AssetsService } from '../modules/assets/service.js';
import { AuditRepository } from '../modules/audit/repository.js';
import { AuditService } from '../modules/audit/service.js';
import { Argon2Hasher, type PasswordHasher } from '../modules/auth/password.js';
import { AuthRepository } from '../modules/auth/repository.js';
import { AuthService } from '../modules/auth/service.js';
import { LoginThrottle } from '../modules/auth/throttle.js';
import { CatalogRepository } from '../modules/catalog/repository.js';
import { CatalogService } from '../modules/catalog/service.js';
import { RbacRepository } from '../modules/rbac/repository.js';
import { RbacService } from '../modules/rbac/service.js';
import { UsersRepository } from '../modules/users/repository.js';
import { UsersService, type SessionRevoker } from '../modules/users/service.js';

export interface Services {
  audit: AuditService;
  rbac: RbacService;
  users: UsersService;
  auth: AuthService;
  catalog: CatalogService;
  assets: AssetsService;
  dashboard: DashboardService;
}

export interface ContainerDeps {
  db: Executor;
  config: AppConfig;
  hasher?: PasswordHasher;
  clock?: Clock;
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
  const audit = new AuditService(new AuditRepository(), db, {
    namesByIds: (ids) => {
      if (!late.users) throw new Error('UsersService no inicializado');
      return late.users.namesByIds(ids);
    },
  });
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
  const catalog = new CatalogService(new CatalogRepository(), db, audit);
  const assets = new AssetsService(
    new AssetsRepository(),
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
  );
  const dashboard = new DashboardService(
    new DashboardRepository(),
    db,
    { namesByIds: (ids) => users.namesByIds(ids) },
    () => localDate(clock.now(), config.timezone),
  );
  return { audit, rbac, users, auth, catalog, assets, dashboard };
}
