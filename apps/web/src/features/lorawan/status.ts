import type { LnsRegistrationStatus } from '@inventarius/shared';

type Color = 'neutral' | 'info' | 'success' | 'warning' | 'error';

/** Color de la insignia del estado LNS; `null` (sin registro) se muestra neutro. */
export function lnsStatusColor(status: LnsRegistrationStatus | null): Color {
  switch (status) {
    case 'registered':
      return 'success';
    case 'registering':
    case 'deregistering':
      return 'info';
    case 'partial':
    case 'conflict':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

/** Clave i18n del estado (`none` para «no registrado»). */
export const lnsStatusKey = (status: LnsRegistrationStatus | null): string =>
  `lorawan.status.${status ?? 'none'}`;

/** Acciones que ofrece la ficha según el estado del registro (RF-60 a RF-64). */
export function lnsActions(status: LnsRegistrationStatus | null) {
  return {
    register: status === null,
    deregister: status === 'registered' || status === 'partial',
    retry: status === 'error' || status === 'partial',
    resolve: status === 'conflict',
  };
}
