-- Estados semilla (RF-13) y permiso de restauración de activos (RF-25).
-- «Asignado» es el estado que pone el check-out; se identifica por system_key, no por nombre.
INSERT INTO status_labels (name, kind, system_key) VALUES
  ('Disponible', 'deployable', NULL),
  ('Asignado', 'deployable', 'assigned'),
  ('En reparación', 'undeployable', NULL),
  ('Dañado', 'undeployable', NULL),
  ('Dado de baja', 'archived', NULL);

INSERT INTO permissions (key) VALUES ('asset:restore') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission)
SELECT id, 'asset:restore' FROM roles WHERE name = 'Administrador'
ON CONFLICT DO NOTHING;
