import { expect } from 'vitest';
import { LnsOperationError } from './adapter.js';

/** Espera que la promesa falle con un `LnsOperationError` y lo devuelve para inspeccionarlo. */
export async function rejection(promise: Promise<unknown>): Promise<LnsOperationError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(LnsOperationError);
    return e as LnsOperationError;
  }
  throw new Error('la operación debía fallar y no falló');
}
