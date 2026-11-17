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
