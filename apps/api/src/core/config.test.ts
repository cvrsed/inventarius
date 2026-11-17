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

  it('TRUSTED_PROXIES: por defecto localhost y redes privadas; acepta IP, CIDR y palabras; rechaza basura', () => {
    expect(loadConfig(valid).trustedProxies).toEqual(['loopback', 'uniquelocal']);
    expect(
      loadConfig({ ...valid, TRUSTED_PROXIES: ' 172.20.0.5, 10.0.0.0/8 ,::1,loopback' })
        .trustedProxies,
    ).toEqual(['172.20.0.5', '10.0.0.0/8', '::1', 'loopback']);
    expect(loadConfig({ ...valid, TRUSTED_PROXIES: '' }).trustedProxies).toEqual([]);
    for (const bad of ['caddy', '10.0.0.0/33', '1.2.3.4/x', '*', '1.2.3.4/8/9']) {
      expect(() => loadConfig({ ...valid, TRUSTED_PROXIES: bad })).toThrowError(/TRUSTED_PROXIES/);
    }
  });

  it('topes de BD y de apagado: por defecto razonables, configurables y validados [P33]', () => {
    const c = loadConfig(valid);
    expect(c.db).toEqual({
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 30_000,
      idleInTransactionTimeoutMs: 30_000,
    });
    expect(c.shutdownTimeoutMs).toBe(10_000);
    const custom = loadConfig({
      ...valid,
      DB_CONNECTION_TIMEOUT_MS: '2000',
      DB_STATEMENT_TIMEOUT_MS: '0',
      DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '15000',
      SHUTDOWN_TIMEOUT_MS: '3000',
    });
    expect(custom.db).toEqual({
      connectionTimeoutMs: 2_000,
      statementTimeoutMs: 0,
      idleInTransactionTimeoutMs: 15_000,
    });
    expect(custom.shutdownTimeoutMs).toBe(3_000);
    expect(() => loadConfig({ ...valid, DB_STATEMENT_TIMEOUT_MS: '-1' })).toThrowError(
      /DB_STATEMENT_TIMEOUT_MS/,
    );
    expect(() => loadConfig({ ...valid, SHUTDOWN_TIMEOUT_MS: '0' })).toThrowError(
      /SHUTDOWN_TIMEOUT_MS/,
    );
  });

  it('CSRF_SECRET: obligatorio en producción, mínimo 32 caracteres, aleatorio si falta en otros entornos [P34]', () => {
    const secret = 's'.repeat(32);
    expect(loadConfig({ ...valid, CSRF_SECRET: secret }).csrfSecret).toBe(secret);
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrowError(/CSRF_SECRET/);
    expect(loadConfig({ ...valid, NODE_ENV: 'production', CSRF_SECRET: secret }).csrfSecret).toBe(
      secret,
    );
    expect(() => loadConfig({ ...valid, CSRF_SECRET: 'corto' })).toThrowError(/CSRF_SECRET/);
    expect(loadConfig({ ...valid, CSRF_SECRET: '' }).csrfSecret).toHaveLength(64); // vacío = sin definir
    const a = loadConfig(valid).csrfSecret;
    expect(a).toHaveLength(64);
    expect(loadConfig(valid).csrfSecret).not.toBe(a);
  });

  it('falla de forma legible si falta DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrowError(/DATABASE_URL/);
  });

  it('convierte PORT a número y rechaza valores inválidos', () => {
    expect(loadConfig({ ...valid, PORT: '8080' }).port).toBe(8080);
    expect(() => loadConfig({ ...valid, PORT: 'abc' })).toThrowError(/PORT/);
  });

  it('el prefijo de las etiquetas de activo es INV por defecto y se valida (D6)', () => {
    expect(loadConfig(valid).assetTagPrefix).toBe('INV');
    expect(loadConfig({ ...valid, ASSET_TAG_PREFIX: 'ZEN' }).assetTagPrefix).toBe('ZEN');
    expect(() => loadConfig({ ...valid, ASSET_TAG_PREFIX: 'con espacio' })).toThrowError(
      /ASSET_TAG_PREFIX/,
    );
  });

  it('valida APP_TIMEZONE como zona horaria IANA', () => {
    expect(loadConfig({ ...valid, APP_TIMEZONE: 'America/Punta_Arenas' }).timezone).toBe(
      'America/Punta_Arenas',
    );
    expect(() => loadConfig({ ...valid, APP_TIMEZONE: 'Marte/Olimpo' })).toThrowError(
      /APP_TIMEZONE/,
    );
  });

  it('la moneda por defecto es CLP, configurable y validada', () => {
    expect(loadConfig(valid).defaultCurrency).toBe('CLP');
    expect(loadConfig({ ...valid, DEFAULT_CURRENCY: 'USD' }).defaultCurrency).toBe('USD');
    expect(() => loadConfig({ ...valid, DEFAULT_CURRENCY: 'ZZZ' })).toThrowError(
      /DEFAULT_CURRENCY/,
    );
  });

  it('marca isProduction según NODE_ENV', () => {
    expect(
      loadConfig({ ...valid, NODE_ENV: 'production', CSRF_SECRET: 'c'.repeat(32) }).isProduction,
    ).toBe(true);
  });

  it('trata METRICS_TOKEN vacío como ausente', () => {
    expect(loadConfig({ ...valid, METRICS_TOKEN: '' }).metricsToken).toBeUndefined();
    expect(loadConfig({ ...valid, METRICS_TOKEN: 'abc' }).metricsToken).toBe('abc');
  });

  it('trae valores seguros de sesión y bloqueo por defecto', () => {
    const c = loadConfig(valid);
    expect(c.session.idleTimeoutSeconds).toBe(8 * 3600);
    expect(c.session.absoluteTimeoutSeconds).toBe(24 * 3600);
    expect(c.session.cookieSecure).toBe(false);
    expect(c.login.maxFailuresPerAccount).toBe(5);
    expect(c.login.maxFailuresPerIp).toBe(20);
  });

  it('la cookie es Secure por defecto en producción y se puede forzar', () => {
    expect(
      loadConfig({ ...valid, NODE_ENV: 'production', CSRF_SECRET: 'c'.repeat(32) }).session
        .cookieSecure,
    ).toBe(true);
    expect(
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        CSRF_SECRET: 'c'.repeat(32),
        SESSION_COOKIE_SECURE: 'false',
      }).session.cookieSecure,
    ).toBe(false);
  });

  it('rechaza un timeout de sesión no positivo', () => {
    expect(() => loadConfig({ ...valid, SESSION_IDLE_TIMEOUT_SECONDS: '0' })).toThrowError(
      /SESSION_IDLE_TIMEOUT_SECONDS/,
    );
  });
});
