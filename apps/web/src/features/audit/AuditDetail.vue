<script setup lang="ts">
import type { AuditEntryDto } from '@inventarius/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { describeAuditDetail } from './detail';

/** Detalle legible de una auditoría: campo → valor, o antes → después cuando algo cambió (RF-31). */
const props = defineProps<{ entry: AuditEntryDto }>();
const { t, te } = useI18n();
const rows = computed(() => [
  ...describeAuditDetail(
    props.entry.diff,
    { t, te },
    { entity: props.entry.entity, action: props.entry.action },
  ),
  // La IP no tiene columna propia (la tabla no debe desbordar): va aquí, al final del detalle.
  ...(props.entry.ip ? [{ field: 'ip', label: t('audit.ip'), value: props.entry.ip }] : []),
]);
</script>

<template>
  <dl
    v-if="rows.length"
    class="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(10rem,max-content)_1fr]"
  >
    <template v-for="r in rows" :key="r.field">
      <dt class="font-medium text-highlighted">{{ r.label }}</dt>
      <dd class="m-0 min-w-0 break-words">
        <ul v-if="r.items" class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="item in r.items" :key="item.text" :title="item.title">{{ item.text }}</li>
        </ul>
        <template v-else-if="r.value !== undefined">{{ r.value }}</template>
        <template v-else>
          <span class="text-muted">{{ t('audit.before') }}:</span> {{ r.before }}
          <span aria-hidden="true"> → </span>
          <span class="text-muted">{{ t('audit.after') }}:</span> {{ r.after }}
        </template>
      </dd>
    </template>
  </dl>
  <p v-else class="m-0 text-muted">—</p>
</template>
