import { describe, expect, it } from 'vitest';
import { csrfToken, csrfTokenValid, newAnonymousBinding } from './csrf.js';

const SECRET = 'a'.repeat(32);

describe('token CSRF firmado y ligado [P34]', () => {
  it('es determinista para el mismo secreto y vínculo, y distinto entre vínculos', () => {
    expect(csrfToken(SECRET, 'sesion-1')).toBe(csrfToken(SECRET, 'sesion-1'));
    expect(csrfToken(SECRET, 'sesion-1')).not.toBe(csrfToken(SECRET, 'sesion-2'));
  });

  it('valida solo con el mismo vínculo y el mismo secreto', () => {
    const token = csrfToken(SECRET, 'sesion-1');
    expect(csrfTokenValid(SECRET, 'sesion-1', token)).toBe(true);
    expect(csrfTokenValid(SECRET, 'sesion-2', token)).toBe(false);
    expect(csrfTokenValid('b'.repeat(32), 'sesion-1', token)).toBe(false);
  });

  it('rechaza token o vínculo ausentes, vacíos o manipulados', () => {
    const token = csrfToken(SECRET, 'sesion-1');
    expect(csrfTokenValid(SECRET, undefined, token)).toBe(false);
    expect(csrfTokenValid(SECRET, 'sesion-1', undefined)).toBe(false);
    expect(csrfTokenValid(SECRET, '', token)).toBe(false);
    expect(csrfTokenValid(SECRET, 'sesion-1', '')).toBe(false);
    expect(csrfTokenValid(SECRET, 'sesion-1', `${token}x`)).toBe(false);
    expect(csrfTokenValid(SECRET, 'sesion-1', token.slice(0, -1))).toBe(false);
  });

  it('el vínculo anónimo es aleatorio', () => {
    expect(newAnonymousBinding()).not.toBe(newAnonymousBinding());
    expect(newAnonymousBinding().length).toBeGreaterThanOrEqual(43);
  });
});
