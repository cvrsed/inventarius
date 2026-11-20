import { CATEGORY_EXTENSIONS, CATEGORY_SCOPES, LOCATION_TYPES, STATUS_KINDS } from './catalog.js';
import { ADJUSTMENT_DIRECTIONS, ADJUSTMENT_REASONS, MOVEMENT_KINDS } from './consumables.js';
import {
  LORAWAN_CLASSES,
  LORAWAN_REGIONAL_PARAMETERS,
  LORAWAN_REGIONS,
  LORAWAN_VERSIONS,
} from './lorawan.js';

/** Tipo de destino de una asignación (campo `assignedToType` del diff). */
export const ASSIGNEE_TYPES = ['user', 'location'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

/** Situación de un activo respecto de su vida útil en el inventario (alta vigente o dado de baja). */
export const ASSET_SITUATIONS = ['vigente', 'baja'] as const;
export type AssetSituation = (typeof ASSET_SITUATIONS)[number];

/** Origen de un dispositivo en el LNS: lo creó Inventarius o ya existía y se vinculó. */
export const LNS_ORIGINS = ['created', 'linked'] as const;
/** Componentes de un LNS que pueden quedar huérfanos tras un registro fallido (`device` en ChirpStack; IS/JS/NS/AS en TTN). */
export const LNS_COMPONENTS = ['device', 'is', 'js', 'ns', 'as'] as const;
/** Claves de un dispositivo LoRaWAN (campo `keys` al revelarlas). */
export const LORAWAN_KEY_NAMES = ['appKey', 'nwkKey'] as const;

/**
 * Campos del diff de auditoría cuyo valor es una enumeración, con todos sus valores posibles. La web traduce cada
 * uno (mapa `AUDIT_VALUE_LABELS`) y un test falla si falta alguna traducción.
 */
export const AUDIT_ENUM_FIELDS = {
  assignedToType: ASSIGNEE_TYPES,
  situation: ASSET_SITUATIONS,
  kind: STATUS_KINDS,
  type: LOCATION_TYPES,
  extension: CATEGORY_EXTENSIONS,
  lorawanClass: LORAWAN_CLASSES,
  lorawanRegion: LORAWAN_REGIONS,
  lorawanVersion: LORAWAN_VERSIONS,
  lorawanRegionalParameters: LORAWAN_REGIONAL_PARAMETERS,
  deviceClass: LORAWAN_CLASSES,
  region: LORAWAN_REGIONS,
  origin: LNS_ORIGINS,
  orphans: LNS_COMPONENTS,
  keys: LORAWAN_KEY_NAMES,
  scope: CATEGORY_SCOPES,
  direction: ADJUSTMENT_DIRECTIONS,
  /** El motivo de una baja o de una anulación es texto libre; solo los del ajuste se traducen. */
  reason: ADJUSTMENT_REASONS,
  originalKind: MOVEMENT_KINDS,
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
  'lorawan.update',
  'lorawan.reveal_keys',
  'lorawan.import',
  'lns_profile.create',
  'lns_profile.update',
  'lns_profile.delete',
  'lns.register',
  'lns.registered',
  'lns.register_failed',
  'lns.deregister',
  'lns.deregistered',
  'lns.link',
  'lns.unlink',
  'lns.cancel',
  'measure_unit.create',
  'measure_unit.update',
  'measure_unit.delete',
  'consumable.create',
  'consumable.update',
  'consumable.delete',
  'consumable.receive',
  'consumable.deliver',
  'consumable.return',
  'consumable.adjust',
  'consumable.transfer',
  'consumable.reverse',
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
  'lns_profile',
  'lorawan_import',
  'measure_unit',
  'consumable',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
