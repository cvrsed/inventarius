import type { AuditEntryDto } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { describeEntry } from './history';

const entry = (action: string, diff: AuditEntryDto['diff']): AuditEntryDto => ({
  id: '1',
  at: '2026-11-16T12:00:00.000Z',
  actorId: null,
  actorName: 'Olga',
  actorLabel: null,
  action,
  entity: 'asset',
  entityId: null,
  entityLabel: null,
  entityLinkable: false,
  diff,
  ip: null,
});

const text = {
  t: (k: string) => ({ 'common.yes': 'Sí', 'common.no': 'No' })[k] ?? k,
  te: () => false,
};

describe('describeEntry', () => {
  it('una modificación lista los campos con nombre en español, antes y después', () => {
    const d = describeEntry(
      entry('asset.update', {
        before: { name: 'A', notes: null },
        after: { name: 'B', notes: 'x' },
      }),
      text,
    );
    expect(d.key).toBe('update');
    expect(d.rows).toEqual([
      { field: 'name', label: 'Nombre', before: 'A', after: 'B' },
      { field: 'notes', label: 'Notas', before: '—', after: 'x' },
    ]);
  });

  it('la asignación nombra el destino y muestra nota y fecha esperada solo si existen', () => {
    const d = describeEntry(
      entry('asset.checkout', {
        before: { status: 'Disponible' },
        after: { status: 'Asignado', assignedTo: 'Tomás', note: 'sale', expectedReturnOn: null },
      }),
      text,
    );
    expect(d.key).toBe('checkout');
    expect(d.params).toEqual({ to: 'Tomás' });
    expect(d.rows.map((r) => r.field)).toEqual(['status', 'note']);
  });

  it('la creación no lista cambios; el motivo de baja es valor simple y lo que cambió, antes → después', () => {
    expect(describeEntry(entry('asset.create', { after: { name: 'X' } }), text).rows).toEqual([]);
    const del = describeEntry(
      entry('asset.delete', {
        before: { situation: 'vigente' },
        after: { situation: 'baja', reason: 'Robo' },
      }),
      text,
    );
    expect(del.rows).toEqual([
      { field: 'situation', label: 'Situación', before: 'Vigente', after: 'Dado de baja' },
      { field: 'reason', label: 'Motivo', value: 'Robo' },
    ]);
  });

  it('una acción desconocida cae en una clave genérica y tolera diff nulo', () => {
    expect(describeEntry(entry('asset.raro', null), text)).toMatchObject({
      key: 'update',
      rows: [],
    });
  });
});
