import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test-utils';
import { fetchOptions } from './api';

afterEach(() => vi.unstubAllGlobals());

const location = (id: string, name: string, path: string) => ({
  id,
  name,
  path,
  parent: null,
  type: 'warehouse',
  address: null,
  active: true,
  updatedAt: '2026-11-16T12:00:00.000Z',
});

describe('opciones de ubicación en dos líneas [P42]', () => {
  it('el nombre del lugar arriba y la ruta de sus padres abajo, con «›»', async () => {
    mockApi({
      'GET /api/v1/locations': () => ({
        data: [
          location(
            '018f0000-0000-7000-8000-0000000000a1',
            'Bodega Norte',
            'Empresa > Chile > Santiago > Bodega Norte',
          ),
          location('018f0000-0000-7000-8000-0000000000a2', 'Oficina Central', 'Oficina Central'),
        ],
        meta: { page: 1, pageSize: 30, total: 2 },
      }),
    });
    const options = await fetchOptions('locations', '');
    expect(options[0]).toEqual({
      id: '018f0000-0000-7000-8000-0000000000a1',
      name: 'Bodega Norte',
      description: 'Empresa › Chile › Santiago',
    });
    // Sin padres no hay segunda línea.
    expect(options[1]).toEqual({
      id: '018f0000-0000-7000-8000-0000000000a2',
      name: 'Oficina Central',
    });
  });

  it('la búsqueda al servidor lleva el texto: encuentra por nombre y por ruta (la API busca en la ruta)', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/locations': () => ({ data: [], meta: { page: 1, pageSize: 30, total: 0 } }),
    });
    await fetchOptions('locations', 'Chile');
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('q=Chile');
  });
});
