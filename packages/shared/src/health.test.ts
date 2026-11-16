import { describe, expect, it } from 'vitest';
import { liveResponseSchema, overallStatus, readyResponseSchema } from './health.js';

describe('health schemas', () => {
  it('acepta la respuesta live', () => {
    expect(liveResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rechaza una respuesta ready con un estado desconocido', () => {
    const result = readyResponseSchema.safeParse({
      status: 'ok',
      checks: { database: 'maybe', queue: 'up' },
    });
    expect(result.success).toBe(false);
  });

  it('overallStatus es ok solo si todo está arriba', () => {
    expect(overallStatus({ database: 'up', queue: 'up' })).toBe('ok');
    expect(overallStatus({ database: 'up', queue: 'down' })).toBe('degraded');
  });
});
