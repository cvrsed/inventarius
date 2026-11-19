import { describe, expect, it } from 'vitest';
import { parseListQuery, serializeListQuery } from './listQuery';

const defaults = { page: 1, pageSize: 25, q: '', statusId: '', sort: 'assetTag' };

describe('parseListQuery', () => {
  it('usa los valores por defecto cuando la URL viene vacía', () => {
    expect(parseListQuery({}, defaults)).toEqual(defaults);
  });

  it('lee números y textos de la URL', () => {
    const parsed = parseListQuery(
      { page: '3', pageSize: '50', q: 'sensor', sort: '-name' },
      defaults,
    );
    expect(parsed).toMatchObject({ page: 3, pageSize: 50, q: 'sensor', sort: '-name' });
  });

  it('descarta valores numéricos inválidos o fuera de rango', () => {
    expect(parseListQuery({ page: 'abc' }, defaults).page).toBe(1);
    expect(parseListQuery({ page: '-4' }, defaults).page).toBe(1);
    expect(parseListQuery({ pageSize: '5000' }, defaults).pageSize).toBe(100);
  });

  it('toma el primer valor si la clave se repite e ignora claves desconocidas', () => {
    const parsed = parseListQuery({ q: ['a', 'b'], otra: 'x' }, defaults);
    expect(parsed.q).toBe('a');
    expect(parsed).not.toHaveProperty('otra');
  });
});

describe('serializeListQuery', () => {
  it('omite lo que vale lo mismo que el valor por defecto', () => {
    expect(serializeListQuery({ ...defaults, q: 'router', page: 2 }, defaults)).toEqual({
      q: 'router',
      page: '2',
    });
  });

  it('una URL sin filtros queda limpia', () => {
    expect(serializeListQuery(defaults, defaults)).toEqual({});
  });

  it('ida y vuelta: lo que se escribe en la URL se lee igual', () => {
    const query = { ...defaults, page: 4, statusId: 'abc', sort: '-model' };
    expect(parseListQuery(serializeListQuery(query, defaults), defaults)).toEqual(query);
  });
});
