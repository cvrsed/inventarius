<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UPopover from '@nuxt/ui/components/Popover.vue';
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { COMPACT_MENU_UI, MENU_CONTENT } from '@/shared/ui/menuUi';
import { useInertWhileOpen } from '@/shared/ui/useInertWhileOpen';
import type { FilterDef } from './types';
import { useFilterValueLabel } from './useFilters';

/**
 * Botón compacto «Estado ▾» de la barra de filtros: abre un menú con buscador (si hay muchas opciones o vienen del
 * servidor) o un selector de fecha. Lo elegido se muestra como chip debajo de la barra; el botón se resalta mientras
 * el filtro esté activo. Teclado: Enter/Espacio abre, flechas mueven, Enter elige, Esc cierra (reka-ui).
 */
const props = defineProps<{ def: FilterDef; value: string; active: boolean }>();
const emit = defineEmits<{ change: [value: string] }>();
const { t } = useI18n();
const onOpen = useInertWhileOpen();

const text = computed(() => props.def.barLabel ?? props.def.label);
const id = computed(() => `filter-${props.def.key}`);
const valueLabel = useFilterValueLabel(props.def, toRef(props, 'value'));

/** El elegido como objeto, para que el menú lo marque; el nombre llega de `valueLabel`. */
const selectedRemote = computed<RemoteOption | null>(() =>
  props.value ? { id: props.value, name: valueLabel.value } : null,
);
const choice = computed({
  get: () => (props.value === '' ? undefined : props.value),
  set: (v: string | undefined) => emit('change', v ?? ''),
});
const searchable = computed(() => props.def.kind === 'choice' && props.def.options.length > 8);
const triggerColor = computed(() => (props.active ? 'primary' : 'neutral'));
</script>

<template>
  <RemoteSelect
    v-if="def.kind === 'remote'"
    :id="id"
    :model-value="selectedRemote"
    :source="def.source"
    :fetcher="def.fetcher"
    :placeholder="text"
    :trigger-label="text"
    :search-placeholder="def.searchPlaceholder"
    :color="triggerColor"
    @update:model-value="(v: RemoteOption | null) => emit('change', v?.id ?? '')"
  />

  <USelectMenu
    v-else-if="def.kind === 'choice'"
    :id="id"
    v-model="choice"
    :items="def.options"
    value-key="value"
    label-key="label"
    :search-input="
      searchable
        ? {
            placeholder: def.searchPlaceholder ?? t('common.searchPlaceholder'),
            id: `${id}-search`,
            name: `${id}-search`,
          }
        : false
    "
    :ui="COMPACT_MENU_UI"
    :content="MENU_CONTENT"
    :color="triggerColor"
    variant="outline"
    class="w-auto"
    @update:open="onOpen"
  >
    <template #default>{{ text }}</template>
    <template #empty>{{ t('common.noOptions') }}</template>
  </USelectMenu>

  <UPopover v-else :content="{ align: 'start' }">
    <UButton
      :id="id"
      :label="text"
      trailing-icon="i-lucide-chevron-down"
      :color="triggerColor"
      variant="outline"
      :aria-label="active ? `${text}: ${valueLabel}` : text"
    />
    <template #content>
      <div class="flex w-64 flex-col gap-2 p-3">
        <label :for="`${id}-input`" class="text-sm font-medium text-highlighted">{{
          def.label
        }}</label>
        <UInput
          :id="`${id}-input`"
          :name="def.key"
          type="date"
          :model-value="value"
          class="w-full"
          @update:model-value="(v) => emit('change', String(v ?? ''))"
        />
        <UButton
          v-if="value"
          :label="t('filters.clearOne')"
          color="neutral"
          variant="ghost"
          size="sm"
          class="self-start"
          @click="emit('change', '')"
        />
      </div>
    </template>
  </UPopover>
</template>
