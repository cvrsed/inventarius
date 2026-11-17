import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  auditActionLabel,
  auditEntityLabel,
} from './audit';

describe('traducción de la auditoría (RNF-05)', () => {
  it('toda acción que el backend puede registrar tiene texto, y no es el código', () => {
    for (const action of AUDIT_ACTIONS) {
      const label = AUDIT_ACTION_LABELS[action];
      expect(label, `falta traducir la acción ${action}`).toBeTruthy();
      expect(label).not.toContain('.');
      expect(label).not.toContain('_');
    }
  });

  it('toda entidad tiene texto y el mapa no tiene claves sobrantes', () => {
    for (const entity of AUDIT_ENTITIES) {
      expect(AUDIT_ENTITY_LABELS[entity], `falta traducir la entidad ${entity}`).toBeTruthy();
    }
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect(Object.keys(AUDIT_ENTITY_LABELS).sort()).toEqual([...AUDIT_ENTITIES].sort());
  });

  it('textos acordados para las acciones de activos', () => {
    expect(auditActionLabel('asset.create')).toBe('Alta');
    expect(auditActionLabel('asset.batch_create')).toBe('Alta en lote');
    expect(auditActionLabel('asset.update')).toBe('Edición');
    expect(auditActionLabel('asset.checkout')).toBe('Asignación');
    expect(auditActionLabel('asset.checkin')).toBe('Devolución');
    expect(auditEntityLabel('asset_batch')).toBe('Activos');
  });

  it('un código desconocido se muestra tal cual en lugar de romper', () => {
    expect(auditActionLabel('futuro.accion')).toBe('futuro.accion');
  });
});
