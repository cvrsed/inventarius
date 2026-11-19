<script setup lang="ts">
import type { AuditEntryDto } from '@inventarius/shared';
import { computed } from 'vue';
import { recordLink } from './record';

/** Rótulo del registro afectado (guardado al momento del evento), con enlace solo si el registro sigue vigente. */
const props = defineProps<{ entry: AuditEntryDto }>();
const to = computed(() => recordLink(props.entry));
</script>

<template>
  <RouterLink v-if="to && entry.entityLabel" :to="to" class="break-words text-primary underline">
    {{ entry.entityLabel }}
  </RouterLink>
  <span v-else-if="entry.entityLabel" class="break-words">{{ entry.entityLabel }}</span>
  <span v-else class="text-muted">—</span>
</template>
