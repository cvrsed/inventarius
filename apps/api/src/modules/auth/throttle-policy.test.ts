import { describe, expect, it } from 'vitest';
import { lockSeconds } from './throttle-policy.js';

describe('lockSeconds (bloqueo progresivo, RF-05)', () => {
  const opts = { max: 5, baseSeconds: 60, capSeconds: 1800 };

  it('no bloquea antes del umbral', () => {
    expect(lockSeconds(1, opts)).toBe(0);
    expect(lockSeconds(4, opts)).toBe(0);
  });

  it('bloquea el tiempo base al llegar al umbral', () => {
    expect(lockSeconds(5, opts)).toBe(60);
  });

  it('duplica con cada fallo adicional', () => {
    expect(lockSeconds(6, opts)).toBe(120);
    expect(lockSeconds(7, opts)).toBe(240);
  });

  it('respeta el tope', () => {
    expect(lockSeconds(20, opts)).toBe(1800);
    expect(lockSeconds(10_000, opts)).toBe(1800);
  });
});
