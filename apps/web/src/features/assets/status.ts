import type { StatusKind } from '@inventarius/shared';

type BadgeColor = 'success' | 'warning' | 'error' | 'neutral';

/** Color del badge según el tipo de estado: no depende del nombre, que el catálogo permite cambiar. */
export function statusColor(kind: StatusKind): BadgeColor {
  return { deployable: 'success', pending: 'warning', undeployable: 'error', archived: 'neutral' }[
    kind
  ] as BadgeColor;
}

/** Color de la barra del Inicio según el tipo de estado (mismo criterio que el badge). */
export function statusBarClass(kind: StatusKind): string {
  return {
    deployable: 'bg-success',
    pending: 'bg-warning',
    undeployable: 'bg-error',
    archived: 'bg-neutral',
  }[kind];
}
