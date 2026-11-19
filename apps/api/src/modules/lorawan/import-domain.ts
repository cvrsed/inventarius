import {
  appKeySchema,
  devEuiSchema,
  joinEuiSchema,
  lorawanClassSchema,
  lorawanRegionSchema,
  lorawanVersionSchema,
  nwkKeySchema,
  type UpdateLorawanInput,
} from '@inventarius/shared';
import { parseCsv } from '../../core/csv-parse.js';

/** Tope de filas por archivo: la vista previa y la transacción se mantienen acotadas. */
export const MAX_IMPORT_ROWS = 2000;

const REQUIRED = ['serial', 'devEui', 'joinEui', 'appKey'] as const;

/** Nombres de columna aceptados (se comparan sin mayúsculas, espacios ni signos). */
const HEADER_ALIASES: Record<string, string> = {
  serial: 'serial',
  serie: 'serial',
  numerodeserie: 'serial',
  deveui: 'devEui',
  joineui: 'joinEui',
  appeui: 'joinEui',
  appkey: 'appKey',
  nwkkey: 'nwkKey',
  class: 'deviceClass',
  clase: 'deviceClass',
  deviceclass: 'deviceClass',
  version: 'lorawanVersion',
  lorawanversion: 'lorawanVersion',
  region: 'region',
};

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export interface ParsedImportRow {
  line: number;
  serial: string;
  /** Cambio a aplicar; solo trae los campos presentes y válidos. */
  data: UpdateLorawanInput;
  errors: string[];
}

export interface ParsedImport {
  rows: ParsedImportRow[];
  fileErrors: string[];
}

/** Valida un campo con su esquema y deja el mensaje en `errors` si no cumple. */
function field<T>(
  value: string,
  schema: { safeParse(v: string): { success: true; data: T } | { success: false } },
  message: string,
  errors: string[],
): T | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  errors.push(message);
  return undefined;
}

/**
 * Interpreta el CSV de la importación (RF-66): cabecera, formato de cada campo y series repetidas en el archivo.
 * No consulta la base: las comprobaciones que dependen de los activos las hace el servicio.
 */
export function parseLorawanImport(csv: string): ParsedImport {
  const table = parseCsv(csv);
  const fileErrors: string[] = [];
  const header = table[0];
  if (!header) return { rows: [], fileErrors: ['El archivo está vacío'] };

  const columns = new Map<string, number>();
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[fold(h)];
    if (key && !columns.has(key)) columns.set(key, i);
  });
  const missing = REQUIRED.filter((c) => !columns.has(c));
  if (missing.length) {
    fileErrors.push(`Faltan columnas obligatorias: ${missing.join(', ')}`);
  }
  const body = table.slice(1);
  if (body.length === 0) fileErrors.push('El archivo no tiene filas de datos');
  if (body.length > MAX_IMPORT_ROWS) {
    fileErrors.push(`El archivo tiene más de ${MAX_IMPORT_ROWS} filas; divídelo en partes`);
  }
  if (fileErrors.length) return { rows: [], fileErrors };

  const cell = (r: string[], key: string) => (r[columns.get(key) ?? -1] ?? '').trim();
  const rows: ParsedImportRow[] = body.map((r, i) => {
    const errors: string[] = [];
    const data: UpdateLorawanInput = {};
    const serial = cell(r, 'serial');
    if (!serial) errors.push('Falta el número de serie');
    const devEui = field(
      cell(r, 'devEui'),
      devEuiSchema,
      'DevEUI inválido (16 caracteres hexadecimales)',
      errors,
    );
    if (devEui) data.devEui = devEui;
    const joinEui = field(
      cell(r, 'joinEui'),
      joinEuiSchema,
      'JoinEUI inválido (16 caracteres hexadecimales)',
      errors,
    );
    if (joinEui) data.joinEui = joinEui;
    const appKey = field(
      cell(r, 'appKey'),
      appKeySchema,
      'AppKey inválida (32 caracteres hexadecimales)',
      errors,
    );
    if (appKey) data.appKey = appKey;
    const nwk = cell(r, 'nwkKey');
    if (nwk) {
      const v = field(nwk, nwkKeySchema, 'NwkKey inválida (32 caracteres hexadecimales)', errors);
      if (v) data.nwkKey = v;
    }
    const cls = cell(r, 'deviceClass').toUpperCase();
    if (cls) {
      const v = field(cls, lorawanClassSchema, 'Clase inválida (A, B o C)', errors);
      if (v) data.deviceClass = v;
    }
    const version = cell(r, 'lorawanVersion');
    if (version) {
      const v = field(version, lorawanVersionSchema, 'Versión LoRaWAN inválida', errors);
      if (v) data.lorawanVersion = v;
    }
    const region = cell(r, 'region').toUpperCase();
    if (region) {
      const v = field(region, lorawanRegionSchema, 'Región inválida', errors);
      if (v) data.region = v;
    }
    return { line: i + 2, serial, data, errors };
  });

  flagRepeats(rows, (r) => r.serial.toLowerCase(), 'Número de serie repetido en el archivo');
  flagRepeats(rows, (r) => r.data.devEui ?? '', 'DevEUI repetido en el archivo');
  return { rows, fileErrors };
}

function flagRepeats(
  rows: ParsedImportRow[],
  keyOf: (r: ParsedImportRow) => string,
  message: string,
): void {
  const seen = new Map<string, ParsedImportRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k) seen.set(k, [...(seen.get(k) ?? []), r]);
  }
  for (const group of seen.values()) {
    if (group.length > 1) for (const r of group) r.errors.push(message);
  }
}
