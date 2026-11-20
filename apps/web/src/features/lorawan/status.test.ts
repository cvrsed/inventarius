import { describe, expect, it } from 'vitest';
import { LNS_REGISTRATION_STATUSES } from '@inventarius/shared';
import { messages } from '@/app/i18n/es-CL';
import { lnsActions, lnsStatusColor, lnsStatusKey } from './status';

describe('estado LNS', () => {
  it('todo estado tiene texto en español', () => {
    const labels = messages.lorawan.status as Record<string, string>;
    for (const s of [null, ...LNS_REGISTRATION_STATUSES]) {
      expect(labels[lnsStatusKey(s).split('.')[2]!]).toBeTruthy();
    }
  });

  it('colores: éxito, en curso, atención y error', () => {
    expect(lnsStatusColor('registered')).toBe('success');
    expect(lnsStatusColor('registering')).toBe('info');
    expect(lnsStatusColor('conflict')).toBe('warning');
    expect(lnsStatusColor('error')).toBe('error');
    expect(lnsStatusColor(null)).toBe('neutral');
  });

  it('acciones por estado', () => {
    expect(lnsActions(null)).toMatchObject({ register: true, deregister: false });
    expect(lnsActions('registered')).toMatchObject({ register: false, deregister: true });
    expect(lnsActions('error')).toMatchObject({ retry: true, deregister: false });
    expect(lnsActions('partial')).toMatchObject({ retry: true, deregister: true });
    expect(lnsActions('conflict')).toMatchObject({ resolve: true, register: false });
    expect(lnsActions('registering')).toEqual({
      register: false,
      deregister: false,
      retry: false,
      resolve: false,
    });
  });
});
