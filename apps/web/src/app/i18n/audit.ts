import {
  type AUDIT_ENUM_FIELDS,
  LORAWAN_CLASS_OPTIONS,
  LORAWAN_REGION_OPTIONS,
  LORAWAN_REGIONAL_PARAMETERS_OPTIONS,
  LORAWAN_VERSION_OPTIONS,
  type AuditAction,
  type AuditEnumField,
  type AuditEntity,
} from '@inventarius/shared';
import { messages } from './es-CL';

/**
 * Único mapa de los códigos internos de auditoría a texto (RNF-05). Inicio, historial y auditoría lo usan:
 * ninguna pantalla muestra «asset.create». `Record<AuditAction, …>` hace que falte una traducción sea un
 * error de compilación, y `audit.test.ts` lo comprueba también en ejecución.
 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.login_failed': 'Intento de acceso fallido',
  'auth.logout': 'Cierre de sesión',
  'auth.change_password': 'Cambio de contraseña',
  'user.create': 'Alta de usuario',
  'user.create_initial_admin': 'Alta del administrador inicial',
  'user.update': 'Edición de usuario',
  'user.deactivate': 'Desactivación de usuario',
  'user.reset_password': 'Restablecimiento de contraseña',
  'role.create': 'Alta de rol',
  'role.update': 'Edición de rol',
  'role.delete': 'Eliminación de rol',
  'category.create': 'Alta de categoría',
  'category.update': 'Edición de categoría',
  'category.delete': 'Eliminación de categoría',
  'manufacturer.create': 'Alta de fabricante',
  'manufacturer.update': 'Edición de fabricante',
  'manufacturer.delete': 'Eliminación de fabricante',
  'model.create': 'Alta de modelo',
  'model.update': 'Edición de modelo',
  'model.delete': 'Eliminación de modelo',
  'location.create': 'Alta de ubicación',
  'location.update': 'Edición de ubicación',
  'location.delete': 'Eliminación de ubicación',
  'status_label.create': 'Alta de estado',
  'status_label.update': 'Edición de estado',
  'status_label.delete': 'Eliminación de estado',
  'asset.create': 'Alta',
  'asset.batch_create': 'Alta en lote',
  'asset.update': 'Edición',
  'asset.status_change': 'Cambio de estado',
  'asset.checkout': 'Asignación',
  'asset.checkin': 'Devolución',
  'asset.delete': 'Baja',
  'asset.restore': 'Restauración',
  'lorawan.update': 'Edición de datos LoRaWAN',
  'lorawan.reveal_keys': 'Revelado de claves LoRaWAN',
  'lorawan.import': 'Importación de datos LoRaWAN',
  'lns_profile.create': 'Alta de perfil LNS',
  'lns_profile.update': 'Edición de perfil LNS',
  'lns_profile.delete': 'Eliminación de perfil LNS',
  'lns.register': 'Registro en LNS solicitado',
  'lns.registered': 'Registrado en LNS',
  'lns.register_failed': 'Registro en LNS fallido',
  'lns.deregister': 'Baja en LNS solicitada',
  'lns.deregistered': 'Dado de baja en LNS',
  'lns.link': 'Vinculado a un dispositivo existente en LNS',
  'lns.unlink': 'Desvinculado del LNS (no se borró nada en el LNS)',
  'lns.cancel': 'Registro en LNS cancelado',
  'measure_unit.create': 'Alta de unidad de medida',
  'measure_unit.update': 'Edición de unidad de medida',
  'measure_unit.delete': 'Eliminación de unidad de medida',
  'consumable.create': 'Alta de consumible',
  'consumable.update': 'Edición de consumible',
  'consumable.delete': 'Eliminación de consumible',
  'consumable.receive': 'Ingreso a bodega',
  'consumable.deliver': 'Entrega',
  'consumable.return': 'Devolución',
  'consumable.adjust': 'Ajuste de stock',
  'consumable.transfer': 'Traslado entre bodegas',
  'consumable.reverse': 'Anulación de movimiento',
};

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  user: 'Usuario',
  role: 'Rol',
  asset: 'Activo',
  asset_batch: 'Activos',
  category: 'Categoría',
  manufacturer: 'Fabricante',
  model: 'Modelo',
  location: 'Ubicación',
  status_label: 'Estado',
  lns_profile: 'Perfil LNS',
  lorawan_import: 'Importación LoRaWAN',
  measure_unit: 'Unidad de medida',
  consumable: 'Consumible',
};

/** Texto de una acción; un código desconocido (p. ej. de una versión futura) se muestra tal cual. */
export const auditActionLabel = (action: string): string =>
  (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;

export const auditEntityLabel = (entity: string): string =>
  (AUDIT_ENTITY_LABELS as Record<string, string>)[entity] ?? entity;

/**
 * Nombre en español de cada campo que aparece en el detalle de una auditoría. Un campo que no esté aquí se
 * muestra con su clave; `audit.test.ts` fija los que hoy registra el backend.
 */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  email: 'Correo electrónico',
  name: 'Nombre',
  active: 'Activo',
  roles: 'Roles',
  description: 'Descripción',
  permissions: 'Permisos',
  assetTag: 'Etiqueta',
  serial: 'Número de serie',
  model: 'Modelo',
  status: 'Estado',
  location: 'Ubicación',
  baseLocation: 'Ubicación base',
  purchaseDate: 'Fecha de compra',
  purchaseCost: 'Costo de compra',
  purchaseCurrency: 'Moneda',
  supplier: 'Proveedor',
  warrantyMonths: 'Garantía (meses)',
  notes: 'Notas',
  assignedTo: 'Asignado a',
  assignedToType: 'Tipo de destino',
  situation: 'Situación',
  expectedReturnOn: 'Devolución esperada',
  returnedTo: 'Devuelto a',
  note: 'Nota',
  reason: 'Motivo',
  count: 'Cantidad de activos',
  batchId: 'Lote',
  extension: 'Tipo de extensión',
  modelNumber: 'Código del fabricante',
  manufacturer: 'Fabricante',
  category: 'Categoría',
  path: 'Ubicación',
  type: 'Tipo',
  address: 'Dirección',
  kind: 'Tipo de estado',
  lorawanClass: 'Clase LoRaWAN',
  lorawanRegion: 'Región / plan de frecuencias',
  lorawanVersion: 'Versión de LoRaWAN',
  lorawanRegionalParameters: 'Versión de parámetros regionales',
  devEui: 'DevEUI',
  joinEui: 'JoinEUI',
  appKeyChanged: 'AppKey modificada',
  nwkKeyChanged: 'NwkKey modificada',
  region: 'Región',
  deviceClass: 'Clase',
  profile: 'Perfil LNS',
  externalId: 'Id en el LNS',
  error: 'Error',
  orphans: 'Componentes huérfanos',
  origin: 'Origen',
  keys: 'Claves reveladas',
  endpoint: 'Endpoint',
  credentialChanged: 'Credencial reemplazada',
  tls: 'TLS',
  serials: 'Números de serie',
  target: 'Destino',
  deviceDefaults: 'Valores por defecto del dispositivo',
  // Dentro de `target` y `deviceDefaults`.
  tenantId: 'Tenant',
  applicationId: 'Aplicación',
  deviceProfileId: 'Device profile',
  frequencyPlanId: 'Plan de frecuencias',
  macVersion: 'Versión MAC',
  phyVersion: 'Versión PHY',
  joinServerAddress: 'Join Server',
  networkServerAddress: 'Network Server',
  applicationServerAddress: 'Application Server',
  // `hasAppKey`/`appKeyChanged` (y sus pares de NwkKey) se muestran como una línea «AppKey: cargada/actualizada».
  appKey: 'AppKey',
  nwkKey: 'NwkKey',
  // Consumibles
  scope: 'Ámbito',
  plural: 'Nombre en plural',
  abbreviation: 'Abreviatura',
  decimals: 'Decimales permitidos',
  unit: 'Unidad',
  minStock: 'Stock mínimo',
  warehouseMinimums: 'Mínimos por bodega',
  quantity: 'Cantidad',
  stockBefore: 'Saldo antes',
  stockAfter: 'Saldo después',
  fromStockAfter: 'Saldo del origen después',
  toStockAfter: 'Saldo del destino después',
  recipient: 'Recibe',
  recipientRef: 'Identificador del receptor',
  direction: 'Sentido',
  fromLocation: 'Bodega de origen',
  toLocation: 'Bodega de destino',
  originalKind: 'Movimiento anulado',
  fromStockBefore: 'Saldo del origen antes',
  toStockBefore: 'Saldo del destino antes',
  originalReason: 'Motivo del movimiento',
  originalNote: 'Nota del movimiento',
  reversalReason: 'Motivo de la anulación',
  originalActor: 'Registrado por',
  movementDate: 'Fecha del movimiento',
  registeredAt: 'Registrado el',
  receivedOn: 'Fecha del ingreso',
  returned: 'Devuelto',
  delivery: 'Entrega',
};

/**
 * Rótulos que dependen de la entidad: un mismo campo significa cosas distintas (`kind` es el tipo de un estado del
 * catálogo y el proveedor de un perfil LNS).
 */
const ENTITY_FIELD_LABELS: Partial<Record<AuditEntity, Record<string, string>>> = {
  lns_profile: { kind: 'Tipo de LNS' },
  // En consumibles el lugar es siempre una bodega (P11).
  consumable: { location: 'Bodega' },
};

export const auditFieldLabel = (field: string, entity?: string): string =>
  (entity
    ? (ENTITY_FIELD_LABELS as Record<string, Record<string, string> | undefined>)[entity]?.[field]
    : undefined) ??
  AUDIT_FIELD_LABELS[field] ??
  field;

const fromOptions = (options: readonly { value: string; label: string }[]) =>
  Object.fromEntries(options.map((o) => [o.value, o.label]));

/**
 * Texto de cada valor de los campos enumerados del detalle (p. ej. «Tipo de destino: user» → «Usuario»).
 * `Record` exige todos los valores de `AUDIT_ENUM_FIELDS`; `audit.test.ts` lo comprueba también en ejecución.
 */
export const AUDIT_VALUE_LABELS: {
  [F in AuditEnumField]: Record<(typeof AUDIT_ENUM_FIELDS)[F][number], string>;
} = {
  assignedToType: { user: 'Usuario', location: 'Ubicación' },
  situation: { vigente: 'Vigente', baja: 'Dado de baja' },
  kind: messages.catalog.kinds,
  type: messages.catalog.locationTypes,
  extension: {
    none: messages.catalog.extensions.none,
    lorawan: messages.catalog.extensions.lorawan,
  },
  lorawanClass: fromOptions(LORAWAN_CLASS_OPTIONS) as Record<'A' | 'B' | 'C', string>,
  lorawanRegion: fromOptions(LORAWAN_REGION_OPTIONS) as never,
  lorawanVersion: fromOptions(LORAWAN_VERSION_OPTIONS) as never,
  lorawanRegionalParameters: fromOptions(LORAWAN_REGIONAL_PARAMETERS_OPTIONS) as never,
  deviceClass: fromOptions(LORAWAN_CLASS_OPTIONS) as Record<'A' | 'B' | 'C', string>,
  region: fromOptions(LORAWAN_REGION_OPTIONS) as never,
  origin: { created: 'Creado por Inventarius', linked: 'Vinculado (ya existía en el LNS)' },
  orphans: {
    device: 'Dispositivo',
    is: 'Identity Server',
    js: 'Join Server',
    ns: 'Network Server',
    as: 'Application Server',
  },
  keys: { appKey: 'AppKey', nwkKey: 'NwkKey' },
  scope: { asset: 'Activos', consumable: 'Consumibles' },
  direction: { add: 'Suma', subtract: 'Resta' },
  reason: {
    physical_count: 'Conteo físico',
    waste_damage: 'Merma o daño',
    loss: 'Pérdida',
    other: 'Otro',
  },
  originalReason: {
    physical_count: 'Conteo físico',
    waste_damage: 'Merma o daño',
    loss: 'Pérdida',
    other: 'Otro',
  },
  originalKind: {
    receipt: 'Ingreso',
    delivery: 'Entrega',
    return: 'Devolución',
    adjustment: 'Ajuste',
    // Un traslado anulado es una sola cosa para quien lee, no «salida» y «entrada» (D9).
    transfer_out: 'Traslado',
    transfer_in: 'Traslado',
    reversal: 'Anulación',
  },
};

/** Valores que dependen de la entidad (ver `ENTITY_FIELD_LABELS`). */
const ENTITY_VALUE_LABELS: Partial<Record<AuditEntity, Record<string, Record<string, string>>>> = {
  lns_profile: { kind: { chirpstack: 'ChirpStack', ttn: 'TTN' } },
};

/** Traducción de un valor enumerado, o `undefined` si el campo no es enumerado o el valor es desconocido. */
export function auditValueLabel(field: string, value: string, entity?: string): string | undefined {
  const byEntity = entity
    ? (ENTITY_VALUE_LABELS as Record<string, Record<string, Record<string, string>> | undefined>)[
        entity
      ]?.[field]
    : undefined;
  if (byEntity) return byEntity[value];
  const map = (AUDIT_VALUE_LABELS as Record<string, Record<string, string>>)[field];
  return map?.[value];
}
