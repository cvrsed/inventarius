import { describe, expect, it } from 'vitest';
import { localDate } from './clock.js';

describe('localDate', () => {
  it('usa la zona horaria, no UTC', () => {
    const instant = new Date('2026-11-17T01:30:00Z'); // 22:30 del 16 en Chile (UTC-3)
    expect(localDate(instant, 'America/Santiago')).toBe('2026-11-16');
    expect(localDate(instant, 'UTC')).toBe('2026-11-17');
  });
  it('cambia de día con el horario de verano', () => {
    expect(localDate(new Date('2026-01-15T02:59:00Z'), 'America/Santiago')).toBe('2026-01-14');
    expect(localDate(new Date('2026-06-15T03:59:00Z'), 'America/Santiago')).toBe('2026-06-14');
    expect(localDate(new Date('2026-06-15T04:00:00Z'), 'America/Santiago')).toBe('2026-06-15');
  });
});
