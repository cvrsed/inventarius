import { describe, expect, it } from 'vitest';
import { csvRow } from './csv.js';

describe('csvRow', () => {
  it('separa por coma y termina con CRLF', () => {
    expect(csvRow(['a', 'b', null, 3])).toBe('a,b,,3\r\n');
  });

  it('entrecomilla comas, comillas y saltos de línea', () => {
    expect(csvRow(['a,b', 'di "hola"', 'l1\nl2'])).toBe('"a,b","di ""hola""","l1\nl2"\r\n');
  });

  it('neutraliza fórmulas de planilla (CSV injection)', () => {
    expect(csvRow(['=SUM(A1)', '+1', '-1', '@cmd', '\tx'])).toBe(
      "'=SUM(A1),'+1,'-1,'@cmd,'\tx\r\n",
    );
  });

  it('no altera un número negativo real', () => {
    expect(csvRow([-5])).toBe('-5\r\n');
  });
});
