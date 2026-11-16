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
  diff,
  ip: null,
});

describe('describeEntry', () => {
  it('una modificación lista los campos con antes y después', () => {
    const d = describeEntry(
      entry('asset.update', {
        before: { name: 'A', notes: null },
        after: { name: 'B', notes: 'x' },
      }),
    );
    expect(d.key).toBe('update');
    expect(d.changes).toEqual([
      { field: 'name', before: 'A', after: 'B' },
      { field: 'notes', before: null, after: 'x' },
    ]);
  });

  it('la asignación nombra el destino y muestra nota y fecha esperada', () => {
    const d = describeEntry(
      entry('asset.checkout', {
        before: { status: 'Disponible' },
        after: { status: 'Asignado', assignedTo: 'Tomás', note: 'sale', expectedReturnOn: null },
      }),
    );
    expect(d.key).toBe('checkout');
    expect(d.params).toEqual({ to: 'Tomás' });
    expect(d.changes.map((c) => c.field)).toEqual(['status', 'note']);
  });

  it('la creación no lista cambios; el motivo de baja sí', () => {
    expect(describeEntry(entry('asset.create', { after: { name: 'X' } })).changes).toEqual([]);
    const del = describeEntry(entry('asset.delete', { after: { reason: 'Robo' } }));
    expect(del.changes).toEqual([{ field: 'reason', before: null, after: 'Robo' }]);
  });

  it('una acción desconocida cae en una clave genérica y tolera diff nulo', () => {
    expect(describeEntry(entry('asset.raro', null))).toMatchObject({ key: 'update', changes: [] });
  });
});
