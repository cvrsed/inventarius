import type { AppConfig } from '../../core/config.js';
import type { Clock } from '../../core/clock.js';
import type { Executor } from '../../core/db/executor.js';
import { TooManyRequestsError } from '../../core/errors.js';
import type { AuthRepository } from './repository.js';
import { lockSeconds } from './throttle-policy.js';

/** Bloqueo temporal por cuenta y por IP (RF-05). Las claves no revelan si la cuenta existe. */
export class LoginThrottle {
  constructor(
    private readonly repo: AuthRepository,
    private readonly db: Executor,
    private readonly cfg: AppConfig['login'],
    private readonly clock: Clock,
  ) {}

  static accountKey(email: string): string {
    return `account:${email.trim().toLowerCase()}`;
  }

  static ipKey(ip: string): string {
    return `ip:${ip}`;
  }

  /** Lanza 429 con `retryAfterSeconds` si alguna de las claves sigue bloqueada. */
  async assertNotLocked(keys: string[]): Promise<void> {
    const now = this.clock.now();
    let wait = 0;
    for (const row of await this.repo.getThrottles(this.db, keys)) {
      if (row.lockedUntil && row.lockedUntil > now) {
        wait = Math.max(wait, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000));
      }
    }
    if (wait > 0) {
      throw new TooManyRequestsError(
        'Demasiados intentos fallidos. Espera un momento antes de volver a intentar.',
        wait,
      );
    }
  }

  async recordFailure(accountKey: string, ipKey: string): Promise<void> {
    const now = this.clock.now();
    const decayBefore = new Date(now.getTime() - this.cfg.lockMaxSeconds * 1000);
    for (const [key, max] of [
      [accountKey, this.cfg.maxFailuresPerAccount],
      [ipKey, this.cfg.maxFailuresPerIp],
    ] as const) {
      const failures = await this.repo.addFailure(this.db, key, now, decayBefore);
      const seconds = lockSeconds(failures, {
        max,
        baseSeconds: this.cfg.lockBaseSeconds,
        capSeconds: this.cfg.lockMaxSeconds,
      });
      if (seconds > 0)
        await this.repo.setLock(this.db, key, new Date(now.getTime() + seconds * 1000));
    }
  }

  /** Un login correcto limpia solo la cuenta; el contador de IP decae solo (si no, una cuenta propia lo vaciaría). */
  async clearAccount(accountKey: string): Promise<void> {
    await this.repo.clearThrottle(this.db, accountKey);
  }
}
