import { CATEGORY_EXTENSIONS, LOCATION_TYPES, STATUS_KINDS } from './catalog.js';
import {
  LORAWAN_CLASSES,
  LORAWAN_REGIONAL_PARAMETERS,
  LORAWAN_REGIONS,
  LORAWAN_VERSIONS,
} from './lorawan.js';

/** Tipo de destino de una asignación (campo `assignedToType` del diff). */
export const ASSIGNEE_TYPES = ['user', 'location'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

/**
 * Campos del diff de auditoría cuyo valor es una enumeración, con todos sus valores posibles. La web traduce cada
 * uno (mapa `AUDIT_VALUE_LABELS`) y un test falla si falta alguna traducción.
 */
export const AUDIT_ENUM_FIELDS = {
  assignedToType: ASSIGNEE_TYPES,
  kind: STATUS_KINDS,
  type: LOCATION_TYPES,
  extension: CATEGORY_EXTENSIONS,
  lorawanClass: LORAWAN_CLASSES,
  lorawanRegion: LORAWAN_REGIONS,
  lorawanVersion: LORAWAN_VERSIONS,
  lorawanRegionalParameters: LORAWAN_REGIONAL_PARAMETERS,
} as const;
export type AuditEnumField = keyof typeof AUDIT_ENUM_FIELDS;

/**
 * Acciones y entidades que registra la auditoría (RF-30). Es la única lista: el API solo puede registrar
 * valores de aquí (lo exige el tipo) y la web tiene un test que falla si falta alguna traducción.
 */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.change_password',
  'user.create',
  'user.create_initial_admin',
  'user.update',
  'user.deactivate',
  'user.reset_password',
  'role.create',
  'role.update',
  'role.delete',
  'category.create',
  'category.update',
  'category.delete',
  'manufacturer.create',
  'manufacturer.update',
  'manufacturer.delete',
  'model.create',
  'model.update',
  'model.delete',
  'location.create',
  'location.update',
  'location.delete',
  'status_label.create',
  'status_label.update',
  'status_label.delete',
  'asset.create',
  'asset.batch_create',
  'asset.update',
  'asset.status_change',
  'asset.checkout',
  'asset.checkin',
  'asset.delete',
  'asset.restore',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = [
  'user',
  'role',
  'asset',
  'asset_batch',
  'category',
  'manufacturer',
  'model',
  'location',
  'status_label',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
