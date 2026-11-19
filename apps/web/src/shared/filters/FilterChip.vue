<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import { toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilterDef } from './types';
import { useFilterValueLabel } from './useFilters';

/** Chip removible de un filtro activo: «Estado: Disponible ✕». El botón de quitar lleva el nombre completo. */
const props = defineProps<{ def: FilterDef; value: string }>();
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
const valueLabel = useFilterValueLabel(props.def, toRef(props, 'value'));
</script>

<template>
  <span
    class="inline-flex min-h-8 items-center gap-1 rounded-full border border-default bg-elevated py-0.5 pr-0.5 pl-3 text-sm"
    data-filter-chip
  >
    <span class="text-default">
      <span class="text-muted">{{ def.label }}:</span> {{ valueLabel }}
    </span>
    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="xs"
      class="rounded-full"
      :aria-label="t('filters.remove', { name: `${def.label}: ${valueLabel}` })"
      @click="emit('remove')"
    />
  </span>
</template>
