-- Estado de partida del alta en lote (RF-27): el equipo llegó pero aún no está configurado.
INSERT INTO status_labels (name, kind) VALUES ('Pendiente de configuración', 'pending')
ON CONFLICT (name) DO NOTHING;
