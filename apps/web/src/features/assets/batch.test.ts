import { describe, expect, it } from 'vitest';
import {
  emptyBatchForm,
  parseQuantity,
  parseSerials,
  toBatchPayload,
  validateBatch,
} from './batch';

const opt = (id: string) => ({ id, name: id });
const valid = {
  ...emptyBatchForm(),
  model: opt('m'),
  baseLocation: opt('l'),
  status: opt('s'),
  quantity: '3',
};

describe('alta en lote (RF-27)', () => {
  it('parsea las series: una por línea, sin vacías ni espacios', () => {
    expect(parseSerials(' A1 \r\n\nB2\n  \nC3')).toEqual(['A1', 'B2', 'C3']);
    expect(parseSerials('')).toEqual([]);
  });

  it('la cantidad es un entero de 1 a 500', () => {
    expect(parseQuantity('1')).toBe(1);
    expect(parseQuantity(' 500 ')).toBe(500);
    for (const bad of ['', '0', '501', '2,5', '-1', 'abc']) expect(parseQuantity(bad)).toBeNull();
  });

  it('exige modelo, bodega, estado y cantidad válida', () => {
    expect(Object.keys(validateBatch(emptyBatchForm())).sort()).toEqual([
      'baseLocation',
      'model',
      'quantity',
      'status',
    ]);
    expect(validateBatch(valid)).toEqual({});
  });

  it('si hay series, la cantidad debe coincidir', () => {
    expect(validateBatch({ ...valid, serials: 'A\nB' }).serials).toBe(
      'assets.batch.serialsMismatch',
    );
    expect(validateBatch({ ...valid, serials: 'A\nB\nC' })).toEqual({});
  });

  it('el cuerpo omite lo opcional vacío', () => {
    expect(toBatchPayload(valid)).toEqual({
      modelId: 'm',
      quantity: 3,
      baseLocationId: 'l',
      statusId: 's',
    });
    expect(toBatchPayload({ ...valid, name: ' Sensor ', serials: 'A\nB\nC' })).toMatchObject({
      name: 'Sensor',
      serials: ['A', 'B', 'C'],
    });
  });
});
