<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useLowStockCount } from './api';

/**
 * Aviso de Inicio (RF-74): cuántos consumibles están bajo su mínimo y un enlace al listado ya filtrado.
 * Solo aparece para quien puede ver consumibles y solo cuando hay algo que reponer.
 */
const { t } = useI18n();
const auth = useAuthStore();
const { data: count } = useLowStockCount(computed(() => auth.can('consumables:read')));
</script>

<template>
  <RouterLink
    v-if="count"
    :to="{ name: 'consumables', query: { lowStock: 'true' } }"
    class="flex min-h-11 items-center gap-3 rounded-lg border border-warning bg-warning/10 p-4 no-underline hover:bg-elevated"
  >
    <UIcon name="i-lucide-triangle-alert" class="size-6 shrink-0 text-warning" aria-hidden="true" />
    <span class="flex flex-col">
      <span class="font-semibold text-highlighted">{{
        t('home.lowStock.title', { n: count }, count)
      }}</span>
      <span class="text-sm text-default">{{ t('home.lowStock.link') }}</span>
    </span>
  </RouterLink>
</template>
