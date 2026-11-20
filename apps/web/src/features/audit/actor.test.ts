import { describe, expect, it } from 'vitest';
import { actorDisplay } from './actor';

const t = (k: string) => ({ 'audit.cli': 'CLI (operación)', 'audit.system': 'Sistema' })[k]!;

describe('actorDisplay', () => {
  it('usuario, CLI y Sistema (el worker del LNS no se muestra como «worker»)', () => {
    expect(actorDisplay({ actorName: 'Ana', actorLabel: null }, t)).toBe('Ana');
    expect(actorDisplay({ actorName: null, actorLabel: 'cli' }, t)).toBe('CLI (operación)');
    expect(actorDisplay({ actorName: null, actorLabel: 'worker' }, t)).toBe('Sistema');
    expect(actorDisplay({ actorName: null, actorLabel: null }, t)).toBe('Sistema');
    expect(actorDisplay({ actorName: null }, t)).toBe('Sistema');
  });
});
