-- Siembra de RBAC: permisos (catálogo fijo, espejo de packages/shared) y roles semilla (sección 3).
-- Un test de integración verifica que esto coincide con SEED_ROLES.
INSERT INTO permissions (key) VALUES
  ('asset:read'),
  ('asset:write'),
  ('asset:checkout'),
  ('asset:delete'),
  ('catalog:write'),
  ('lorawan:read'),
  ('lorawan:register'),
  ('lorawan:keys:reveal'),
  ('lns_profile:manage'),
  ('user:manage'),
  ('role:manage'),
  ('audit:read')
ON CONFLICT DO NOTHING;

INSERT INTO roles (name, description, is_system, is_protected) VALUES ('Administrador', 'Acceso total, incluida la gestión de usuarios, roles y perfiles LNS.', true, true);
INSERT INTO role_permissions (role_id, permission)
SELECT id, p FROM roles, unnest(ARRAY['asset:read', 'asset:write', 'asset:checkout', 'asset:delete', 'catalog:write', 'lorawan:read', 'lorawan:register', 'lorawan:keys:reveal', 'lns_profile:manage', 'user:manage', 'role:manage', 'audit:read']) AS p
WHERE name = 'Administrador';

INSERT INTO roles (name, description, is_system, is_protected) VALUES ('Operador', 'Gestiona activos y catálogo; registra en LNS sin ver claves.', true, false);
INSERT INTO role_permissions (role_id, permission)
SELECT id, p FROM roles, unnest(ARRAY['asset:read', 'asset:write', 'asset:checkout', 'asset:delete', 'catalog:write', 'lorawan:read', 'lorawan:register', 'audit:read']) AS p
WHERE name = 'Operador';

INSERT INTO roles (name, description, is_system, is_protected) VALUES ('Técnico de campo', 'Asigna activos y registra dispositivos en LNS desde terreno.', true, false);
INSERT INTO role_permissions (role_id, permission)
SELECT id, p FROM roles, unnest(ARRAY['asset:read', 'asset:checkout', 'lorawan:read', 'lorawan:register']) AS p
WHERE name = 'Técnico de campo';

INSERT INTO roles (name, description, is_system, is_protected) VALUES ('Lector', 'Solo consulta.', true, false);
INSERT INTO role_permissions (role_id, permission)
SELECT id, p FROM roles, unnest(ARRAY['asset:read', 'lorawan:read']) AS p
WHERE name = 'Lector';

