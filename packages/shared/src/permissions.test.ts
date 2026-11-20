import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SEED_ROLES, isPermission } from './permissions.js';

describe('matriz de permisos semilla', () => {
  const byName = (n: string) => SEED_ROLES.find((r) => r.name === n)!.permissions;

  it('Administrador tiene todos los permisos y es protegido', () => {
    const admin = SEED_ROLES.find((r) => r.name === 'Administrador')!;
    expect([...admin.permissions].sort()).toEqual([...PERMISSIONS].sort());
    expect(admin.isProtected).toBe(true);
  });

  it('solo el administrador revela claves, restaura activos y gestiona usuarios, roles y perfiles LNS', () => {
    for (const p of [
      'lorawan:keys:reveal',
      'lns_profile:manage',
      'user:manage',
      'role:manage',
      'asset:restore',
    ] as const) {
      const holders = SEED_ROLES.filter((r) => r.permissions.includes(p)).map((r) => r.name);
      expect(holders).toEqual(['Administrador']);
    }
  });

  it('el técnico registra en LNS pero no escribe activos ni revela claves', () => {
    const tech = byName('Técnico de campo');
    expect(tech).toContain('lorawan:register');
    expect(tech).toContain('asset:checkout');
    expect(tech).not.toContain('asset:write');
    expect(tech).not.toContain('lorawan:keys:reveal');
  });

  it('el lector solo consulta', () => {
    expect(byName('Lector')).toEqual(['asset:read', 'lorawan:read', 'consumables:read']);
  });

  it('isPermission distingue valores válidos', () => {
    expect(isPermission('asset:read')).toBe(true);
    expect(isPermission('asset:fly')).toBe(false);
  });
});

describe('permisos de consumibles (D12)', () => {
  const holders = (p: (typeof PERMISSIONS)[number]) =>
    SEED_ROLES.filter((r) => r.permissions.includes(p)).map((r) => r.name);

  it('ajustar y anular es solo del Administrador', () => {
    expect(holders('consumables:adjust')).toEqual(['Administrador']);
  });

  it('todos consultan; el técnico entrega pero no ingresa ni traslada', () => {
    expect(holders('consumables:read')).toHaveLength(4);
    expect(holders('consumables:deliver')).toEqual([
      'Administrador',
      'Operador',
      'Técnico de campo',
    ]);
    expect(holders('consumables:receive')).toEqual(['Administrador', 'Operador']);
    expect(holders('consumables:transfer')).toEqual(['Administrador', 'Operador']);
    expect(holders('consumables:manage')).toEqual(['Administrador', 'Operador']);
  });
});
