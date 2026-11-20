import { Writable } from 'node:stream';
import { status, type ServiceError } from '@grpc/grpc-js';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { LnsOperationError } from '../modules/lns/adapter.js';
import { buildLoggerOptions } from './logger.js';

const config = { logLevel: 'info' } as Parameters<typeof buildLoggerOptions>[0];

function logError(err: unknown): Record<string, unknown> {
  let out = '';
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  pino(buildLoggerOptions(config), sink).error({ err, registrationId: 'r1' }, 'falla del LNS');
  return JSON.parse(out) as Record<string, unknown>;
}

describe('logger: errores del LNS', () => {
  it('serializa err.cause.details para diagnosticar y no filtra credenciales', () => {
    const cause = Object.assign(new Error('13 INTERNAL: detalle'), {
      code: status.INTERNAL,
      details: 'violates foreign key constraint "device_dp_fkey"',
    }) as ServiceError;
    const err = new LnsOperationError('ChirpStack respondió con un error interno', {
      transient: true,
      cause,
    });
    const line = logError(err);
    expect(JSON.stringify(line)).toContain('device_dp_fkey');
    expect(JSON.stringify(line)).not.toContain('clave-api-de-prueba');
  });
});
