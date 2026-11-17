<script setup lang="ts">
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

export interface BarItem {
  key: string;
  label: string;
  count: number;
  to: RouteLocationRaw;
}

/** Barras horizontales hechas con CSS (sin librería de gráficos); cada fila enlaza al listado filtrado. */
const props = defineProps<{ items: readonly BarItem[]; emptyText: string }>();
const max = computed(() => Math.max(1, ...props.items.map((i) => i.count)));
const width = (count: number) => `${Math.round((count / max.value) * 100)}%`;
</script>

<template>
  <p v-if="!items.length" class="m-0 text-sm text-muted">{{ emptyText }}</p>
  <ul v-else class="m-0 flex list-none flex-col gap-1 p-0">
    <li v-for="item in items" :key="item.key">
      <RouterLink
        :to="item.to"
        class="flex min-h-11 flex-col justify-center gap-1 rounded-md px-1 no-underline hover:bg-elevated"
      >
        <span class="flex items-baseline justify-between gap-3 text-sm">
          <span class="min-w-0 break-words text-default">{{ item.label }}</span>
          <span class="font-semibold text-highlighted tabular-nums">{{ item.count }}</span>
        </span>
        <span class="h-2 w-full overflow-hidden rounded-full bg-accented" aria-hidden="true">
          <span
            class="block h-full rounded-full bg-primary"
            data-bar
            :style="{ width: width(item.count) }"
          />
        </span>
      </RouterLink>
    </li>
  </ul>
</template>
