<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { fetchOptions } from './api';

/**
 * Selector de ubicación con buscador «Buscar ubicación…» y dos líneas por opción: el nombre y, debajo, la ruta de sus
 * padres (la `description` que arma el catálogo). `scope` limita el tipo: solo bodegas, solo sitios (todo menos
 * bodegas) o todas. Es el único selector de ubicaciones de los formularios de activos.
 */
const props = withDefaults(
  defineProps<{
    scope?: 'all' | 'warehouse' | 'site';
    placeholder: string;
    id?: string;
    clearable?: boolean;
    disabled?: boolean;
  }>(),
  { scope: 'all', id: undefined, clearable: false, disabled: false },
);
const model = defineModel<RemoteOption | null>({ default: null });
const { t } = useI18n();

const extra = computed((): Record<string, string> | undefined =>
  props.scope === 'warehouse'
    ? { type: 'warehouse' }
    : props.scope === 'site'
      ? { excludeType: 'warehouse' }
      : undefined,
);
const fetcher = (q: string) =>
  fetchOptions('locations', q, extra.value ? { extra: extra.value } : {});
</script>

<template>
  <RemoteSelect
    :id="id"
    v-model="model"
    :source="`locations-${scope}`"
    :fetcher="fetcher"
    :placeholder="placeholder"
    :search-placeholder="t('filters.search.locations')"
    :clearable="clearable"
    :disabled="disabled"
  />
</template>
