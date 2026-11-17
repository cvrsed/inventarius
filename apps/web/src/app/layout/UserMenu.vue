<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UDropdownMenu from '@nuxt/ui/components/DropdownMenu.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccountActions } from '@/features/auth/useAccountActions';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useInertWhileOpen } from '@/shared/ui/useInertWhileOpen';

const { t } = useI18n();
const auth = useAuthStore();
const onOpen = useInertWhileOpen();
const { themeLabel, themeIcon, changePassword, toggleTheme, logout } = useAccountActions();

/** Opciones con texto: nada de íconos sueltos en la cabecera. */
const items = computed(() => [
  [{ type: 'label' as const, label: auth.user?.name ?? '', description: auth.user?.email }],
  [
    { label: t('session.changePassword'), icon: 'i-lucide-key-round', onSelect: changePassword },
    { label: themeLabel.value, icon: themeIcon.value, onSelect: toggleTheme },
  ],
  [{ label: t('session.logout'), icon: 'i-lucide-log-out', onSelect: logout }],
]);
</script>

<template>
  <UDropdownMenu v-if="auth.user" :items="items" :content="{ align: 'end' }" @update:open="onOpen">
    <UButton
      icon="i-lucide-circle-user"
      color="neutral"
      variant="ghost"
      :label="auth.user.name"
      :aria-label="`${t('session.menu')}: ${auth.user.name}`"
      :ui="{ label: 'hidden max-w-40 truncate sm:inline' }"
    />
  </UDropdownMenu>
</template>
