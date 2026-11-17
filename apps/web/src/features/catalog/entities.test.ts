import type { AssetModelDto, LocationDto, StatusLabelDto } from '@inventarius/shared';
import {
  LORAWAN_REGIONAL_PARAMETERS_OPTIONS,
  LORAWAN_REGION_OPTIONS,
  LORAWAN_VERSION_OPTIONS,
} from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { emptyForm, formFromItem, toPayload, visibleFields } from './entities';

const model: AssetModelDto = {
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'SDM530',
  modelNumber: null,
  manufacturer: { id: '018f0000-0000-7000-8000-0000000000a1', name: 'Acme' },
  category: { id: '018f0000-0000-7000-8000-0000000000b1', name: 'Medidores', extension: 'lorawan' },
  active: true,
  lorawanClass: 'C',
  lorawanRegion: null,
  lorawanVersion: '1.0.3',
  lorawanRegionalParameters: null,
  updatedAt: '2026-11-16T12:00:00.000Z',
};

describe('formularios del catálogo', () => {
  it('el formulario vacío parte activo y sin referencias', () => {
    expect(emptyForm('models')).toMatchObject({
      name: '',
      manufacturer: null,
      category: null,
      active: true,
    });
  });

  it('un modelo existente se carga con sus referencias como objetos', () => {
    const form = formFromItem('models', model);
    expect(form['manufacturer']).toEqual({ id: model.manufacturer.id, name: 'Acme' });
    expect(form['category']).toMatchObject({ id: model.category.id, extension: 'lorawan' });
    expect(form['lorawanClass']).toBe('C');
    expect(form['modelNumber']).toBe('');
  });

  it('los campos LoRaWAN solo se ven con una categoría LoRaWAN', () => {
    const lora = visibleFields('models', formFromItem('models', model)).map((f) => f.key);
    expect(lora).toContain('lorawanClass');
    const plain = formFromItem('models', {
      ...model,
      category: { ...model.category, extension: 'none' },
    });
    expect(visibleFields('models', plain).map((f) => f.key)).not.toContain('lorawanClass');
  });

  it('el payload del modelo lleva ids y descarta lo LoRaWAN si la categoría no lo es', () => {
    const lora = toPayload('models', formFromItem('models', model), 'edit');
    expect(lora).toMatchObject({
      name: 'SDM530',
      manufacturerId: model.manufacturer.id,
      categoryId: model.category.id,
      lorawanClass: 'C',
      lorawanVersion: '1.0.3',
      modelNumber: null,
      active: true,
    });
    const plain = toPayload(
      'models',
      {
        ...formFromItem('models', model),
        category: { id: 'x', name: 'Notebooks', extension: 'none' },
      },
      'create',
    );
    expect(plain).toMatchObject({ lorawanClass: null, lorawanVersion: null });
    expect(plain).not.toHaveProperty('active');
  });

  it('los campos LoRaWAN usan las listas compartidas y la clase es obligatoria', () => {
    const fields = visibleFields('models', formFromItem('models', model));
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey['lorawanClass']).toMatchObject({ required: true, kind: 'select' });
    expect(byKey['lorawanRegion']!.options).toBe(LORAWAN_REGION_OPTIONS);
    expect(byKey['lorawanVersion']!.options).toBe(LORAWAN_VERSION_OPTIONS);
    expect(byKey['lorawanRegionalParameters']!.options).toBe(LORAWAN_REGIONAL_PARAMETERS_OPTIONS);
    expect(byKey['lorawanRegion']!.kind).toBe('search');
    expect(byKey['lorawanRegion']!.required).toBeUndefined();
    expect(byKey['lorawanRegion']!.options!.length).toBe(13);
  });

  it('la región viaja en el payload solo con categoría LoRaWAN', () => {
    const form = { ...formFromItem('models', model), lorawanRegion: 'AU915' };
    expect(toPayload('models', form, 'edit')).toMatchObject({ lorawanRegion: 'AU915' });
  });

  it('la ubicación manda el padre como id o null', () => {
    const location: LocationDto = {
      id: '018f0000-0000-7000-8000-000000000002',
      name: 'Sala',
      parent: { id: '018f0000-0000-7000-8000-0000000000c1', name: 'Edificio' },
      path: 'Edificio > Sala',
      address: null,
      active: true,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    expect(toPayload('locations', formFromItem('locations', location), 'edit')).toMatchObject({
      parentId: location.parent!.id,
      address: null,
    });
    expect(toPayload('locations', emptyForm('locations'), 'create')).toMatchObject({
      parentId: null,
    });
  });

  it('el estado del sistema no se puede editar', () => {
    const status: StatusLabelDto = {
      id: '018f0000-0000-7000-8000-000000000003',
      name: 'Asignado',
      kind: 'deployable',
      active: true,
      isSystem: true,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    expect(formFromItem('statuses', status)['name']).toBe('Asignado');
    expect(toPayload('statuses', emptyForm('statuses'), 'create')).toEqual({
      name: '',
      kind: 'deployable',
    });
  });
});
