import type { AuditAction, AuditEntity } from '@inventarius/shared';

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
};

export const auditFieldLabel = (field: string): string => AUDIT_FIELD_LABELS[field] ?? field;
