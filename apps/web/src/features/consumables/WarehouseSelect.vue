<script setup lang="ts">
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import { useI18n } from 'vue-i18n';
import { MENU_CONTENT, WRAPPED_MENU_UI } from '@/shared/ui/menuUi';
import { useInertWhileOpen } from '@/shared/ui/useInertWhileOpen';

/**
 * Una bodega elegible. `stock` ya viene formateado («10 pares»). Con `disabledReason` la opción se ve apagada y dice por
 * qué no se puede elegir para esta acción (en vez de fallar al enviar); `note` es un aviso que no impide elegirla.
 */
export interface WarehouseOption {
  id: string;
  name: string;
  /** Ruta de los padres («Zensi › Chile»), vacía si es de primer nivel. */
  parents: string;
  stock?: string;
  disabledReason?: string;
  note?: string;
}

/**
 * Selector de bodega de los movimientos de consumibles (P13): nombre destacado, ruta en una segunda línea más chica y el
 * stock a la derecha. Nunca recorta: los textos largos pasan a otra línea, igual en escritorio que a 360 px.
 */
defineProps<{ items: WarehouseOption[]; placeholder: string; id?: string; disabled?: boolean }>();
const model = defineModel<string>({ default: '' });

const { t } = useI18n();
const onOpen = useInertWhileOpen();
</script>

<template>
  <USelectMenu
    :id="id"
    :model-value="model === '' ? undefined : model"
    :items="items.map((i) => ({ ...i, disabled: !!i.disabledReason }))"
    value-key="id"
    label-key="name"
    :filter-fields="['name', 'parents']"
    :placeholder="placeholder"
    :disabled="disabled"
    :search-input="{
      placeholder: `${placeholder} — ${t('common.searchPlaceholder')}`,
      id: `${id ?? 'warehouse'}-search`,
      name: `${id ?? 'warehouse'}-search`,
    }"
    class="w-full"
    :ui="WRAPPED_MENU_UI"
    :content="MENU_CONTENT"
    @update:model-value="(v: string | null | undefined) => (model = v ?? '')"
    @update:open="onOpen"
  >
    <template #item="{ item }">
      <span class="flex w-full min-w-0 items-start justify-between gap-3">
        <span class="flex min-w-0 flex-col">
          <span class="font-medium break-words whitespace-normal text-highlighted">{{
            item.name
          }}</span>
          <span
            v-if="item.parents"
            class="text-xs break-words whitespace-normal text-muted"
            data-testid="warehouse-path"
            >{{ item.parents }}</span
          >
          <span
            v-if="item.disabledReason"
            class="text-xs break-words whitespace-normal text-muted"
            data-testid="warehouse-reason"
            >{{ item.disabledReason }}</span
          >
          <span
            v-else-if="item.note"
            class="text-xs break-words whitespace-normal text-muted"
            data-testid="warehouse-note"
            >{{ item.note }}</span
          >
        </span>
        <span
          v-if="item.stock !== undefined"
          class="shrink-0 text-sm whitespace-nowrap text-default tabular-nums"
          data-testid="warehouse-stock"
          >{{ item.stock }}</span
        >
      </span>
    </template>
    <template #empty>{{ t('common.noOptions') }}</template>
  </USelectMenu>
</template>
