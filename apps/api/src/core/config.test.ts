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
});
