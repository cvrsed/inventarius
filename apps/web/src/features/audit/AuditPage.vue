<script setup lang="ts">
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type AuditEntryDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { computed, ref } from 'vue';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import IconAction from '@/shared/ui/IconAction.vue';
import { useI18n } from 'vue-i18n';
import { auditActionLabel, auditEntityLabel } from '@/app/i18n/audit';
import { formatDateTime } from '@/shared/format/format';
import AppSelect from '@/shared/ui/AppSelect.vue';
import PagedFooter from '@/shared/ui/PagedFooter.vue';
import { useAuditList, type AuditQuery } from './api';

const { t } = useI18n();

const blank: AuditQuery = { page: 1, pageSize: 25, entity: '', action: '', from: '', to: '' };
const query = ref<AuditQuery>({ ...blank });
const { data, isPending, isFetching, isError, refetch } = useAuditList(query);
const expanded = ref<Record<string, boolean>>({});

const page = computed({
  get: () => query.value.page,
  set: (v: number) => (query.value = { ...query.value, page: v }),
});
const pageSize = computed({
  get: () => query.value.pageSize,
  set: (v: number) => (query.value = { ...query.value, pageSize: v, page: 1 }),
});

const columns = computed(() => [
  { id: 'expand', header: t('audit.detail') },
  { id: 'when', header: t('audit.when') },
  { id: 'who', header: t('audit.who') },
  { id: 'action', header: t('audit.action') },
  { id: 'entity', header: t('audit.entity') },
  { accessorKey: 'ip', header: t('audit.ip') },
]);

const entityOptions = computed(() => [
  { value: '', label: t('audit.all') },
  ...AUDIT_ENTITIES.map((value) => ({ value, label: auditEntityLabel(value) })),
]);
const actionOptions = computed(() => [
  { value: '', label: t('audit.all') },
  ...AUDIT_ACTIONS.map((value) => ({ value, label: auditActionLabel(value) })),
]);

const actionLabel = auditActionLabel;
const entityLabel = auditEntityLabel;

function setFilter(patch: Partial<AuditQuery>): void {
  query.value = { ...query.value, ...patch, page: 1 };
}
/** Usuario; si no hubo (`cli`) la operación por línea de comandos; si no, el sistema. */
const who = (e: AuditEntryDto): string =>
  e.actorName ?? (e.actorLabel === 'cli' ? t('audit.cli') : t('audit.system'));
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

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

    <form class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" @submit.prevent>
      <UFormField :label="t('audit.filterEntity')" name="f-entity">
        <AppSelect
          id="f-entity"
          :model-value="query.entity"
          :items="entityOptions"
          class="w-full"
          @update:model-value="(v: string | number) => setFilter({ entity: String(v) })"
        />
      </UFormField>
      <UFormField :label="t('audit.filterAction')" name="f-action">
        <AppSelect
          id="f-action"
          :model-value="query.action"
          :items="actionOptions"
          class="w-full"
          @update:model-value="(v: string | number) => setFilter({ action: String(v) })"
        />
      </UFormField>
      <UFormField :label="t('audit.filterFrom')" name="f-from">
        <UInput
          id="f-from"
          :model-value="query.from"
          type="date"
          class="w-full"
          @update:model-value="(v) => setFilter({ from: String(v ?? '') })"
        />
      </UFormField>
      <UFormField :label="t('audit.filterTo')" name="f-to">
        <UInput
          id="f-to"
          :model-value="query.to"
          type="date"
          class="w-full"
          @update:model-value="(v) => setFilter({ to: String(v ?? '') })"
        />
      </UFormField>
      <div class="flex items-end">
        <UButton
          type="button"
          :label="t('audit.clear')"
          color="neutral"
          variant="outline"
          @click="query = { ...blank }"
        />
      </div>
    </form>

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
      <template #expanded="{ row }">
        <pre v-if="row.original.diff" class="m-0 overflow-x-auto text-sm">{{
          pretty(row.original.diff)
        }}</pre>
        <p v-else class="m-0 text-muted">—</p>
      </template>
      <template #card="{ item }">
        <div class="flex items-start justify-between gap-2">
          <span class="font-semibold text-highlighted">{{ actionLabel(item.action) }}</span>
          <span class="shrink-0 text-xs text-muted">{{ formatDateTime(item.at) }}</span>
        </div>
        <p class="m-0 text-sm text-muted">{{ entityLabel(item.entity) }} · {{ who(item) }}</p>
        <UButton
          v-if="item.diff"
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
        <pre
          v-if="item.diff && openCards.has(item.id)"
          class="m-0 text-sm break-words whitespace-pre-wrap"
          >{{ pretty(item.diff) }}</pre>
      </template>
    </ResponsiveTable>

    <PagedFooter
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="data?.meta.total ?? 0"
      :page-sizes="[25, 50, 100]"
    />
  </div>
</template>
