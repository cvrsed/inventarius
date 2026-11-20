import { describe, expect, it } from 'vitest';
import { failureDetail } from './connection';

const label = (n: string) => n.toUpperCase();

describe('failureDetail', () => {
  it('sin fallas no hay detalle', () => {
    expect(failureDetail([{ name: 'a', ok: true, detail: null }], label)).toBe('');
  });

  it('todas fallan por la misma causa: un solo mensaje', () => {
    const checks = ['tenant', 'application', 'deviceProfile'].map((name) => ({
      name,
      ok: false,
      detail: 'No se pudo conectar con ChirpStack',
    }));
    expect(failureDetail(checks, label)).toBe('No se pudo conectar con ChirpStack');
  });

  it('causas distintas: detalle por elemento', () => {
    const checks = [
      { name: 'tenant', ok: true, detail: null },
      { name: 'application', ok: false, detail: 'no encontró' },
      { name: 'deviceProfile', ok: false, detail: 'sin permisos' },
    ];
    expect(failureDetail(checks, label)).toBe(
      'APPLICATION: no encontró · DEVICEPROFILE: sin permisos',
    );
  });

  it('falla solo una de varias: se nombra cuál', () => {
    const checks = [
      { name: 'tenant', ok: true, detail: null },
      { name: 'application', ok: false, detail: 'no encontró' },
    ];
    expect(failureDetail(checks, label)).toBe('APPLICATION: no encontró');
  });

  it('una única verificación (TTN) que falla: solo el mensaje', () => {
    expect(failureDetail([{ name: 'application', ok: false, detail: 'x' }], label)).toBe('x');
  });
});
