import type { AssetListItemDto } from '@inventarius/shared';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Dónde está el activo: su ubicación actual o, si lo tiene una persona, «Con <nombre>» (RF-23). */
export function currentPlace(
  a: Pick<AssetListItemDto, 'location' | 'assignedUser'>,
  t: Translate,
): string {
  if (a.location) return a.location.name;
  if (a.assignedUser) return t('assets.withPerson', { name: a.assignedUser.name });
  return t('assets.noLocation');
}

/** Ruta completa de la ubicación actual para el tooltip; vacía si no tiene padres (no repite el nombre). */
export function placeTitle(
  a: Pick<AssetListItemDto, 'location' | 'assignedUser'>,
): string | undefined {
  const loc = a.location;
  return loc && loc.path !== loc.name ? loc.path : undefined;
}
