<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

/** Número grande que enlaza al listado de activos con el filtro aplicado. `highlight` lo destaca. */
defineProps<{ label: string; value: number; to: RouteLocationRaw; highlight?: boolean }>();
</script>

<template>
  <RouterLink
    :to="to"
    class="flex min-h-11 flex-col gap-1 rounded-lg border p-4 no-underline hover:bg-elevated"
    :class="
      highlight ? 'border-primary bg-primary/10 text-highlighted' : 'border-default bg-default'
    "
  >
    <span class="text-3xl font-semibold text-highlighted tabular-nums">{{ value }}</span>
    <span class="text-sm" :class="highlight ? 'font-medium text-default' : 'text-muted'">{{
      label
    }}</span>
  </RouterLink>
</template>
