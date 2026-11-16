import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgres://app:pw@localhost:5432/inventarius',
};

describe('loadConfig', () => {
  it('aplica valores por defecto', () => {
    const config = loadConfig(valid);
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('info');
    expect(config.timezone).toBe('America/Santiago');
    expect(config.isProduction).toBe(false);
  });

  it('falla de forma legible si falta DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('convierte PORT a número y rechaza valores inválidos', () => {
    expect(loadConfig({ ...valid, PORT: '8080' }).port).toBe(8080);
    expect(() => loadConfig({ ...valid, PORT: 'abc' })).toThrowError(/PORT/);
  });

  it('marca isProduction según NODE_ENV', () => {
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).isProduction).toBe(true);
  });

  it('trata METRICS_TOKEN vacío como ausente', () => {
    expect(loadConfig({ ...valid, METRICS_TOKEN: '' }).metricsToken).toBeUndefined();
    expect(loadConfig({ ...valid, METRICS_TOKEN: 'abc' }).metricsToken).toBe('abc');
  });

  it('trae valores seguros de sesión y bloqueo por defecto', () => {
    const c = loadConfig(valid);
    expect(c.session.idleTimeoutSeconds).toBe(8 * 3600);
    expect(c.session.absoluteTimeoutSeconds).toBe(7 * 24 * 3600);
    expect(c.session.cookieSecure).toBe(false);
    expect(c.login.maxFailuresPerAccount).toBe(5);
    expect(c.login.maxFailuresPerIp).toBe(20);
  });

  it('la cookie es Secure por defecto en producción y se puede forzar', () => {
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).session.cookieSecure).toBe(true);
    expect(
      loadConfig({ ...valid, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }).session
        .cookieSecure,
    ).toBe(false);
  });

  it('rechaza un timeout de sesión no positivo', () => {
    expect(() => loadConfig({ ...valid, SESSION_IDLE_TIMEOUT_SECONDS: '0' })).toThrowError(
      /SESSION_IDLE_TIMEOUT_SECONDS/,
    );
  });
});
