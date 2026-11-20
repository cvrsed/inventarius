/** Lo que hace falta saber de un evento para nombrar a quien lo originó. */
export interface ActorFields {
  actorName: string | null;
  actorLabel?: string | null;
}

/**
 * Nombre de quien originó un evento, igual en todas las vistas (Auditoría, historial de la ficha, inicio): el usuario;
 * si no hubo, `CLI` para la operación por línea de comandos y **Sistema** para todo lo demás (p. ej. el worker del LNS).
 */
export function actorDisplay(e: ActorFields, t: (key: string) => string): string {
  if (e.actorName) return e.actorName;
  return e.actorLabel === 'cli' ? t('audit.cli') : t('audit.system');
}
