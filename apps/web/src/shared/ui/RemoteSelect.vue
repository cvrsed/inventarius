<script setup lang="ts">
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useInertWhileOpen } from './useInertWhileOpen';

/** Opción mínima: todo registro referenciable llega con `id` y `name`. */
export interface RemoteOption {
  id: string;
  name: string;
  [extra: string]: unknown;
}

/**
 * Selector con búsqueda en el servidor: los catálogos pueden tener miles de filas y los listados están
 * limitados a 100 (RNF-06), así que nunca se cargan completos. Lo elegido viaja como objeto `{ id, name }`
 * para poder mostrar su nombre sin otra consulta.
 */
const props = defineProps<{
  /** Identifica la fuente en la caché (p. ej. `models`). */
  source: string;
  fetcher: (q: string) => Promise<RemoteOption[]>;
  placeholder: string;
  id?: string;
  clearable?: boolean;
  disabled?: boolean;
}>();
const model = defineModel<RemoteOption | null>({ default: null });

const { t } = useI18n();
const onOpen = useInertWhileOpen();
const open = ref(false);
const search = ref('');
const term = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (v) => {
  clearTimeout(timer);
  timer = setTimeout(() => (term.value = v.trim()), 250);
});

const { data, isFetching } = useQuery({
  queryKey: computed(() => ['remote', props.source, term.value] as const),
  queryFn: () => props.fetcher(term.value),
  enabled: open,
  placeholderData: keepPreviousData,
  staleTime: 15_000,
});

/** Lo ya elegido siempre figura en la lista, aunque la búsqueda actual no lo traiga. */
const items = computed(() => {
  const found = data.value ?? [];
  const chosen = model.value;
  return chosen && !found.some((o) => o.id === chosen.id) ? [chosen, ...found] : found;
});

function onUpdateOpen(value: boolean): void {
  open.value = value;
  onOpen(value);
  if (!value) {
    search.value = '';
    term.value = '';
  }
}
</script>

<template>
  <USelectMenu
    :id="id"
    v-model="model"
    v-model:search-term="search"
    :items="items"
    by="id"
    label-key="name"
    :placeholder="placeholder"
    :loading="isFetching"
    :disabled="disabled"
    :clear="clearable"
    :search-input="{ placeholder: `${placeholder} — ${t('common.searchPlaceholder')}` }"
    ignore-filter
    class="w-full"
    @update:open="onUpdateOpen"
  >
    <template #empty>{{ t('common.noOptions') }}</template>
  </USelectMenu>
</template>
