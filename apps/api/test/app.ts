import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Clock } from '../src/core/clock.js';
import { loadConfig, type AppConfig } from '../src/core/config.js';
import { pingDatabase, pingQueue } from '../src/core/db/client.js';
import { buildServices, type Services } from '../src/core/container.js';
import type { PasswordHasher } from '../src/modules/auth/password.js';
import { createIsolatedDb, type IsolatedDb } from './db.js';

/** Hasher rápido: los tests que no prueban argon2 no deben pagar su costo. */
export class FastHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `fast:${password}`;
  }
  async verify(hash: string, password: string): Promise<boolean> {
    return hash === `fast:${password}`;
  }
}

/** Reloj controlable. */
export class FakeClock implements Clock {
  constructor(private current = new Date('2026-11-16T12:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export const STRONG_PASSWORD = 'violeta-cobre-nube-87';

/** Cliente de pruebas con jar de cookies y manejo automático del token CSRF. */
export class TestClient {
  private cookies = new Map<string, string>();
  private csrfToken: string | undefined;
  constructor(
    private readonly app: FastifyInstance,
    readonly ip = '10.0.0.10',
  ) {}

  private absorb(res: LightMyRequestResponse): void {
    for (const c of res.cookies) {
      if (c.value === '' || (c.expires && c.expires.getTime() < Date.now()))
        this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
  }

  get cookie(): Record<string, string> {
    return Object.fromEntries(this.cookies);
  }

  /** Reemplaza la cookie de sesión por la de otro cliente (simula robo/reuso de un token). */
  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  async request(opts: InjectOptions & { csrf?: boolean }): Promise<LightMyRequestResponse> {
    const method = String(opts.method ?? 'GET').toUpperCase();
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const headers: Record<string, string> = {
      ...(opts.headers as Record<string, string> | undefined),
    };
    if (unsafe && opts.csrf !== false) {
      if (!this.csrfToken) {
        const t = await this.app.inject({
          method: 'GET',
          url: '/api/v1/auth/csrf',
          remoteAddress: this.ip,
          cookies: this.cookie,
        });
        this.absorb(t);
        this.csrfToken = (t.json() as { token: string }).token;
      }
      headers['x-csrf-token'] = this.csrfToken;
    }
    const res = await this.app.inject({
      ...opts,
      headers,
      cookies: this.cookie,
      remoteAddress: this.ip,
    });
    this.absorb(res);
    return res;
  }

  get(url: string) {
    return this.request({ method: 'GET', url });
  }
  post(url: string, payload?: unknown, headers?: Record<string, string>) {
    return this.request({
      method: 'POST',
      url,
      ...(payload !== undefined ? { payload: payload as object } : {}),
      ...(headers ? { headers } : {}),
    });
  }
  patch(url: string, payload: unknown, headers?: Record<string, string>) {
    return this.request({
      method: 'PATCH',
      url,
      payload: payload as object,
      ...(headers ? { headers } : {}),
    });
  }
  delete(url: string) {
    return this.request({ method: 'DELETE', url });
  }

  async login(email: string, password = STRONG_PASSWORD): Promise<LightMyRequestResponse> {
    return this.post('/api/v1/auth/login', { email, password });
  }
}

export interface TestEnv {
  app: FastifyInstance;
  db: IsolatedDb;
  services: Services;
  config: AppConfig;
  clock: FakeClock;
  client(ip?: string): TestClient;
  /** Crea un usuario con el rol dado (por nombre), listo para iniciar sesión (sin cambio de contraseña pendiente). */
  createUser(opts: {
    email: string;
    role: string;
    name?: string;
    password?: string;
    active?: boolean;
  }): Promise<string>;
  close(): Promise<void>;
}

export async function createTestEnv(
  overrides: Record<string, string> = {},
  opts: { realHasher?: boolean } = {},
): Promise<TestEnv> {
  const db = await createIsolatedDb();
  const config = loadConfig({
    DATABASE_URL: db.appUrl,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SESSION_COOKIE_SECURE: 'false',
    ...overrides,
  });
  const clock = new FakeClock();
  const hasher = opts.realHasher ? undefined : new FastHasher();
  const app = await buildApp({
    config,
    db: db.db,
    clock,
    ...(hasher ? { hasher } : {}),
    health: { database: () => pingDatabase(db.pool), queue: () => pingQueue(db.pool) },
  });
  const services = buildServices({ db: db.db, config, clock, ...(hasher ? { hasher } : {}) });

  return {
    app,
    db,
    services,
    config,
    clock,
    client: (ip) => new TestClient(app, ip),
    async createUser({
      email,
      role,
      name = email.split('@')[0]!,
      password = STRONG_PASSWORD,
      active = true,
    }) {
      const roles = await services.rbac.listRoles();
      const roleId = roles.find((r) => r.name === role)?.id;
      if (!roleId) throw new Error(`Rol de prueba inexistente: ${role}`);
      const user = await services.users.create(
        { actorId: null, ip: null },
        { email, name, roleIds: [roleId], password },
      );
      await db.migratorPool.query(
        'UPDATE users SET must_change_password = false, active = $2 WHERE id = $1',
        [user.id, active],
      );
      return user.id;
    },
    async close() {
      await app.close();
      await db.drop();
    },
  };
}
