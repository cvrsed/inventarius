<script setup lang="ts">
import type { AuditEntryDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UTooltip from '@nuxt/ui/components/Tooltip.vue';
import { computed, ref } from 'vue';
import { actorDisplay } from './actor';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import IconAction from '@/shared/ui/IconAction.vue';
import { useI18n } from 'vue-i18n';
import { auditActionLabel, auditEntityLabel } from '@/app/i18n/audit';
import FilterToolbar from '@/shared/filters/FilterToolbar.vue';
import { useListQuery } from '@/shared/list/useListQuery';
import { formatDateTime } from '@/shared/format/format';
import PagedFooter from '@/shared/ui/PagedFooter.vue';
import AuditDetail from './AuditDetail.vue';
import AuditRecord from './AuditRecord.vue';
import { useAuditList, type AuditQuery } from './api';
import { auditFilterDefs } from './filters';

const { t } = useI18n();

const { query, update, setPage, reset } = useListQuery({
  page: 1,
  pageSize: 25,
  entity: '',
  action: '',
  from: '',
  to: '',
} satisfies AuditQuery);
const { data, isPending, isFetching, isError, refetch } = useAuditList(query);
const filterDefs = computed(() => auditFilterDefs(t));
const expanded = ref<Record<string, boolean>>({});

const columns = computed(() => [
  { id: 'expand', header: t('audit.detail') },
  { id: 'when', header: t('audit.when') },
  { id: 'who', header: t('audit.who') },
  { id: 'action', header: t('audit.action') },
  { id: 'entity', header: t('audit.entity') },
  { id: 'record', header: t('audit.record') },
]);

const actionLabel = auditActionLabel;
const entityLabel = auditEntityLabel;

const who = (e: AuditEntryDto): string => actorDisplay(e, t);

/** Detalle abierto en el modo tarjeta (en la tabla lo maneja `expanded`). */
const openCards = ref(new Set<string>());
function toggleCard(id: string): void {
  const next = new Set(openCards.value);
  if (!next.delete(id)) next.add(id);
  openCards.value = next;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('audit.title') }}</h1>

    <FilterToolbar
      :defs="filterDefs"
      :values="query"
      :total="data?.meta.total"
      @change="update"
      @clear="reset"
    />

    <UAlert v-if="isError" color="error" variant="subtle" role="alert">
      <template #description>
        {{ t('common.genericError') }}
        <UButton
          class="ml-2"
          :label="t('common.retry')"
          size="sm"
          variant="link"
          @click="refetch()"
        />
      </template>
    </UAlert>

    <ResponsiveTable
      v-model:expanded="expanded"
      :data="data?.data ?? []"
      :columns="columns"
      :loading="isPending || isFetching"
      :get-row-id="(e: AuditEntryDto) => e.id"
      :ui="{
        td: 'whitespace-normal align-top px-2 xl:px-4',
        th: 'whitespace-nowrap px-2 xl:px-4',
      }"
      class="rounded-lg border border-default"
    >
      <template #empty>{{ t('audit.empty') }}</template>
      <template #expand-cell="{ row }">
        <IconAction
          :icon="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          :label="t('audit.detail')"
          :target="actionLabel(row.original.action)"
          :aria-expanded="row.getIsExpanded()"
          @click="row.toggleExpanded()"
        />
      </template>
      <template #when-cell="{ row }">{{ formatDateTime(row.original.at) }}</template>
      <template #who-cell="{ row }">{{ who(row.original) }}</template>
      <template #action-cell="{ row }">{{ actionLabel(row.original.action) }}</template>
      <template #entity-cell="{ row }">{{ entityLabel(row.original.entity) }}</template>
      <template #record-cell="{ row }">
        <!-- El rótulo se trunca para que la tabla no desborde; completo en el tooltip y en el detalle. -->
        <UTooltip :text="row.original.entityLabel ?? ''" :disabled="!row.original.entityLabel">
          <span class="block max-w-28 truncate lg:max-w-48 xl:max-w-72" data-testid="audit-record">
            <AuditRecord :entry="row.original" />
          </span>
        </UTooltip>
      </template>
      <template #expanded="{ row }">
        <AuditDetail :entry="row.original" />
      </template>
      <template #card="{ item }">
        <div class="flex items-start justify-between gap-2">
          <span class="font-semibold text-highlighted">{{ actionLabel(item.action) }}</span>
          <span class="shrink-0 text-xs text-muted">{{ formatDateTime(item.at) }}</span>
        </div>
        <p class="m-0 text-sm">
          <span class="text-muted">{{ entityLabel(item.entity) }}:</span>
          <AuditRecord :entry="item" />
        </p>
        <p class="m-0 text-sm text-muted">{{ who(item) }}</p>
        <UButton
          v-if="item.diff || item.ip"
          :label="t('audit.detail')"
          :aria-label="`${t('audit.detail')}: ${actionLabel(item.action)}`"
          :icon="openCards.has(item.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          :aria-expanded="openCards.has(item.id)"
          color="neutral"
          variant="outline"
          size="sm"
          class="self-start"
          @click="toggleCard(item.id)"
        />
        <AuditDetail v-if="(item.diff || item.ip) && openCards.has(item.id)" :entry="item" />
      </template>
    </ResponsiveTable>

    <PagedFooter
      :page="query.page"
      :page-size="query.pageSize"
      :total="data?.meta.total ?? 0"
      :page-sizes="[25, 50, 100]"
      @update:page="setPage"
      @update:page-size="(n: number) => update({ pageSize: n })"
    />
  </div>
</template>
