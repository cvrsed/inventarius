import { describe, expect, it } from 'vitest';
import { emptyAssetForm, formFromAsset, toAssetPayload } from './form';

const option = (id: string, name: string) => ({ id, name });

describe('formulario de activo', () => {
  it('el alta sin etiqueta no la manda (se autogenera) y deja vacíos como null', () => {
    const payload = toAssetPayload(
      {
        ...emptyAssetForm(),
        name: ' Sensor ',
        model: option('m1', 'Modelo'),
        status: option('s1', 'Disponible'),
      },
      'create',
    );
    expect(payload).toEqual({
      name: 'Sensor',
      modelId: 'm1',
      statusId: 's1',
      serial: null,
      baseLocationId: null,
      purchaseDate: null,
      purchaseCost: null,
      purchaseCurrency: 'CLP',
      supplier: null,
      warrantyMonths: null,
      notes: null,
    });
  });

  it('convierte costo y garantía a número y conserva la etiqueta escrita', () => {
    const payload = toAssetPayload(
      {
        ...emptyAssetForm(),
        assetTag: ' LAB-1 ',
        name: 'x',
        model: option('m1', 'M'),
        status: option('s1', 'S'),
        purchaseCost: '1234,5',
        purchaseCurrency: 'CLP',
        warrantyMonths: '24',
      },
      'create',
    );
    expect(payload).toMatchObject({ assetTag: 'LAB-1', purchaseCost: 1234.5, warrantyMonths: 24 });
  });

  it('la moneda parte en la de la instalación y viaja con el costo', () => {
    expect(emptyAssetForm().purchaseCurrency).toBe('CLP');
    expect(emptyAssetForm('USD').purchaseCurrency).toBe('USD');
    const form = {
      ...emptyAssetForm('USD'),
      name: 'x',
      model: option('m1', 'M'),
      status: option('s1', 'S'),
      purchaseCost: '10,5',
    };
    expect(toAssetPayload(form, 'create')).toMatchObject({
      purchaseCost: 10.5,
      purchaseCurrency: 'USD',
    });
  });

  it('la edición manda la etiqueta y omite el estado si no cambió', () => {
    const form = {
      ...emptyAssetForm(),
      assetTag: 'INV-000001',
      name: 'x',
      model: option('m1', 'M'),
      status: option('s1', 'S'),
    };
    const payload = toAssetPayload(form, 'edit', 's1');
    expect(payload).toMatchObject({ assetTag: 'INV-000001' });
    expect(payload).not.toHaveProperty('statusId');
    expect(toAssetPayload(form, 'edit', 'otro')).toHaveProperty('statusId', 's1');
  });

  it('carga un activo existente en el formulario', () => {
    const form = formFromAsset({
      assetTag: 'INV-000009',
      name: 'Notebook',
      serial: null,
      model: option('m1', 'Modelo'),
      status: { id: 's1', name: 'Disponible', kind: 'deployable' },
      baseLocation: option('l1', 'Sala'),
      purchaseDate: '2026-01-31',
      purchaseCost: 1500,
      purchaseCurrency: 'CLP',
      supplier: null,
      warrantyMonths: 12,
      notes: 'nota',
    });
    expect(form).toMatchObject({
      assetTag: 'INV-000009',
      serial: '',
      purchaseCost: '1500',
      purchaseCurrency: 'CLP',
      warrantyMonths: '12',
      baseLocation: { id: 'l1', name: 'Sala' },
    });
  });

  it('un costo no numérico se descarta en vez de enviar NaN', () => {
    const payload = toAssetPayload(
      {
        ...emptyAssetForm(),
        name: 'x',
        model: option('m', 'M'),
        status: option('s', 'S'),
        purchaseCost: 'abc',
        purchaseCurrency: 'CLP',
      },
      'create',
    );
    expect(payload['purchaseCost']).toBeNull();
  });
});
