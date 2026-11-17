import { createHash, randomBytes } from 'node:crypto';
import type { SessionUser } from '@inventarius/shared';
import type { AuthContext } from '../../core/access.js';
import type { Clock } from '../../core/clock.js';
import type { AppConfig } from '../../core/config.js';
import type { Executor } from '../../core/db/executor.js';
import { UnauthorizedError, ValidationError } from '../../core/errors.js';
import type { Actor, AuditService } from '../audit/service.js';
import type { RbacService } from '../rbac/service.js';
import type { UsersService } from '../users/service.js';
import { assertPasswordPolicy, type PasswordHasher } from './password.js';
import type { AuthRepository } from './repository.js';
import { LoginThrottle } from './throttle.js';

/** Hash fijo para igualar el tiempo de respuesta cuando el usuario no existe (evita enumerar cuentas por timing). */
const DUMMY_HASH_PASSWORD = 'contraseña-señuelo-para-igualar-tiempos';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** Se actualiza `last_seen_at` como máximo cada tantos ms para no escribir en cada petición. */
const TOUCH_INTERVAL_MS = 30_000;
/** Fracción de la inactividad máxima que puede pasar entre un refresco y el siguiente. */
const TOUCH_FRACTION_OF_IDLE = 4;

export interface SessionStart {
  token: string;
  user: SessionUser;
}

export interface ClientInfo {
  ip: string;
  userAgent: string | null;
}

/** Autenticación y sesiones (RF-01, RF-04, RF-05). Implementa también `SessionRevoker` para users. */
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly repo: AuthRepository,
    private readonly db: Executor,
    private readonly users: UsersService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
    private readonly throttle: LoginThrottle,
    private readonly cfg: AppConfig['session'],
    private readonly clock: Clock,
  ) {
    // Con una inactividad corta (8 h en producción, 15 s en e2e) el refresco no puede ser más lento que
    // ella: si lo fuera, la sesión moriría por «inactiva» aunque el usuario esté trabajando.
    this.touchIntervalMs = Math.min(
      TOUCH_INTERVAL_MS,
      (cfg.idleTimeoutSeconds * 1000) / TOUCH_FRACTION_OF_IDLE,
    );
  }

  private readonly touchIntervalMs: number;

  private async sessionUser(userId: string, exec: Executor = this.db): Promise<SessionUser | null> {
    const user = await this.users.findById(userId, exec);
    if (!user || !user.active) return null;
    const [permissions, roles] = await Promise.all([
      this.rbac.permissionsForUser(userId, exec),
      this.rbac.rolesForUsers([userId], exec),
    ]);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      mustChangePassword: user.mustChangePassword,
      roles: (roles.get(userId) ?? []).map((r) => r.name),
      permissions,
    };
  }

  private async openSession(exec: Executor, userId: string, client: ClientInfo): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    await this.repo.insertSession(exec, {
      id: hashToken(token),
      userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.cfg.absoluteTimeoutSeconds * 1000),
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, 300) ?? null,
    });
    return token;
  }

  /**
   * Valida credenciales. Siempre abre una sesión nueva (rotación del ID al hacer login) y, en la misma
   * transacción, revoca la sesión previa que traía la petición (`previousSessionId`), si había: así el token
   * anterior del navegador deja de valer en cuanto se inicia otra sesión. Un login fallido no revoca nada.
   * Los fallos devuelven el mismo mensaje exista o no la cuenta, y cuentan para el bloqueo.
   */
  async login(
    input: { email: string; password: string },
    client: ClientInfo,
    previousSessionId?: string,
  ): Promise<SessionStart> {
    const accountKey = LoginThrottle.accountKey(input.email);
    const ipKey = LoginThrottle.ipKey(client.ip);
    await this.throttle.assertNotLocked([accountKey, ipKey]);

    const found = await this.users.findForLogin(input.email);
    this.dummyHash ??= this.hasher.hash(DUMMY_HASH_PASSWORD);
    const valid = await this.hasher.verify(
      found?.passwordHash ?? (await this.dummyHash),
      input.password,
    );

    if (!found || !valid || !found.active) {
      await this.throttle.recordFailure(accountKey, ipKey);
      await this.audit.record(this.db, {
        actorId: null,
        ip: client.ip,
        action: 'auth.login_failed',
        entity: 'user',
        entityId: found?.id ?? null,
        diff: { email: input.email },
      });
      throw new UnauthorizedError('Correo o contraseña incorrectos');
    }

    await this.throttle.clearAccount(accountKey);
    const token = await this.db.transaction(async (tx) => {
      if (previousSessionId) await this.repo.deleteSession(tx, previousSessionId);
      const t = await this.openSession(tx, found.id, client);
      await this.audit.record(tx, {
        actorId: found.id,
        ip: client.ip,
        action: 'auth.login',
        entity: 'user',
        entityId: found.id,
      });
      return t;
    });
    const user = (await this.sessionUser(found.id))!;
    return { token, user };
  }

  /** Resuelve la cookie a un contexto, aplicando expiración inactiva y absoluta. `null` si no hay sesión válida. */
  async resolve(token: string | undefined): Promise<AuthContext | null> {
    if (!token) return null;
    const id = hashToken(token);
    const session = await this.repo.findSession(this.db, id);
    if (!session) return null;

    const now = this.clock.now();
    const idleDeadline = session.lastSeenAt.getTime() + this.cfg.idleTimeoutSeconds * 1000;
    if (session.expiresAt <= now || idleDeadline <= now.getTime()) {
      await this.repo.deleteSession(this.db, id);
      return null;
    }
    const user = await this.sessionUser(session.userId);
    if (!user) {
      await this.repo.deleteSession(this.db, id);
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() > this.touchIntervalMs) {
      await this.repo.touchSession(this.db, id, now);
    }
    return { sessionId: id, user };
  }

  async logout(actor: Actor, sessionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.repo.deleteSession(tx, sessionId);
      await this.audit.record(tx, {
        ...actor,
        action: 'auth.logout',
        entity: 'user',
        entityId: actor.actorId,
      });
    });
  }

  /** RF-04: cambio de contraseña propio. Cierra todas las sesiones y devuelve una nueva. */
  async changePassword(
    ctx: AuthContext,
    input: { currentPassword: string; newPassword: string },
    client: ClientInfo,
  ): Promise<SessionStart> {
    const found = await this.users.findSecretById(ctx.user.id);
    if (!found || !(await this.hasher.verify(found.passwordHash, input.currentPassword))) {
      throw new ValidationError('La contraseña actual no es correcta', {
        currentPassword: ['La contraseña actual no es correcta'],
      });
    }
    assertPasswordPolicy(input.newPassword, { email: found.email });
    if (input.newPassword === input.currentPassword) {
      throw new ValidationError('La contraseña nueva debe ser distinta', {
        newPassword: ['Debe ser distinta de la actual'],
      });
    }
    const hash = await this.hasher.hash(input.newPassword);
    const token = await this.db.transaction(async (tx) => {
      await this.users.setPassword(tx, found.id, hash, false);
      await this.repo.deleteSessionsOfUser(tx, found.id);
      const t = await this.openSession(tx, found.id, client);
      await this.audit.record(tx, {
        actorId: found.id,
        ip: client.ip,
        action: 'auth.change_password',
        entity: 'user',
        entityId: found.id,
      });
      return t;
    });
    return { token, user: (await this.sessionUser(found.id))! };
  }

  async revokeAllForUser(exec: Executor, userId: string): Promise<void> {
    await this.repo.deleteSessionsOfUser(exec, userId);
  }

  /**
   * Borra las sesiones vencidas (absolutas o inactivas) y devuelve cuántas eran. Lo invoca cada hora el job
   * de mantenimiento; la validez de una sesión no depende de él, porque `resolve` ya rechaza las vencidas.
   */
  async purgeExpired(): Promise<number> {
    const now = this.clock.now();
    const idleBefore = new Date(now.getTime() - this.cfg.idleTimeoutSeconds * 1000);
    return this.repo.deleteExpiredSessions(this.db, now, idleBefore);
  }
}
