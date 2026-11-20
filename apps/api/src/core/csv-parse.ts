/**
 * Lee un CSV (RFC 4180): campos entre comillas con `""` escapadas, saltos de línea dentro de comillas, LF o CRLF y BOM
 * inicial. Devuelve las filas como listas de celdas; no interpreta cabeceras. Las filas totalmente vacías se omiten.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Excel en español exporta con `;`; se acepta si la primera línea no trae comas.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let touched = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (touched || row.some((c) => c !== '')) rows.push(row);
    row = [];
    touched = false;
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
      touched = true;
    } else if (ch === sep) {
      endCell();
      touched = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      endRow();
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0 || touched) endRow();
  return rows;
}
