import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@inventarius/shared';
import { auditActionLabel, auditEntityLabel } from '@/app/i18n/audit';
import type { FilterDef } from '@/shared/filters/types';

type Translate = (key: string) => string;

/** Filtros de la auditoría (RF-31): entidad, acción y rango de fechas. Todos van en la barra. */
export function auditFilterDefs(t: Translate): FilterDef[] {
  return [
    {
      kind: 'choice',
      key: 'entity',
      label: t('audit.filterEntity'),
      placement: 'bar',
      options: AUDIT_ENTITIES.map((value) => ({ value, label: auditEntityLabel(value) })),
    },
    {
      kind: 'choice',
      key: 'action',
      label: t('audit.filterAction'),
      placement: 'bar',
      options: AUDIT_ACTIONS.map((value) => ({ value, label: auditActionLabel(value) })),
    },
    { kind: 'date', key: 'from', label: t('audit.filterFrom'), placement: 'bar' },
    { kind: 'date', key: 'to', label: t('audit.filterTo'), placement: 'bar' },
  ];
}
