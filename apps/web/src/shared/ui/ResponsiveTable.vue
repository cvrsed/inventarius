<script setup lang="ts" generic="T">
import UTable from '@nuxt/ui/components/Table.vue';
import { computed, useSlots } from 'vue';
import { useIsDesktop } from './useIsDesktop';

/**
 * Listado que es tabla desde 768 px y lista de tarjetas por debajo (sin scroll horizontal, RF-40).
 * Solo se monta una de las dos vistas, para que no haya contenido duplicado en el DOM.
 * Las celdas de la tabla se pasan como slots `<columna>-cell` (igual que `UTable`); la tarjeta de cada
 * fila se arma con el slot `card` y sus acciones quedan visibles dentro de ella.
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  data: readonly T[];
  columns: ({ id: string; header: string } | { accessorKey: string; header: string })[];
  loading?: boolean;
  getRowId: (item: T) => string;
}>();

const isDesktop = useIsDesktop();
const slots = useSlots();
/** Todo lo que no sea del modo tarjeta se reenvía a `UTable`. */
const tableSlots = computed(() => Object.keys(slots).filter((name) => name !== 'card'));
</script>

<template>
  <div v-if="isDesktop">
    <UTable
      v-bind="$attrs"
      :data="[...props.data]"
      :columns="props.columns"
      :loading="props.loading"
      :get-row-id="props.getRowId"
      class="rounded-lg border border-default"
    >
      <template v-for="name in tableSlots" :key="name" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>
    </UTable>
  </div>

  <ul v-else class="m-0 flex list-none flex-col gap-3 p-0" :aria-busy="props.loading">
    <li v-if="!props.data.length" class="py-8 text-center text-muted">
      <slot name="empty" />
    </li>
    <li
      v-for="item in props.data"
      :key="props.getRowId(item)"
      class="flex flex-col gap-2 rounded-lg border border-default bg-default p-3"
    >
      <slot name="card" :item="item" />
    </li>
  </ul>
</template>
