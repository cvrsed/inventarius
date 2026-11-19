<script setup lang="ts">
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { useI18n } from 'vue-i18n';
import AppSelect from '@/shared/ui/AppSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import type { FilterDef, FilterValues } from './types';

/**
 * Los filtros como campos con su etiqueta: es el contenido del panel inferior de móvil y de «+ Filtros» en escritorio.
 * Cada cambio se aplica al instante (la URL y el listado se actualizan), sin botón de «aplicar».
 */
const props = defineProps<{ defs: readonly FilterDef[]; values: FilterValues }>();
const emit = defineEmits<{ change: [patch: Record<string, string>] }>();
const { t } = useI18n();

const str = (def: FilterDef) => String(props.values[def.key] ?? '');
const choiceItems = (def: Extract<FilterDef, { kind: 'choice' }>) => [
  ...(def.defaultValue === undefined || def.defaultValue === ''
    ? [{ value: '', label: t('filters.all') }]
    : []),
  ...def.options,
];

/** Nombres de los ids remotos activos (de la URL), para que cada selector muestre lo elegido. */
const remotes = computed(() => props.defs.filter((d) => d.kind === 'remote'));
const resolved = useQuery({
  queryKey: computed(
    () => ['filter-fields', remotes.value.map((d) => `${d.key}=${str(d)}`).join('&')] as const,
  ),
  queryFn: async () => {
    const out: Record<string, RemoteOption | null> = {};
    for (const d of remotes.value) {
      const id = str(d);
      out[d.key] = id && d.kind === 'remote' ? await d.resolve(id) : null;
    }
    return out;
  },
  staleTime: 60_000,
});
const selected = (def: FilterDef): RemoteOption | null => resolved.data.value?.[def.key] ?? null;
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField v-for="def in defs" :key="def.key" :label="def.label" :name="`filter-${def.key}`">
      <RemoteSelect
        v-if="def.kind === 'remote'"
        :id="`filter-${def.key}`"
        :model-value="selected(def)"
        :source="def.source"
        :fetcher="def.fetcher"
        :placeholder="t('filters.all')"
        :search-placeholder="def.searchPlaceholder"
        clearable
        @update:model-value="(v: RemoteOption | null) => emit('change', { [def.key]: v?.id ?? '' })"
      />
      <AppSelect
        v-else-if="def.kind === 'choice'"
        :id="`filter-${def.key}`"
        :model-value="str(def)"
        :items="choiceItems(def)"
        class="w-full"
        @update:model-value="(v: string | number) => emit('change', { [def.key]: String(v) })"
      />
      <UInput
        v-else
        :id="`filter-${def.key}`"
        :name="def.key"
        type="date"
        :model-value="str(def)"
        class="w-full"
        @update:model-value="(v) => emit('change', { [def.key]: String(v ?? '') })"
      />
    </UFormField>
  </div>
</template>
