import type { AssetModelDto, LocationDto, StatusLabelDto } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { columnsOf, displayCells } from './columns';
import { SECTIONS } from './entities';

const t = (key: string) => key;

describe('columnas del catálogo', () => {
  it('cada sección termina en estado y acciones, y la primera columna es el nombre', () => {
    for (const section of SECTIONS) {
      const ids = columnsOf(section, t).map((c) => c.id);
      expect(ids[0]).toBe('name');
      expect(ids.slice(-2)).toEqual(['state', 'actions']);
    }
  });

  it('el modelo muestra número, fabricante y categoría', () => {
    const model = {
      id: '1',
      name: 'SDM530',
      modelNumber: 'LR',
      manufacturer: { id: 'm', name: 'Milesight' },
      category: { id: 'c', name: 'Medidores', extension: 'lorawan' },
      active: true,
      lorawanClass: null,
      lorawanRegion: null,
      lorawanVersion: null,
      lorawanRegionalParameters: null,
      updatedAt: '',
    } satisfies AssetModelDto;
    expect(displayCells('models', model, t)).toEqual({
      title: 'SDM530',
      second: 'LR',
      third: 'Milesight',
      fourth: 'Medidores',
    });
  });

  it('la ubicación se muestra con su ruta completa y el estado con su tipo traducido', () => {
    const location = {
      id: '1',
      name: 'Piso 2',
      parent: null,
      path: 'Cliente > Edificio > Piso 2',
      address: 'Calle 1',
      active: true,
      updatedAt: '',
    } satisfies LocationDto;
    expect(displayCells('locations', location, t).title).toBe('Cliente > Edificio > Piso 2');
    const status = {
      id: '1',
      name: 'Dañado',
      kind: 'undeployable',
      active: true,
      isSystem: false,
      updatedAt: '',
    } satisfies StatusLabelDto;
    expect(displayCells('statuses', status, t).second).toBe('catalog.kinds.undeployable');
  });
});
