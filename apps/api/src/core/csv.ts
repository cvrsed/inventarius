export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let text = String(value);
  // Una celda que empieza con = + - @ se interpreta como fórmula al abrir el CSV en una planilla.
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Una fila CSV (RFC 4180) terminada en CRLF, con protección contra inyección de fórmulas. */
export function csvRow(cells: readonly CsvCell[]): string {
  return `${cells.map(cell).join(',')}\r\n`;
}
