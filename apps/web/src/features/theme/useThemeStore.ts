import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'inventarius.theme';
const DARK_CLASS = 'dark';

function readStored(): 'light' | 'dark' | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** Modo claro/oscuro: preferencia guardada o, si no hay, la del sistema. */
export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(false);

  function apply(dark: boolean): void {
    isDark.value = dark;
    document.documentElement.classList.toggle(DARK_CLASS, dark);
  }

  function init(): void {
    const stored = readStored();
    apply(stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function toggle(): void {
    apply(!isDark.value);
    try {
      localStorage.setItem(STORAGE_KEY, isDark.value ? 'dark' : 'light');
    } catch {
      // Sin almacenamiento disponible (modo privado): la preferencia dura solo la sesión.
    }
  }

  return { isDark, init, toggle };
});
