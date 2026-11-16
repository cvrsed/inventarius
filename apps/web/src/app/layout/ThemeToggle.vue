<script setup lang="ts">
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useThemeStore } from '@/features/theme/useThemeStore';

const { t } = useI18n();
const theme = useThemeStore();
</script>

<template>
  <Button
    class="app-touch"
    :icon="theme.isDark ? 'pi pi-sun' : 'pi pi-moon'"
    :aria-label="theme.isDark ? t('theme.toLight') : t('theme.toDark')"
    severity="secondary"
    text
    rounded
    @click="theme.toggle()"
  />
</template>
