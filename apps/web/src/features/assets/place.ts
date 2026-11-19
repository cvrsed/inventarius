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
