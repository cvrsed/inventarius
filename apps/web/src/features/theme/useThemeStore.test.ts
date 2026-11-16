import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from './useThemeStore';

function mockPrefersDark(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('useThemeStore', () => {
  it('parte con la preferencia del sistema cuando no hay valor guardado', () => {
    mockPrefersDark(true);
    const store = useThemeStore();
    store.init();
    expect(store.isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('respeta el valor guardado por sobre el sistema', () => {
    mockPrefersDark(true);
    localStorage.setItem('inventarius.theme', 'light');
    const store = useThemeStore();
    store.init();
    expect(store.isDark).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggle cambia la clase y persiste', () => {
    mockPrefersDark(false);
    const store = useThemeStore();
    store.init();
    store.toggle();
    expect(store.isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('inventarius.theme')).toBe('dark');
  });

  it('funciona aunque localStorage lance error', () => {
    mockPrefersDark(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const store = useThemeStore();
    store.init();
    expect(() => store.toggle()).not.toThrow();
    expect(store.isDark).toBe(true);
    vi.restoreAllMocks();
  });
});
