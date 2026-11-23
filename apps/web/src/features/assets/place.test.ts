import { describe, expect, it } from 'vitest';
import { currentPlace, placeTitle } from './place';

const t = (key: string, p?: Record<string, unknown>) =>
  key === 'assets.withPerson' ? `Con ${String(p?.['name'])}` : key;
const ref = (name: string) => ({ id: '018f0000-0000-7000-8000-000000000001', name });
const loc = (name: string, path = name) => ({ ...ref(name), path });

describe('currentPlace (RF-23)', () => {
  it('prefiere la ubicación actual', () => {
    expect(currentPlace({ location: loc('Bodega'), assignedUser: null }, t)).toBe('Bodega');
  });
  it('con una persona dice «Con <nombre>»', () => {
    expect(currentPlace({ location: null, assignedUser: ref('Tomás') }, t)).toBe('Con Tomás');
  });
  it('sin nada, «sin ubicación»', () => {
    expect(currentPlace({ location: null, assignedUser: null }, t)).toBe('assets.noLocation');
  });
});

describe('placeTitle (U6)', () => {
  it('con ubicación anidada, la ruta completa va en el tooltip y el texto sigue siendo el nombre corto', () => {
    const a = {
      location: loc('Rack 7', 'Chile > Cliente Norte > Sala 201 > Rack 7'),
      assignedUser: null,
    };
    expect(currentPlace(a, t)).toBe('Rack 7');
    expect(placeTitle(a)).toBe('Chile > Cliente Norte > Sala 201 > Rack 7');
  });
  it('sin padres no hay tooltip (no repite el nombre)', () => {
    expect(placeTitle({ location: loc('Bodega'), assignedUser: null })).toBeUndefined();
  });
  it('con una persona o sin ubicación no hay tooltip', () => {
    expect(placeTitle({ location: null, assignedUser: ref('Tomás') })).toBeUndefined();
    expect(placeTitle({ location: null, assignedUser: null })).toBeUndefined();
  });
});
