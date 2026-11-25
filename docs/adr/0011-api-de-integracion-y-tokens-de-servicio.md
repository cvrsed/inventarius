# ADR 0011 — API de integración y tokens de servicio

- Estado: Propuesto
- Fecha: 2026-11-25
- Requerimientos: RF-87 (sección 16 del requerimiento); usa RF-84 y RF-30

## Contexto

La plataforma consumidora (y quizás clientes) necesita leer los dispositivos por ubicación y cliente. La API actual usa
sesión por cookie y CSRF, pensada para el navegador. D3 pide tokens por alcance desde el primer día.

## Decisión

1. **Superficie separada** bajo `/api/v1/integration`, solo `GET`, con sus propios esquemas de respuesta (lista blanca) y su
   propio documento OpenAPI. No se reutilizan las respuestas internas: un campo nuevo en la ficha no aparece solo en la API.
2. **Módulo propio** que llama a los servicios públicos de activos y clientes; no lee sus tablas. No importa el cifrado.
3. **Token de servicio** `Authorization: Bearer inv_<prefijo>_<secreto>`: secreto de al menos 256 bits; se guarda el
   SHA-256 y el prefijo visible. Al ser aleatorio de alta entropía no necesita argon2.
4. **Alcance en el token:** `all` o `client:<id>`. El alcance se aplica en la consulta (subárbol del ADR 0009), antes de
   cualquier filtro del llamador, y lo que queda fuera responde igual que lo inexistente.
5. **Cuarto tipo de acceso de ruta** (`integrationRoute`) junto a los tres actuales: la app sigue sin arrancar si una ruta
   no declara acceso. Las rutas de integración ignoran las cookies; las demás ignoran el Bearer.
6. **Ciclo de vida:** vencimiento (por defecto un año), rotación con solapamiento de 0 a 7 días y revocación inmediata. Solo
   Administrador.
7. **Límite de tasa por token** y por IP para fallos de autenticación.
8. **Auditoría** `api.access` por petición autenticada, con actor `API: <nombre>` (`actor_label`, como el CLI). Volumen y
   retención en Q113.

## Alternativas descartadas

- **Usuarios «de servicio» con sesión:** arrastran contraseña, CSRF, expiración por inactividad y roles que no aplican.
- **JWT firmados sin estado:** la revocación inmediata y el último uso exigen consultar la base de todos modos.
- **OAuth 2.0 (client credentials) con un servidor de autorización:** mucho para uno o dos consumidores; el modelo de token
  no lo impide después.
- **Acceso a la base o a una réplica:** expone el esquema y las columnas cifradas, y no tiene alcance ni auditoría.
- **Empezar con un token global y agregar alcance después:** contradice D3 y obliga a rehacer a los consumidores.

## Consecuencias

- El contrato es público: un cambio incompatible exige `/api/v2` (RNF-10). Conviene acordarlo con el primer consumidor antes
  de implementar (Q111).
- El estado LNS es el que Inventarius tiene guardado, no el del Network Server en ese momento.
- La auditoría crece con el uso de la API y no tiene purga.
- Si hay Cloudflare Access delante, la ruta necesita una decisión de borde (Q112).
- Escritura y webhooks quedan fuera; agregarlos requiere revisar este ADR.
