import { describe, expect, it } from 'vitest';
import { currentPlace } from './place';

const t = (key: string, p?: Record<string, unknown>) =>
  key === 'assets.withPerson' ? `Con ${String(p?.['name'])}` : key;
const ref = (name: string) => ({ id: '018f0000-0000-7000-8000-000000000001', name });

describe('currentPlace (RF-23)', () => {
  it('prefiere la ubicación actual', () => {
    expect(currentPlace({ location: ref('Bodega'), assignedUser: null }, t)).toBe('Bodega');
  });
  it('con una persona dice «Con <nombre>»', () => {
    expect(currentPlace({ location: null, assignedUser: ref('Tomás') }, t)).toBe('Con Tomás');
  });
  it('sin nada, «sin ubicación»', () => {
    expect(currentPlace({ location: null, assignedUser: null }, t)).toBe('assets.noLocation');
  });
});
