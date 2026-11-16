import type { StatusKind } from '@inventarius/shared';

type BadgeColor = 'success' | 'warning' | 'error' | 'neutral';

/** Color del badge según el tipo de estado: no depende del nombre, que el catálogo permite cambiar. */
export function statusColor(kind: StatusKind): BadgeColor {
  return { deployable: 'success', pending: 'warning', undeployable: 'error', archived: 'neutral' }[
    kind
  ] as BadgeColor;
}
