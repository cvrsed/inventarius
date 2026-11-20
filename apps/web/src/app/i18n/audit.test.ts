import { AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_ENUM_FIELDS } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_LABELS,
  auditFieldLabel,
  auditValueLabel,
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

  it('los campos que hoy registra el backend tienen nombre en español', () => {
    const fields = [
      'email',
      'name',
      'active',
      'roles',
      'description',
      'permissions',
      'assetTag',
      'serial',
      'model',
      'status',
      'location',
      'baseLocation',
      'purchaseDate',
      'purchaseCost',
      'purchaseCurrency',
      'supplier',
      'warrantyMonths',
      'notes',
      'assignedTo',
      'expectedReturnOn',
      'returnedTo',
      'note',
      'reason',
      'count',
      'batchId',
      'extension',
      'modelNumber',
      'manufacturer',
      'category',
      'path',
      'type',
      'address',
      'kind',
      'lorawanClass',
      'lorawanRegion',
      'lorawanVersion',
      'lorawanRegionalParameters',
      'devEui',
      'joinEui',
      'region',
      'deviceClass',
      'profile',
      'externalId',
      'error',
      'origin',
      'serials',
      'target',
      'deviceDefaults',
      'orphans',
      'keys',
      'tenantId',
      'applicationId',
      'deviceProfileId',
      'appKey',
      'nwkKey',
      'scope',
      'plural',
      'abbreviation',
      'decimals',
      'unit',
      'minStock',
      'warehouseMinimums',
      'quantity',
      'stockBefore',
      'stockAfter',
      'recipient',
      'recipientRef',
      'direction',
      'fromLocation',
      'toLocation',
      'originalKind',
      'receivedOn',
    ];
    for (const f of fields) expect(auditFieldLabel(f), f).not.toBe(f);
  });

  it('todo valor de un campo enumerado tiene traducción y no se muestra el código [P29]', () => {
    for (const [field, values] of Object.entries(AUDIT_ENUM_FIELDS)) {
      for (const value of values as readonly string[]) {
        const label = auditValueLabel(field, value);
        expect(label, `falta traducir ${field} = ${value}`).toBeTruthy();
        if (
          field === 'assignedToType' ||
          field === 'kind' ||
          field === 'type' ||
          field === 'extension' ||
          field === 'origin' ||
          field === 'orphans'
        ) {
          expect(label).not.toBe(value);
        }
      }
    }
  });

  it('«Tipo de LNS» y sus valores dependen de la entidad: un perfil LNS no es un estado del catálogo', () => {
    expect(auditFieldLabel('kind', 'lns_profile')).toBe('Tipo de LNS');
    expect(auditFieldLabel('kind', 'status_label')).toBe('Tipo de estado');
    expect(auditValueLabel('kind', 'chirpstack', 'lns_profile')).toBe('ChirpStack');
    expect(auditValueLabel('kind', 'ttn', 'lns_profile')).toBe('TTN');
    expect(auditValueLabel('kind', 'ttn')).toBeUndefined();
  });

  it('el motivo de un ajuste se traduce y el de una anulación (texto libre) se deja tal cual', () => {
    expect(auditValueLabel('reason', 'physical_count')).toBe('Conteo físico');
    expect(auditValueLabel('reason', 'Se ingresó dos veces')).toBeUndefined();
  });

  it('un valor desconocido no tiene traducción (se mostrará tal cual)', () => {
    expect(auditValueLabel('assignedToType', 'otro')).toBeUndefined();
    expect(auditValueLabel('name', 'x')).toBeUndefined();
  });
});
