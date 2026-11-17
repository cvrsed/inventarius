/**
 * Formato único de fechas de la app: `dd-mm-aaaa HH:mm` (24 h) en la zona horaria de la instalación.
 * Las fechas llegan de la API en UTC (RNF-05); la zona sale de `APP_TIMEZONE` vía `/api/v1/settings`.
 */
const DEFAULT_TIMEZONE = 'America/Santiago';
const MISSING = '—';

let timezone = DEFAULT_TIMEZONE;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Fija los ajustes de formato; se llama al cargar la sesión. */
export function setFormatSettings(settings: { timezone: string }): void {
  timezone = isValidTimezone(settings.timezone) ? settings.timezone : DEFAULT_TIMEZONE;
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('es-CL', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('es-CL', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

function parts(value: string | Date | null | undefined): Record<string, string> | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}

/** `15-06-2026 11:05`. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p['day']}-${p['month']}-${p['year']} ${p['hour']}:${p['minute']}` : MISSING;
}

/** `15-06-2026`, a partir de un instante. */
export function formatDate(value: string | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p['day']}-${p['month']}-${p['year']}` : MISSING;
}

/** `05-03-2026` a partir de `2026-03-05`: es un día de calendario, no un instante, así que no se convierte de zona. */
export function formatDateOnly(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : MISSING;
}
