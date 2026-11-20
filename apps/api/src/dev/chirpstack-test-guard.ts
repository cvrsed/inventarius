/**
 * Las pruebas contra un ChirpStack real crean y borran dispositivos. Solo corren si el endpoint está marcado
 * explícitamente como de prueba con `CHIRPSTACK_TEST_ENDPOINT` (el mismo valor que el endpoint de la configuración).
 */
export function assertMarkedAsTest(endpoint: string, marked: string | undefined): void {
  if (marked === endpoint) return;
  throw new Error(
    `Esta prueba crea y borra dispositivos y se niega a correr contra «${endpoint}»: ` +
      'defina CHIRPSTACK_TEST_ENDPOINT con ese mismo endpoint para marcarlo como ChirpStack de prueba',
  );
}
