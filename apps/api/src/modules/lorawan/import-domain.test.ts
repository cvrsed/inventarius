import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_ROWS, parseLorawanImport } from './import-domain.js';

const KEY = '00112233445566778899aabbccddeeff';
const head = 'serial,DevEUI,JoinEUI,AppKey';

describe('parseLorawanImport', () => {
  it('lee filas válidas y normaliza EUI y claves', () => {
    const out = parseLorawanImport(
      `${head},NwkKey,Clase,Versión,Región\nSN-1,00:11:22:33:44:55:66:77,8877665544332211,${KEY},${KEY},a,1.1,au915\n`,
    );
    expect(out.fileErrors).toEqual([]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      line: 2,
      serial: 'SN-1',
      errors: [],
      data: {
        devEui: '0011223344556677',
        joinEui: '8877665544332211',
        appKey: KEY.toUpperCase(),
        nwkKey: KEY.toUpperCase(),
        deviceClass: 'A',
        lorawanVersion: '1.1',
        region: 'AU915',
      },
    });
  });

  it('acepta alias de cabecera en español y el orden de columnas libre', () => {
    const out = parseLorawanImport(
      `AppKey,Número de serie,Join EUI,Dev EUI\n${KEY},SN-1,8877665544332211,0011223344556677`,
    );
    expect(out.rows[0]!.errors).toEqual([]);
    expect(out.rows[0]!.serial).toBe('SN-1');
  });

  it('informa por fila los formatos inválidos', () => {
    const out = parseLorawanImport(`${head},Clase\n,0011,XYZ,${KEY.slice(2)},D\n`);
    expect(out.rows[0]!.errors).toEqual([
      'Falta el número de serie',
      'DevEUI inválido (16 caracteres hexadecimales)',
      'JoinEUI inválido (16 caracteres hexadecimales)',
      'AppKey inválida (32 caracteres hexadecimales)',
      'Clase inválida (A, B o C)',
    ]);
  });

  it('marca series y DevEUI repetidos en todas las filas implicadas', () => {
    const row = (s: string, d: string) => `${s},${d},8877665544332211,${KEY}`;
    const out = parseLorawanImport(
      [
        head,
        row('A', '0000000000000001'),
        row('a', '0000000000000002'),
        row('B', '0000000000000002'),
      ].join('\n'),
    );
    expect(out.rows[0]!.errors).toEqual(['Número de serie repetido en el archivo']);
    expect(out.rows[1]!.errors).toEqual([
      'Número de serie repetido en el archivo',
      'DevEUI repetido en el archivo',
    ]);
    expect(out.rows[2]!.errors).toEqual(['DevEUI repetido en el archivo']);
  });

  it('errores del archivo: vacío, sin columnas obligatorias, sin datos y demasiado largo', () => {
    expect(parseLorawanImport('').fileErrors).toEqual(['El archivo está vacío']);
    expect(parseLorawanImport('serial,DevEUI\nA,1').fileErrors[0]).toMatch(/joinEui, appKey/);
    expect(parseLorawanImport(head).fileErrors).toEqual(['El archivo no tiene filas de datos']);
    const big = [head, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `S${i},,,`)].join(
      '\n',
    );
    expect(parseLorawanImport(big).fileErrors[0]).toMatch(/más de/);
  });
});
