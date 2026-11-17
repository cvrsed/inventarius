import { beforeEach, describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDateOnly, setFormatSettings } from './format';

describe('formato de fechas (dd-mm-aaaa HH:mm, 24 h)', () => {
  beforeEach(() => setFormatSettings({ timezone: 'America/Santiago' }));

  it('muestra instantes UTC en la zona configurada', () => {
    // Enero: verano chileno (UTC-3).
    expect(formatDateTime('2026-01-15T15:05:00.000Z')).toBe('15-01-2026 12:05');
    // Junio: invierno (UTC-4).
    expect(formatDateTime('2026-06-15T15:05:00.000Z')).toBe('15-06-2026 11:05');
  });

  it('usa 24 horas: medianoche es 00:00 y la tarde 15:30', () => {
    expect(formatDateTime('2026-06-15T04:00:00.000Z')).toBe('15-06-2026 00:00');
    expect(formatDateTime('2026-06-15T19:30:00.000Z')).toBe('15-06-2026 15:30');
  });

  it('cambia con la zona configurada', () => {
    setFormatSettings({ timezone: 'UTC' });
    expect(formatDateTime('2026-06-15T15:05:00.000Z')).toBe('15-06-2026 15:05');
    setFormatSettings({ timezone: 'Asia/Tokyo' });
    expect(formatDateTime('2026-06-15T15:05:00.000Z')).toBe('16-06-2026 00:05');
  });

  it('formatDate muestra solo la fecha en la zona configurada', () => {
    expect(formatDate('2026-06-16T02:00:00.000Z')).toBe('15-06-2026');
  });

  it('una fecha sin hora (AAAA-MM-DD) no se desplaza por zona horaria', () => {
    setFormatSettings({ timezone: 'Pacific/Kiritimati' });
    expect(formatDateOnly('2026-03-05')).toBe('05-03-2026');
  });

  it('valores vacíos o inválidos se muestran como guion', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('no es fecha')).toBe('—');
    expect(formatDateOnly(undefined)).toBe('—');
  });

  it('una zona inválida cae en la de Chile en vez de romper la pantalla', () => {
    setFormatSettings({ timezone: 'Marte/Olimpo' });
    expect(formatDateTime('2026-01-15T15:05:00.000Z')).toBe('15-01-2026 12:05');
  });
});
