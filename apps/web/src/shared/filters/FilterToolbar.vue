<script setup lang="ts">
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UPopover from '@nuxt/ui/components/Popover.vue';
import USlideover from '@nuxt/ui/components/Slideover.vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useIsDesktop } from '@/shared/ui/useIsDesktop';
import FilterChip from './FilterChip.vue';
import FilterFields from './FilterFields.vue';
import FilterMenu from './FilterMenu.vue';
import type { FilterDef, FilterValues } from './types';
import { activeFilters, clearPatch, isActive } from './useFilters';

/**
 * Barra de búsqueda y filtros de los listados.
 *
 * - Escritorio: una sola fila con el buscador y botones compactos «Estado ▾» (los de `placement: 'bar'`) más
 *   «+ Filtros» con el resto. Sin etiquetas encima.
 * - Móvil: el buscador y un botón «Filtros (n)» que abre un panel inferior con todos los filtros y «Ver N resultados».
 * - Los filtros activos son chips removibles bajo la barra, con «Limpiar todo» (solo si hay filtros) y el conteo de
 *   resultados en la misma línea.
 *
 * El estado vive fuera (en la URL, ver `useListQuery`): este componente solo lo muestra y emite `change`/`clear`.
 */
const props = defineProps<{
  defs: readonly FilterDef[];
  values: FilterValues;
  /** Sin `searchId` no hay buscador (p. ej. la auditoría solo filtra). */
  searchPlaceholder?: string;
  searchId?: string;
  total?: number | undefined;
}>();
const search = defineModel<string>('search', { default: '' });
const emit = defineEmits<{ change: [patch: Record<string, string>]; clear: [] }>();

const { t } = useI18n();
const isDesktop = useIsDesktop();
const panelOpen = ref(false);

const barDefs = computed(() => props.defs.filter((d) => d.placement === 'bar'));
const moreDefs = computed(() => props.defs.filter((d) => d.placement === 'more'));
const active = computed(() => activeFilters(props.defs, props.values));
const moreActive = computed(() => activeFilters(moreDefs.value, props.values).length);
const str = (def: FilterDef) => String(props.values[def.key] ?? '');
const remove = (def: FilterDef) => emit('change', clearPatch([def]));
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <UInput
        v-if="searchId"
        :id="searchId"
        v-model="search"
        name="q"
        type="search"
        icon="i-lucide-search"
        :placeholder="searchPlaceholder"
        :aria-label="searchPlaceholder"
        class="min-w-0 flex-1"
      />
      <div v-else class="flex-1" aria-hidden="true" />

      <template v-if="isDesktop">
        <FilterMenu
          v-for="def in barDefs"
          :key="def.key"
          :def="def"
          :value="str(def)"
          :active="isActive(values, def)"
          @change="(v: string) => emit('change', { [def.key]: v })"
        />
        <UPopover v-if="moreDefs.length" :content="{ align: 'end' }">
          <UButton
            id="filters-more"
            icon="i-lucide-plus"
            :label="t('filters.more')"
            :color="moreActive ? 'primary' : 'neutral'"
            variant="outline"
          >
            <template v-if="moreActive" #trailing>
              <UBadge :label="String(moreActive)" size="sm" color="primary" variant="solid" />
            </template>
          </UButton>
          <template #content>
            <div class="w-80 max-w-[calc(100vw-2rem)] p-4">
              <FilterFields :defs="moreDefs" :values="values" @change="(p) => emit('change', p)" />
            </div>
          </template>
        </UPopover>
      </template>
      <UButton
        v-else
        id="filters-panel-button"
        icon="i-lucide-list-filter"
        :label="t('filters.withCount', { n: active.length })"
        :color="active.length ? 'primary' : 'neutral'"
        variant="outline"
        aria-haspopup="dialog"
        @click="panelOpen = true"
      />
    </div>

    <div class="flex min-h-8 flex-wrap items-center gap-2">
      <p v-if="total !== undefined" class="m-0 text-sm text-muted" aria-live="polite">
        {{ t('common.total', { n: total }, total) }}
      </p>
      <FilterChip
        v-for="def in active"
        :key="def.key"
        :def="def"
        :value="str(def)"
        @remove="remove(def)"
      />
      <UButton
        v-if="active.length"
        icon="i-lucide-x"
        :label="t('filters.clearAll')"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="emit('clear')"
      />
    </div>

    <USlideover
      v-if="!isDesktop"
      v-model:open="panelOpen"
      side="bottom"
      :title="t('filters.title')"
      :description="t('filters.panelHint')"
    >
      <template #body>
        <FilterFields :defs="defs" :values="values" @change="(p) => emit('change', p)" />
      </template>
      <template #footer>
        <div class="flex w-full gap-2">
          <UButton
            v-if="active.length"
            :label="t('filters.clearAll')"
            color="neutral"
            variant="outline"
            @click="emit('clear')"
          />
          <UButton
            block
            class="flex-1"
            :label="t('filters.showResults', { n: total ?? 0 }, total ?? 0)"
            @click="panelOpen = false"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
