import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv-parse.js';

describe('parseCsv', () => {
  it('lee filas simples con LF y CRLF', () => {
    expect(parseCsv('a,b\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
  it('respeta comillas, comas y saltos de línea dentro del campo', () => {
    expect(parseCsv('a,"x, ""y""",c\n"l1\nl2",2,3\n')).toEqual([
      ['a', 'x, "y"', 'c'],
      ['l1\nl2', '2', '3'],
    ]);
  });
  it('ignora el BOM y las líneas vacías; conserva celdas vacías', () => {
    expect(parseCsv('﻿a,b,c\n\n1,,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
  it('acepta punto y coma cuando la cabecera no usa comas', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('texto vacío no tiene filas', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
