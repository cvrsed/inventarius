/** Catálogo fijo de permisos atómicos `recurso:acción` (sección 3). La BD los siembra por migración. */
export const PERMISSIONS = [
  'asset:read',
  'asset:write',
  'asset:checkout',
  'asset:delete',
  'catalog:write',
  'lorawan:read',
  'lorawan:register',
  'lorawan:keys:reveal',
  'lns_profile:manage',
  'user:manage',
  'role:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export interface SeedRole {
  name: string;
  description: string;
  /** El rol Administrador no se puede borrar y su matriz de permisos es fija. */
  isProtected: boolean;
  permissions: readonly Permission[];
}

const OPERATOR: readonly Permission[] = [
  'asset:read',
  'asset:write',
  'asset:checkout',
  'asset:delete',
  'catalog:write',
  'lorawan:read',
  'lorawan:register',
  'audit:read',
];

/** Roles semilla y su matriz (sección 3). Fuente de verdad del código; la migración la replica y un test lo verifica. */
export const SEED_ROLES: readonly SeedRole[] = [
  {
    name: 'Administrador',
    description: 'Acceso total, incluida la gestión de usuarios, roles y perfiles LNS.',
    isProtected: true,
    permissions: PERMISSIONS,
  },
  {
    name: 'Operador',
    description: 'Gestiona activos y catálogo; registra en LNS sin ver claves.',
    isProtected: false,
    permissions: OPERATOR,
  },
  {
    name: 'Técnico de campo',
    description: 'Asigna activos y registra dispositivos en LNS desde terreno.',
    isProtected: false,
    permissions: ['asset:read', 'asset:checkout', 'lorawan:read', 'lorawan:register'],
  },
  {
    name: 'Lector',
    description: 'Solo consulta.',
    isProtected: false,
    permissions: ['asset:read', 'lorawan:read'],
  },
];

export const ADMIN_ROLE_NAME = 'Administrador';
