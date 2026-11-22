import { PERMISSIONS } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { messages } from './es-CL';

describe('traducción de permisos (D5)', () => {
  const labels = messages.permissions as Record<string, string>;

  it.each(PERMISSIONS)('%s tiene un texto para personas, no la clave cruda', (permission) => {
    expect(labels[permission], `falta traducir «${permission}»`).toBeTruthy();
    expect(labels[permission]).not.toBe(permission);
    expect(labels[permission]).not.toContain(':');
  });

  it('los permisos de consumibles usan los textos acordados', () => {
    expect(labels['consumables:read']).toBe('Ver consumibles');
    expect(labels['consumables:manage']).toBe('Gestionar catálogo de consumibles');
    expect(labels['consumables:receive']).toBe('Ingresar a bodega');
    expect(labels['consumables:deliver']).toBe('Entregar y registrar devoluciones');
    expect(labels['consumables:transfer']).toBe('Trasladar entre bodegas');
    expect(labels['consumables:adjust']).toBe('Ajustar stock');
    expect(labels['consumables:reverse']).toBe('Anular movimientos');
  });

  it('no sobran traducciones de permisos que ya no existen', () => {
    expect(Object.keys(labels).sort()).toEqual([...PERMISSIONS].sort());
  });
});
