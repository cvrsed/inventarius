import { describe, expect, it } from 'vitest';
import { ASSET_LIST_DEFAULTS, exportUrl, listParams } from './api';
import { statusColor } from './status';

describe('parámetros del listado de activos', () => {
  it('sin filtros solo van página, tamaño y orden', () => {
    expect([...listParams(ASSET_LIST_DEFAULTS).keys()].sort()).toEqual([
      'page',
      'pageSize',
      'sort',
    ]);
  });

  it('cada filtro activo se manda con su nombre de la API', () => {
    const params = listParams({
      ...ASSET_LIST_DEFAULTS,
      q: 'router',
      statusId: 's',
      categoryId: 'c',
      modelId: 'm',
      locationId: 'l',
      assignedUserId: 'u',
      deleted: 'only',
    });
    expect(Object.fromEntries(params)).toMatchObject({
      q: 'router',
      statusId: 's',
      categoryId: 'c',
      modelId: 'm',
      locationId: 'l',
      assignedUserId: 'u',
      deleted: 'only',
    });
  });

  it('la exportación conserva los filtros pero no la paginación', () => {
    const url = exportUrl({ ...ASSET_LIST_DEFAULTS, q: 'x', page: 5, pageSize: 100 });
    expect(url).toBe('/api/v1/assets/export?q=x&sort=assetTag');
  });
});

describe('color del estado', () => {
  it('depende del tipo, no del nombre', () => {
    expect(statusColor('deployable')).toBe('success');
    expect(statusColor('pending')).toBe('warning');
    expect(statusColor('undeployable')).toBe('error');
    expect(statusColor('archived')).toBe('neutral');
  });
});
