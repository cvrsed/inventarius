# ADR 0010 — Almacenamiento de archivos: local o S3 compatible

- Estado: Propuesto
- Fecha: 2026-11-25
- Requerimientos: RF-89, RF-82, RF-88 (sección 16 del requerimiento)

## Contexto

El MVP no guarda archivos. v2 agrega fotos de instalación y el logo. La app debe poder correr en cualquier infraestructura
(RNF-08). Ya está decidido (D4): drivers `local` y `s3`, desarrollo y testing con volumen local, producción con S3, bucket
privado, URLs firmadas con vencimiento, nunca objetos públicos, y MinIO en desarrollo y CI para probar `s3`.

## Decisión

1. **Puerto `FileStorage` en `core`** (guardar, leer, borrar, existe, URL firmada), inyectado como los demás adaptadores.
   Los módulos no saben qué driver hay. `STORAGE_DRIVER` se valida con Zod al arrancar.
2. **La base guarda la clave del objeto**, el tipo, el tamaño y el SHA-256; nunca la URL ni el driver. Las claves las genera
   el servidor (`<ámbito>/<uuid>`), sin nombres entregados por el usuario.
3. **Las subidas pasan por la API** (no hay subida directa al bucket): ahí se validan contenido y límites y se recodifica
   antes de guardar.
4. **Descargas con URL firmada de vida corta**, emitida solo tras comprobar el permiso. `s3`: URL prefirmada del proveedor.
   `local`: ruta de la API con HMAC (`STORAGE_URL_SECRET`) y vencimiento; el volumen no lo sirve Caddy.
5. **Excepción controlada:** el logo se sirve sin sesión desde la API (el login lo necesita); el objeto sigue privado.
6. **Migración entre drivers** por CLI (`storage-migrate`): copia, verifica el hash, se puede repetir y no borra el origen.
   Procedimiento: detener escrituras, copiar, cambiar `STORAGE_DRIVER`, verificar y recién entonces limpiar.
7. **Un test de contrato común** corre contra `local` y contra `s3` (MinIO en compose de desarrollo y CI, fijado por
   digest).

## Alternativas descartadas

- **Archivos en Postgres (`bytea`):** respaldo simple, pero infla la base y los `pg_dump`.
- **Solo S3:** obliga a montar un servidor S3 en cada desarrollo e instalación chica.
- **Montaje de red como volumen:** descartado por D4; falla de formas difíciles de diagnosticar.
- **Bucket público con nombres imposibles de adivinar:** una URL filtrada no vence nunca.
- **Subida directa del navegador al bucket:** evita pasar bytes por la API, pero valida después de guardar y exige CORS.

## Consecuencias

- Hay dos cosas que respaldar y restaurar juntas: base y archivos. Con `local`, el volumen entra al respaldo; con `s3`, se
  configura la protección del bucket (versionado o copia).
- El endpoint S3 debe ser alcanzable por el navegador y su origen entra en la CSP (`img-src`, `connect-src`).
- Una URL firmada sirve a quien la tenga hasta que venza: vida corta y nunca en logs.
- Borrar es baja lógica en la base y eliminación diferida del objeto; hace falta un job de limpieza y uno que detecte
  huérfanos.
- Dependencia nueva (cliente S3) fuera del stack 7.2, a justificar en el PR de F4. El soporte de la imagen de MinIO se
  verifica antes (Q120).
