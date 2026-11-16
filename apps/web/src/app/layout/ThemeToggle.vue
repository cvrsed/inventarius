<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import { useI18n } from 'vue-i18n';
import { useThemeStore } from '@/features/theme/useThemeStore';

const { t } = useI18n();
const theme = useThemeStore();
</script>

<template>
  <UButton
    :icon="theme.isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
    :aria-label="theme.isDark ? t('theme.toLight') : t('theme.toDark')"
    color="neutral"
    variant="ghost"
    @click="theme.toggle()"
  />
</template>
