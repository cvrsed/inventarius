import type { AuditEntryDto } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { recordLink } from './record';

const entry = (over: Partial<AuditEntryDto>): AuditEntryDto => ({
  id: '1',
  at: '2026-11-16T12:00:00.000Z',
  actorId: null,
  actorName: null,
  actorLabel: null,
  action: 'x',
  entity: 'asset',
  entityId: 'abc',
  entityLabel: 'INV-1 Algo',
  entityLinkable: true,
  diff: null,
  ip: null,
  ...over,
});

describe('recordLink [P40]', () => {
  it('el activo vigente lleva a su ficha', () => {
    expect(recordLink(entry({}))).toEqual({ name: 'asset', params: { id: 'abc' } });
  });

  it('un registro borrado, dado de baja o sin id no tiene enlace', () => {
    expect(recordLink(entry({ entityLinkable: false }))).toBeNull();
    expect(recordLink(entry({ entityId: null }))).toBeNull();
    expect(recordLink(entry({ entity: 'asset_batch' }))).toBeNull();
  });

  it('el catálogo lleva a su sección buscando el nombre; usuarios y roles, a su listado', () => {
    expect(recordLink(entry({ entity: 'status_label', entityLabel: 'Disponible' }))).toEqual({
      name: 'catalog',
      params: { section: 'statuses' },
      query: { q: 'Disponible' },
    });
    expect(recordLink(entry({ entity: 'user' }))).toEqual({ name: 'users' });
    expect(recordLink(entry({ entity: 'role' }))).toEqual({ name: 'roles' });
  });
});
