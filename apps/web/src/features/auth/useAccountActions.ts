import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useThemeStore } from '@/features/theme/useThemeStore';
import { useAuthStore } from './useAuthStore';

/** Acciones de la cuenta (contraseña, tema, salir) que comparten el menú de usuario y el panel «Más» móvil. */
export function useAccountActions() {
  const { t } = useI18n();
  const router = useRouter();
  const auth = useAuthStore();
  const theme = useThemeStore();

  const themeLabel = computed(() => (theme.isDark ? t('theme.toLight') : t('theme.toDark')));
  const themeIcon = computed(() => (theme.isDark ? 'i-lucide-sun' : 'i-lucide-moon'));

  const changePassword = () => router.push({ name: 'change-password' });
  const toggleTheme = () => theme.toggle();
  async function logout(): Promise<void> {
    await auth.logout();
    await router.replace({ name: 'login' });
  }

  return { themeLabel, themeIcon, changePassword, toggleTheme, logout };
}
